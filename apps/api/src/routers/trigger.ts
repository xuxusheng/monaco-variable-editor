import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { logger } from "../lib/logger.js"
import { triggerConfigSchema } from "../schemas/index.js"
import { nameToSlug } from "@weave/shared/slug"
import { buildTriggerFlowYaml } from "../lib/trigger-yaml.js"

export const workflowTriggerRouter = t.router({
  create: t.procedure
    .input(
      z.object({
        workflowId: z.string(),
        name: z.string().min(1).max(100),
        type: z.enum(["schedule", "webhook"]),
        config: triggerConfigSchema,
        inputs: z.record(z.string(), z.string()).optional(),
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

      if (
        input.type === "webhook" &&
        (!("secret" in input.config) || !input.config.secret)
      ) {
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

  list: t.procedure
    .input(z.object({ workflowId: z.string() }))
    .query(({ input }) => {
      return prisma.workflowTrigger.findMany({
        where: { workflowId: input.workflowId },
        orderBy: { createdAt: "desc" },
      })
    }),

  status: t.procedure
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

  update: t.procedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        config: triggerConfigSchema.optional(),
        inputs: z.record(z.string(), z.string()).optional(),
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
          } catch (e) {
            logger.warn({ err: e }, "Kestra trigger sync failed (best-effort)")
          }
        }
      }

      return prisma.workflowTrigger.update({
        where: { id },
        data: updateData,
      })
    }),

  delete: t.procedure
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
      } catch (e) {
        logger.warn({ err: e }, "Kestra trigger delete failed (best-effort)")
      }

      return prisma.workflowTrigger.delete({ where: { id: input.id } })
    }),

  toggle: t.procedure
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
        } catch (e) {
          logger.warn({ err: e }, "Kestra trigger disable failed (best-effort)")
        }
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
})
