import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import type { Prisma } from "./generated/prisma/client.js";
import { serveStatic } from "hono/bun";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { prisma } from "./db.js";

const app = new Hono();

// Middleware
app.use(logger());
app.use("/api/*", cors());

// tRPC sub-router
const trpcRoute = new Hono().all("*", (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c),
  });
});

app.route("/api/trpc", trpcRoute);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Webhook endpoint
app.post("/api/webhook/:workflowId/:triggerName", async (c) => {
  const { workflowId, triggerName } = c.req.param()

  const trigger = await prisma.workflowTrigger.findFirst({
    where: {
      workflowId,
      kestraFlowId: triggerName,
      type: "webhook",
      disabled: false,
    },
    include: {
      workflow: { include: { namespace: true } },
    },
  })

  if (!trigger) {
    return c.json({ error: "Trigger not found or disabled" }, 404)
  }

  // Verify webhook secret (constant-time comparison)
  const secret = c.req.header("X-Webhook-Secret")
  const config = trigger.config as Record<string, unknown>
  const expected = String(config.secret ?? "")
  if (!expected || typeof config.secret !== "string") {
    return c.json({ error: "Webhook secret not configured" }, 500)
  }
  const got = secret ?? ""
  if (!got || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return c.json({ error: "Invalid webhook secret" }, 401)
  }

  // Trigger execution via Kestra
  let executionId: string
  let state: string
  let startDate: string | undefined
  try {
    const { getKestraClient } = await import("./lib/kestra-client.js")
    const client = getKestraClient()
    const execution = await client.triggerExecution(
      trigger.workflow.namespace.kestraNamespace,
      trigger.kestraFlowId,
    )
    executionId = execution.id
    state = execution.state.current
    startDate = execution.state.startDate
  } catch (e) {
    console.error("Webhook Kestra trigger failed:", e)
    return c.json({ error: "Failed to trigger execution" }, 502)
  }

  // Async: create WorkflowExecution record (fire-and-forget)
  const latestRelease = await prisma.workflowRelease.findFirst({
    where: { workflowId },
    orderBy: { version: "desc" },
    select: { id: true },
  })

  if (latestRelease) {
    prisma.workflowExecution.create({
      data: {
        workflowId,
        releaseId: latestRelease.id,
        kestraExecId: executionId,
        inputValues: {} as Prisma.InputJsonValue,
        state,
        triggeredBy: `webhook:${triggerName}`,
        startedAt: startDate ? new Date(startDate) : undefined,
      },
    }).catch((e: unknown) => {
      console.error("Failed to create WorkflowExecution:", e)
    })
  }

  return c.json({ executionId, state })
})

// --- Static assets ---
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function getStaticRoot(): string {
  if (process.env.STATIC_ROOT) {
    return process.env.STATIC_ROOT;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fromApiDir = join(__dirname, "../../web/dist");
  if (existsSync(fromApiDir)) {
    return fromApiDir;
  }

  const fromProjectRoot = join(process.cwd(), "apps/web/dist");
  if (existsSync(fromProjectRoot)) {
    return fromProjectRoot;
  }

  return "/web/dist/";
}

const STATIC_ROOT = getStaticRoot();
console.log(`[static] Serving from: ${STATIC_ROOT}`);

// Hashed assets (/assets/*) → long cache, immutable, with precompressed support
app.use(
  "/assets/*",
  async (c, next) => {
    await next();
    if (c.res.ok) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
  serveStatic({ root: STATIC_ROOT, precompressed: true }),
);

// SPA fallback: skip known file extensions, no-cache for index.html
const knownExt = /\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|json|txt|map|webp|avif|wasm)$/;

app.get("*", async (c, next) => {
  if (knownExt.test(c.req.path)) return c.notFound();
  c.header("Cache-Control", "no-cache");
  return serveStatic({
    root: STATIC_ROOT,
    rewriteRequestPath: () => "/index.html",
  })(c, next);
});

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: err.message ?? "Internal Server Error" }, 500);
});

export default {
  port: process.env.PORT ? Number(process.env.PORT) : undefined,
  fetch: app.fetch,
}

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  clearInterval(syncTimer);
  prisma.$disconnect().then(() => {
    console.log("Server closed");
    process.exit(0);
  });
}

// ─── SyncExecutions cron (every 10 min) ───

const SYNC_INTERVAL = 10 * 60 * 1000 // 10 minutes

async function syncRunningExecutions() {
  const kestraUrl = process.env.KESTRA_URL
  if (!kestraUrl) return

  try {
    const { getKestraClient } = await import("./lib/kestra-client.js")
    const client = getKestraClient()

    const running = await prisma.workflowDraftExecution.findMany({
      where: { state: { notIn: ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"] } },
    })

    if (running.length > 0) {
      console.log(`[sync] Syncing ${running.length} running execution(s)...`)

      const results = await Promise.allSettled(
        running.map(async (exec) => {
          const kestraExec = await client.getExecution(exec.kestraExecId)
          if (kestraExec.state.current !== exec.state) {
            await prisma.workflowDraftExecution.update({
              where: { id: exec.id },
              data: {
                state: kestraExec.state.current,
                taskRuns: (kestraExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
                startedAt: kestraExec.state.startDate
                  ? new Date(kestraExec.state.startDate)
                  : exec.startedAt,
                endedAt: kestraExec.state.endDate
                  ? new Date(kestraExec.state.endDate)
                  : undefined,
              },
            })
            console.log(`[sync] ${exec.id}: ${exec.state} → ${kestraExec.state.current}`)
          }
        }),
      )

      const failed = results.filter((r) => r.status === "rejected").length
      if (failed > 0) {
        console.warn(`[sync] ${failed}/${running.length} draft sync failed`)
      }
    }

    // Also sync WorkflowExecution (production)
    const prodRunning = await prisma.workflowExecution.findMany({
      where: { state: { notIn: ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"] } },
    })

    if (prodRunning.length > 0) {
      console.log(`[sync] Syncing ${prodRunning.length} running production execution(s)...`)

      const prodResults = await Promise.allSettled(
        prodRunning.map(async (exec) => {
          const kestraExec = await client.getExecution(exec.kestraExecId)
          if (kestraExec.state.current !== exec.state) {
            await prisma.workflowExecution.update({
              where: { id: exec.id },
              data: {
                state: kestraExec.state.current,
                taskRuns: (kestraExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
                startedAt: kestraExec.state.startDate
                  ? new Date(kestraExec.state.startDate)
                  : exec.startedAt,
                endedAt: kestraExec.state.endDate
                  ? new Date(kestraExec.state.endDate)
                  : undefined,
              },
            })
            console.log(`[sync][prod] ${exec.id}: ${exec.state} → ${kestraExec.state.current}`)
          }
        }),
      )

      const prodFailed = prodResults.filter((r) => r.status === "rejected").length
      if (prodFailed > 0) {
        console.warn(`[sync] ${prodFailed}/${prodRunning.length} production sync failed`)
      }
    }
  } catch (e) {
    console.error("[sync] Cron job error:", e)
  }
}

// Start sync timer (skip first 30s to let server boot)
const syncTimer = setInterval(syncRunningExecutions, SYNC_INTERVAL)

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
