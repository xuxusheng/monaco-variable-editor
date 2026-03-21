import type { Context as HonoContext } from "hono"
import { prisma } from "./db.js"

export function createContext(c: HonoContext) {
  return {
    prisma,
    req: c.req,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
