import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { useWorkflowStore } from "@/stores/workflow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface NamespaceCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (id: string) => void
}

export function NamespaceCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: NamespaceCreateDialogProps) {
  const utils = trpc.useUtils()
  const setCurrentNamespace = useWorkflowStore((s) => s.setCurrentNamespace)
  const setHasNamespaces = useWorkflowStore((s) => s.setHasNamespaces)

  const [name, setName] = useState("")
  const [kestraNamespace, setKestraNamespace] = useState("")
  const [description, setDescription] = useState("")

  const createNamespace = trpc.namespace.create.useMutation({
    onSuccess: (result) => {
      utils.namespace.list.invalidate()
      setCurrentNamespace(result.id)
      setHasNamespaces(true)
      toast.success("项目空间已创建")
      onCreated?.(result.id)
      handleReset()
      onOpenChange(false)
    },
    onError: (err) => {
      if (err.data?.code === "CONFLICT") {
        toast.error("空间名称已存在")
      } else {
        toast.error(err.message || "创建失败")
      }
    },
  })

  const handleReset = () => {
    setName("")
    setKestraNamespace("")
    setDescription("")
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("请输入空间名称")
      return
    }
    createNamespace.mutate({
      name: name.trim(),
      kestraNamespace: kestraNamespace.trim() || name.trim(),
      description: description.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建项目空间</DialogTitle>
          <DialogDescription>
            创建一个新的项目空间来组织工作流。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="dialog-ns-name" className="text-sm font-medium">
              空间名称
            </label>
            <Input
              id="dialog-ns-name"
              placeholder="例如：my-project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="dialog-kestra-ns" className="text-sm font-medium">
              Kestra Namespace（可选）
            </label>
            <Input
              id="dialog-kestra-ns"
              placeholder="留空将自动映射"
              value={kestraNamespace}
              onChange={(e) => setKestraNamespace(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="dialog-ns-desc" className="text-sm font-medium">
              描述（可选）
            </label>
            <Input
              id="dialog-ns-desc"
              placeholder="简要描述此空间的用途"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={createNamespace.isPending}>
              {createNamespace.isPending ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
