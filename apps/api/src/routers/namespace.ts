import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { createNamespaceSchema } from "../types.js"

const updateNamespaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  kestraNamespace: z.string().min(1).optional(),
  description: z.string().optional(),
})

export const namespaceRouter = t.router({
  list: t.procedure.query(() => {
    return prisma.namespace.findMany({
      orderBy: { createdAt: "desc" },
    })
  }),

  create: t.procedure.input(createNamespaceSchema).mutation(({ input }) => {
    return prisma.namespace.create({ data: input })
  }),

  get: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const ns = await prisma.namespace.findUnique({
        where: { id: input.id },
      })
      if (!ns) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Namespace ${input.id} not found`,
        })
      }
      return ns
    }),

  update: t.procedure.input(updateNamespaceSchema).mutation(async ({ input }) => {
    const { id, ...data } = input
    const ns = await prisma.namespace.findUnique({ where: { id } })
    if (!ns) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Namespace ${id} not found`,
      })
    }
    return prisma.namespace.update({ where: { id }, data })
  }),
})
