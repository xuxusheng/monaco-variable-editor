import { initTRPC, TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { prisma } from "../db.js"
import { createNamespaceSchema } from "../types.js"

const t = initTRPC.create()

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
})
