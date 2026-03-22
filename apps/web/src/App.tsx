import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import { trpc } from "@/lib/trpc"
import { Toaster } from "sonner"
import { router } from "./routes"
import { RouterProvider } from "@tanstack/react-router"

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  return "http://localhost:3001"
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Toaster position="bottom-right" richColors closeButton />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </trpc.Provider>
  )
}
