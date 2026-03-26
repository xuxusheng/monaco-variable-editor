import { t } from "./trpc.js"
import { workflowRouter } from "./routers/workflow.js"
import { namespaceRouter } from "./routers/namespace.js"
import { workflowDraftRouter } from "./routers/draft.js"
import { workflowReleaseRouter } from "./routers/release.js"
import { workflowExecutionRouter } from "./routers/execution.js"
import { workflowTriggerRouter } from "./routers/trigger.js"
import { workflowVariableRouter } from "./routers/variable.js"
import { workflowSecretRouter } from "./routers/secret.js"

export const appRouter = t.router({
  health: t.procedure.query(() => ({
    status: "ok" as const,
    timestamp: new Date(),
  })),
  namespace: namespaceRouter,
  workflow: workflowRouter,
  workflowDraft: workflowDraftRouter,
  workflowRelease: workflowReleaseRouter,
  workflowExecution: workflowExecutionRouter,
  workflowTrigger: workflowTriggerRouter,
  workflowVariable: workflowVariableRouter,
  workflowSecret: workflowSecretRouter,
})

export type AppRouter = typeof appRouter
