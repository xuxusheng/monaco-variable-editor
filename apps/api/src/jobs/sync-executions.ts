import { Prisma } from "../generated/prisma/client.js"
import { prisma } from "../db.js"
import { logger } from "../lib/logger.js"

const SYNC_INTERVAL = 10 * 60 * 1000

async function syncRunningExecutions() {
  const kestraUrl = process.env.KESTRA_URL
  if (!kestraUrl) return

  try {
    const { getKestraClient } = await import("../lib/kestra-client.js")
    const client = getKestraClient()

    const running = await prisma.workflowDraftExecution.findMany({
      where: { state: { notIn: ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"] } },
    })

    if (running.length > 0) {
      logger.info({ count: running.length }, "Syncing running draft executions")

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
            logger.info({ execId: exec.id, from: exec.state, to: kestraExec.state.current }, "Draft execution state synced")
          }
        }),
      )

      const failed = results.filter((r) => r.status === "rejected").length
      if (failed > 0) {
        logger.warn({ failed, total: running.length }, "Some draft execution syncs failed")
      }
    }

    const prodRunning = await prisma.workflowExecution.findMany({
      where: { state: { notIn: ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"] } },
    })

    if (prodRunning.length > 0) {
      logger.info({ count: prodRunning.length }, "Syncing running production executions")

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
            logger.info({ execId: exec.id, from: exec.state, to: kestraExec.state.current }, "Production execution state synced")
          }
        }),
      )

      const prodFailed = prodResults.filter((r) => r.status === "rejected").length
      if (prodFailed > 0) {
        logger.warn({ failed: prodFailed, total: prodRunning.length }, "Some production execution syncs failed")
      }
    }
  } catch (e) {
    logger.error({ err: e }, "Sync cron job failed")
  }
}

let syncTimer: ReturnType<typeof setInterval> | null = null

export function startSyncExecutionsTimer() {
  if (syncTimer) return syncTimer
  syncTimer = setInterval(syncRunningExecutions, SYNC_INTERVAL)
  return syncTimer
}

export function stopSyncExecutionsTimer() {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}
