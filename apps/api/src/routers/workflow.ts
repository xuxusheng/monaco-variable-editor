import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import {
  createWorkflowSchema,
  updateWorkflowSchema,
} from "../schemas/index.js"

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

      const triggers = await prisma.workflowTrigger.findMany({
        where: { workflowId: { in: workflowIds } },
        select: { id: true, workflowId: true, name: true, type: true, config: true, disabled: true },
      })

      const latestProdExecs = await prisma.workflowExecution.findMany({
        where: { workflowId: { in: workflowIds } },
        orderBy: { createdAt: "desc" },
        take: workflowIds.length * 5,
        select: { id: true, workflowId: true, state: true, triggeredBy: true, startedAt: true, endedAt: true, createdAt: true },
      })

      const latestDraftExecs = await prisma.workflowDraftExecution.findMany({
        where: { workflowId: { in: workflowIds } },
        orderBy: { createdAt: "desc" },
        take: workflowIds.length * 5,
        select: { id: true, workflowId: true, state: true, triggeredBy: true, startedAt: true, endedAt: true, createdAt: true },
      })

      const latestExecByWorkflow = new Map<string, typeof latestProdExecs[number]>()
      for (const exec of [...latestDraftExecs, ...latestProdExecs]) {
        const existing = latestExecByWorkflow.get(exec.workflowId)
        if (!existing || exec.createdAt > existing.createdAt) {
          latestExecByWorkflow.set(exec.workflowId, exec)
        }
      }

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
    .mutation(async ({ input }) => {
      const namespace = await prisma.namespace.findUnique({ where: { id: input.namespaceId } })
      if (!namespace) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "项目空间不存在，请先创建项目空间" })
      }
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
})
