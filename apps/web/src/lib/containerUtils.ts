import type { WorkflowNode, WorkflowEdge } from "@/types/workflow"

/** 收集指定容器的所有后代节点 ID（BFS 递归） */
export function collectDescendants(
  containerId: string,
  nodes: WorkflowNode[],
): string[] {
  const result: string[] = []
  const queue = [containerId]
  while (queue.length > 0) {
    const parentId = queue.shift()!
    for (const n of nodes) {
      if (n.containerId === parentId) {
        result.push(n.id)
        queue.push(n.id)
      }
    }
  }
  return result
}

/** 过滤掉折叠容器的所有后代节点 */
export function filterVisibleNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  const collapsedIds = new Set(
    nodes.filter((n) => n.ui?.collapsed).map((n) => n.id),
  )
  if (collapsedIds.size === 0) return nodes

  const hiddenNodeIds = new Set<string>()
  for (const id of collapsedIds) {
    for (const childId of collectDescendants(id, nodes)) {
      hiddenNodeIds.add(childId)
    }
  }
  return nodes.filter((n) => !hiddenNodeIds.has(n.id))
}

/** 过滤掉被隐藏节点相关的边 */
export function filterVisibleEdges(
  edges: WorkflowEdge[],
  visibleNodeIds: Set<string>,
): WorkflowEdge[] {
  return edges.filter(
    (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
  )
}

/** 计算容器的直接子节点数量 */
export function getChildCount(
  containerId: string,
  nodes: WorkflowNode[],
): number {
  return nodes.filter((n) => n.containerId === containerId).length
}

/** 获取容器的所有直接子节点 */
export function getChildren(
  containerId: string,
  nodes: WorkflowNode[],
): WorkflowNode[] {
  return nodes
    .filter((n) => n.containerId === containerId)
    .sort((a, b) => a.sortIndex - b.sortIndex)
}
