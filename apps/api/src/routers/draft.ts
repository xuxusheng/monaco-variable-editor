import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
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

      // 前端传入当前状态时，先更新 workflow 记录（确保刷新后数据不丢）
      if (input.nodes || input.edges || input.inputs || input.variables) {
        await prisma.workflow.update({
          where: { id: input.workflowId },
          data: {
            ...(input.nodes !== undefined && { nodes: input.nodes as Prisma.InputJsonValue }),
            ...(input.edges !== undefined && { edges: input.edges as Prisma.InputJsonValue }),
            ...(input.inputs !== undefined && { inputs: input.inputs as Prisma.InputJsonValue }),
            ...(input.variables !== undefined && { variables: input.variables as Prisma.InputJsonValue }),
          },
        })
      }

      // 重新读取 workflow（可能刚被更新过）
      const updatedWf = await prisma.workflow.findUnique({
        where: { id: input.workflowId },
      })

      const draft = await prisma.workflowDraft.create({
        data: {
          workflowId: input.workflowId,
          nodes: (updatedWf?.nodes ?? wf.nodes) as Prisma.InputJsonValue,
          edges: (updatedWf?.edges ?? wf.edges) as Prisma.InputJsonValue,
          inputs: (updatedWf?.inputs ?? wf.inputs) as Prisma.InputJsonValue,
          variables: (updatedWf?.variables ?? wf.variables) as Prisma.InputJsonValue,
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
