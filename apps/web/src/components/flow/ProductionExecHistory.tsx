/**
 * ProductionExecHistory.tsx — 生产执行历史面板
 *
 * 显示由 schedule/webhook 触发的生产执行记录
 */

import { useState } from "react"
import { trpc } from "@/lib/trpc"
import {
  Clock, Loader, CheckCircle, XCircle, AlertTriangle,
  XOctagon, Ban, Pause, ListTodo, RefreshCw, HelpCircle,
  History, Inbox, ChevronDown, ChevronUp,
} from "lucide-react"

const STATE_ICONS: Record<string, React.ReactNode> = {
  CREATED: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  RUNNING: <Loader className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  SUCCESS: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  FAILED: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  WARNING: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  KILLED: <XOctagon className="w-3.5 h-3.5 text-gray-500" />,
  CANCELLED: <Ban className="w-3.5 h-3.5 text-gray-500" />,
  PAUSED: <Pause className="w-3.5 h-3.5 text-yellow-500" />,
  QUEUED: <ListTodo className="w-3.5 h-3.5 text-muted-foreground" />,
  RETRYING: <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  RESTARTED: <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
}

interface ProductionExecHistoryProps {
  workflowId: string
  onClose: () => void
}

interface ProdExecItem {
  id: string
  workflowId?: string
  releaseId?: string
  kestraExecId: string
  inputValues?: Record<string, unknown> | null
  state: string
  taskRuns?: Array<{ id: string; state: string; startDate?: string; endDate?: string; duration?: number; attempts?: number; outputs?: Record<string, unknown> }> | null
  triggeredBy: string
  createdAt: Date | string
}

export function ProductionExecHistory({ workflowId, onClose }: ProductionExecHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | undefined>()

  const listQuery = trpc.workflow.productionExecList.useQuery(
    { workflowId, limit: 20, cursor },
    { enabled: !!workflowId, refetchInterval: 10000 },
  )

  const selectedExecId = expandedId
  const detailQuery = trpc.workflow.productionExecGet.useQuery(
    { executionId: selectedExecId! },
    { enabled: !!selectedExecId },
  )

  const items: ProdExecItem[] = ((listQuery.data?.items ?? []) as ProdExecItem[])
  const nextCursor: string | undefined = listQuery.data?.nextCursor ?? undefined

  return (
    <div className="w-72 md:w-80 h-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <History className="w-4 h-4" /> 生产执行历史
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => listQuery.refetch()}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="刷新"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${listQuery.isRefetching ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {listQuery.isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">暂无生产执行记录</p>
            <p className="text-xs text-muted-foreground/70">
              由 schedule 或 webhook 触发的执行将显示在此
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => (
              <ExecRow
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                detail={expandedId === item.id ? (detailQuery.data as ProdExecItem | undefined) : undefined}
                detailLoading={expandedId === item.id && detailQuery.isLoading}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              />
            ))}

            {nextCursor && (
              <div className="p-3">
                <button
                  onClick={() => setCursor(nextCursor)}
                  disabled={listQuery.isFetching}
                  className="w-full py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground disabled:opacity-50 transition-colors"
                >
                  加载更多
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ExecRow({ item, expanded, detail, detailLoading, onToggle }: {
  item: ProdExecItem
  expanded: boolean
  detail?: ProdExecItem
  detailLoading?: boolean
  onToggle: () => void
}) {
  const currentState = item.state ?? "UNKNOWN"
  const time = formatTime(item.createdAt)

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 text-left"
      >
        <span className="shrink-0">
          {STATE_ICONS[currentState] ?? <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono font-medium truncate">{item.id.slice(0, 12)}</div>
          <div className="text-xs text-muted-foreground truncate">{formatTriggeredBy(item.triggeredBy)}</div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{time}</span>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {detailLoading ? (
            <div className="text-xs text-muted-foreground py-2">加载详情...</div>
          ) : detail ? (
            <ExecDetail item={detail} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function ExecDetail({ item }: { item: ProdExecItem }) {
  const taskRuns = (item.taskRuns ?? []) as Array<{ id: string; state: string; startDate?: string; endDate?: string; duration?: number }>

  return (
    <div className="space-y-2 border-l-2 border-border ml-1 pl-3">
      <div className="text-xs space-y-1">
        <InfoRow label="状态" value={item.state ?? "—"} />
        <InfoRow label="触发" value={formatTriggeredBy(item.triggeredBy)} />
        <InfoRow label="时间" value={formatTime(item.createdAt)} />
      </div>

      {taskRuns.length > 0 && (
        <div className="space-y-0.5 mt-2">
          <div className="text-xs font-medium text-muted-foreground mb-1">任务执行</div>
          {taskRuns.map((tr) => (
            <div key={tr.id} className="flex items-center gap-2 text-xs py-0.5">
              {STATE_ICONS[tr.state] ?? <HelpCircle className="w-3 h-3 text-muted-foreground" />}
              <span className="truncate flex-1">{tr.id}</span>
              <span className="text-muted-foreground">{tr.state}</span>
              {tr.duration != null && (
                <span className="text-muted-foreground">{(tr.duration / 1000).toFixed(1)}s</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-8 shrink-0">{label}</span>
      <span className="font-mono break-all">{value}</span>
    </div>
  )
}

function formatTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatTriggeredBy(triggeredBy: string): string {
  if (triggeredBy.startsWith("webhook:")) {
    const name = triggeredBy.slice(8)
    return `webhook:${name}`
  }
  if (triggeredBy.startsWith("schedule:")) {
    const name = triggeredBy.slice(9)
    return `schedule:${name}`
  }
  return triggeredBy
}
