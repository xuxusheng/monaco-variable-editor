import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { logger } from "../lib/logger.js"

export const workflowVariableRouter = t.router({
  list: t.procedure
    .input(z.object({ namespaceId: z.string() }))
    .query(async ({ input }) => {
      const items = await prisma.variable.findMany({
        where: { namespaceId: input.namespaceId },
        orderBy: { key: "asc" },
      })
      return items
    }),

  create: t.procedure
    .input(z.object({
      namespaceId: z.string(),
      key: z.string().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be uppercase letters, numbers, and underscores only"),
      value: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.variable.findUnique({
        where: { namespaceId_key: { namespaceId: input.namespaceId, key: input.key } },
      })
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Variable with this key already exists" })
      }

      let variable
      try {
        variable = await prisma.variable.create({
          data: {
            namespaceId: input.namespaceId,
            key: input.key,
            value: input.value,
            description: input.description,
          },
        })
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "Variable with this key already exists" })
        }
        throw e
      }

      // Best-effort sync to Kestra namespace variables
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        const ns = await prisma.namespace.findUnique({ where: { id: input.namespaceId } })
        if (ns) {
          const allVars = await prisma.variable.findMany({
            where: { namespaceId: input.namespaceId },
          })
          const vars = Object.fromEntries(allVars.map((v) => [v.key, v.value]))
          await client.request("POST", `/api/v1/variables/${ns.kestraNamespace}`, vars)
        }
      } catch (e) {
        logger.warn({ err: e }, "Kestra variable sync failed (best-effort)")
      }

      return variable
    }),

  update: t.procedure
    .input(z.object({
      id: z.string(),
      value: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const variable = await prisma.variable.findUnique({ where: { id: input.id } })
      if (!variable) throw new TRPCError({ code: "NOT_FOUND", message: "Variable not found" })

      const updated = await prisma.variable.update({
        where: { id: input.id },
        data: {
          ...(input.value !== undefined && { value: input.value }),
          ...(input.description !== undefined && { description: input.description }),
        },
      })

      // Best-effort sync
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        const ns = await prisma.namespace.findUnique({ where: { id: variable.namespaceId } })
        if (ns) {
          const allVars = await prisma.variable.findMany({ where: { namespaceId: variable.namespaceId } })
          const vars = Object.fromEntries(allVars.map((v) => [v.key, v.value]))
          await client.request("POST", `/api/v1/variables/${ns.kestraNamespace}`, vars)
        }
      } catch (e) {
        logger.warn({ err: e }, "Kestra variable update sync failed (best-effort)")
      }

      return updated
    }),

  delete: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const variable = await prisma.variable.findUnique({ where: { id: input.id } })
      if (!variable) throw new TRPCError({ code: "NOT_FOUND", message: "Variable not found" })

      await prisma.variable.delete({ where: { id: input.id } })

      // Best-effort sync — delete specific key from Kestra
      try {
        const { getKestraClient } = await import("../lib/kestra-client.js")
        const client = getKestraClient()
        const ns = await prisma.namespace.findUnique({ where: { id: variable.namespaceId } })
        if (ns) {
          await client.request("DELETE", `/api/v1/variables/${ns.kestraNamespace}/${variable.key}`)
        }
      } catch (e) {
        logger.warn({ err: e }, "Kestra variable delete sync failed (best-effort)")
      }

      return { success: true }
    }),
})
