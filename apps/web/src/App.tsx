import { useState } from "react"
import type React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import superjson from "superjson"
import { MonacoVariableEditor } from "@/components/monaco-variable-editor"
import { parseVariables, getAllVariables, defaultVariableGroups } from "@/types/variables"
import { ReactFlowProvider } from "@xyflow/react"
import WorkflowEditorPage from "@/pages/WorkflowEditorPage"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { Wrench, FileText, Code } from "lucide-react"
import { Toaster } from "sonner"

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
        <AppContent />
      </QueryClientProvider>
    </trpc.Provider>
  )
}

function AppContent() {
  const [tab, setTab] = useState<"monaco" | "workflow">("workflow")
  const [value, setValue] = useState("")
  const allVariables = getAllVariables(defaultVariableGroups)
  const parsed = parseVariables(value)

  const tabBtn = (id: "monaco" | "workflow", label: React.ReactNode) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
        tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
      )}
    >
      {label}
    </button>
  )

  if (tab === "workflow") {
    return (
      <div className="h-screen flex flex-col">
        <div className="h-9 bg-muted/50 border-b border-border flex items-center px-3 gap-1 shrink-0">
          {tabBtn("monaco", <><Code className="w-3.5 h-3.5 inline" /> 编辑器</>)}
          {tabBtn("workflow", <><Wrench className="w-3.5 h-3.5 inline" /> 工作流</>)}
        </div>
        <div className="flex-1 overflow-hidden">
          <ReactFlowProvider>
            <WorkflowEditorPage />
          </ReactFlowProvider>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="h-9 bg-muted/50 border-b border-border flex items-center px-3 gap-1 shrink-0">
        {tabBtn("monaco", <><Code className="w-3.5 h-3.5 inline" /> 编辑器</>)}
        {tabBtn("workflow", <><Wrench className="w-3.5 h-3.5 inline" /> 工作流</>)}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold">Monaco 变量编辑器</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              输入 <code className="bg-muted px-1 rounded text-xs font-mono">{"{{"}</code> 触发变量补全
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <div>
              <MonacoVariableEditor value={value} onChange={setValue} height="400px" />
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium mb-2">🔍 变量 ({parsed.length})</h3>
                <div className="flex flex-col gap-1">
                  {parsed.map((v, i) => {
                    const item = allVariables.find((a) => a.value === v.variable)
                    return (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 text-sm">
                        <span>{item?.icon ?? "❓"}</span>
                        <span className="font-medium text-primary">{item?.label ?? v.variable}</span>
                      </div>
                    )
                  })}
                  {parsed.length === 0 && <p className="text-sm text-muted-foreground text-center py-3">还没有引用变量</p>}
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium mb-2"><FileText className="w-4 h-4 inline" /> 实际值</h3>
                <pre className="text-xs text-muted-foreground bg-muted/50 p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap break-all font-mono">
                  {value || "空"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
