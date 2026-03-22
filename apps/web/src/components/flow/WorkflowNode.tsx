import { memo, useCallback } from "react"
import { Handle, Position } from "@xyflow/react"
import type { NodeProps } from "@xyflow/react"
import { getNodeColor } from "@/types/workflow"
import { getOutputHandles, getChildFieldName } from "@/types/container"
import { useWorkflowStore } from "@/stores/workflow"
import type { TaskRun } from "@/stores/workflow"
import { canExpandContainer } from "@/lib/containerUtils"
import { toast } from "sonner"
import {
  Clock, Loader, CheckCircle, XCircle, AlertTriangle,
  XOctagon, Ban, HelpCircle, Package,
} from "lucide-react"

// ========== Execution state colors ==========
const STATE_STYLES: Record<string, { border: string; glow: string; pulse?: boolean }> = {
  CREATED:   { border: "#94a3b8", glow: "0 0 6px #94a3b8" },
  RUNNING:   { border: "#3b82f6", glow: "0 0 10px #3b82f6", pulse: true },
  SUCCESS:   { border: "#22c55e", glow: "0 0 6px #22c55e" },
  FAILED:    { border: "#ef4444", glow: "0 0 10px #ef4444" },
  WARNING:   { border: "#f59e0b", glow: "0 0 6px #f59e0b" },
  KILLED:    { border: "#6b7280", glow: "0 0 4px #6b7280" },
  CANCELLED: { border: "#6b7280", glow: "0 0 4px #6b7280" },
}

function useExecutionState(nodeId: string) {
  return useWorkflowStore((s) => {
    const exec = s.currentExecution
    if (!exec || !exec.taskRuns) return null
    return (exec.taskRuns as unknown as TaskRun[]).find((tr) => tr.taskId === nodeId) ?? null
  })
}

interface WorkflowNodeData {
  label: string
  type: string
  spec: Record<string, unknown>
  containerId: string | null
  sortIndex: number
  isContainer: boolean
  collapsed: boolean
  childCount: number
  hasMissingRefs: boolean
}

export const WorkflowNode = memo(({ data, selected, id }: NodeProps) => {
  const d = data as unknown as WorkflowNodeData
  const color = getNodeColor(d.type)
  const shortType = d.type.split(".").pop() || d.type
  const toggleCollapse = useWorkflowStore((s) => s.toggleCollapse)
  const taskRun = useExecutionState(id)

  // Execution state styling
  const execStyle = taskRun ? STATE_STYLES[taskRun.state] : null

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // 展开时检查嵌套深度
      if (d.collapsed) {
        const nodes = useWorkflowStore.getState().nodes
        if (!canExpandContainer(id, nodes)) {
          toast.warning("已达到最大嵌套层级")
          return
        }
      }
      toggleCollapse(id)
    },
    [id, toggleCollapse, d.collapsed],
  )

  // 容器节点：获取输出 Handle 列表
  const outputHandles = d.isContainer ? getOutputHandles(d.type) : []

  // 容器节点样式
  if (d.isContainer) {
    return (
      <div
        className={`relative px-4 py-3 rounded-2xl border-2 border-dashed bg-white shadow-sm min-w-[220px] transition-all ${
          selected ? "shadow-lg" : "hover:shadow-md"
        } ${execStyle?.pulse ? "animate-pulse" : ""}`}
        style={{
          borderColor: execStyle ? execStyle.border : selected ? color : `${color}88`,
          background: `${color}08`,
          boxShadow: execStyle?.glow ?? undefined,
        }}
      >
        {/* 输入 Handle */}
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !border-white"
          style={{ background: color }}
        />

        {/* 缺失引用标识 */}
        {d.hasMissingRefs && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-sm" title="存在缺失的变量引用">
            <AlertTriangle className="w-3 h-3 text-white" />
          </div>
        )}

        {/* 头部：折叠按钮 + 类型 + 名称 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleCollapse}
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 text-xs shrink-0"
            title={d.collapsed ? "展开" : "折叠"}
          >
            {d.collapsed ? "▶" : "▼"}
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {shortType}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {d.label || "未命名"}
            </div>
          </div>
        </div>

        {/* 折叠时显示子任务摘要 */}
        {d.collapsed && d.childCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2 pt-2 border-t border-dashed" style={{ borderColor: `${color}44` }}>
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span>{d.childCount} 个{getChildFieldName(d.type) === "then/else" ? "分支" : "任务"}</span>
          </div>
        )}

        {/* 展开时显示分隔线 */}
        {!d.collapsed && (
          <div className="mt-2 pt-2 border-t border-dashed" style={{ borderColor: `${color}33` }}>
            <div className="text-xs text-muted-foreground/60">
              拖入子节点
            </div>
          </div>
        )}

        {/* 输出 Handle（多端口） */}
        {outputHandles.length > 0 ? (
          <div className="flex justify-around mt-2 -mb-1">
            {outputHandles.map((h) => (
              <div key={h.id} className="flex flex-col items-center gap-1">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ color: h.color, background: `${h.color}15` }}
                >
                  {h.label}
                </span>
                <Handle
                  type="source"
                  id={h.id}
                  position={Position.Bottom}
                  className="!w-3 !h-3 !border-2 !border-white"
                  style={{ background: h.color }}
                />
              </div>
            ))}
          </div>
        ) : (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!w-3 !h-3 !border-2 !border-white"
            style={{ background: color }}
          />
        )}
      </div>
    )
  }

  // 普通节点样式
  return (
    <div
      className={`relative px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[200px] transition-all ${
        selected ? "shadow-md" : "hover:shadow-md"
      } ${execStyle?.pulse ? "animate-pulse" : ""}`}
      style={{
        borderColor: execStyle ? execStyle.border : selected ? color : `${color}66`,
        borderLeftWidth: 4,
        borderLeftColor: execStyle ? execStyle.border : color,
        boxShadow: execStyle?.glow ?? undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-white"
        style={{ background: color }}
      />

      {/* 缺失引用标识 */}
      {d.hasMissingRefs && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-sm" title="存在缺失的变量引用">
          <AlertTriangle className="w-3 h-3 text-white" />
        </div>
      )}

      <div className="flex items-center gap-2">
        {taskRun ? (
          <span className="text-xs shrink-0">{execStateIcon(taskRun.state)}</span>
        ) : (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: color }}
          />
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {d.label || "未命名"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
            {shortType}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !border-2 !border-white"
        style={{ background: color }}
      />
    </div>
  )
})

WorkflowNode.displayName = "WorkflowNode"

function execStateIcon(state: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    CREATED: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
    RUNNING: <Loader className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
    SUCCESS: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
    FAILED: <XCircle className="w-3.5 h-3.5 text-red-500" />,
    WARNING: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
    KILLED: <XOctagon className="w-3.5 h-3.5 text-gray-500" />,
    CANCELLED: <Ban className="w-3.5 h-3.5 text-gray-500" />,
  }
  return icons[state] ?? <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
}
