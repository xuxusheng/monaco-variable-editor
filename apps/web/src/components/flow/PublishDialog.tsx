/**
 * PublishDialog — 发布新版本对话框
 * 用户填写版本名称 → 生成 YAML → 发布
 */

import { useState, useCallback, useMemo } from "react"
import Editor from "@monaco-editor/react"
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow"
import type { ApiWorkflowVariable } from "@/types/api"
import { toKestraYaml } from "@/lib/yamlConverter"
import { Rocket } from "lucide-react"

interface PublishDialogProps {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowInput[]
  variables: ApiWorkflowVariable[]
  flowId: string
  namespace: string
  nextVersion: number
  isPublishing: boolean
  onPublish: (name: string, yaml: string) => void
  onClose: () => void
}

export function PublishDialog({
  nodes,
  edges,
  inputs,
  variables,
  flowId,
  namespace,
  nextVersion,
  isPublishing,
  onPublish,
  onClose,
}: PublishDialogProps) {
  const [name, setName] = useState(`v${nextVersion} 正式版`)
  const [showYaml, setShowYaml] = useState(false)

  const yaml = useMemo(
    () => toKestraYaml(nodes, edges, inputs, variables, flowId, namespace),
    [nodes, edges, inputs, variables, flowId, namespace],
  )

  const handlePublish = useCallback(() => {
    if (!name.trim()) return
    onPublish(name.trim(), yaml)
  }, [name, yaml, onPublish])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-lg"><Rocket className="w-4 h-4" /></span>
            <h2 className="text-base font-semibold">发布新版本</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">版本名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`v${nextVersion} 正式版`}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* YAML preview toggle */}
          <div>
            <button
              onClick={() => setShowYaml(!showYaml)}
              className="text-xs text-indigo-500 hover:text-indigo-600 transition-colors"
            >
              {showYaml ? "▼ 隐藏 YAML 预览" : "▶ 查看 YAML 预览"}
            </button>
            {showYaml && (
              <div className="mt-2 border border-border rounded-md overflow-hidden h-64">
                <Editor
                  height="100%"
                  language="yaml"
                  theme="vs"
                  value={yaml}
                  options={{
                    readOnly: true,
                    fontSize: 12,
                    lineHeight: 20,
                    minimap: { enabled: false },
                    padding: { top: 8 },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm bg-muted hover:bg-muted/80 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handlePublish}
            disabled={!name.trim() || isPublishing}
            className="px-4 py-2 rounded-md text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPublishing ? "发布中..." : `发布 v${nextVersion}`}
          </button>
        </div>
      </div>
    </div>
  )
}
