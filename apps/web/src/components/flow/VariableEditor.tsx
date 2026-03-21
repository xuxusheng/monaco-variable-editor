/**
 * VariableEditor — 创建 / 编辑变量对话框
 */

import { useState, useCallback } from "react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { Save } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "编辑变量" : "创建变量"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Key */}
          <div className="space-y-1.5">
            <Label>
              Key <span className="text-destructive">*</span>
            </Label>
            <Input
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="MY_VARIABLE"
              disabled={!!editing}
            />
            {keyError && (
              <p className="text-xs text-destructive">{keyError}</p>
            )}
          </div>

          {/* Value */}
          <div className="space-y-1.5">
            <Label>
              Value <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="变量值"
              rows={4}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="变量描述（可选）"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            <Save className="w-3.5 h-3.5" />
            {isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
