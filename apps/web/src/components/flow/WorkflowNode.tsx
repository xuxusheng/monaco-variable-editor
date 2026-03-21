import { memo, useCallback } from "react"
import { Handle, Position } from "@xyflow/react"
import type { NodeProps } from "@xyflow/react"
import { getNodeColor } from "@/types/workflow"
import { getOutputHandles } from "@/types/container"
import { useWorkflowStore } from "@/stores/workflow"

interface WorkflowNodeData {
  label: string
  type: string
  spec: Record<string, unknown>
  containerId: string | null
  sortIndex: number
  isContainer: boolean
  collapsed: boolean
  childCount: number
}

export const WorkflowNode = memo(({ data, selected, id }: NodeProps) => {
  const d = data as unknown as WorkflowNodeData
  const color = getNodeColor(d.type)
  const shortType = d.type.split(".").pop() || d.type
  const toggleCollapse = useWorkflowStore((s) => s.toggleCollapse)

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      toggleCollapse(id)
    },
    [id, toggleCollapse],
  )

  // 容器节点：获取输出 Handle 列表
  const outputHandles = d.isContainer ? getOutputHandles(d.type) : []

  // 容器节点样式
  if (d.isContainer) {
    return (
      <div
        className={`relative px-4 py-3 rounded-2xl border-2 border-dashed bg-white shadow-sm min-w-[220px] transition-all ${
          selected ? "shadow-lg" : "hover:shadow-md"
        }`}
        style={{
          borderColor: selected ? color : `${color}88`,
          background: `${color}08`,
        }}
      >
        {/* 输入 Handle */}
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !border-white"
          style={{ background: color }}
        />

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
          <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-dashed" style={{ borderColor: `${color}44` }}>
            📦 {d.childCount} 个子任务
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
      }`}
      style={{
        borderColor: selected ? color : `${color}66`,
        borderLeftWidth: 4,
        borderLeftColor: color,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-white"
        style={{ background: color }}
      />

      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
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
