/**
 * TriggerPanel — 触发器管理面板
 * 显示当前 workflow 的所有触发器，支持启用/禁用、删除
 */

import { useCallback } from "react"
import { Clock, Webhook, Trash2, Power, Plus, Inbox } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"

interface TriggerPanelProps {
  workflowId: string
  onCreate: () => void
}

interface TriggerItem {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  kestraFlowId: string
  disabled: boolean
  createdAt: string | Date
}

function getTypeIcon(type: string) {
  if (type === "schedule") return <Clock className="w-4 h-4 text-amber-500" />
  if (type === "webhook") return <Webhook className="w-4 h-5 text-blue-500" />
  return null
}

function getTypeLabel(type: string) {
  if (type === "schedule") return "定时"
  if (type === "webhook") return "Webhook"
  return type
}

function getTriggerDetail(item: TriggerItem, workflowId: string): string | null {
  if (item.type === "schedule") {
    const cron = item.config.cron as string | undefined
    return cron ? `Cron: ${cron}` : null
  }
  if (item.type === "webhook") {
    const url = `${window.location.origin}/api/webhook/${workflowId}/${item.kestraFlowId}`
    if (url.length > 40) return `${url.slice(0, 37)}…`
    return url
  }
  return null
}

export function TriggerPanel({ workflowId, onCreate }: TriggerPanelProps) {
  const { data, isLoading, refetch } = trpc.workflow.triggerList.useQuery(
    { workflowId },
    { enabled: !!workflowId },
  )

  const toggleMutation = trpc.workflow.triggerToggle.useMutation({
    onSuccess: () => {
      refetch()
      toast.success("已更新触发器状态")
    },
    onError: () => toast.error("操作失败"),
  })

  const deleteMutation = trpc.workflow.triggerDelete.useMutation({
    onSuccess: () => {
      refetch()
      toast.success("已删除触发器")
    },
    onError: () => toast.error("删除失败"),
  })

  const handleToggle = useCallback(
    (item: TriggerItem) => {
      toggleMutation.mutate({ id: item.id, disabled: !item.disabled })
    },
    [toggleMutation],
  )

  const handleDelete = useCallback(
    (item: TriggerItem) => {
      if (window.confirm(`确认删除触发器「${item.name}」？`)) {
        deleteMutation.mutate({ id: item.id })
      }
    },
    [deleteMutation],
  )

  const triggers = (data ?? []) as TriggerItem[]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold">触发器</h2>
        <button
          onClick={onCreate}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          创建触发器
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            加载中…
          </div>
        ) : triggers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">暂无触发器</p>
            <p className="text-xs text-muted-foreground/70">
              点击「创建触发器」添加定时或 Webhook 触发
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {triggers.map((item) => {
              const detail = getTriggerDetail(item, workflowId)
              return (
                <div
                  key={item.id}
                  className="bg-muted/50 rounded-md px-3 py-2 flex items-start gap-2.5 group"
                >
                  <span className="mt-0.5 shrink-0">{getTypeIcon(item.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {getTypeLabel(item.type)}
                      </span>
                    </div>
                    {detail && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          item.disabled ? "bg-gray-400" : "bg-green-500"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {item.disabled ? "已禁用" : "已启用"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggle(item)}
                      className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title={item.disabled ? "启用" : "禁用"}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
