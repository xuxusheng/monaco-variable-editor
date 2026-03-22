import type { WorkflowNode, WorkflowEdge } from "@/types/workflow"

/** 最大容器嵌套层级 */
export const MAX_CONTAINER_DEPTH = 4

/** 计算节点的嵌套深度（从顶层开始为 0） */
export function getNodeDepth(nodeId: string, nodes: WorkflowNode[]): number {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  let depth = 0
  let current = nodeMap.get(nodeId)
  while (current?.containerId) {
    depth++
    current = nodeMap.get(current.containerId)
  }
  return depth
}

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

/**
 * 检查容器是否可以展开（未超过最大嵌套层级）。
 * depth 为容器自身的嵌套深度（0 = 顶层），其子节点的深度 = depth + 1。
 * 当 depth >= MAX_CONTAINER_DEPTH - 1 时，该容器内的子容器不能再展开。
 */
export function canExpandContainer(
  containerId: string,
  nodes: WorkflowNode[],
): boolean {
  return getNodeDepth(containerId, nodes) < MAX_CONTAINER_DEPTH - 1
}
