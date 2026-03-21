import superjson from "superjson"
import type {
  WorkflowSummary,
  WorkflowFull,
  ApiWorkflowNode,
  ApiWorkflowEdge,
  ApiWorkflowInput,
} from "@/types/api"

function getBaseUrl() {
  if (typeof window !== "undefined") return ""
  return "http://localhost:3001"
}

const BASE = `${getBaseUrl()}/api/trpc`

async function trpcCall<T>(path: string, input?: unknown): Promise<T> {
  const url =
    input !== undefined
      ? `${BASE}/${path}?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`
      : `${BASE}/${path}`

  const res = await fetch(url)
  const json = await res.json()
  if (json.error) throw new Error(json.error.message ?? "tRPC error")
  return superjson.deserialize(json.result.data.json) as T
}

export const trpcClient = {
  workflow: {
    list: () => trpcCall<WorkflowSummary[]>("workflow.list"),
    get: (id: string) => trpcCall<WorkflowFull | null>("workflow.get", { id }),
    create: (input: {
      flowId: string
      name: string
      namespaceId: string
      description?: string
      nodes: ApiWorkflowNode[]
      edges: ApiWorkflowEdge[]
      inputs: ApiWorkflowInput[]
    }) => trpcCall<{ id: string }>("workflow.create", input),
    update: (input: {
      id: string
      flowId?: string
      name?: string
      namespace?: string
      description?: string
      nodes?: ApiWorkflowNode[]
      edges?: ApiWorkflowEdge[]
      inputs?: ApiWorkflowInput[]
    }) => trpcCall<{ id: string }>("workflow.update", input),
  },
}
