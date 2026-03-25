/**
 * 画布数据转换层 — 业务状态 ↔ React Flow 节点/边
 */
import { MarkerType } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";
import { EDGE_STYLES } from "@/types/workflow";
import { isContainer } from "@/types/container";
import { getChildCount } from "@/lib/containerUtils";

/** 业务节点 → React Flow 节点 */
export function toCanvasNodes(
  wfNodes: WorkflowNode[],
  nodesWithMissingRefs?: Set<string>,
  dragOverId?: string | null,
): Node[] {
  return wfNodes.map((n) => ({
    id: n.id,
    type: "workflowNode" as const,
    position: n.ui ?? { x: 150, y: 50 },
    selected: n.selected ?? false,
    data: {
      label: n.name,
      type: n.type,
      spec: n.spec,
      containerId: n.containerId,
      sortIndex: n.sortIndex,
      isContainer: isContainer(n.type),
      collapsed: n.ui?.collapsed ?? false,
      childCount: getChildCount(n.id, wfNodes),
      hasMissingRefs: nodesWithMissingRefs?.has(n.id) ?? false,
      isDragOver: n.id === dragOverId,
    },
  }));
}

/** 业务边 → React Flow 边 */
export function toCanvasEdges(wfEdges: WorkflowEdge[]): Edge[] {
  return wfEdges.map((e) => {
    const style = EDGE_STYLES[e.type];
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.type === "case" ? e.label : undefined,
      targetHandle: undefined,
      type: "workflowEdge" as const,
      data: { edgeType: e.type, label: e.label },
      animated: e.type === "sequence",
      style: {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 16,
        height: 16,
      },
    };
  });
}

/** React Flow 节点 → 业务节点（同步 position 到 ui），用 Map 优化到 O(n) */
export function syncPositions(wfNodes: WorkflowNode[], canvasNodes: Node[]): WorkflowNode[] {
  const posMap = new Map(canvasNodes.map((c) => [c.id, c.position]));
  return wfNodes.map((n) => {
    const pos = posMap.get(n.id);
    if (!pos) return n;
    return { ...n, ui: { x: pos.x, y: pos.y } };
  });
}
