/**
 * PublishDialog — 发布新版本对话框
 * 用户填写版本名称 → 生成 YAML → 发布
 */

import { useState, useCallback, useMemo } from "react"
import Editor from "@monaco-editor/react"
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow"
import type { ApiWorkflowVariable } from "@/types/api"
import { toKestraYaml } from "@/lib/yamlConverter"
import { diffNodes } from "@/lib/diff"
import { DiffSummary } from "@/components/flow/DiffSummary"
import { Rocket } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface PublishDialogProps {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowInput[]
  variables: ApiWorkflowVariable[]
  flowId: string
  namespace: string
  nextVersion: number
  isPublishing: boolean
  prevReleaseNodes?: WorkflowNode[]
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
  prevReleaseNodes,
  onPublish,
  onClose,
}: PublishDialogProps) {
  const [name, setName] = useState(`v${nextVersion} 正式版`)
  const [showYaml, setShowYaml] = useState(false)

  const yaml = useMemo(
    () => toKestraYaml(nodes, edges, inputs, variables, flowId, namespace),
    [nodes, edges, inputs, variables, flowId, namespace],
  )

  const diffResult = useMemo(
    () => prevReleaseNodes ? diffNodes(prevReleaseNodes, nodes) : { added: nodes, removed: [], modified: [] },
    [prevReleaseNodes, nodes],
  )

  const handlePublish = useCallback(() => {
    if (!name.trim()) return
    onPublish(name.trim(), yaml)
  }, [name, yaml, onPublish])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-4 h-4" />
            发布新版本
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="space-y-4">
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

          {/* 变更摘要 */}
          {diffResult && (
            <div>
              <label className="block text-sm font-medium mb-1.5">变更摘要</label>
              <div className="rounded-md border border-border p-3 bg-muted/30">
                <DiffSummary diff={diffResult} />
              </div>
            </div>
          )}

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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={handlePublish}
            disabled={!name.trim() || isPublishing}
          >
            {isPublishing ? "发布中..." : `发布 v${nextVersion}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
