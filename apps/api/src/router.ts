import { t } from "./trpc.js"
import { workflowRouter } from "./routers/workflow.js"
import { namespaceRouter } from "./routers/namespace.js"

export const appRouter = t.router({
  health: t.procedure.query(() => ({
    status: "ok" as const,
    timestamp: new Date(),
  })),
  namespace: namespaceRouter,
  workflow: workflowRouter,
})

export type AppRouter = typeof appRouter
