import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { createNamespaceSchema } from "../schemas/index.js"

const updateNamespaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(64).optional(),
  kestraNamespace: z.string().min(1).max(64).optional(),
  description: z.string().optional(),
})

export const namespaceRouter = t.router({
  list: t.procedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 50
      const items = await prisma.namespace.findMany({
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input?.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
      })
      const hasMore = items.length > limit
      if (hasMore) items.pop()
      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      }
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
    // 用 $transaction 保证原子性
    await prisma.$transaction([
      prisma.workflow.deleteMany({ where: { namespaceId: input.id } }),
      prisma.namespace.delete({ where: { id: input.id } }),
    ])
    return { id: input.id }
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
    try {
      return await prisma.namespace.update({ where: { id }, data })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Kestra namespace already in use",
        })
      }
      throw e
    }
  }),
})
