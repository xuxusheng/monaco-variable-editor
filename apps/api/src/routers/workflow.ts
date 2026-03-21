import { initTRPC, TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { prisma } from "../db.js"
import { createWorkflowSchema, updateWorkflowSchema } from "../types.js"

const t = initTRPC.create()

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
})
