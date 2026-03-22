/**
 * KestraYamlPanel — YAML 预览 + 导入面板
 * 使用 toKestraYaml() 生成完整 Kestra YAML
 * 支持复制、下载、粘贴导入（含变更摘要预览）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import type { editor } from "monaco-editor"
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow"
import type { ApiWorkflowVariable } from "@/types/api"
import { toKestraYaml, fromKestraYaml } from "@/lib/yamlConverter"
import { toast } from "sonner"
import { FileText, Copy, Save, Plus, Minus, Pencil } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import YAML from "yaml"

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

interface ImportDiff {
  added: number
  removed: number
  modified: number
  newNodes: { name: string; type: string }[]
}

type ImportStep = "edit" | "preview"

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
  const [importStep, setImportStep] = useState<ImportStep>("edit")
  const [importDiff, setImportDiff] = useState<ImportDiff | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null)

  const yaml = useMemo(
    () => toKestraYaml(nodes, edges, inputs, variables, flowId, namespace),
    [nodes, edges, inputs, variables, flowId, namespace],
  )

  // Current node names for diff comparison
  const currentNodeNames = useMemo(
    () => new Set(nodes.map((n) => n.name)),
    [nodes],
  )

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yaml)
    toast.success("已复制到剪贴板")
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

  const setParseError = useCallback((message: string, line?: number) => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor) return
    const model = editor.getModel()
    if (!model) return

    if (line != null) {
      monaco.editor.setModelMarkers(model, "yaml-import", [{
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line) + 1,
      }])
    } else {
      monaco.editor.setModelMarkers(model, "yaml-import", [{
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: model.getLineMaxColumn(1) + 1,
      }])
    }
  }, [])

  const clearMarkers = useCallback(() => {
    const monaco = monacoRef.current
    const editor = editorRef.current
    if (!monaco || !editor) return
    const model = editor.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(model, "yaml-import", [])
  }, [])

  const handlePreviewImport = useCallback(() => {
    if (!importYaml.trim()) {
      toast.warning("请粘贴 Kestra YAML")
      return
    }

    clearMarkers()

    try {
      YAML.parse(importYaml)
    } catch (err) {
      const parseErr = err as { message?: string; linePos?: { line: number; col: number }[] }
      const line = parseErr.linePos?.[0]?.line
      const msg = parseErr.message || "YAML 解析失败"
      setParseError(msg, line)
      toast.error(line ? `第 ${line} 行: ${msg}` : msg)
      return
    }

    try {
      const result = fromKestraYaml(importYaml)
      if (result.nodes.length === 0) {
        toast.warning("YAML 中未解析到任务节点")
        return
      }

      const newNodeNames = new Set(result.nodes.map((n) => n.name))
      const added = result.nodes.filter((n) => !currentNodeNames.has(n.name)).length
      const removed = nodes.filter((n) => !newNodeNames.has(n.name)).length
      const modified = result.nodes.filter((n) => currentNodeNames.has(n.name)).length

      setImportDiff({
        added,
        removed,
        modified,
        newNodes: result.nodes.map((n) => ({ name: n.name, type: n.type })),
      })
      setImportStep("preview")
    } catch {
      toast.error("YAML 结构解析失败，请检查格式")
    }
  }, [importYaml, nodes, currentNodeNames, setParseError, clearMarkers])

  const handleConfirmImport = useCallback(() => {
    if (!importYaml.trim()) return

    try {
      const result = fromKestraYaml(importYaml)
      onImport?.(result)
      toast.success(`已导入 ${result.nodes.length} 个节点`)
      setMode("preview")
      setImportYaml("")
      setImportStep("edit")
      setImportDiff(null)
    } catch {
      toast.error("导入失败，请重试")
    }
  }, [importYaml, onImport])

  const handleCancelImport = useCallback(() => {
    setImportStep("edit")
    setImportDiff(null)
  }, [])

  const handleSwitchMode = useCallback((newMode: "preview" | "import") => {
    setMode(newMode)
    if (newMode === "preview") {
      setImportYaml("")
      setImportStep("edit")
      setImportDiff(null)
    }
  }, [])

  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor, monacoInstance: typeof import("monaco-editor")) => {
    editorRef.current = editorInstance
    monacoRef.current = monacoInstance
  }, [])

  // Clean up markers when import text changes
  useEffect(() => {
    if (importStep === "edit") {
      clearMarkers()
    }
  }, [importYaml, importStep, clearMarkers])

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="fixed top-0 right-0 left-auto translate-x-0 translate-y-0 h-screen w-full md:w-[560px] max-w-none rounded-none ring-0 p-0 flex flex-col gap-0 animate-in slide-in-from-right duration-200 zoom-in-100 zoom-out-100 fade-in-0 fade-out-0"
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-border gap-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <DialogTitle>
              {mode === "preview" ? "Kestra YAML" : "导入 YAML"}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              <button
                onClick={() => handleSwitchMode("preview")}
                className={`px-3 py-1.5 transition-colors ${
                  mode === "preview"
                    ? "bg-indigo-500 text-white"
                    : "hover:bg-muted"
                }`}
              >
                预览
              </button>
              <button
                onClick={() => handleSwitchMode("import")}
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
        </DialogHeader>

        {/* Content — scrolls inside the dialog */}
        <div className="flex-1 overflow-y-auto">
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
          ) : importStep === "edit" ? (
            <Editor
              height="100%"
              language="yaml"
              theme="vs"
              value={importYaml}
              onChange={(v) => setImportYaml(v ?? "")}
              onMount={handleEditorMount}
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
          ) : (
            /* Import preview / diff summary */
            <div className="p-5 space-y-4">
              <div className="text-sm font-medium text-foreground">变更摘要</div>
              {importDiff && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-green-600">
                      <Plus className="w-3.5 h-3.5" />
                      新增 {importDiff.added} 个节点
                    </span>
                    <span className="flex items-center gap-1.5 text-red-500">
                      <Minus className="w-3.5 h-3.5" />
                      删除 {importDiff.removed} 个节点
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <Pencil className="w-3.5 h-3.5" />
                      保留 {importDiff.modified} 个节点
                    </span>
                  </div>
                  <div className="border border-border rounded-md divide-y divide-border">
                    {importDiff.newNodes.map((n, i) => {
                      const isNew = !currentNodeNames.has(n.name)
                      return (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                          {isNew ? (
                            <Plus className="w-3 h-3 text-green-600 shrink-0" />
                          ) : (
                            <Pencil className="w-3 h-3 text-amber-600 shrink-0" />
                          )}
                          <span className="font-medium">{n.name}</span>
                          <span className="text-muted-foreground ml-auto">{n.type}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
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
          ) : importStep === "edit" ? (
            <>
              <button
                onClick={() => handleSwitchMode("preview")}
                className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm transition-colors"
              >
                取消
              </button>
              <button
                onClick={handlePreviewImport}
                className="px-3 py-1.5 rounded-md bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
              >
                预览
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleCancelImport}
                className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-sm transition-colors"
              >
                返回编辑
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-3 py-1.5 rounded-md bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
              >
                确认导入
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
