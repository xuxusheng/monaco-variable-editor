/**
 * ExecutionHistory.tsx — 执行历史列表面板
 *
 * 右侧抽屉，按触发方式分组
 */

import { trpc } from "@/lib/trpc"
import type { ExecutionSummary } from "@/stores/workflow"

const STATE_ICONS: Record<string, string> = {
  CREATED: "⏳",
  RUNNING: "🔄",
  SUCCESS: "🟢",
  FAILED: "🔴",
  WARNING: "🟡",
  KILLED: "💀",
  CANCELLED: "🚫",
}

interface ExecutionHistoryProps {
  workflowId: string
  onSelect?: (execution: ExecutionSummary) => void
  onClose: () => void
}

export function ExecutionHistory({ workflowId, onSelect, onClose }: ExecutionHistoryProps) {
  const query = trpc.workflow.executionList.useQuery(
    { workflowId, limit: 30 },
    { enabled: !!workflowId, refetchInterval: 10000 },
  )

  const items = query.data?.items ?? []

  // Group by trigger type
  const manual = items.filter((i: { triggeredBy: string }) => i.triggeredBy === "manual")
  const replays = items.filter((i: { triggeredBy: string }) => i.triggeredBy.startsWith("replay:"))

  return (
    <div className="w-72 md:w-80 h-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold">📋 执行历史</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {query.isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6 text-center">
            <span className="text-3xl mb-3">📭</span>
            <p className="text-sm font-medium mb-1">暂无执行记录</p>
            <p className="text-xs text-muted-foreground/70">
              点击工具栏「▶ 运行测试」开始执行
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {manual.length > 0 && (
              <GroupSection title="手动测试" items={manual} onSelect={onSelect} />
            )}
            {replays.length > 0 && (
              <GroupSection title="Replay" items={replays} onSelect={onSelect} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupSection({ title, items, onSelect }: {
  title: string
  items: Array<{
    id: string
    state: string
    triggeredBy: string
    createdAt: Date | string
  }>
  onSelect?: (execution: ExecutionSummary) => void
}) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground px-2 mb-1">{title}</h4>
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              onSelect?.({
                id: item.id,
                kestraExecId: "",
                state: item.state,
                taskRuns: [],
                triggeredBy: item.triggeredBy,
                createdAt:
                  item.createdAt instanceof Date
                    ? item.createdAt.toISOString()
                    : String(item.createdAt),
              })
            }
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-left"
          >
            <span className="text-sm">{STATE_ICONS[item.state] ?? "❓"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{item.id.slice(0, 12)}</div>
              <div className="text-xs text-muted-foreground">
                {formatTime(item.createdAt)}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{item.state}</span>
          </button>
        ))}
      </div>
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
