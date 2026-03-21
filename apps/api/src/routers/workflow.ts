import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { parse as parseYaml } from "yaml"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { createWorkflowSchema, updateWorkflowSchema } from "../types.js"

const idSchema = z.object({ id: z.string() })

export const workflowRouter = t.router({
  list: t.procedure
    .input(z.object({ namespaceId: z.string().optional() }).optional())
    .query(({ input }) => {
      return prisma.workflow.findMany({
        where: input?.namespaceId ? { namespaceId: input.namespaceId } : undefined,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          flowId: true,
          namespaceId: true,
          disabled: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    }),

  get: t.procedure.input(idSchema).query(async ({ input }) => {
    const wf = await prisma.workflow.findUnique({
      where: { id: input.id },
    })
    if (!wf) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Workflow ${input.id} not found`,
      })
    }
    return wf
  }),

  create: t.procedure
    .input(createWorkflowSchema)
    .mutation(({ input }) => {
      return prisma.workflow.create({
        data: {
          name: input.name,
          flowId: input.flowId,
          namespaceId: input.namespaceId,
          description: input.description,
          nodes: input.nodes as unknown as Prisma.InputJsonValue,
          edges: input.edges as unknown as Prisma.InputJsonValue,
          inputs: input.inputs as unknown as Prisma.InputJsonValue,
          variables: input.variables as unknown as Prisma.InputJsonValue,
          disabled: input.disabled,
        },
      })
    }),

  update: t.procedure
    .input(updateWorkflowSchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      )
      if (Object.keys(cleanData).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one field must be provided for update",
        })
      }
      try {
        const updateData: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(cleanData)) {
          if (["nodes", "edges", "inputs", "variables"].includes(k)) {
            updateData[k] = v as unknown as Prisma.InputJsonValue
          } else {
            updateData[k] = v
          }
        }
        return await prisma.workflow.update({
          where: { id },
          data: updateData,
        })
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2025"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Workflow ${id} not found`,
          })
        }
        throw e
      }
    }),

  delete: t.procedure
    .input(idSchema)
    .mutation(async ({ input }) => {
      try {
        return await prisma.workflow.delete({ where: { id: input.id } })
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2025"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Workflow ${input.id} not found`,
          })
        }
        throw e
      }
    }),

  // ─── Draft API ───

  draftSave: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        message: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const wf = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
      })
      if (!wf) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Workflow ${input.workflowId} not found`,
        })
      }

      const draft = await prisma.workflowDraft.create({
        data: {
          workflowId: input.workflowId,
          nodes: wf.nodes as Prisma.InputJsonValue,
          edges: wf.edges as Prisma.InputJsonValue,
          inputs: wf.inputs as Prisma.InputJsonValue,
          variables: wf.variables as Prisma.InputJsonValue,
          message: input.message,
        },
      })

      // 异步推 Kestra（失败不阻塞 Draft 保存）
      // TODO: draftSave 需要前端传入 yaml，或后端调用 toKestraYaml 生成
      // 当前 releasePublish 已实现 Kestra push，draftSave 联调时补充
      // try {
      //   const { getKestraClient } = await import("../lib/kestra-client.js")
      //   const client = getKestraClient()
      //   await client.upsertFlow(wf.namespace.kestraNamespace, `${wf.flowId}_test`, yaml)
      // } catch { /* Kestra 不可达，Draft 仍保存成功 */ }

      return draft
    }),

  draftList: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .query(({ input }) => {
      return prisma.workflowDraft.findMany({
        where: { workflowId: input.workflowId },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    }),

  draftRollback: t.procedure
    .input(z.object({ draftId: z.string() }))
    .mutation(async ({ input }) => {
      const draft = await prisma.workflowDraft.findUnique({
        where: { id: input.draftId },
      })
      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Draft ${input.draftId} not found`,
        })
      }

      return prisma.workflow.update({
        where: { id: draft.workflowId },
        data: {
          nodes: draft.nodes as Prisma.InputJsonValue,
          edges: draft.edges as Prisma.InputJsonValue,
          inputs: draft.inputs as Prisma.InputJsonValue,
          variables: draft.variables as Prisma.InputJsonValue,
        },
      })
    }),

  // ─── Release API ───

  releasePublish: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        name: z.string(),
        yaml: z.string().max(500_000),
      }),
    )
    .mutation(async ({ input }) => {
      // YAML 轻量校验
      try {
        const parsed = parseYaml(input.yaml)
        if (!parsed || typeof parsed !== "object") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "YAML 格式无效",
          })
        }
        if (
          !parsed.id ||
          !parsed.namespace ||
          !Array.isArray(parsed.tasks)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "YAML 缺少 id/namespace/tasks",
          })
        }
      } catch (e) {
        if (e instanceof TRPCError) throw e
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "YAML 解析失败",
        })
      }

      const wf = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
        include: { namespace: true },
      })
      if (!wf) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Workflow ${input.workflowId} not found`,
        })
      }

      const nextVersion = wf.publishedVersion + 1

      const [release] = await prisma.$transaction([
        prisma.workflowRelease.create({
          data: {
            workflowId: input.workflowId,
            version: nextVersion,
            name: input.name,
            nodes: wf.nodes as Prisma.InputJsonValue,
            edges: wf.edges as Prisma.InputJsonValue,
            inputs: wf.inputs as Prisma.InputJsonValue,
            variables: wf.variables as Prisma.InputJsonValue,
            yaml: input.yaml,
          },
        }),
        prisma.workflow.update({
          where: { id: input.workflowId },
          data: { publishedVersion: nextVersion },
        }),
      ])

      // 异步推 Kestra（失败不阻塞发布）
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        await client.upsertFlow(wf.namespace.kestraNamespace, wf.flowId, input.yaml)
      } catch {
        // Kestra 不可达，Release 仍创建成功
      }

      return release
    }),

  releaseList: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .query(({ input }) => {
      return prisma.workflowRelease.findMany({
        where: { workflowId: input.workflowId },
        orderBy: { version: "desc" },
      })
    }),

  releaseRollback: t.procedure
    .input(z.object({ releaseId: z.string() }))
    .mutation(async ({ input }) => {
      const release = await prisma.workflowRelease.findUnique({
        where: { id: input.releaseId },
      })
      if (!release) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Release ${input.releaseId} not found`,
        })
      }

      const wf = await prisma.workflow.findUnique({
        where: { id: release.workflowId },
        include: { namespace: true },
      })
      if (!wf) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Workflow ${release.workflowId} not found`,
        })
      }

      // 事务：先更新 Workflow（用户画布立即恢复），再创建 Draft 记录
      const [draft] = await prisma.$transaction([
        prisma.workflowDraft.create({
          data: {
            workflowId: release.workflowId,
            nodes: release.nodes as Prisma.InputJsonValue,
            edges: release.edges as Prisma.InputJsonValue,
            inputs: release.inputs as Prisma.InputJsonValue,
            variables: release.variables as Prisma.InputJsonValue,
            message: `从版本 v${release.version} 回滚`,
          },
        }),
        prisma.workflow.update({
          where: { id: release.workflowId },
          data: {
            nodes: release.nodes as Prisma.InputJsonValue,
            edges: release.edges as Prisma.InputJsonValue,
            inputs: release.inputs as Prisma.InputJsonValue,
            variables: release.variables as Prisma.InputJsonValue,
          },
        }),
      ])

      // 异步推 Kestra（失败不阻塞）
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        await client.upsertFlow(wf.namespace.kestraNamespace, wf.flowId, release.yaml)
      } catch {
        // Kestra 不可达，本地回滚仍成功
      }

      return draft
    }),

  // ─── Kestra Integration ───

  kestraHealth: t.procedure.query(async () => {
    try {
      const { getKestraClient } = await import("../lib/kestra-client.js")
      const client = getKestraClient()
      const healthy = await client.refreshHealth()
      return { healthy, timestamp: new Date().toISOString() }
    } catch {
      return { healthy: false, timestamp: new Date().toISOString() }
    }
  }),

  executeTest: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        inputValues: z.record(z.string()).optional(),
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
      // 软检查：尝试刷新健康状态，不阻塞执行
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

  executionGet: t.procedure
    .input(z.object({ executionId: z.string() }))
    .query(async ({ input }) => {
      const { getKestraClient, isTerminalState } = await import(
        "../lib/kestra-client.js"
      )

      const exec = await prisma.workflowDraftExecution.findUnique({
        where: { id: input.executionId },
      })
      if (!exec) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Execution not found" })
      }

      // 非终态时同步 Kestra 最新状态
      if (!isTerminalState(exec.state)) {
        try {
          const client = getKestraClient()
          const kestraExec = await client.getExecution(exec.kestraExecId)
          return prisma.workflowDraftExecution.update({
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
        } catch {
          // Kestra 不可达，返回本地数据
          return exec
        }
      }

      return exec
    }),

  executionList: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        state: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {
        workflowId: input.workflowId,
      }
      if (input.state) where.state = input.state

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

  executionKill: t.procedure
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

  executionReplay: t.procedure
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

  executionLogs: t.procedure
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

  syncExecutions: t.procedure.mutation(async () => {
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

    return {
      synced: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    }
  }),

  // ─── Trigger CRUD (基础，M5 做调度逻辑) ───

  triggerCreate: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        name: z.string().min(1).max(100),
        type: z.enum(["schedule", "webhook"]),
        config: z.record(z.unknown()),
        inputs: z.record(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const wf = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
        include: { namespace: true },
      })
      if (!wf) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" })
      }

      const kestraFlowId = `__trigger_${input.workflowId}_${input.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`

      return prisma.workflowTrigger.create({
        data: {
          workflowId: input.workflowId,
          name: input.name,
          type: input.type,
          config: input.config as Prisma.InputJsonValue,
          inputs: (input.inputs ?? {}) as Prisma.InputJsonValue,
          kestraFlowId,
        },
      })
    }),

  triggerList: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .query(({ input }) => {
      return prisma.workflowTrigger.findMany({
        where: { workflowId: input.workflowId },
        orderBy: { createdAt: "desc" },
      })
    }),

  triggerUpdate: t.procedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        config: z.record(z.unknown()).optional(),
        inputs: z.record(z.string()).optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, config, inputs, ...rest } = input
      const updateData: Record<string, unknown> = { ...rest }
      if (config) updateData.config = config as unknown as Prisma.InputJsonValue
      if (inputs) updateData.inputs = inputs as unknown as Prisma.InputJsonValue
      return prisma.workflowTrigger.update({
        where: { id },
        data: updateData,
      })
    }),

  triggerDelete: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.workflowTrigger.delete({ where: { id: input.id } })
    }),
})
