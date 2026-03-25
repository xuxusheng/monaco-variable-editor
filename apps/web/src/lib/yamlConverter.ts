/**
 * yamlConverter.ts — 平台 nodes/edges ↔ Kestra YAML 双向转换
 *
 * toKestraYaml: WorkflowNode[] + WorkflowEdge[] → Kestra YAML string
 * fromKestraYaml: Kestra YAML string → { nodes, edges, inputs }
 */

import YAML from "yaml"
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow"
import type { ApiWorkflowVariable } from "@/types/api"
import { uniqueSlug } from "@weave/shared/slug"
import { getChildren } from "./containerUtils"

// ========== 提取 spec ==========
// Kestra 通用属性，不放入 spec
const EXCLUDED_SPEC_KEYS = new Set([
  "id", "type", "name", "description", "tasks",
  "then", "else", "cases", "errors", "finally",
  "retry", "timeout", "disabled",
])

function extractSpec(task: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(task).filter(([k]) => !EXCLUDED_SPEC_KEYS.has(k)),
  )
}

// ========== toKestraYaml ==========

/**
 * 将平台扁平 nodes/edges 转换为 Kestra 嵌套 YAML
 */
export function toKestraYaml(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  inputs: WorkflowInput[],
  variables: ApiWorkflowVariable[],
  flowId?: string,
  namespace?: string,
): string {
  const slugSet = new Set<string>()

  const topLevel = nodes
    .filter((n) => n.containerId === null)
    .sort((a, b) => a.sortIndex - b.sortIndex)

  const tasks = topLevel.map((n) => convertTask(n, nodes, edges, slugSet))

  const flow: Record<string, unknown> = {
    id: flowId || "workflow",
    namespace: namespace || "company.team",
  }

  if (inputs.length > 0) {
    flow.inputs = inputs.map(convertInputToKestra)
  }

  if (variables.length > 0) {
    flow.variables = Object.fromEntries(
      variables.map((v) => [v.key, v.value]),
    )
  }

  flow.tasks = tasks

  // 处理顶级的 errors/finally 边
  addTopLevelErrorFinally(flow, topLevel, nodes, edges, slugSet)

  return YAML.stringify(flow, { lineWidth: 0 })
}

/** 递归转换单个节点为 Kestra task */
function convertTask(
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): Record<string, unknown> {
  const slug = uniqueSlug(node.name, slugSet)
  const base: Record<string, unknown> = {
    id: slug,
    type: node.type,
    ...(node.description ? { description: node.description } : {}),
    ...node.spec,
  }

  const shortType = node.type.split(".").pop()

  switch (shortType) {
    case "ForEach":
    case "Sequential":
    case "Parallel":
      return convertContainerTask(base, node, allNodes, edges, slugSet)

    case "If":
      return convertIfTask(base, node, allNodes, edges, slugSet)

    case "Switch":
      return convertSwitchTask(base, node, allNodes, edges, slugSet)

    default:
      return convertLeafTask(base, node, allNodes, edges, slugSet)
  }
}

/** ForEach / Sequential / Parallel：子任务 → tasks 数组 */
function convertContainerTask(
  base: Record<string, unknown>,
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): Record<string, unknown> {
  const children = getChildren(node.id, allNodes)
  const childTasks = children.map((c) =>
    convertTask(c, allNodes, edges, slugSet),
  )

  // 处理子任务间的 sequence 边（多入边 → dependsOn）
  for (let i = 0; i < childTasks.length; i++) {
    const childNode = children[i]
    const seqEdges = edges.filter(
      (e) =>
        e.target === childNode.id &&
        e.type === "sequence" &&
        children.some((c) => c.id === e.source),
    )
    if (seqEdges.length > 1) {
      // 多入边汇聚：需要知道每个 source 的 slug
      // 这里用 source 名称生成 slug（需与 slugSet 同步）
      // 简化处理：用 children 中已生成的 slug
      const dependsOn: string[] = []
      for (const e of seqEdges) {
        const sourceChild = children.find((c) => c.id === e.source)
        if (sourceChild) {
          // childTask 的 id 就是其 slug
          dependsOn.push(
            (childTasks[children.indexOf(sourceChild)] as Record<string, unknown>).id as string,
          )
        }
      }
      if (dependsOn.length > 0) {
        childTasks[i] = { ...childTasks[i], dependsOn }
      }
    }
  }

  // 处理子任务的 errors/finally
  for (let i = 0; i < childTasks.length; i++) {
    addChildErrorFinally(
      childTasks[i] as Record<string, unknown>,
      children[i],
      allNodes,
      edges,
      slugSet,
    )
  }

  return { ...base, tasks: childTasks }
}

/** If：then/else 分支 */
function convertIfTask(
  base: Record<string, unknown>,
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }

  const thenEdges = edges.filter(
    (e) => e.source === node.id && e.type === "then",
  )
  const elseEdges = edges.filter(
    (e) => e.source === node.id && e.type === "else",
  )

  if (thenEdges.length > 0) {
    result.then = thenEdges.map((e) => {
      const target = allNodes.find((n) => n.id === e.target)
      if (!target) return { id: "unknown", type: "unknown" }
      return convertTask(target, allNodes, edges, slugSet)
    })
  }

  if (elseEdges.length > 0) {
    result.else = elseEdges.map((e) => {
      const target = allNodes.find((n) => n.id === e.target)
      if (!target) return { id: "unknown", type: "unknown" }
      return convertTask(target, allNodes, edges, slugSet)
    })
  }

  return result
}

/** Switch：按 label 分组 cases */
function convertSwitchTask(
  base: Record<string, unknown>,
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): Record<string, unknown> {
  const caseEdges = edges.filter(
    (e) => e.source === node.id && e.type === "case",
  )

  const result: Record<string, unknown> = { ...base }

  if (caseEdges.length === 0) return result

  // 按 label 分组
  const caseGroups = new Map<string, Record<string, unknown>[]>()

  for (const ce of caseEdges) {
    const caseLabel = ce.label || "default"
    const target = allNodes.find((n) => n.id === ce.target)
    if (!target) continue

    const task = convertTask(target, allNodes, edges, slugSet)
    if (!caseGroups.has(caseLabel)) caseGroups.set(caseLabel, [])
    caseGroups.get(caseLabel)!.push(task)
  }

  result.cases = Object.fromEntries(caseGroups)

  return result
}

/** 普通叶子节点：可能有 errors/finally */
function convertLeafTask(
  base: Record<string, unknown>,
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  addChildErrorFinally(result, node, allNodes, edges, slugSet)
  return result
}

/** 添加节点的 errors/finally */
function addChildErrorFinally(
  task: Record<string, unknown>,
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): void {
  const errorEdges = edges.filter(
    (e) => e.source === node.id && e.type === "errors",
  )
  const finallyEdges = edges.filter(
    (e) => e.source === node.id && e.type === "finally",
  )

  if (errorEdges.length > 0) {
    task.errors = errorEdges.map((e) => {
      const target = allNodes.find((n) => n.id === e.target)
      if (!target) return { id: "unknown", type: "unknown" }
      return convertTask(target, allNodes, edges, slugSet)
    })
  }

  if (finallyEdges.length > 0) {
    task.finally = finallyEdges.map((e) => {
      const target = allNodes.find((n) => n.id === e.target)
      if (!target) return { id: "unknown", type: "unknown" }
      return convertTask(target, allNodes, edges, slugSet)
    })
  }
}

/** 添加顶级的 errors/finally */
function addTopLevelErrorFinally(
  flow: Record<string, unknown>,
  topLevel: WorkflowNode[],
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): void {
  const topIds = new Set(topLevel.map((n) => n.id))

  const topErrors = edges.filter(
    (e) => e.type === "errors" && topIds.has(e.source),
  )
  const topFinally = edges.filter(
    (e) => e.type === "finally" && topIds.has(e.source),
  )

  if (topErrors.length > 0) {
    flow.errors = topErrors.map((e) => {
      const target = allNodes.find((n) => n.id === e.target)
      if (!target) return { id: "unknown", type: "unknown" }
      return convertTask(target, allNodes, edges, slugSet)
    })
  }

  if (topFinally.length > 0) {
    flow.finally = topFinally.map((e) => {
      const target = allNodes.find((n) => n.id === e.target)
      if (!target) return { id: "unknown", type: "unknown" }
      return convertTask(target, allNodes, edges, slugSet)
    })
  }
}

/** Input → Kestra format */
function convertInputToKestra(input: WorkflowInput): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: input.id,
    type: input.type,
  }
  if (input.displayName) result.displayName = input.displayName
  if (input.description) result.description = input.description
  if (input.required !== undefined) result.required = input.required
  if (input.defaults !== undefined) result.defaults = input.defaults
  if (input.values) result.values = input.values
  if (input.allowCustomValue !== undefined)
    result.allowCustomValue = input.allowCustomValue
  return result
}

// ========== fromKestraYaml ==========

/**
 * 将 Kestra YAML 字符串转换为平台扁平 nodes/edges
 */
export function fromKestraYaml(yamlStr: string): {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowInput[]
} {
  const flow = YAML.parse(yamlStr)
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []
  let sortIdx = 0

  // 建立 slug → task 定义的查找表（用于 Switch cases 解析）
  const taskMap = buildTaskMap(flow)

  // 转换顶级 tasks
  if (Array.isArray(flow.tasks)) {
    for (const task of flow.tasks) {
      flattenTask(task, null, sortIdx++, nodes, edges, taskMap)
    }
  }

  // 转换顶级 errors
  if (Array.isArray(flow.errors)) {
    for (const errTask of flow.errors) {
      const errSort = sortIdx++
      flattenTask(errTask, null, errSort, nodes, edges, taskMap, {
        sourceId: "__top__",
        edgeType: "errors",
      })
    }
  }

  // 转换顶级 finally
  if (Array.isArray(flow.finally)) {
    for (const finTask of flow.finally) {
      const finSort = sortIdx++
      flattenTask(finTask, null, finSort, nodes, edges, taskMap, {
        sourceId: "__top__",
        edgeType: "finally",
      })
    }
  }

  // 转换 inputs
  const inputs: WorkflowInput[] = (flow.inputs || []).map(
    convertFromKestraInput,
  )

  // 自动布局
  autoLayoutNodes(nodes)

  return { nodes, edges, inputs }
}

/** 构建 slug → task 定义查找表 */
function buildTaskMap(
  flow: Record<string, unknown>,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()

  function walk(tasks: unknown[]) {
    for (const task of tasks) {
      if (typeof task === "object" && task !== null) {
        const t = task as Record<string, unknown>
        if (typeof t.id === "string") {
          map.set(t.id, t)
        }
        // 递归子任务
        if (Array.isArray(t.tasks)) walk(t.tasks)
        if (Array.isArray(t.then)) walk(t.then)
        if (Array.isArray(t.else)) walk(t.else)
        if (Array.isArray(t.errors)) walk(t.errors)
        if (Array.isArray(t.finally)) walk(t.finally)
        if (typeof t.cases === "object" && t.cases !== null) {
          for (const caseTasks of Object.values(
            t.cases as Record<string, unknown>,
          )) {
            if (Array.isArray(caseTasks)) walk(caseTasks)
          }
        }
      }
    }
  }

  if (Array.isArray(flow.tasks)) walk(flow.tasks)
  if (Array.isArray(flow.errors)) walk(flow.errors)
  if (Array.isArray(flow.finally)) walk(flow.finally)

  return map
}

interface ParentEdge {
  sourceId: string
  edgeType: string
  label?: string
}

/** 递归展平 Kestra task 为平台节点 */
function flattenTask(
  task: Record<string, unknown>,
  containerId: string | null,
  sortIndex: number,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  taskMap: Map<string, Record<string, unknown>>,
  parentEdge?: ParentEdge,
): string {
  const id = generateId()
  const node: WorkflowNode = {
    id,
    type: task.type as string,
    name: (task.name as string) || (task.id as string),
    description: task.description as string | undefined,
    containerId,
    sortIndex,
    spec: extractSpec(task),
    ui: { x: 0, y: 0 },
  }
  nodes.push(node)

  // 创建父边
  if (parentEdge && parentEdge.sourceId !== "__top__") {
    edges.push({
      id: generateId(),
      source: parentEdge.sourceId,
      target: id,
      type: parentEdge.edgeType as WorkflowEdge["type"],
      label: parentEdge.label,
    })
  }

  const shortType = (task.type as string).split(".").pop()

  switch (shortType) {
    case "ForEach":
    case "Sequential":
    case "Parallel":
      convertContainerChildren(task, id, nodes, edges, taskMap)
      break

    case "If":
      convertIfBranches(task, id, nodes, edges, taskMap)
      break

    case "Switch":
      convertSwitchCases(task, id, nodes, edges, taskMap)
      break

    default:
      convertLeafErrorsFinally(task, id, nodes, edges, taskMap)
      break
  }

  return id
}

/** ForEach/Sequential/Parallel 子任务 */
function convertContainerChildren(
  task: Record<string, unknown>,
  parentId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  taskMap: Map<string, Record<string, unknown>>,
): void {
  if (!Array.isArray(task.tasks)) return

  let childSort = 0
  const childIds: string[] = []

  for (const child of task.tasks) {
    const childId = flattenTask(
      child as Record<string, unknown>,
      parentId,
      childSort++,
      nodes,
      edges,
      taskMap,
    )
    childIds.push(childId)

    // containment 边
    edges.push({
      id: generateId(),
      source: parentId,
      target: childId,
      type: "containment",
    })
  }

  // sequence 边（数组顺序 = 执行顺序）
  for (let i = 1; i < childIds.length; i++) {
    edges.push({
      id: generateId(),
      source: childIds[i - 1],
      target: childIds[i],
      type: "sequence",
    })
  }

  // 处理 dependsOn（多入边汇聚）
  for (let i = 0; i < task.tasks.length; i++) {
    const child = task.tasks[i] as Record<string, unknown>
    if (Array.isArray(child.dependsOn)) {
      for (const depSlug of child.dependsOn) {
        // 找到 dependsOn 对应的 childId
        const depIndex = task.tasks.findIndex(
          (t: unknown) => (t as Record<string, unknown>).id === depSlug,
        )
        if (depIndex >= 0 && depIndex !== i) {
          edges.push({
            id: generateId(),
            source: childIds[depIndex],
            target: childIds[i],
            type: "sequence",
          })
        }
      }
    }
  }
}

/** If 的 then/else 分支 */
function convertIfBranches(
  task: Record<string, unknown>,
  parentId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  taskMap: Map<string, Record<string, unknown>>,
): void {
  if (Array.isArray(task.then)) {
    for (const t of task.then) {
      flattenTask(
        t as Record<string, unknown>,
        parentId,
        0,
        nodes,
        edges,
        taskMap,
        { sourceId: parentId, edgeType: "then" },
      )
    }
  }

  if (Array.isArray(task.else)) {
    for (const t of task.else) {
      flattenTask(
        t as Record<string, unknown>,
        parentId,
        1,
        nodes,
        edges,
        taskMap,
        { sourceId: parentId, edgeType: "else" },
      )
    }
  }
}

/** Switch 的 cases */
function convertSwitchCases(
  task: Record<string, unknown>,
  parentId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  taskMap: Map<string, Record<string, unknown>>,
): void {
  const cases = task.cases as Record<string, unknown[]> | undefined
  if (!cases) return

  let sortIdx = 0
  for (const [caseLabel, caseTasks] of Object.entries(cases)) {
    if (!Array.isArray(caseTasks)) continue

    for (const ct of caseTasks) {
      // caseTasks 里的元素可能是完整 task 定义或 slug 引用
      const taskDef = typeof ct === "object" ? (ct as Record<string, unknown>) : taskMap.get(ct as string)
      if (!taskDef) continue

      flattenTask(taskDef, parentId, sortIdx++, nodes, edges, taskMap, {
        sourceId: parentId,
        edgeType: "case",
        label: caseLabel,
      })
    }
  }
}

/** 普通节点的 errors/finally */
function convertLeafErrorsFinally(
  task: Record<string, unknown>,
  parentId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  taskMap: Map<string, Record<string, unknown>>,
): void {
  if (Array.isArray(task.errors)) {
    for (const err of task.errors) {
      flattenTask(
        err as Record<string, unknown>,
        nodes.find((n) => n.id === parentId)?.containerId ?? null,
        0,
        nodes,
        edges,
        taskMap,
        { sourceId: parentId, edgeType: "errors" },
      )
    }
  }

  if (Array.isArray(task.finally)) {
    for (const fin of task.finally) {
      flattenTask(
        fin as Record<string, unknown>,
        nodes.find((n) => n.id === parentId)?.containerId ?? null,
        0,
        nodes,
        edges,
        taskMap,
        { sourceId: parentId, edgeType: "finally" },
      )
    }
  }
}

/** Kestra Input → 平台 Input */
function convertFromKestraInput(
  input: Record<string, unknown>,
): WorkflowInput {
  return {
    id: input.id as string,
    type: (input.type as WorkflowInput["type"]) || "STRING",
    displayName: input.displayName as string | undefined,
    description: input.description as string | undefined,
    required: input.required as boolean | undefined,
    defaults: input.defaults,
    values: input.values as string[] | undefined,
    allowCustomValue: input.allowCustomValue as boolean | undefined,
  }
}

// ========== 辅助 ==========

function generateId(): string {
  return `node_${crypto.randomUUID().slice(0, 8)}`
}

/** 简单自动布局（用于 YAML 导入） */
function autoLayoutNodes(nodes: WorkflowNode[]): void {
  const NODE_WIDTH = 200
  const NODE_HEIGHT = 80
  const H_GAP = 60
  const V_GAP = 100

  // 按 containerId 分组
  const groups = new Map<string | null, WorkflowNode[]>()
  for (const node of nodes) {
    const key = node.containerId
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(node)
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.sortIndex - b.sortIndex)
  }

  const topLevel = groups.get(null) || []
  let currentY = 50

  for (const node of topLevel) {
    node.ui = { x: 100, y: currentY }

    const children = groups.get(node.id)
    if (children && children.length > 0) {
      const childY = currentY + NODE_HEIGHT + V_GAP
      for (let j = 0; j < children.length; j++) {
        children[j].ui = {
          x: 100 + j * (NODE_WIDTH + H_GAP),
          y: childY,
        }
      }
      currentY = childY + NODE_HEIGHT + 40
    } else {
      currentY += NODE_HEIGHT + V_GAP
    }
  }
}
