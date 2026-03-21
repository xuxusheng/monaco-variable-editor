import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "../../../api/src/router.js"

export const trpc = createTRPCReact<AppRouter>()
