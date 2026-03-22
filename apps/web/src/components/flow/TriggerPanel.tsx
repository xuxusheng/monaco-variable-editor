/**
 * TriggerPanel — 触发器管理面板
 * 显示当前 workflow 的所有触发器，支持启用/禁用、删除
 */

import { useCallback, useMemo, useState } from "react"
import { Clock, Webhook, Trash2, Power, Plus, Inbox, Copy, Key, Eye, EyeOff, CalendarClock, CheckCircle2, XCircle } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
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

interface TriggerStatusItem {
  triggerId: string
  nextFireAt: string | null
  lastExecution: {
    state: string
    startedAt: string | null
    endedAt: string | null
  } | null
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

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diffMs = date.getTime() - now
  const absDiff = Math.abs(diffMs)

  if (absDiff < 60_000) return diffMs >= 0 ? "即将" : "刚刚"

  const minutes = Math.floor(absDiff / 60_000)
  if (minutes < 60) return diffMs >= 0 ? `${minutes} 分钟后` : `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return diffMs >= 0 ? `${hours} 小时后` : `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 30) return diffMs >= 0 ? `${days} 天后` : `${days} 天前`

  return date.toLocaleDateString("zh-CN")
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function StateBadge({ state }: { state: string }) {
  const isSuccess = state === "SUCCESS"
  const isFailed = state === "FAILED" || state === "KILLED" || state === "CANCELLED"
  if (isSuccess) {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-green-600"><CheckCircle2 className="w-3 h-3" /> 成功</span>
  }
  if (isFailed) {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-red-500"><XCircle className="w-3 h-3" /> 失败</span>
  }
  return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">{state}</span>
}

export function TriggerPanel({ workflowId, onCreate }: TriggerPanelProps) {
  const { data, isLoading, refetch } = trpc.workflow.triggerList.useQuery(
    { workflowId },
    { enabled: !!workflowId },
  )

  const { data: statusData } = trpc.workflow.triggerStatus.useQuery(
    { workflowId },
    { enabled: !!workflowId, refetchInterval: 30_000 },
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

  const [deleteTarget, setDeleteTarget] = useState<TriggerItem | null>(null)

  const handleToggle = useCallback(
    (item: TriggerItem) => {
      toggleMutation.mutate({ id: item.id, disabled: !item.disabled })
    },
    [toggleMutation],
  )

  const handleDelete = useCallback(
    (item: TriggerItem) => {
      setDeleteTarget(item)
    },
    [],
  )

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget.id })
      setDeleteTarget(null)
    }
  }, [deleteTarget, deleteMutation])

  const triggers = (data ?? []) as TriggerItem[]
  const statusMap = useMemo(() => {
    const m = new Map<string, TriggerStatusItem>()
    for (const s of (statusData ?? []) as TriggerStatusItem[]) {
      m.set(s.triggerId, s)
    }
    return m
  }, [statusData])

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
              const status = statusMap.get(item.id)
              return (
                <div
                  key={item.id}
                  className="bg-muted/50 rounded-md px-3 py-2.5 flex items-start gap-2.5 group"
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
                    {item.type === "webhook" && (
                      <WebhookActions item={item} workflowId={workflowId} />
                    )}

                    {/* Enhanced info: next fire + last execution */}
                    {status && (
                      <div className="mt-1.5 space-y-0.5">
                        {item.type === "schedule" && status.nextFireAt && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CalendarClock className="w-3 h-3 text-amber-500/70" />
                            下次执行: {formatRelativeTime(status.nextFireAt)}
                            <span className="text-muted-foreground/50">
                              ({formatDateTime(status.nextFireAt)})
                            </span>
                          </div>
                        )}
                        {status.lastExecution ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <StateBadge state={status.lastExecution.state} />
                            <span className="text-muted-foreground/50">
                              {formatDateTime(status.lastExecution.endedAt ?? status.lastExecution.startedAt)}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground/50">
                            暂无执行记录
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-1.5">
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

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除触发器</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除触发器「{deleteTarget?.name}」？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function WebhookActions({ item, workflowId }: { item: TriggerItem; workflowId: string }) {
  const [showSecret, setShowSecret] = useState(false)
  const webhookUrl = `${window.location.origin}/api/webhook/${workflowId}/${item.kestraFlowId}`
  const secret = item.config.secret as string | undefined

  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(webhookUrl)
    toast.success("已复制 URL")
  }, [webhookUrl])

  const copySecret = useCallback(() => {
    if (secret) {
      navigator.clipboard.writeText(secret)
      toast.success("已复制密钥")
    }
  }, [secret])

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <button
        onClick={copyUrl}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Copy className="w-3 h-3" /> 复制URL
      </button>
      {secret && (
        <button
          onClick={copySecret}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Key className="w-3 h-3" /> {showSecret ? "复制密钥" : "••••••••"}
        </button>
      )}
      {secret && (
        <button
          onClick={() => setShowSecret(!showSecret)}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          title={showSecret ? "隐藏密钥" : "显示密钥"}
        >
          {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      )}
    </div>
  )
}
