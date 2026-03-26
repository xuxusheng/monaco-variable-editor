import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { Prisma } from "../generated/prisma/client.js"
import { t } from "../trpc.js"
import { prisma } from "../db.js"
import { encrypt, decrypt } from "../lib/crypto.js"

export const workflowSecretRouter = t.router({
  list: t.procedure
    .input(z.object({ namespaceId: z.string() }))
    .query(async ({ input }) => {
      const items = await prisma.secret.findMany({
        where: { namespaceId: input.namespaceId },
        orderBy: { key: "asc" },
      })
      return items.map((s) => ({
        id: s.id,
        key: s.key,
        maskedValue: s.value.length > 8
          ? s.value.slice(0, 4) + "••••" + s.value.slice(-4)
          : "••••••••",
        description: s.description,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
    }),

  create: t.procedure
    .input(z.object({
      namespaceId: z.string(),
      key: z.string().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/, "Key must be uppercase letters, numbers, and underscores only"),
      value: z.string().min(1),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await prisma.secret.findUnique({
        where: { namespaceId_key: { namespaceId: input.namespaceId, key: input.key } },
      })
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Secret with this key already exists" })
      }

      const encrypted = encrypt(input.value, `${input.namespaceId}::${input.key}`)

      let secret
      try {
        secret = await prisma.secret.create({
          data: {
            namespaceId: input.namespaceId,
            key: input.key,
            value: encrypted,
            description: input.description,
          },
        })
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new TRPCError({ code: "CONFLICT", message: "Secret with this key already exists" })
        }
        throw e
      }

      return { id: secret.id, key: secret.key, description: secret.description }
    }),

  update: t.procedure
    .input(z.object({
      id: z.string(),
      value: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const secret = await prisma.secret.findUnique({ where: { id: input.id } })
      if (!secret) throw new TRPCError({ code: "NOT_FOUND", message: "Secret not found" })

      const updated = await prisma.secret.update({
        where: { id: input.id },
        data: {
          ...(input.value !== undefined && {
            value: encrypt(input.value, `${secret.namespaceId}::${secret.key}`),
          }),
          ...(input.description !== undefined && { description: input.description }),
        },
      })

      return { id: updated.id, key: updated.key, description: updated.description }
    }),

  delete: t.procedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const secret = await prisma.secret.findUnique({ where: { id: input.id } })
      if (!secret) throw new TRPCError({ code: "NOT_FOUND", message: "Secret not found" })

      await prisma.secret.delete({ where: { id: input.id } })
      return { success: true }
    }),

  reveal: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const secret = await prisma.secret.findUnique({ where: { id: input.id } })
      if (!secret) throw new TRPCError({ code: "NOT_FOUND", message: "Secret not found" })

      const value = decrypt(secret.value, `${secret.namespaceId}::${secret.key}`)
      return { value }
    }),
})
