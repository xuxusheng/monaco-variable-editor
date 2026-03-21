/**
 * VariableEditor — 创建 / 编辑变量对话框
 */

import { useState, useCallback } from "react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { X, Save } from "lucide-react"

interface VariableEditorProps {
  namespaceId: string
  editing?: { id: string; key: string; value: string; description?: string } | null
  onClose: () => void
  onSaved: () => void
}

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/

export function VariableEditor({
  namespaceId,
  editing,
  onClose,
  onSaved,
}: VariableEditorProps) {
  const [key, setKey] = useState(editing?.key ?? "")
  const [value, setValue] = useState(editing?.value ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [keyError, setKeyError] = useState("")

  const createVar = trpc.workflow.variableCreate.useMutation({
    onSuccess: () => {
      toast.success("变量创建成功")
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const updateVar = trpc.workflow.variableUpdate.useMutation({
    onSuccess: () => {
      toast.success("变量更新成功")
      onSaved()
      onClose()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const isPending = createVar.isPending || updateVar.isPending

  const handleKeyChange = useCallback((v: string) => {
    setKey(v)
    if (v && !KEY_PATTERN.test(v)) {
      setKeyError("Key 必须为大写字母或下划线组成，且以字母或下划线开头")
    } else {
      setKeyError("")
    }
  }, [])

  const handleSubmit = useCallback(() => {
    if (!key.trim()) {
      toast.error("请输入 Key")
      return
    }
    if (!KEY_PATTERN.test(key)) {
      setKeyError("Key 必须为大写字母或下划线组成，且以字母或下划线开头")
      return
    }
    if (!value.trim()) {
      toast.error("请输入 Value")
      return
    }

    if (editing) {
      updateVar.mutate({
        id: editing.id,
        value: value.trim(),
        description: description.trim() || undefined,
      })
    } else {
      createVar.mutate({
        namespaceId,
        key: key.trim(),
        value: value.trim(),
        description: description.trim() || undefined,
      })
    }
  }, [key, value, description, editing, namespaceId, createVar, updateVar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">
            {editing ? "编辑变量" : "创建变量"}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Key */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Key <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="MY_VARIABLE"
              disabled={!!editing}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {keyError && (
              <p className="text-xs text-destructive mt-1">{keyError}</p>
            )}
          </div>

          {/* Value */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Value <span className="text-destructive">*</span>
            </label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="变量值"
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="变量描述（可选）"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm bg-muted hover:bg-muted/80 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  )
}
