export type EdgeType =
  | "sequence"
  | "containment"
  | "then"
  | "else"
  | "case"
  | "errors"
  | "finally"

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

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label?: string
}

export type WorkflowInputType =
  | "STRING" | "INT" | "FLOAT" | "BOOL"
  | "SELECT" | "MULTISELECT"
  | "DATE" | "DATETIME" | "TIME" | "DURATION"
  | "ARRAY" | "JSON" | "YAML"
  | "FILE" | "URI" | "SECRET"

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

export type VariableType = "STRING" | "NUMBER" | "BOOLEAN" | "JSON"

export interface WorkflowVariable {
  key: string
  value: string
  type: VariableType
  description?: string
}

export interface PluginEntry {
  type: string
  name: string
  category: "flow" | "http" | "script" | "jdbc" | "serdes" | "storage" | "other"
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

export type PluginCategory = "flow" | "http" | "script" | "jdbc" | "serdes" | "storage" | "other"

export const CATEGORY_COLORS = {
  flow:    "#818cf8",
  http:    "#3b82f6",
  script:  "#22c55e",
  jdbc:    "#f59e0b",
  serdes:  "#06b6d4",
  storage: "#6b7280",
  other:   "#6366f1",
} satisfies Record<PluginCategory, string>

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
  sequence:    { stroke: "#6366f1", strokeWidth: 2 },
  containment: { stroke: "#9ca3af", strokeWidth: 2, strokeDasharray: "5,5" },
  "then":      { stroke: "#22c55e", strokeWidth: 2 },
  else:        { stroke: "#ef4444", strokeWidth: 2 },
  case:        { stroke: "#3b82f6", strokeWidth: 2 },
  errors:      { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5,5" },
  finally:     { stroke: "#9ca3af", strokeWidth: 2, strokeDasharray: "5,5" },
}
