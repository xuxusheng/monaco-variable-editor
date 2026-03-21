import {
  createTRPCProxyClient,
  httpBatchLink,
} from "@trpc/client"
import superjson from "superjson"
import type { AppRouter } from "../../../api/src/router.js"

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  return "http://localhost:3001"
}

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
})
