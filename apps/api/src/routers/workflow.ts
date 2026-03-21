import { TRPCError } from "@trpc/server"
import { z } from "zod"
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

      return prisma.workflowDraft.create({
        data: {
          workflowId: input.workflowId,
          nodes: wf.nodes as Prisma.InputJsonValue,
          edges: wf.edges as Prisma.InputJsonValue,
          inputs: wf.inputs as Prisma.InputJsonValue,
          variables: wf.variables as Prisma.InputJsonValue,
          message: input.message,
        },
      })
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
        const { parse } = await import("yaml")
        const parsed = parse(input.yaml)
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

      return draft
    }),
})
