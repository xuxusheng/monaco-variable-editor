import "dotenv/config"
import { initTracing } from "./lib/tracing.js"
initTracing()

import { serveStatic } from "hono/bun"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "./router.js"
import { createContext } from "./context.js"
import { prisma } from "./db.js"
import { requestLogger } from "./middleware/request-logger.js"
import { tracing } from "./middleware/tracing.js"
import { apiRateLimiter, shutdownRateLimiter } from "./middleware/rate-limit.js"
import { webhookRoute } from "./routes/webhook.js"
import { startSyncExecutionsTimer, stopSyncExecutionsTimer } from "./jobs/sync-executions.js"
import { logger } from "./lib/logger.js"
import { join, dirname } from "node:path"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const app = new Hono()

app.use(tracing)
app.use(requestLogger)
app.use(apiRateLimiter)
app.use("/api/*", cors())

const trpcRoute = new Hono().all("*", (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c),
  })
})

app.route("/api/trpc", trpcRoute)
app.route("/api/webhook", webhookRoute)

app.get("/health", (c) => c.json({ status: "ok" }))

function getStaticRoot(): string {
  if (process.env.STATIC_ROOT) {
    return process.env.STATIC_ROOT
  }

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const fromApiDir = join(__dirname, "../../web/dist")
  if (existsSync(fromApiDir)) {
    return fromApiDir
  }

  const fromProjectRoot = join(process.cwd(), "apps/web/dist")
  if (existsSync(fromProjectRoot)) {
    return fromProjectRoot
  }

  return "/web/dist/"
}

const STATIC_ROOT = getStaticRoot()
logger.info({ staticRoot: STATIC_ROOT }, "Serving static assets")

app.use(
  "/assets/*",
  async (c, next) => {
    await next()
    if (c.res.ok) {
      c.header("Cache-Control", "public, max-age=31536000, immutable")
    }
  },
  serveStatic({ root: STATIC_ROOT, precompressed: true }),
)

const knownExt = /\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|json|txt|map|webp|avif|wasm)$/

app.get("*", async (c, next) => {
  if (knownExt.test(c.req.path)) return c.notFound()
  c.header("Cache-Control", "no-cache")
  return serveStatic({
    root: STATIC_ROOT,
    rewriteRequestPath: () => "/index.html",
  })(c, next)
})

app.onError((err, c) => {
  logger.error({
    err: { message: err.message, stack: err.stack },
    path: c.req.path,
    method: c.req.method,
  }, "Unhandled error")
  return c.json({ error: err.message ?? "Internal Server Error" }, 500)
})

startSyncExecutionsTimer()

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down")
  stopSyncExecutionsTimer()
  shutdownRateLimiter()
  prisma.$disconnect()
    .then(() => {
      logger.info("Server closed")
      process.exit(0)
    })
    .catch((err) => {
      logger.error({ err }, "Failed to disconnect prisma")
      process.exit(1)
    })
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))

export default {
  port: process.env.PORT ? Number(process.env.PORT) : undefined,
  fetch: app.fetch,
}
