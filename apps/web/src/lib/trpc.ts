import { createTRPCReact } from "@trpc/react-query"
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import type { AppRouter } from "../../../api/src/router.js"

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  return "http://localhost:3001"
}

// React hooks（用于组件内 useQuery / useMutation）
export const trpc = createTRPCReact<AppRouter>()

// Proxy client（用于 imperative 调用，如按钮触发的加载）
export const trpcProxy = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
})
