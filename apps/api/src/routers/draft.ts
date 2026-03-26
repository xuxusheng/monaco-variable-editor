import { TRPCError } from "@trpc/server"
import { z } from "zod"
import type { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import {
  workflowNodeSchema,
  workflowEdgeSchema,
  workflowInputSchema,
  workflowVariableSchema,
} from "../schemas/index.js"

export const workflowDraftRouter = t.router({
  save: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        message: z.string().optional(),
        nodes: z.array(workflowNodeSchema).optional(),
        edges: z.array(workflowEdgeSchema).optional(),
        inputs: z.array(workflowInputSchema).optional(),
        variables: z.array(workflowVariableSchema).optional(),
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

      const wfResult = input.nodes || input.edges || input.inputs || input.variables
        ? await prisma.workflow.update({
            where: { id: input.workflowId },
            data: {
              ...(input.nodes !== undefined && { nodes: input.nodes as Prisma.InputJsonValue }),
              ...(input.edges !== undefined && { edges: input.edges as Prisma.InputJsonValue }),
              ...(input.inputs !== undefined && { inputs: input.inputs as Prisma.InputJsonValue }),
              ...(input.variables !== undefined && { variables: input.variables as Prisma.InputJsonValue }),
            },
          })
        : wf

      const draft = await prisma.workflowDraft.create({
        data: {
          workflowId: input.workflowId,
          nodes: wfResult.nodes as Prisma.InputJsonValue,
          edges: wfResult.edges as Prisma.InputJsonValue,
          inputs: wfResult.inputs as Prisma.InputJsonValue,
          variables: wfResult.variables as Prisma.InputJsonValue,
          message: input.message,
        },
      })

      // 异步推 Kestra（失败不阻塞 Draft 保存）
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        if (client.isHealthy()) {
          const namespace = await prisma.namespace.findUnique({
            where: { id: wf.namespaceId },
          })
          if (namespace) {
            const { toKestraYaml } = await import("../lib/yaml-generator.js")
            const yaml = toKestraYaml(
              wfResult.nodes as Prisma.InputJsonValue,
              wfResult.edges as Prisma.InputJsonValue,
              wfResult.inputs as Prisma.InputJsonValue,
              wfResult.variables as Prisma.InputJsonValue,
              wf.flowId,
              namespace.kestraNamespace,
            )
            await client.upsertFlow(namespace.kestraNamespace, `${wf.flowId}_test`, yaml)
          }
        }
      } catch { /* Kestra 不可达，Draft 仍保存成功 */ }

      return draft
    }),

  list: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .query(({ input }) => {
      return prisma.workflowDraft.findMany({
        where: { workflowId: input.workflowId },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    }),

  rollback: t.procedure
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
})
