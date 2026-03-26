import { z } from "zod"

export type EdgeType =
  | "sequence"
  | "containment"
  | "then"
  | "else"
  | "case"
  | "errors"
  | "finally"

export const edgeTypeSchema = z.enum([
  "sequence",
  "containment",
  "then",
  "else",
  "case",
  "errors",
  "finally",
])

export interface WorkflowNode {
  id: string
  type: string
  name: string
  description?: string
  containerId: string | null
  sortIndex: number
  spec: Record<string, unknown>
  ui?: {
    x: number
    y: number
    collapsed?: boolean
  }
  selected?: boolean
}

export const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string().optional(),
  containerId: z.string().nullable(),
  sortIndex: z.number(),
  spec: z.record(z.string(), z.unknown()),
  ui: z
    .object({
      x: z.number(),
      y: z.number(),
      collapsed: z.boolean().optional(),
    })
    .optional(),
})

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label?: string
}

export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: edgeTypeSchema,
  label: z.string().optional(),
})

export type WorkflowInputType =
  | "STRING"
  | "INT"
  | "FLOAT"
  | "BOOL"
  | "SELECT"
  | "MULTISELECT"
  | "DATE"
  | "DATETIME"
  | "TIME"
  | "DURATION"
  | "ARRAY"
  | "JSON"
  | "YAML"
  | "FILE"
  | "URI"
  | "SECRET"

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

export interface WorkflowInput {
  id: string
  type: WorkflowInputType
  displayName?: string
  description?: string
  required?: boolean
  defaults?: unknown
  values?: string[]
  allowCustomValue?: boolean
  itemType?: string
  allowedFileExtensions?: string[]
  validator?: { regex: string; message: string }
}

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

export type VariableType = "STRING" | "NUMBER" | "BOOLEAN" | "JSON"

export const variableTypeSchema = z.enum(["STRING", "NUMBER", "BOOLEAN", "JSON"])

export interface WorkflowVariable {
  key: string
  value: string
  type: VariableType
  description?: string
}

export const workflowVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: variableTypeSchema,
  description: z.string().optional(),
})

export type PluginCategory = "flow" | "http" | "script" | "jdbc" | "serdes" | "storage" | "other"

export interface PluginEntry {
  type: string
  name: string
  category: PluginCategory
  defaultSpec?: Record<string, unknown>
}

export const PLUGIN_CATALOG: PluginEntry[] = [
  {
    type: "io.kestra.plugin.core.log.Log",
    name: "Log Message",
    category: "flow",
    defaultSpec: { message: "Hello from Weave" },
  },
  {
    type: "io.kestra.plugin.core.http.Request",
    name: "HTTP Request",
    category: "http",
    defaultSpec: { uri: "https://api.example.com", method: "GET" },
  },
  {
    type: "io.kestra.plugin.core.http.Download",
    name: "HTTP Download",
    category: "http",
    defaultSpec: { uri: "https://example.com/file.csv" },
  },
  {
    type: "io.kestra.plugin.core.jdbc.Query",
    name: "JDBC Query",
    category: "jdbc",
    defaultSpec: { url: "jdbc:postgresql://localhost:5432/db", sql: "SELECT 1" },
  },
  {
    type: "io.kestra.plugin.scripts.shell.Script",
    name: "Shell Script",
    category: "script",
    defaultSpec: { script: "echo 'Hello'" },
  },
  {
    type: "io.kestra.plugin.scripts.python.Script",
    name: "Python Script",
    category: "script",
    defaultSpec: { script: "print('Hello')" },
  },
  {
    type: "io.kestra.plugin.scripts.node.Script",
    name: "Node.js Script",
    category: "script",
    defaultSpec: { script: "console.log('Hello')" },
  },
  {
    type: "io.kestra.plugin.core.storage.LocalFiles",
    name: "Local Files",
    category: "storage",
    defaultSpec: {},
  },
  {
    type: "io.kestra.plugin.core.flow.ForEach",
    name: "ForEach Loop",
    category: "flow",
    defaultSpec: { values: ["item1", "item2"] },
  },
  {
    type: "io.kestra.plugin.core.flow.If",
    name: "If Condition",
    category: "flow",
    defaultSpec: { condition: "{{ inputs.enabled }}" },
  },
  {
    type: "io.kestra.plugin.core.flow.Switch",
    name: "Switch",
    category: "flow",
    defaultSpec: { cases: [] },
  },
  {
    type: "io.kestra.plugin.core.flow.Parallel",
    name: "Parallel",
    category: "flow",
    defaultSpec: {},
  },
  {
    type: "io.kestra.plugin.core.flow.Sequential",
    name: "Sequential",
    category: "flow",
    defaultSpec: {},
  },
]

export const CATEGORY_COLORS: Record<PluginCategory, string> = {
  flow: "#818cf8",
  http: "#3b82f6",
  script: "#22c55e",
  jdbc: "#f59e0b",
  serdes: "#06b6d4",
  storage: "#6b7280",
  other: "#6366f1",
}

export function getNodeColor(type: string): string {
  if (type.includes(".flow.")) return CATEGORY_COLORS.flow
  if (type.includes(".http.")) return CATEGORY_COLORS.http
  if (type.includes(".scripts.")) return CATEGORY_COLORS.script
  if (type.includes(".jdbc.")) return CATEGORY_COLORS.jdbc
  if (type.includes(".serdes.")) return CATEGORY_COLORS.serdes
  if (type.includes(".storage.")) return CATEGORY_COLORS.storage
  return CATEGORY_COLORS.other
}

export const EDGE_STYLES: Record<EdgeType, { stroke: string; strokeWidth: number; strokeDasharray?: string }> = {
  sequence: { stroke: "#6366f1", strokeWidth: 2 },
  containment: { stroke: "#9ca3af", strokeWidth: 2, strokeDasharray: "6,4" },
  then: { stroke: "#22c55e", strokeWidth: 2 },
  else: { stroke: "#ef4444", strokeWidth: 2 },
  case: { stroke: "#3b82f6", strokeWidth: 2 },
  errors: { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "6,4" },
  finally: { stroke: "#8b5cf6", strokeWidth: 2, strokeDasharray: "3,3" },
}

export const TERMINAL_STATES = new Set([
  "SUCCESS",
  "WARNING",
  "FAILED",
  "KILLED",
  "CANCELLED",
  "RETRIED",
])

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state)
}

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

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>
