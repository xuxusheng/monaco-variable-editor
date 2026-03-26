import { Hono } from "hono"
import { timingSafeEqual } from "node:crypto"
import type { Prisma } from "../generated/prisma/client.js"
import { prisma } from "../db.js"
import { logger } from "../lib/logger.js"
import { webhookRateLimiter } from "../middleware/rate-limit.js"

export const webhookRoute = new Hono()

webhookRoute.use(webhookRateLimiter)

webhookRoute.post("/:workflowId/:triggerName", async (c) => {
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

  let executionId: string
  let state: string
  let startDate: string | undefined
  try {
    const { getKestraClient } = await import("../lib/kestra-client.js")
    const client = getKestraClient()
    const execution = await client.triggerExecution(
      trigger.workflow.namespace.kestraNamespace,
      trigger.kestraFlowId,
    )
    executionId = execution.id
    state = execution.state.current
    startDate = execution.state.startDate
  } catch (e) {
    logger.error({ err: e, workflowId, triggerName }, "Webhook Kestra trigger failed")
    return c.json({ error: "Failed to trigger execution" }, 502)
  }

  const latestRelease = await prisma.workflowRelease.findFirst({
    where: { workflowId },
    orderBy: { version: "desc" },
    select: { id: true },
  })

  if (latestRelease) {
    void prisma.workflowExecution.create({
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
      logger.error({ err: e, workflowId }, "Failed to create WorkflowExecution")
    })
  }

  return c.json({ executionId, state })
})
