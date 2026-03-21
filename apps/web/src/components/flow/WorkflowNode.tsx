import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import type { NodeProps } from "@xyflow/react"
import type { WorkflowNode as WorkflowNodeType } from "@/types/workflow"
import { getNodeColor } from "@/types/workflow"

export const WorkflowNode = memo(({ data, selected }: NodeProps) => {
  const node = data as unknown as WorkflowNodeType
  const color = getNodeColor(node.type)
  const shortType = node.type.split(".").pop() || node.type

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
            {node.name || "未命名"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
            {shortType}
          </div>
        </div>
      </div>

      {node.description && (
        <div className="text-xs text-muted-foreground mt-1.5 truncate">
          {node.description}
        </div>
      )}

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
