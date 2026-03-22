import { z } from "zod"

// ========== 边类型枚举 ==========
export const edgeTypeSchema = z.enum([
  "sequence",
  "containment",
  "then",
  "else",
  "case",
  "errors",
  "finally",
])
export type EdgeType = z.infer<typeof edgeTypeSchema>

// ========== 节点 Schema ==========
export const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string().optional(),
  containerId: z.string().nullable(),
  sortIndex: z.number(),
  spec: z.record(z.unknown()),
  ui: z
    .object({
      x: z.number(),
      y: z.number(),
      collapsed: z.boolean().optional(),
    })
    .optional(),
})
export type WorkflowNode = z.infer<typeof workflowNodeSchema>

// ========== 边 Schema ==========
export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: edgeTypeSchema,
  label: z.string().optional(),
})
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>

// ========== Input 类型枚举 ==========
export const workflowInputTypeSchema = z.enum([
  "STRING",
  "INT",
  "FLOAT",
  "BOOL",
  "SELECT",
  "MULTISELECT",
  "DATE",
  "DATETIME",
  "TIME",
  "DURATION",
  "ARRAY",
  "JSON",
  "YAML",
  "FILE",
  "URI",
  "SECRET",
])
export type WorkflowInputType = z.infer<typeof workflowInputTypeSchema>

// ========== Input Schema ==========
export const workflowInputSchema = z.object({
  id: z.string(),
  type: workflowInputTypeSchema,
  displayName: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  defaults: z.unknown().optional(),
  values: z.array(z.string()).optional(),
  allowCustomValue: z.boolean().optional(),
  itemType: z.string().optional(),
  allowedFileExtensions: z.array(z.string()).optional(),
  validator: z
    .object({
      regex: z.string(),
      message: z.string(),
    })
    .optional(),
})
export type WorkflowInput = z.infer<typeof workflowInputSchema>

// ========== Variable 类型枚举 ==========
export const variableTypeSchema = z.enum([
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "JSON",
])
export type VariableType = z.infer<typeof variableTypeSchema>

// ========== Variable Schema ==========
export const workflowVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: variableTypeSchema,
  description: z.string().optional(),
})
export type WorkflowVariable = z.infer<typeof workflowVariableSchema>

// ========== CRUD Schema ==========

export const createWorkflowSchema = z.object({
  name: z.string().min(1),
  flowId: z.string().min(1),
  namespaceId: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(workflowNodeSchema).default([]),
  edges: z.array(workflowEdgeSchema).default([]),
  inputs: z.array(workflowInputSchema).default([]),
  variables: z.array(workflowVariableSchema).default([]),
  disabled: z.boolean().default(false),
})

export const updateWorkflowSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  flowId: z.string().min(1).optional(),
  description: z.string().optional(),
  nodes: z.array(workflowNodeSchema).optional(),
  edges: z.array(workflowEdgeSchema).optional(),
  inputs: z.array(workflowInputSchema).optional(),
  variables: z.array(workflowVariableSchema).optional(),
  disabled: z.boolean().optional(),
  publishedVersion: z.number().int().optional(),
})

export const createNamespaceSchema = z.object({
  name: z.string().min(1, "空间名称不能为空").max(64, "空间名称不超过 64 个字符"),
  kestraNamespace: z.string().min(1).max(64),
  description: z.string().optional(),
})
