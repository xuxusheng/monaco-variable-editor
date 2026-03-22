import { useState } from "react"
import { MonacoVariableEditor } from "@/components/monaco-variable-editor"
import { parseVariables, getAllVariables, defaultVariableGroups } from "@/types/variables"
import { FileText, Search, HelpCircle } from "lucide-react"

export function MonacoVariableEditorPage() {
  const [value, setValue] = useState("")
  const allVariables = getAllVariables(defaultVariableGroups)
  const parsed = parseVariables(value)

  return (
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
            <h3 className="text-sm font-medium mb-2 flex items-center gap-1"><Search className="w-4 h-4" /> 变量 ({parsed.length})</h3>
            <div className="flex flex-col gap-1">
              {parsed.map((v, i) => {
                const item = allVariables.find((a) => a.value === v.variable)
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 text-sm">
                    <span>{item?.icon ?? <HelpCircle className="w-4 h-4" />}</span>
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
  )
}
