import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { parse as parseYaml } from "yaml"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { logger } from "../lib/logger.js"

export const workflowReleaseRouter = t.router({
  publish: t.procedure
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
        logger.warn({ err: e, workflowId: input.workflowId }, "Kestra push failed on release publish")
        kestraStatus = "failed"
      }

      return { ...release, kestraStatus }
    }),

  list: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .query(({ input }) => {
      return prisma.workflowRelease.findMany({
        where: { workflowId: input.workflowId },
        orderBy: { version: "desc" },
      })
    }),

  rollback: t.procedure
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
})
