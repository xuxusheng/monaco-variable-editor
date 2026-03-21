import { useState } from "react"
import { X, Save, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface SecretEditorProps {
  namespaceId: string
  editing?: { id: string; key: string; description?: string } | null
  onClose: () => void
  onSaved: () => void
}

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/

export function SecretEditor({ namespaceId, editing, onClose, onSaved }: SecretEditorProps) {
  const [key, setKey] = useState(editing?.key ?? "")
  const [value, setValue] = useState("")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [showValue, setShowValue] = useState(false)
  const [keyError, setKeyError] = useState("")

  const createMutation = trpc.workflow.secretCreate.useMutation({
    onSuccess: () => {
      toast.success("密钥已创建")
      onSaved()
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = trpc.workflow.secretUpdate.useMutation({
    onSuccess: () => {
      toast.success("密钥已更新")
      onSaved()
    },
    onError: (err) => toast.error(err.message),
  })

  const isEdit = !!editing

  function validateKey(v: string) {
    if (!v) {
      setKeyError("密钥名称不能为空")
      return false
    }
    if (!KEY_PATTERN.test(v)) {
      setKeyError("只能使用大写字母、数字和下划线，且以字母或下划线开头")
      return false
    }
    setKeyError("")
    return true
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!validateKey(key)) return
    if (!value) {
      toast.error("密钥值不能为空")
      return
    }

    const payload = { namespaceId, key, value, description: description || undefined }

    if (isEdit) {
      updateMutation.mutate({ id: editing.id, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-lg mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold">{isEdit ? "编辑密钥" : "添加密钥"}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4">
            {/* Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Key</label>
              <Input
                value={key}
                onChange={(e) => {
                  setKey(e.target.value.toUpperCase())
                  if (keyError) validateKey(e.target.value.toUpperCase())
                }}
                onBlur={() => key && validateKey(key)}
                disabled={isEdit}
                placeholder="DATABASE_URL"
                className={keyError ? "border-destructive" : ""}
              />
              {keyError && (
                <p className="text-xs text-destructive">{keyError}</p>
              )}
            </div>

            {/* Value */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Value</label>
              <div className="relative">
                <Input
                  type={showValue ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={isEdit ? "输入新值以替换" : "输入密钥值"}
                  className="pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowValue(!showValue)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选描述"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              <Save className="w-3.5 h-3.5" />
              {pending ? "保存中..." : "保存"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
