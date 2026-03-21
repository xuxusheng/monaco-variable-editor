/**
 * VariableTable — 变量列表表格
 * 支持查看 / 创建 / 编辑 / 删除
 */

import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Inbox } from "lucide-react"
import { VariableEditor } from "./VariableEditor"
import type { ApiWorkflowVariable } from "@/types/api"

interface VariableTableProps {
  namespaceId: string
}

type VariableItem = ApiWorkflowVariable & { id: string }

export function VariableTable({ namespaceId }: VariableTableProps) {
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<{
    id: string
    key: string
    value: string
    description?: string
  } | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: variables, refetch } = trpc.workflow.variableList.useQuery({
    namespaceId,
  })

  const deleteVar = trpc.workflow.variableDelete.useMutation({
    onSuccess: () => {
      toast.success("变量已删除")
      refetch()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const handleEdit = (v: VariableItem) => {
    setEditing(v)
    setShowEditor(true)
  }

  const handleDelete = (id: string) => {
    deleteVar.mutate({ id })
    setDeletingId(null)
  }

  const items: VariableItem[] = (variables as VariableItem[] | undefined) ?? []

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          变量 ({items.length})
        </h3>
        <button
          onClick={() => {
            setEditing(null)
            setShowEditor(true)
          }}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          添加
        </button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Inbox className="w-8 h-8 mb-2" />
          <p className="text-sm">暂无变量</p>
        </div>
      )}

      {/* Table */}
      {items.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-2.5 font-medium">Key</th>
                <th className="px-4 py-2.5 font-medium">Value</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium w-24 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((v) => {
                const isExpanded = expandedKey === v.id
                const truncated =
                  v.value.length > 40 ? v.value.slice(0, 40) + "..." : v.value

                return (
                  <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs">{v.key}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() =>
                          setExpandedKey(isExpanded ? null : v.id)
                        }
                        className="flex items-center gap-1 text-left text-xs hover:text-foreground transition-colors"
                      >
                        <span className="font-mono whitespace-pre-wrap break-all">
                          {isExpanded ? v.value : truncated}
                        </span>
                        {v.value.length > 40 && (
                          isExpanded
                            ? <ChevronUp className="w-3 h-3 shrink-0" />
                            : <ChevronDown className="w-3 h-3 shrink-0" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {v.description || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(v)}
                          className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                          title="编辑"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {deletingId === v.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(v.id)}
                              className="px-2 py-1 rounded text-xs bg-destructive text-destructive-foreground hover:opacity-90 transition-colors"
                            >
                              确认
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 rounded text-xs bg-muted hover:bg-muted/80 transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(v.id)}
                            className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor dialog */}
      {showEditor && (
        <VariableEditor
          namespaceId={namespaceId}
          editing={editing}
          onClose={() => {
            setShowEditor(false)
            setEditing(null)
          }}
          onSaved={() => refetch()}
        />
      )}
    </div>
  )
}
