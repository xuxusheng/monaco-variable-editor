import { useState } from "react"
import { Plus, Pencil, Trash2, Eye, EyeOff, Key, Inbox } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { SecretEditor } from "./SecretEditor"

interface SecretTableProps {
  namespaceId: string
}

function RevealCell({ id }: { id: string }) {
  const [revealed, setRevealed] = useState(false)
  const { data } = trpc.workflow.secretReveal.useQuery({ id }, { enabled: revealed })

  return (
    <button
      onClick={() => setRevealed(!revealed)}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {revealed ? (
        <>
          <span className="font-mono">{data?.value ?? "..."}</span>
          <EyeOff className="w-3.5 h-3.5" />
        </>
      ) : (
        <>
          <span>点击显示</span>
          <Eye className="w-3.5 h-3.5" />
        </>
      )}
    </button>
  )
}

export function SecretTable({ namespaceId }: SecretTableProps) {
  const [editorState, setEditorState] = useState<{
    open: boolean
    editing?: { id: string; key: string; description?: string }
  }>({ open: false })

  const { data, refetch } = trpc.workflow.secretList.useQuery({ namespaceId })

  const deleteMutation = trpc.workflow.secretDelete.useMutation({
    onSuccess: () => {
      toast.success("密钥已删除")
      refetch()
    },
    onError: (err) => toast.error(err.message),
  })

  function handleDelete(id: string, key: string) {
    if (window.confirm(`确定要删除密钥 "${key}" 吗？\n密钥删除后不可恢复！`)) {
      deleteMutation.mutate({ id })
    }
  }

  const items = data ?? []

  return (
    <div data-slot="secret-table">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Key className="w-4 h-4 text-muted-foreground" />
          <span>密钥 ({items.length})</span>
        </div>
        <Button
          size="sm"
          onClick={() => setEditorState({ open: true })}
        >
          <Plus className="w-3.5 h-3.5" />
          添加
        </Button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-6 text-center">
          <Inbox className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">暂无密钥</p>
          <p className="text-xs text-muted-foreground/70">点击上方"添加"按钮创建第一个密钥</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-4 px-5 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Key</span>
            <span>Value</span>
            <span>Description</span>
            <span className="w-[72px]">Actions</span>
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-4 px-5 py-2.5 hover:bg-muted/50 transition-colors group items-center"
            >
              {/* Key */}
              <span className="font-mono text-sm font-medium truncate">{item.key}</span>

              {/* Value (masked / reveal) */}
              <div className="text-sm text-muted-foreground">
                <RevealCell id={item.id} />
              </div>

              {/* Description */}
              <span className="text-sm text-muted-foreground truncate">
                {item.description || <span className="text-muted-foreground/50">—</span>}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    setEditorState({
                      open: true,
                      editing: { id: item.id, key: item.key, description: item.description ?? undefined },
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDelete(item.id, item.key)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      {editorState.open && (
        <SecretEditor
          namespaceId={namespaceId}
          editing={editorState.editing}
          onClose={() => setEditorState({ open: false })}
          onSaved={() => {
            setEditorState({ open: false })
            refetch()
          }}
        />
      )}
    </div>
  )
}
