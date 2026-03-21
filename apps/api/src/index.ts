import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
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

// --- Static assets ---
const STATIC_ROOT = process.env.STATIC_ROOT || "/web/dist/";

// Hashed assets (/assets/*) → long cache, immutable
app.use(
  "/assets/*",
  async (c, next) => {
    await next();
    if (c.res.ok) {
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    }
  },
  serveStatic({ root: STATIC_ROOT }),
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

const port = Number(process.env.PORT) || 3001;

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Server running on http://localhost:${info.port}`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log("Server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
