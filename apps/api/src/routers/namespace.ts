import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { createNamespaceSchema } from "../types.js"

const updateNamespaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64).optional(),
  kestraNamespace: z.string().min(1).max(64).optional(),
  description: z.string().optional(),
})

export const namespaceRouter = t.router({
  list: t.procedure.query(() => {
    return prisma.namespace.findMany({
      orderBy: { createdAt: "desc" },
    })
  }),

  create: t.procedure.input(createNamespaceSchema).mutation(async ({ input }) => {
    const existing = await prisma.namespace.findFirst({ where: { name: input.name } })
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "空间名称已存在" })
    }
    return prisma.namespace.create({ data: input })
  }),

  delete: t.procedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const ns = await prisma.namespace.findUnique({ where: { id: input.id } })
    if (!ns) {
      throw new TRPCError({ code: "NOT_FOUND", message: "项目空间不存在" })
    }
    const count = await prisma.namespace.count()
    if (count <= 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "不能删除最后一个项目空间" })
    }
    // Namespace -> Workflow 没有 onDelete: Cascade，需要先删除关联的 Workflows
    await prisma.workflow.deleteMany({ where: { namespaceId: input.id } })
    return prisma.namespace.delete({ where: { id: input.id } })
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
