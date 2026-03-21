import { PrismaClient } from "./generated/prisma/client.js"

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db"

// 根据 URL 自动选择 adapter（SQLite vs PostgreSQL）
async function createAdapter() {
  if (databaseUrl.startsWith("file:") || databaseUrl.startsWith("sqlite:")) {
    const { PrismaLibSql } = await import("@prisma/adapter-libsql")
    return new PrismaLibSql({ url: databaseUrl })
  }
  // PostgreSQL 用 library 引擎，不需要额外 adapter
  // PrismaClient 会通过内置 Rust 引擎直接连接
  return undefined
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 同步初始化（生产环境 PostgreSQL 不需要 adapter）
// 开发环境 SQLite 需要 adapter，通过延迟加载处理
let prismaInstance: PrismaClient | undefined = globalForPrisma.prisma

if (!prismaInstance) {
  if (databaseUrl.startsWith("file:") || databaseUrl.startsWith("sqlite:")) {
    // SQLite dev：同步 import adapter
    // 注意：这要求 @prisma/adapter-libsql 安装在 dependencies 中
    const { PrismaLibSql } = await import("@prisma/adapter-libsql")
    const adapter = new PrismaLibSql({ url: databaseUrl })
    prismaInstance = new PrismaClient({ adapter })
  } else {
    // PostgreSQL prod：直接用 library 引擎
    prismaInstance = new PrismaClient()
  }

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prismaInstance
  }
}

export const prisma = prismaInstance
