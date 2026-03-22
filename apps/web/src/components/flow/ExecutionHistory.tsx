/**
 * ExecutionHistory.tsx — 执行记录列表面板
 *
 * 右侧抽屉，按触发方式分组，支持状态/时间/触发方式筛选和排序
 */

import { useState, useMemo } from "react"
import { trpc } from "@/lib/trpc"
import type { ExecutionSummary, TaskRun } from "@/stores/workflow"
import {
  Clock, Loader, CheckCircle, XCircle, AlertTriangle,
  XOctagon, Ban, History, Inbox, HelpCircle,
  Filter, X,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Collapsible, CollapsibleContent,
} from "@/components/ui/collapsible"

const STATE_ICONS: Record<string, React.ReactNode> = {
  CREATED: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  RUNNING: <Loader className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
  SUCCESS: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  FAILED: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  WARNING: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  KILLED: <XOctagon className="w-3.5 h-3.5 text-gray-500" />,
  CANCELLED: <Ban className="w-3.5 h-3.5 text-gray-500" />,
}

const STATE_OPTIONS = ["SUCCESS", "FAILED", "RUNNING", "KILLED", "CANCELLED"] as const

const TIME_RANGE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" },
] as const

const TRIGGER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "manual", label: "手动" },
  { value: "schedule", label: "Schedule" },
  { value: "webhook", label: "Webhook" },
  { value: "replay", label: "Replay" },
] as const

const SORT_OPTIONS = [
  { value: "time-desc", label: "时间倒序" },
  { value: "duration-desc", label: "耗时倒序" },
] as const

type TimeRange = typeof TIME_RANGE_OPTIONS[number]["value"]
type TriggerFilter = typeof TRIGGER_OPTIONS[number]["value"]
type SortBy = typeof SORT_OPTIONS[number]["value"]

function matchesTrigger(triggeredBy: string, filter: TriggerFilter): boolean {
  if (filter === "all") return true
  if (filter === "replay") return triggeredBy.startsWith("replay:")
  if (filter === "schedule") return triggeredBy.startsWith("schedule:")
  if (filter === "webhook") return triggeredBy.startsWith("webhook:")
  return triggeredBy === filter
}

function withinTimeRange(createdAt: Date | string, range: TimeRange): boolean {
  if (range === "all") return true
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt)
  const now = Date.now()
  const ms: Record<string, number> = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 }
  return now - d.getTime() <= (ms[range] ?? Infinity)
}

function getDurationMs(item: { createdAt: Date | string; endedAt?: Date | string | null }): number {
  const start = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt)
  if (!item.endedAt) return 0
  const end = item.endedAt instanceof Date ? item.endedAt : new Date(item.endedAt)
  return end.getTime() - start.getTime()
}

interface ExecutionHistoryProps {
  workflowId: string
  onSelect?: (execution: ExecutionSummary) => void
  onClose: () => void
}

export function ExecutionHistory({ workflowId, onSelect, onClose }: ExecutionHistoryProps) {
  const utils = trpc.useUtils()
  const query = trpc.workflow.executionList.useQuery(
    { workflowId, limit: 30 },
    { enabled: !!workflowId, refetchInterval: 10000 },
  )

  const items = query.data?.items ?? []

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange>("all")
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all")
  const [sortBy, setSortBy] = useState<SortBy>("time-desc")

  const hasActiveFilter = selectedStates.length > 0 || timeRange !== "all" || triggerFilter !== "all"

  const filteredItems = useMemo(() => {
    let result = items.filter((i: { state: string; createdAt: Date | string; triggeredBy: string }) => {
      if (selectedStates.length > 0 && !selectedStates.includes(i.state)) return false
      if (!withinTimeRange(i.createdAt, timeRange)) return false
      if (!matchesTrigger(i.triggeredBy, triggerFilter)) return false
      return true
    })

    result = [...result].sort((a: { createdAt: Date | string; endedAt?: Date | string | null }, b: { createdAt: Date | string; endedAt?: Date | string | null }) => {
      if (sortBy === "duration-desc") {
        return getDurationMs(b) - getDurationMs(a)
      }
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime()
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()
      return bTime - aTime
    })

    return result
  }, [items, selectedStates, timeRange, triggerFilter, sortBy])

  function toggleState(state: string) {
    setSelectedStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    )
  }

  function clearFilters() {
    setSelectedStates([])
    setTimeRange("all")
    setTriggerFilter("all")
  }

  // Group filtered items by trigger type
  const manual = filteredItems.filter((i: { triggeredBy: string }) => i.triggeredBy === "manual")
  const replays = filteredItems.filter((i: { triggeredBy: string }) => i.triggeredBy.startsWith("replay:"))
  // schedule / webhook also included
  const scheduled = filteredItems.filter((i: { triggeredBy: string }) => i.triggeredBy.startsWith("schedule:") || i.triggeredBy.startsWith("webhook:"))

  return (
    <div className="w-72 md:w-80 h-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <History className="w-4 h-4" /> 执行记录
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`p-1 rounded hover:bg-muted ${hasActiveFilter ? "text-primary" : "text-muted-foreground"}`}
            title="筛选"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
      </div>

      {/* Filter panel */}
      <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
        <CollapsibleContent>
          <div className="px-3 py-2 border-b border-border space-y-3">
            {/* Status filter */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">状态</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {STATE_OPTIONS.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer text-xs">
                    <Checkbox
                      checked={selectedStates.includes(s)}
                      onCheckedChange={() => toggleState(s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            {/* Time range */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">时间范围</div>
              <Select value={timeRange} onValueChange={(v) => setTimeRange((v as TimeRange) ?? "all")}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Trigger type */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">触发方式</div>
              <Select value={triggerFilter} onValueChange={(v) => setTriggerFilter((v as TriggerFilter) ?? "all")}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">排序</div>
              <Select value={sortBy} onValueChange={(v) => setSortBy((v as SortBy) ?? "time-desc")}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear + count */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                显示 {filteredItems.length}/{items.length} 条记录
              </span>
              {hasActiveFilter && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" /> 清除筛选
                </button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {query.isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">加载中...</div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">
              {hasActiveFilter ? "无匹配记录" : "暂无执行记录"}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {hasActiveFilter ? "尝试调整筛选条件" : "点击工具栏「▶ 运行测试」开始执行"}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {manual.length > 0 && (
              <GroupSection title="手动测试" items={manual} onSelect={onSelect} utils={utils} />
            )}
            {replays.length > 0 && (
              <GroupSection title="Replay" items={replays} onSelect={onSelect} utils={utils} />
            )}
            {scheduled.length > 0 && (
              <GroupSection title="已发布" items={scheduled} onSelect={onSelect} utils={utils} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupSection({ title, items, onSelect, utils }: {
  title: string
  items: Array<{
    id: string
    state: string
    triggeredBy: string
    createdAt: Date | string
  }>
  onSelect?: (execution: ExecutionSummary) => void
  utils: ReturnType<typeof trpc.useUtils>
}) {
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground px-2 mb-1">{title}</h4>
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={async () => {
              try {
                const full = await utils.workflow.executionGet.fetch({ executionId: item.id })
                if (full && onSelect) {
                  onSelect({
                    id: full.id,
                    kestraExecId: full.kestraExecId,
                    state: full.state,
                    taskRuns: (full.taskRuns ?? []) as unknown as TaskRun[],
                    triggeredBy: full.triggeredBy,
                    createdAt:
                      full.createdAt instanceof Date
                        ? full.createdAt.toISOString()
                        : String(full.createdAt),
                  })
                  return
                }
              } catch {
                // fallback: use summary data
              }
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
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 text-left"
          >
            <span className="text-sm">{STATE_ICONS[item.state] ?? <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">{item.id.slice(0, 12)}</span>
                <SourceTag triggeredBy={item.triggeredBy} />
              </div>
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

function SourceTag({ triggeredBy }: { triggeredBy: string }) {
  const isProduction = triggeredBy.startsWith("schedule:") || triggeredBy.startsWith("webhook:")
  if (isProduction) {
    return (
      <span className="inline-flex items-center px-1 py-0 rounded text-[10px] font-medium bg-green-500/10 text-green-700 border border-green-500/20">
        已发布
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-1 py-0 rounded text-[10px] font-medium bg-yellow-500/10 text-yellow-700 border border-yellow-500/20">
      草稿测试
    </span>
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
