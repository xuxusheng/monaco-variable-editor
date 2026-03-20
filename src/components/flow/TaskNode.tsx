import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import type { NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"

export interface TaskNodeData {
  label: string
  taskConfig: string
}

export const TaskNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as TaskNodeData

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[180px] transition-all",
        selected
          ? "border-indigo-500 shadow-md shadow-indigo-200"
          : "border-border hover:border-indigo-300 hover:shadow-md",
      )}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white" />

      <div className="flex items-center gap-2">
        <span className="text-lg">⚙️</span>
        <div>
          <div className="text-sm font-semibold text-foreground">{d.label || "未命名任务"}</div>
          <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-[160px]">
            {extractTaskType(d.taskConfig)}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-indigo-400 !border-2 !border-white" />
    </div>
  )
})

TaskNode.displayName = "TaskNode"

function extractTaskType(yaml: string): string {
  try {
    const lines = yaml.split("\n")
    const typeLine = lines.find((l) => l.trim().startsWith("type:"))
    return typeLine?.replace(/^.*type:\s*/, "").trim() || "未配置"
  } catch {
    return "解析失败"
  }
}
