/**
 * KestraYamlPanel — YAML 预览 + 导入面板
 * 使用 toKestraYaml() 生成完整 Kestra YAML
 * 支持复制、下载、粘贴导入
 */

import { useCallback, useMemo, useState } from "react"
import Editor from "@monaco-editor/react"
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow"
import type { ApiWorkflowVariable } from "@/types/api"
import { toKestraYaml, fromKestraYaml } from "@/lib/yamlConverter"
import { toast } from "sonner"
import { FileText, Copy, Save } from "lucide-react"

interface KestraYamlPanelProps {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowInput[]
  variables: ApiWorkflowVariable[]
  flowId: string
  namespace: string
  onImport?: (data: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; inputs: WorkflowInput[] }) => void
  onClose: () => void
}

export function KestraYamlPanel({
  nodes,
  edges,
  inputs,
  variables,
  flowId,
  namespace,
  onImport,
  onClose,
}: KestraYamlPanelProps) {
  const [mode, setMode] = useState<"preview" | "import">("preview")
  const [importYaml, setImportYaml] = useState("")

  const yaml = useMemo(
    () => toKestraYaml(nodes, edges, inputs, variables, flowId, namespace),
    [nodes, edges, inputs, variables, flowId, namespace],
  )

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yaml)
    toast.success("YAML 已复制")
  }, [yaml])

  const handleDownload = useCallback(() => {
    const blob = new Blob([yaml], { type: "text/yaml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${flowId}.yaml`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("YAML 已下载")
  }, [yaml, flowId])

  const handleImport = useCallback(() => {
    if (!importYaml.trim()) {
      toast.warning("请粘贴 Kestra YAML")
      return
    }

    try {
      const result = fromKestraYaml(importYaml)
      if (result.nodes.length === 0) {
        toast.warning("YAML 中未解析到任务节点")
        return
      }
      if (
        !window.confirm(
          `导入 ${result.nodes.length} 个节点将替换当前画布上的所有内容，确定继续？`,
        )
      ) {
        return
      }
      onImport?.(result)
      toast.success(`已导入 ${result.nodes.length} 个节点`)
      setMode("preview")
      setImportYaml("")
    } catch {
      toast.error("YAML 解析失败，请检查格式")
    }
  }, [importYaml, onImport])

  return (
    <div className="fixed top-0 right-0 h-screen w-full md:w-[560px] bg-card border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg"><FileText className="w-4 h-4" /></span>
          <h2 className="text-base font-semibold">
            {mode === "preview" ? "Kestra YAML" : "导入 YAML"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            <button
              onClick={() => setMode("preview")}
              className={`px-3 py-1.5 transition-colors ${
                mode === "preview"
                  ? "bg-indigo-500 text-white"
                  : "hover:bg-muted"
              }`}
            >
              预览
            </button>
            <button
              onClick={() => setMode("import")}
              className={`px-3 py-1.5 transition-colors ${
                mode === "import"
                  ? "bg-indigo-500 text-white"
                  : "hover:bg-muted"
              }`}
            >
              导入
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "preview" ? (
          <Editor
            height="100%"
            language="yaml"
            theme="vs"
            value={yaml}
            options={{
              readOnly: true,
              fontSize: 13,
              lineHeight: 22,
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
            }}
          />
        ) : (
          <Editor
            height="100%"
            language="yaml"
            theme="vs"
            value={importYaml}
            onChange={(v) => setImportYaml(v ?? "")}
            options={{
              fontSize: 13,
              lineHeight: 22,
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              placeholder: "粘贴 Kestra YAML 在此处...",
            }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
        {mode === "preview" ? (
          <>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm transition-colors"
            >
              <Copy className="w-3.5 h-3.5" /> 复制
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-md bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> 下载 .yaml
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setMode("preview")
                setImportYaml("")
              }}
              className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              className="px-3 py-1.5 rounded-md bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
            >
              导入到画布
            </button>
          </>
        )}
      </div>
    </div>
  )
}
