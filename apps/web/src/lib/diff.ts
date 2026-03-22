/**
 * 节点级 Diff 算法
 * 比较两个版本的 nodes 数组，输出 added / removed / modified
 */

import type { WorkflowNode } from "@/types/workflow"

export interface NodeDiffResult {
  added: WorkflowNode[]
  removed: WorkflowNode[]
  modified: Array<{ oldNode: WorkflowNode; newNode: WorkflowNode }>
}

/**
 * 比较两组节点，按 ID 匹配
 * modified 判定：name、type、spec、ui 任一变化即为 modified
 */
export function diffNodes(
  oldNodes: WorkflowNode[],
  newNodes: WorkflowNode[],
): NodeDiffResult {
  const oldMap = new Map(oldNodes.map((n) => [n.id, n]))
  const newMap = new Map(newNodes.map((n) => [n.id, n]))

  const added: WorkflowNode[] = []
  const removed: WorkflowNode[] = []
  const modified: Array<{ oldNode: WorkflowNode; newNode: WorkflowNode }> = []

  // 新版本中有、旧版本中没有 → added
  for (const [id, newNode] of newMap) {
    if (!oldMap.has(id)) {
      added.push(newNode)
    }
  }

  // 旧版本中有、新版本中没有 → removed
  for (const [id, oldNode] of oldMap) {
    if (!newMap.has(id)) {
      removed.push(oldNode)
    }
  }

  // 两版本都有 → 检查变化
  for (const [id, oldNode] of oldMap) {
    const newNode = newMap.get(id)
    if (!newNode) continue

    if (hasNodeChanged(oldNode, newNode)) {
      modified.push({ oldNode, newNode })
    }
  }

  return { added, removed, modified }
}

/** 判断两个节点是否有变化 */
function hasNodeChanged(a: WorkflowNode, b: WorkflowNode): boolean {
  if (a.name !== b.name) return true
  if (a.type !== b.type) return true
  if (a.description !== b.description) return true
  if (a.sortIndex !== b.sortIndex) return true
  if (JSON.stringify(a.spec) !== JSON.stringify(b.spec)) return true
  if (JSON.stringify(a.ui) !== JSON.stringify(b.ui)) return true
  return false
}
