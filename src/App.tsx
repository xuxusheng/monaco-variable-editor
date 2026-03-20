import { useState } from "react"
import { MonacoVariableEditor } from "@/components/monaco-variable-editor"
import { parseVariables, getAllVariables, defaultVariableGroups } from "@/types/variables"
import WorkflowEditorPage from "@/pages/WorkflowEditorPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const DOUBLE_BRACE = "{{"

const INITIAL_VALUE = [
  '尊敬的「{{ input.userName }}」，您好！',
  "",
  '您的订单「{{ input.orderId }}」已确认，',
  '商品：「{{ input.productName }}」',
  '金额：「{{ input.amount }}」元',
  '将发送至「{{ input.email }}」。',
  "",
  "// 👇 试试在下方输入 {{ 触发变量补全",
  "",
].join("\n")

export default function App() {
  const [tab, setTab] = useState<"monaco" | "workflow">("workflow")
  const [value, setValue] = useState(INITIAL_VALUE)
  const allVariables = getAllVariables(defaultVariableGroups)
  const parsed = parseVariables(value)

  const tabBtn = (id: "monaco" | "workflow", label: string) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        "px-3 py-1 rounded-md text-xs font-medium transition-colors",
        tab === id
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  )

  if (tab === "workflow") {
    return (
      <div className="h-screen flex flex-col">
        <div className="h-10 bg-muted/50 border-b border-border flex items-center px-4 gap-1 shrink-0">
          {tabBtn("monaco", "📝 变量编辑器")}
          {tabBtn("workflow", "🔧 工作流编排")}
        </div>
        <div className="flex-1 overflow-hidden">
          <WorkflowEditorPage />
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="h-10 bg-muted/50 border-b border-border flex items-center px-4 gap-1 shrink-0">
        {tabBtn("monaco", "📝 变量编辑器")}
        {tabBtn("workflow", "🔧 工作流编排")}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Monaco 变量编辑器</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              React 19 + Vite 8 + Tailwind CSS v4 + shadcn/ui · 输入{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{DOUBLE_BRACE}</code>{" "}
              触发变量补全
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <div>
              <MonacoVariableEditor value={value} onChange={setValue} height="480px" />
            </div>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    🔍 解析到的变量
                    <Badge variant="secondary" className="text-xs">{parsed.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-1.5">
                    {parsed.map((v, i) => {
                      const item = allVariables.find((a) => a.value === v.variable)
                      return (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm">
                          <span className="text-base">{item?.icon ?? "❓"}</span>
                          <span className="font-medium text-primary">{item?.label ?? v.variable}</span>
                          <code className="text-xs text-muted-foreground ml-auto font-mono">{v.variable}</code>
                        </div>
                      )
                    })}
                    {parsed.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">还没有引用变量</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">📄 实际值</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md overflow-auto max-h-40 whitespace-pre-wrap break-all font-mono">
                    {value}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator className="my-8" />
          <p className="text-xs text-muted-foreground text-center">
            Vite 8 · React 19 · TypeScript 5.9 · Tailwind CSS v4 · shadcn/ui · Monaco Editor
          </p>
        </div>
      </div>
    </div>
  )
}
