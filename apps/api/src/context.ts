import type { Context as HonoContext } from "hono"

export function createContext(c: HonoContext) {
  return {
    req: c.req,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
