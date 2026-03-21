/**
 * ExecutionDrawer.tsx — 执行详情底部抽屉
 *
 * 三个 Tab：概览 / 任务列表 / 日志
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { useWorkflowStore } from "@/stores/workflow"
import type { TaskRun } from "@/stores/workflow"
import {
  Clock, Loader, CheckCircle, XCircle, AlertTriangle,
  XOctagon, Ban, Pause, ListTodo, RefreshCw, HelpCircle,
} from "lucide-react"

const STATE_ICONS: Record<string, React.ReactNode> = {
  CREATED: <Clock className="w-4 h-4 text-muted-foreground" />,
  RUNNING: <Loader className="w-4 h-4 text-blue-500 animate-spin" />,
  SUCCESS: <CheckCircle className="w-4 h-4 text-green-500" />,
  FAILED: <XCircle className="w-4 h-4 text-red-500" />,
  WARNING: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  KILLED: <XOctagon className="w-4 h-4 text-gray-500" />,
  CANCELLED: <Ban className="w-4 h-4 text-gray-500" />,
  PAUSED: <Pause className="w-4 h-4 text-yellow-500" />,
  QUEUED: <ListTodo className="w-4 h-4 text-muted-foreground" />,
  RETRYING: <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />,
  RESTARTED: <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />,
}

const STATE_COLORS: Record<string, string> = {
  CREATED: "text-muted-foreground",
  RUNNING: "text-blue-500",
  SUCCESS: "text-green-500",
  FAILED: "text-red-500",
  WARNING: "text-amber-500",
  KILLED: "text-gray-500",
  CANCELLED: "text-gray-500",
}

type Tab = "overview" | "tasks" | "logs"

interface ExecutionDrawerProps {
  onClose: () => void
  onReplay?: (executionId: string, taskRunId: string) => void
}

export function ExecutionDrawer({ onClose, onReplay }: ExecutionDrawerProps) {
  const [tab, setTab] = useState<Tab>("overview")
  const currentExecution = useWorkflowStore((s) => s.currentExecution)
  const isExecuting = useWorkflowStore((s) => s.isExecuting)
  const executionKill = trpc.workflow.executionKill.useMutation({
    onSuccess: () => toast.success("已发送停止信号"),
    onError: (err) => toast.error(`停止失败: ${err.message}`),
  })

  if (!currentExecution) return null

  const duration = currentExecution.taskRuns
    ? formatDuration(currentExecution)
    : "—"

  const progress = currentExecution.taskRuns
    ? `${currentExecution.taskRuns.filter((tr: TaskRun) => ["SUCCESS", "WARNING"].includes(tr.state)).length}/${currentExecution.taskRuns.length}`
    : "—"

  const handleKill = useCallback(() => {
    executionKill.mutate({ executionId: currentExecution.id })
  }, [currentExecution.id, executionKill])

  const handleReplay = useCallback(
    (taskRunId: string) => {
      onReplay?.(currentExecution.id, taskRunId)
    },
    [currentExecution.id, onReplay],
  )

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-2xl z-50 flex flex-col" style={{ height: "40vh", minHeight: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">执行详情</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATE_COLORS[currentExecution.state] ?? "text-muted-foreground"}`}>
            {STATE_ICONS[currentExecution.state] ?? <HelpCircle className="w-4 h-4 text-muted-foreground" />} {currentExecution.state}
          </span>
          {isExecuting && (
            <span className="text-xs text-blue-500 animate-pulse">执行中...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExecuting && (
            <button
              onClick={handleKill}
              disabled={executionKill.isPending}
              className="px-2 py-1 text-xs font-medium rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              ⏹ 停止
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["overview", "tasks", "logs"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "overview" ? "概览" : t === "tasks" ? "任务列表" : "日志"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "overview" && (
          <OverviewTab execution={currentExecution} duration={duration} progress={progress} />
        )}
        {tab === "tasks" && (
          <TasksTab
            execution={currentExecution}
            isExecuting={isExecuting}
            onReplay={handleReplay}
          />
        )}
        {tab === "logs" && (
          <LogsTab kestraExecId={currentExecution.kestraExecId} />
        )}
      </div>
    </div>
  )
}

// ========== Overview Tab ==========

function OverviewTab({ execution, duration, progress }: {
  execution: { id: string; kestraExecId: string; state: string; triggeredBy: string; createdAt: string }
  duration: string
  progress: string
}) {
  return (
    <div className="space-y-3 text-sm">
      <InfoRow label="平台 ID" value={execution.id} />
      <InfoRow label="Kestra ID" value={execution.kestraExecId} />
      <InfoRow label="状态" value={`${STATE_ICONS[execution.state] ?? ""} ${execution.state}`} />
      <InfoRow label="触发方式" value={formatTriggeredBy(execution.triggeredBy)} />
      <InfoRow label="进度" value={progress} />
      <InfoRow label="耗时" value={duration} />
      <InfoRow label="创建时间" value={formatTime(execution.createdAt)} />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground w-20 shrink-0 text-right">{label}</span>
      <span className="font-mono text-xs break-all">{value}</span>
    </div>
  )
}

// ========== Tasks Tab ==========

function TasksTab({ execution, isExecuting, onReplay }: {
  execution: { state: string; taskRuns: TaskRun[] }
  isExecuting: boolean
  onReplay: (taskRunId: string) => void
}) {
  const taskRuns = execution.taskRuns ?? []

  if (taskRuns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {isExecuting ? "等待任务执行..." : "暂无任务数据"}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {taskRuns.map((tr: TaskRun) => (
        <div
          key={tr.id}
          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 group"
        >
          <span className="text-base shrink-0">{STATE_ICONS[tr.state] ?? <HelpCircle className="w-4 h-4 text-muted-foreground" />}</span>
          <span className="text-sm font-medium truncate flex-1">{tr.taskId}</span>
          <span className={`text-xs ${STATE_COLORS[tr.state] ?? ""}`}>{tr.state}</span>
          <span className="text-xs text-muted-foreground w-14 text-right shrink-0">
            {tr.endDate && tr.startDate
              ? `${((new Date(tr.endDate).getTime() - new Date(tr.startDate).getTime()) / 1000).toFixed(1)}s`
              : tr.state === "RUNNING"
                ? "..."
                : "—"}
          </span>
          {tr.state === "FAILED" && (
            <button
              onClick={() => onReplay(tr.id)}
              className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <RefreshCw className="w-3 h-3 mr-1" />重跑
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ========== Logs Tab ==========

function LogsTab({ kestraExecId }: { kestraExecId: string }) {
  const [level, setLevel] = useState<"TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "">("")
  const logsQuery = trpc.workflow.executionLogs.useQuery(
    { kestraExecId, minLevel: level || undefined },
    { enabled: !!kestraExecId, refetchInterval: 5000 },
  )

  const logs = logsQuery.data?.results ?? []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs.length])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as typeof level)}
          className="text-xs bg-muted border border-border rounded px-2 py-1"
        >
          <option value="">全部级别</option>
          <option value="TRACE">TRACE</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
        {logsQuery.isLoading && <span className="text-xs text-muted-foreground">加载中...</span>}
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs space-y-0.5">
        {logs.map((log, i) => (
          <div key={`${log.timestamp}-${log.level}-${i}`} className={`flex gap-2 ${levelColor(log.level)}`}>
            <span className="text-muted-foreground shrink-0">{log.timestamp?.slice(11, 19) ?? ""}</span>
            <span className="shrink-0 w-10">[{log.level}]</span>
            <span className="break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ========== Helpers ==========

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatDuration(exec: { state: string; taskRuns: TaskRun[] }): string {
  const runs = exec.taskRuns ?? []
  if (runs.length === 0) return "—"

  const starts = runs
    .map((r: TaskRun) => r.startDate ? new Date(r.startDate).getTime() : 0)
    .filter((t: number) => t > 0)
  const ends = runs
    .map((r: TaskRun) => r.endDate ? new Date(r.endDate).getTime() : 0)
    .filter((t: number) => t > 0)

  if (starts.length === 0) return "—"
  const start = Math.min(...starts)

  if (["SUCCESS", "FAILED", "WARNING", "KILLED", "CANCELLED"].includes(exec.state) && ends.length > 0) {
    const end = Math.max(...ends)
    return `${((end - start) / 1000).toFixed(1)}s`
  }

  return `${((Date.now() - start) / 1000).toFixed(1)}s（进行中）`
}

function formatTriggeredBy(triggeredBy: string): string {
  if (triggeredBy === "manual") return "手动测试"
  if (triggeredBy.startsWith("replay:")) {
    const parts = triggeredBy.split(":")
    return `Replay (从 ${parts[1]?.slice(0, 8)}... ${parts[2]?.slice(0, 8)}...)`
  }
  return triggeredBy
}

function levelColor(level: string): string {
  switch (level) {
    case "ERROR": return "text-red-500"
    case "WARN": return "text-amber-500"
    case "DEBUG": return "text-muted-foreground"
    case "TRACE": return "text-muted-foreground/50"
    default: return ""
  }
}
