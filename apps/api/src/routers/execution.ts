import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"

export const workflowExecutionRouter = t.router({
  kestraHealth: t.procedure.query(async () => {
    try {
      const { getKestraClient } = await import("../lib/kestra-client.js")
      const client = getKestraClient()
      const result = await client.healthCheckDetailed()
      client.healthy = result.healthy
      return { healthy: result.healthy, error: result.error, timestamp: new Date().toISOString() }
    } catch (err) {
      return { healthy: false, error: err instanceof Error ? err.message : "Kestra 客户端未初始化", timestamp: new Date().toISOString() }
    }
  }),

  executeTest: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        inputValues: z.record(z.string(), z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { getKestraClient, KestraError } = await import(
        "../lib/kestra-client.js"
      )

      const wf = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
        include: { namespace: true },
      })
      if (!wf) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" })
      }

      const client = getKestraClient()
      if (!client.isHealthy()) {
        try {
          await client.refreshHealth()
        } catch { /* ignore */ }
        if (!client.isHealthy()) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "Kestra 不可达，请检查连接",
          })
        }
      }

      const testFlowId = `${wf.flowId}_test`
      try {
        const execution = await client.triggerExecution(
          wf.namespace.kestraNamespace,
          testFlowId,
          input.inputValues,
        )

        return prisma.workflowDraftExecution.create({
          data: {
            workflowId: input.workflowId,
            kestraExecId: execution.id,
            nodes: wf.nodes as Prisma.InputJsonValue,
            edges: wf.edges as Prisma.InputJsonValue,
            inputs: wf.inputs as Prisma.InputJsonValue,
            variables: wf.variables as Prisma.InputJsonValue,
            inputValues: (input.inputValues ?? {}) as Prisma.InputJsonValue,
            state: execution.state.current,
            taskRuns: (execution.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
            triggeredBy: "manual",
            startedAt: execution.state.startDate
              ? new Date(execution.state.startDate)
              : undefined,
          },
        })
      } catch (e) {
        if (e instanceof KestraError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `Kestra 执行失败: ${e.statusCode} ${e.responseBody}`,
          })
        }
        throw e
      }
    }),

  get: t.procedure
    .input(z.object({ executionId: z.string() }))
    .query(async ({ input }) => {
      const { getKestraClient, isTerminalState } = await import(
        "../lib/kestra-client.js"
      )

      const draftExec = await prisma.workflowDraftExecution.findUnique({
        where: { id: input.executionId },
      })

      if (draftExec) {
        const exec = draftExec
        if (!isTerminalState(exec.state)) {
          try {
            const client = getKestraClient()
            const kestraExec = await client.getExecution(exec.kestraExecId)
            return {
              source: "draft" as const,
              ...(await prisma.workflowDraftExecution.update({
                where: { id: exec.id },
                data: {
                  state: kestraExec.state.current,
                  taskRuns:
                    (kestraExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
                  startedAt: kestraExec.state.startDate
                    ? new Date(kestraExec.state.startDate)
                    : exec.startedAt,
                  endedAt: kestraExec.state.endDate
                    ? new Date(kestraExec.state.endDate)
                    : undefined,
                },
              })),
            }
          } catch {
            return { source: "draft" as const, ...exec }
          }
        }
        return { source: "draft" as const, ...exec }
      }

      const prodExec = await prisma.workflowExecution.findUnique({
        where: { id: input.executionId },
        include: {
          release: {
            select: { version: true, name: true, nodes: true, edges: true, inputs: true, variables: true },
          },
        },
      })
      if (!prodExec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Execution not found" })
      }

      const { release, ...exec } = prodExec
      const releaseSnapshot = {
        nodes: release.nodes,
        edges: release.edges,
        inputs: release.inputs,
        variables: release.variables,
      }
      if (!isTerminalState(exec.state)) {
        try {
          const client = getKestraClient()
          const kestraExec = await client.getExecution(exec.kestraExecId)
          const updated = await prisma.workflowExecution.update({
            where: { id: exec.id },
            data: {
              state: kestraExec.state.current,
              taskRuns:
                (kestraExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
              startedAt: kestraExec.state.startDate
                ? new Date(kestraExec.state.startDate)
                : exec.startedAt,
              endedAt: kestraExec.state.endDate
                ? new Date(kestraExec.state.endDate)
                : undefined,
            },
          })
          return {
            source: "release" as const,
            releaseVersion: release.version,
            releaseName: release.name,
            ...releaseSnapshot,
            ...updated,
          }
        } catch {
          return {
            source: "release" as const,
            releaseVersion: release.version,
            releaseName: release.name,
            ...releaseSnapshot,
            ...exec,
          }
        }
      }

      return {
        source: "release" as const,
        releaseVersion: release.version,
        releaseName: release.name,
        ...releaseSnapshot,
        ...exec,
      }
    }),

  list: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        state: z.string().optional(),
        triggeredBy: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {
        workflowId: input.workflowId,
      }
      if (input.state) where.state = input.state
      if (input.triggeredBy) where.triggeredBy = input.triggeredBy
      if (input.startDate || input.endDate) {
        const createdAt: Record<string, Date> = {}
        if (input.startDate) createdAt.gte = new Date(input.startDate)
        if (input.endDate) createdAt.lte = new Date(input.endDate)
        where.createdAt = createdAt
      }

      const items = await prisma.workflowDraftExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          kestraExecId: true,
          state: true,
          triggeredBy: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
        },
      })

      const hasMore = items.length > input.limit
      if (hasMore) items.pop()

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      }
    }),

  kill: t.procedure
    .input(z.object({ executionId: z.string() }))
    .mutation(async ({ input }) => {
      const { getKestraClient } = await import("../lib/kestra-client.js")

      const exec = await prisma.workflowDraftExecution.findUnique({
        where: { id: input.executionId },
      })
      if (!exec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Execution not found" })
      }

      try {
        const client = getKestraClient()
        await client.killExecution(exec.kestraExecId)
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "停止执行失败",
        })
      }

      return { success: true }
    }),

  replay: t.procedure
    .input(
      z.object({
        executionId: z.string(),
        taskRunId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const { getKestraClient, KestraError } = await import(
        "../lib/kestra-client.js"
      )

      const exec = await prisma.workflowDraftExecution.findUnique({
        where: { id: input.executionId },
      })
      if (!exec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Execution not found" })
      }

      try {
        const client = getKestraClient()
        const newExec = await client.replayExecution(
          exec.kestraExecId,
          input.taskRunId,
          true,
        )

        return prisma.workflowDraftExecution.create({
          data: {
            workflowId: exec.workflowId,
            kestraExecId: newExec.id,
            nodes: exec.nodes as Prisma.InputJsonValue,
            edges: exec.edges as Prisma.InputJsonValue,
            inputs: exec.inputs as Prisma.InputJsonValue,
            variables: exec.variables as Prisma.InputJsonValue,
            inputValues: exec.inputValues as Prisma.InputJsonValue,
            state: newExec.state.current,
            taskRuns:
              (newExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
            triggeredBy: `replay:${input.executionId}:${input.taskRunId}`,
            startedAt: newExec.state.startDate
              ? new Date(newExec.state.startDate)
              : undefined,
          },
        })
      } catch (e) {
        if (e instanceof KestraError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `Replay 失败: ${e.statusCode} ${e.responseBody}`,
          })
        }
        throw e
      }
    }),

  logs: t.procedure
    .input(
      z.object({
        kestraExecId: z.string(),
        taskRunId: z.string().optional(),
        minLevel: z
          .enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR"])
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      const { getKestraClient, KestraError } = await import(
        "../lib/kestra-client.js"
      )

      try {
        const client = getKestraClient()
        return client.getExecutionLogs(input.kestraExecId, {
          taskRunId: input.taskRunId,
          minLevel: input.minLevel,
        })
      } catch (e) {
        if (e instanceof KestraError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `获取日志失败: ${e.statusCode}`,
          })
        }
        throw e
      }
    }),

  sync: t.procedure.mutation(async () => {
    const { getKestraClient } = await import("../lib/kestra-client.js")

    const client = getKestraClient()

    const running = await prisma.workflowDraftExecution.findMany({
      where: { state: { notIn: ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"] } },
    })

    const results = await Promise.allSettled(
      running.map(async (exec) => {
        const kestraExec = await client.getExecution(exec.kestraExecId)
        await prisma.workflowDraftExecution.update({
          where: { id: exec.id },
          data: {
            state: kestraExec.state.current,
            taskRuns:
              (kestraExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
            startedAt: kestraExec.state.startDate
              ? new Date(kestraExec.state.startDate)
              : exec.startedAt,
            endedAt: kestraExec.state.endDate
              ? new Date(kestraExec.state.endDate)
              : undefined,
          },
        })
      }),
    )

    const prodRunning = await prisma.workflowExecution.findMany({
      where: { state: { notIn: ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"] } },
    })

    const prodResults = await Promise.allSettled(
      prodRunning.map(async (exec) => {
        const kestraExec = await client.getExecution(exec.kestraExecId)
        await prisma.workflowExecution.update({
          where: { id: exec.id },
          data: {
            state: kestraExec.state.current,
            taskRuns:
              (kestraExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
            startedAt: kestraExec.state.startDate
              ? new Date(kestraExec.state.startDate)
              : exec.startedAt,
            endedAt: kestraExec.state.endDate
              ? new Date(kestraExec.state.endDate)
              : undefined,
          },
        })
      }),
    )

    return {
      synced: results.filter((r) => r.status === "fulfilled").length + prodResults.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length + prodResults.filter((r) => r.status === "rejected").length,
    }
  }),

  productionList: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        state: z.string().optional(),
        triggeredBy: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {
        workflowId: input.workflowId,
      }
      if (input.state) where.state = input.state
      if (input.triggeredBy) where.triggeredBy = input.triggeredBy
      if (input.startDate || input.endDate) {
        const createdAt: Record<string, Date> = {}
        if (input.startDate) createdAt.gte = new Date(input.startDate)
        if (input.endDate) createdAt.lte = new Date(input.endDate)
        where.createdAt = createdAt
      }

      const items = await prisma.workflowExecution.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
        select: {
          id: true,
          kestraExecId: true,
          state: true,
          triggeredBy: true,
          startedAt: true,
          endedAt: true,
          createdAt: true,
        },
      })

      const hasMore = items.length > input.limit
      if (hasMore) items.pop()

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      }
    }),

  productionGet: t.procedure
    .input(z.object({ executionId: z.string() }))
    .query(async ({ input }) => {
      const { getKestraClient, isTerminalState } = await import(
        "../lib/kestra-client.js"
      )

      const prodExec = await prisma.workflowExecution.findUnique({
        where: { id: input.executionId },
        include: {
          release: {
            select: { version: true, name: true, nodes: true, edges: true, inputs: true, variables: true },
          },
        },
      })
      if (!prodExec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Execution not found" })
      }

      const { release, ...exec } = prodExec
      const sourceInfo = {
        source: "release" as const,
        releaseVersion: release.version,
        releaseName: release.name,
        nodes: release.nodes,
        edges: release.edges,
        inputs: release.inputs,
        variables: release.variables,
      }

      if (!isTerminalState(exec.state)) {
        try {
          const client = getKestraClient()
          const kestraExec = await client.getExecution(exec.kestraExecId)
          const updated = await prisma.workflowExecution.update({
            where: { id: exec.id },
            data: {
              state: kestraExec.state.current,
              taskRuns:
                (kestraExec.taskRunList ?? []) as unknown as Prisma.InputJsonValue,
              startedAt: kestraExec.state.startDate
                ? new Date(kestraExec.state.startDate)
                : exec.startedAt,
              endedAt: kestraExec.state.endDate
                ? new Date(kestraExec.state.endDate)
                : undefined,
            },
          })
          return { ...sourceInfo, ...updated }
        } catch {
          return { ...sourceInfo, ...exec }
        }
      }

      return { ...sourceInfo, ...exec }
    }),
})
