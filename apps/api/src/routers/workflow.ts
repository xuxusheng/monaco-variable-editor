import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { parse as parseYaml } from "yaml"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { createWorkflowSchema, updateWorkflowSchema } from "../types.js"
import { buildTriggerFlowYaml } from "../lib/trigger-yaml.js"
import { encrypt, decrypt } from "../lib/crypto.js"

const idSchema = z.object({ id: z.string() })

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "unnamed"
}

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
          publishedVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    }),

  listEnriched: t.procedure
    .input(z.object({ namespaceId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const workflows = await prisma.workflow.findMany({
        where: input?.namespaceId ? { namespaceId: input.namespaceId } : undefined,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          flowId: true,
          namespaceId: true,
          disabled: true,
          publishedVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      if (workflows.length === 0) return []

      const workflowIds = workflows.map((w) => w.id)

      // Fetch triggers for all workflows
      const triggers = await prisma.workflowTrigger.findMany({
        where: { workflowId: { in: workflowIds } },
        select: { id: true, workflowId: true, name: true, type: true, config: true, disabled: true },
      })

      // Fetch latest production execution per workflow
      const latestProdExecs = await prisma.workflowExecution.findMany({
        where: { workflowId: { in: workflowIds } },
        orderBy: { createdAt: "desc" },
        take: workflowIds.length * 5,
        select: { id: true, workflowId: true, state: true, triggeredBy: true, startedAt: true, endedAt: true, createdAt: true },
      })

      // Fetch latest draft execution per workflow
      const latestDraftExecs = await prisma.workflowDraftExecution.findMany({
        where: { workflowId: { in: workflowIds } },
        orderBy: { createdAt: "desc" },
        take: workflowIds.length * 5,
        select: { id: true, workflowId: true, state: true, triggeredBy: true, startedAt: true, endedAt: true, createdAt: true },
      })

      // Index latest execution per workflow (prefer production)
      const latestExecByWorkflow = new Map<string, typeof latestProdExecs[number]>()
      for (const exec of latestDraftExecs) {
        if (!latestExecByWorkflow.has(exec.workflowId)) {
          latestExecByWorkflow.set(exec.workflowId, exec)
        }
      }
      for (const exec of latestProdExecs) {
        latestExecByWorkflow.set(exec.workflowId, exec)
      }

      // Index triggers per workflow
      const triggersByWorkflow = new Map<string, typeof triggers>()
      for (const trigger of triggers) {
        const list = triggersByWorkflow.get(trigger.workflowId) ?? []
        list.push(trigger)
        triggersByWorkflow.set(trigger.workflowId, list)
      }

      return workflows.map((wf) => {
        const wfTriggers = triggersByWorkflow.get(wf.id) ?? []
        const lastExec = latestExecByWorkflow.get(wf.id) ?? null
        return {
          ...wf,
          triggers: wfTriggers.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            config: t.config,
            disabled: t.disabled,
          })),
          lastExecution: lastExec
            ? {
                state: lastExec.state,
                triggeredBy: lastExec.triggeredBy,
                startedAt: lastExec.startedAt?.toISOString() ?? null,
                endedAt: lastExec.endedAt?.toISOString() ?? null,
                createdAt: lastExec.createdAt.toISOString(),
              }
            : null,
        }
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

  duplicate: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .mutation(async ({ input }) => {
      const source = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
      })
      if (!source) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Workflow ${input.workflowId} not found`,
        })
      }

      // Generate unique flowId for the copy
      let newFlowId = `${source.flowId}_copy`
      let counter = 1
      while (
        await prisma.workflow.findUnique({
          where: {
            namespaceId_flowId: {
              namespaceId: source.namespaceId,
              flowId: newFlowId,
            },
          },
        })
      ) {
        counter++
        newFlowId = `${source.flowId}_copy${counter}`
      }

      return prisma.workflow.create({
        data: {
          name: `${source.name}（副本）`,
          flowId: newFlowId,
          namespaceId: source.namespaceId,
          description: source.description,
          nodes: source.nodes as Prisma.InputJsonValue,
          edges: source.edges as Prisma.InputJsonValue,
          inputs: source.inputs as Prisma.InputJsonValue,
          variables: source.variables as Prisma.InputJsonValue,
        },
      })
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
      let kestraStatus: "synced" | "failed" = "synced"
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        await client.upsertFlow(wf.namespace.kestraNamespace, wf.flowId, input.yaml)
      } catch (e) {
        console.warn(`[releasePublish] Kestra push failed for workflow ${input.workflowId}:`, e)
        kestraStatus = "failed"
      }

      return { ...release, kestraStatus }
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

      // 先查草稿执行，再查生产执行
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

  executionList: t.procedure
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

    // Also sync production executions
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

  // ─── Production Execution API ───

  productionExecList: t.procedure
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

  productionExecGet: t.procedure
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

  // ─── Trigger CRUD (基础，M5 做调度逻辑) ───

  triggerCreate: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        name: z.string().min(1).max(100),
        type: z.enum(["schedule", "webhook"]),
        config: z.record(z.unknown()),
        inputs: z.record(z.string()).optional(),
        releaseId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const wf = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
        include: {
          namespace: true,
          releases: { orderBy: { version: "desc" }, take: 10 },
        },
      })
      if (!wf) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workflow not found" })
      }
      if (wf.releases.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请先发布一个版本再创建触发器",
        })
      }

      if (input.type === "webhook" && !input.config.secret) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook secret is required" })
      }

      const release = input.releaseId
        ? wf.releases.find((r) => r.id === input.releaseId) ?? wf.releases[0]!
        : wf.releases[0]!

      const kestraFlowId = `__trigger_${wf.id}_${nameToSlug(input.name)}`
      const existing = await prisma.workflowTrigger.findFirst({
        where: { workflowId: input.workflowId, name: input.name },
      })
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "同名触发器已存在" })
      }

      const { buildTriggerFlowYaml } = await import("../lib/trigger-yaml.js")
      const yaml = buildTriggerFlowYaml({
        namespace: wf.namespace.kestraNamespace,
        flowId: kestraFlowId,
        baseYaml: release.yaml,
        triggerType: input.type as "schedule" | "webhook",
        triggerConfig: input.config,
      })

      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        await client.upsertFlow(wf.namespace.kestraNamespace, kestraFlowId, yaml)
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "推送触发器到 Kestra 失败",
        })
      }

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

  triggerStatus: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .query(async ({ input }) => {
      const triggers = await prisma.workflowTrigger.findMany({
        where: { workflowId: input.workflowId },
        select: { id: true, type: true, config: true, kestraFlowId: true },
      })

      // Get the most recent production execution for each trigger
      const execs = await prisma.workflowExecution.findMany({
        where: {
          workflowId: input.workflowId,
          triggeredBy: { startsWith: "trigger:" },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { triggeredBy: true, state: true, startedAt: true, endedAt: true, createdAt: true },
      })

      // Index latest execution per trigger name
      const latestExec = new Map<string, (typeof execs)[number]>()
      for (const exec of execs) {
        // triggeredBy format: "trigger:<triggerName>"
        const triggerName = exec.triggeredBy.slice("trigger:".length)
        if (!latestExec.has(triggerName)) latestExec.set(triggerName, exec)
      }

      const { nextCronFire } = await import("../lib/cron.js")

      return triggers.map((t) => {
        const config = t.config as Record<string, unknown>

        // Next fire time (schedule only)
        let nextFireAt: string | null = null
        if (t.type === "schedule") {
          const cron = config.cron as string | undefined
          if (cron) {
            try {
              const next = nextCronFire(cron, new Date())
              if (next) nextFireAt = next.toISOString()
            } catch { /* ignore parse errors */ }
          }
        }

        // Last execution
        const lastExec = latestExec.get(t.kestraFlowId) ?? null

        return {
          triggerId: t.id,
          nextFireAt,
          lastExecution: lastExec
            ? {
                state: lastExec.state,
                startedAt: lastExec.startedAt?.toISOString() ?? null,
                endedAt: lastExec.endedAt?.toISOString() ?? null,
              }
            : null,
        }
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

      // If config changed and trigger is active, re-sync Kestra
      if (config) {
        const trigger = await prisma.workflowTrigger.findUnique({
          where: { id },
          include: {
            workflow: {
              include: {
                namespace: true,
                releases: { orderBy: { version: "desc" }, take: 1 },
              },
            },
          },
        })
        if (trigger && !trigger.disabled && trigger.workflow.releases.length > 0) {
          const release = trigger.workflow.releases[0]!
          const yaml = buildTriggerFlowYaml({
            namespace: trigger.workflow.namespace.kestraNamespace,
            flowId: trigger.kestraFlowId,
            baseYaml: release.yaml,
            triggerType: trigger.type as "schedule" | "webhook",
            triggerConfig: config,
          })
          try {
            const { getKestraClient } = await import("../lib/kestra-client.js")
            const client = getKestraClient()
            await client.upsertFlow(trigger.workflow.namespace.kestraNamespace, trigger.kestraFlowId, yaml)
          } catch { /* best-effort */ }
        }
      }

      return prisma.workflowTrigger.update({
        where: { id },
        data: updateData,
      })
    }),

  triggerDelete: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const trigger = await prisma.workflowTrigger.findUnique({
        where: { id: input.id },
        include: { workflow: { include: { namespace: true } } },
      })
      if (!trigger) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trigger not found" })
      }

      // Best-effort Kestra cleanup
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        await client.deleteFlow(trigger.workflow.namespace.kestraNamespace, trigger.kestraFlowId)
      } catch { /* best-effort */ }

      return prisma.workflowTrigger.delete({ where: { id: input.id } })
    }),

  triggerToggle: t.procedure
    .input(z.object({ id: z.string(), disabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const trigger = await prisma.workflowTrigger.findUnique({
        where: { id: input.id },
        include: {
          workflow: {
            include: {
              namespace: true,
              releases: { orderBy: { version: "desc" }, take: 1 },
            },
          },
        },
      })
      if (!trigger) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trigger not found" })
      }

      const ns = trigger.workflow.namespace.kestraNamespace

      if (input.disabled) {
        // Best-effort Kestra cleanup
        try {
          const { getKestraClient } = await import("../lib/kestra-client.js")
          const client = getKestraClient()
          await client.deleteFlow(ns, trigger.kestraFlowId)
        } catch { /* best-effort */ }
      } else {
        // Re-generate YAML and push (hard fail)
        if (trigger.workflow.releases.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "请先发布一个版本再启用触发器",
          })
        }
        const release = trigger.workflow.releases[0]!
        const { buildTriggerFlowYaml } = await import("../lib/trigger-yaml.js")
        const yaml = buildTriggerFlowYaml({
          namespace: ns,
          flowId: trigger.kestraFlowId,
          baseYaml: release.yaml,
          triggerType: trigger.type as "schedule" | "webhook",
          triggerConfig: trigger.config as Record<string, unknown>,
        })
        try {
          const { getKestraClient } = await import("../lib/kestra-client.js")
          const client = getKestraClient()
          await client.upsertFlow(ns, trigger.kestraFlowId, yaml)
        } catch {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "推送触发器到 Kestra 失败",
          })
        }
      }

      return prisma.workflowTrigger.update({
        where: { id: input.id },
        data: { disabled: input.disabled },
      })
    }),

  // ─── Variable API ───

  variableList: t.procedure
    .input(z.object({ namespaceId: z.string() }))
    .query(async ({ input }) => {
      const items = await prisma.variable.findMany({
        where: { namespaceId: input.namespaceId },
        orderBy: { key: "asc" },
      })
      return items
    }),

  variableCreate: t.procedure
    .input(z.object({
      namespaceId: z.string(),
      key: z.string().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be uppercase letters, numbers, and underscores only"),
      value: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.variable.findUnique({
        where: { namespaceId_key: { namespaceId: input.namespaceId, key: input.key } },
      })
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Variable with this key already exists" })
      }

      const variable = await prisma.variable.create({
        data: {
          namespaceId: input.namespaceId,
          key: input.key,
          value: input.value,
          description: input.description,
        },
      })

      // Best-effort sync to Kestra namespace variables
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        const ns = await prisma.namespace.findUnique({ where: { id: input.namespaceId } })
        if (ns) {
          const allVars = await prisma.variable.findMany({
            where: { namespaceId: input.namespaceId },
          })
          const vars = Object.fromEntries(allVars.map((v) => [v.key, v.value]))
          await client.request("POST", `/api/v1/variables/${ns.kestraNamespace}`, vars)
        }
      } catch { /* best-effort */ }

      return variable
    }),

  variableUpdate: t.procedure
    .input(z.object({
      id: z.string(),
      value: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const variable = await prisma.variable.findUnique({ where: { id: input.id } })
      if (!variable) throw new TRPCError({ code: "NOT_FOUND", message: "Variable not found" })

      const updated = await prisma.variable.update({
        where: { id: input.id },
        data: {
          ...(input.value !== undefined && { value: input.value }),
          ...(input.description !== undefined && { description: input.description }),
        },
      })

      // Best-effort sync
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        const ns = await prisma.namespace.findUnique({ where: { id: variable.namespaceId } })
        if (ns) {
          const allVars = await prisma.variable.findMany({ where: { namespaceId: variable.namespaceId } })
          const vars = Object.fromEntries(allVars.map((v) => [v.key, v.value]))
          await client.request("POST", `/api/v1/variables/${ns.kestraNamespace}`, vars)
        }
      } catch { /* best-effort */ }

      return updated
    }),

  variableDelete: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const variable = await prisma.variable.findUnique({ where: { id: input.id } })
      if (!variable) throw new TRPCError({ code: "NOT_FOUND", message: "Variable not found" })

      await prisma.variable.delete({ where: { id: input.id } })

      // Best-effort sync — delete specific key from Kestra
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        const ns = await prisma.namespace.findUnique({ where: { id: variable.namespaceId } })
        if (ns) {
          await client.request("DELETE", `/api/v1/variables/${ns.kestraNamespace}/${variable.key}`)
        }
      } catch { /* best-effort */ }

      return { success: true }
    }),

  // ─── Secret API ───

  secretList: t.procedure
    .input(z.object({ namespaceId: z.string() }))
    .query(async ({ input }) => {
      const items = await prisma.secret.findMany({
        where: { namespaceId: input.namespaceId },
        orderBy: { key: "asc" },
      })
      return items.map((s) => ({
        id: s.id,
        key: s.key,
        maskedValue: s.value.length > 8
          ? s.value.slice(0, 4) + "••••" + s.value.slice(-4)
          : "••••••••",
        description: s.description,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
    }),

  secretCreate: t.procedure
    .input(z.object({
      namespaceId: z.string(),
      key: z.string().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be uppercase letters, numbers, and underscores only"),
      value: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.secret.findUnique({
        where: { namespaceId_key: { namespaceId: input.namespaceId, key: input.key } },
      })
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Secret with this key already exists" })
      }

      const encrypted = encrypt(input.value, `${input.namespaceId}::${input.key}`)

      const secret = await prisma.secret.create({
        data: {
          namespaceId: input.namespaceId,
          key: input.key,
          value: encrypted,
          description: input.description,
        },
      })

      return { id: secret.id, key: secret.key, description: secret.description }
    }),

  secretUpdate: t.procedure
    .input(z.object({
      id: z.string(),
      value: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const secret = await prisma.secret.findUnique({ where: { id: input.id } })
      if (!secret) throw new TRPCError({ code: "NOT_FOUND", message: "Secret not found" })

      const updated = await prisma.secret.update({
        where: { id: input.id },
        data: {
          ...(input.value !== undefined && {
            value: encrypt(input.value, `${secret.namespaceId}::${secret.key}`),
          }),
          ...(input.description !== undefined && { description: input.description }),
        },
      })

      return { id: updated.id, key: updated.key, description: updated.description }
    }),

  secretDelete: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await prisma.secret.delete({ where: { id: input.id } })
      return { success: true }
    }),

  secretReveal: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const secret = await prisma.secret.findUnique({ where: { id: input.id } })
      if (!secret) throw new TRPCError({ code: "NOT_FOUND", message: "Secret not found" })

      const value = decrypt(secret.value, `${secret.namespaceId}::${secret.key}`)
      return { value }
    }),
})
