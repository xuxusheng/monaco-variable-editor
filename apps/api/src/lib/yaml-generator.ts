/**
 * yaml-generator.ts — 简化版 Kestra YAML 生成（后端专用）
 *
 * 用于 Draft 保存时推送 YAML 到 Kestra。
 * 前端版本（yamlConverter.ts）支持完整的双向转换，此版本仅生成基本结构。
 */

import YAML from "yaml"
import { uniqueSlug } from "@weave/shared/slug"

interface WorkflowNode {
  id: string
  type: string
  name: string
  description?: string
  containerId?: string | null
  sortIndex: number
  spec?: Record<string, unknown>
}

interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: string
  label?: string
}

interface WorkflowInput {
  id: string
  type: string
  displayName?: string
  description?: string
  required?: boolean
  defaults?: unknown
  values?: string[]
  allowCustomValue?: boolean
}

interface WorkflowVariable {
  key: string
  value: string
  type: string
}

const EXCLUDED_SPEC_KEYS = new Set([
  "id", "type", "name", "description",
  "tasks", "then", "else", "cases", "errors", "finally",
  "retry", "timeout", "disabled",
])

function extractSpec(node: WorkflowNode): Record<string, unknown> {
  if (!node.spec) return {}
  return Object.fromEntries(
    Object.entries(node.spec).filter(([k]) => !EXCLUDED_SPEC_KEYS.has(k)),
  )
}

function getChildren(parentId: string, nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes
    .filter((n) => n.containerId === parentId)
    .sort((a, b) => a.sortIndex - b.sortIndex)
}

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
    ...extractSpec(node),
  }

  const shortType = node.type.split(".").pop()

  switch (shortType) {
    case "ForEach":
    case "Sequential":
    case "Parallel": {
      const children = getChildren(node.id, allNodes)
      const childTasks = children.map((c) => convertTask(c, allNodes, edges, slugSet))
      for (let i = 0; i < childTasks.length; i++) {
        addErrorFinally(childTasks[i]!, children[i]!, allNodes, edges, slugSet)
      }
      return { ...base, tasks: childTasks }
    }

    case "If": {
      const result: Record<string, unknown> = { ...base }
      const thenEdges = edges.filter((e) => e.source === node.id && e.type === "then")
      const elseEdges = edges.filter((e) => e.source === node.id && e.type === "else")

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

    case "Switch": {
      const caseEdges = edges.filter((e) => e.source === node.id && e.type === "case")
      const result: Record<string, unknown> = { ...base }
      if (caseEdges.length > 0) {
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
      }
      return result
    }

    default: {
      addErrorFinally(base, node, allNodes, edges, slugSet)
      return base
    }
  }
}

function addErrorFinally(
  task: Record<string, unknown>,
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  edges: WorkflowEdge[],
  slugSet: Set<string>,
): void {
  const errorEdges = edges.filter((e) => e.source === node.id && e.type === "errors")
  const finallyEdges = edges.filter((e) => e.source === node.id && e.type === "finally")

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

function convertInput(input: WorkflowInput): Record<string, unknown> {
  const result: Record<string, unknown> = { id: input.id, type: input.type }
  if (input.displayName) result.displayName = input.displayName
  if (input.description) result.description = input.description
  if (input.required !== undefined) result.required = input.required
  if (input.defaults !== undefined) result.defaults = input.defaults
  if (input.values) result.values = input.values
  if (input.allowCustomValue !== undefined) result.allowCustomValue = input.allowCustomValue
  return result
}

export function toKestraYaml(
  nodes: unknown,
  edges: unknown,
  inputs: unknown,
  variables: unknown,
  flowId: string,
  namespace: string,
): string {
  const nodeList = (Array.isArray(nodes) ? nodes : []) as WorkflowNode[]
  const edgeList = (Array.isArray(edges) ? edges : []) as WorkflowEdge[]
  const inputList = (Array.isArray(inputs) ? inputs : []) as WorkflowInput[]
  const variableList = (Array.isArray(variables) ? variables : []) as WorkflowVariable[]

  const slugSet = new Set<string>()
  const topLevel = nodeList
    .filter((n) => n.containerId === null)
    .sort((a, b) => a.sortIndex - b.sortIndex)

  const tasks = topLevel.map((n) => convertTask(n, nodeList, edgeList, slugSet))

  const flow: Record<string, unknown> = {
    id: flowId,
    namespace,
  }

  if (inputList.length > 0) {
    flow.inputs = inputList.map(convertInput)
  }

  if (variableList.length > 0) {
    flow.variables = Object.fromEntries(variableList.map((v) => [v.key, v.value]))
  }

  flow.tasks = tasks

  return YAML.stringify(flow, { lineWidth: 0 })
}
