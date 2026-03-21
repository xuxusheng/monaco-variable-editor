import { PrismaClient } from "./generated/prisma/client.js"

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let prismaInstance: PrismaClient | undefined = globalForPrisma.prisma

if (!prismaInstance) {
  if (databaseUrl.startsWith("file:") || databaseUrl.startsWith("sqlite:")) {
    // SQLite dev：需要 libsql adapter
    const { PrismaLibSql } = await import("@prisma/adapter-libsql")
    const adapter = new PrismaLibSql({ url: databaseUrl })
    prismaInstance = new PrismaClient({ adapter })
  } else {
    // PostgreSQL prod：library 引擎直接连接，不需要 adapter
    prismaInstance = new PrismaClient()
  }

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaInstance
  }
}

export const prisma = prismaInstance
