import { memo } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"
import type { EdgeType } from "@/types/workflow"
import { EDGE_STYLES } from "@/types/workflow"

interface WorkflowEdgeData {
  edgeType: EdgeType
  label?: string
}

export const WorkflowEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  }: EdgeProps) => {
    const edgeData = data as WorkflowEdgeData | undefined
    const edgeType = edgeData?.edgeType ?? "sequence"
    const label = edgeData?.label
    const style = EDGE_STYLES[edgeType]

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    })

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            strokeDasharray: style.strokeDasharray,
          }}
        />
        {label && (
          <EdgeLabelRenderer>
            <div
              className="nodrag nopan absolute px-1.5 py-0.5 rounded text-[10px] font-medium bg-white border shadow-sm"
              style={{
                color: style.stroke,
                borderColor: `${style.stroke}44`,
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              }}
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    )
  },
)

WorkflowEdge.displayName = "WorkflowEdge"
