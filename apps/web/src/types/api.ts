// API types — 对齐新的业务模型

export interface ApiWorkflowNode {
  id: string
  type: string
  name: string
  description?: string
  containerId: string | null
  sortIndex: number
  spec: Record<string, unknown>
  ui?: { x: number; y: number; collapsed?: boolean }
}

export interface ApiWorkflowEdge {
  id: string
  source: string
  target: string
  type: "sequence" | "containment" | "then" | "else" | "case" | "errors" | "finally"
  label?: string
}

export interface ApiWorkflowInput {
  id: string
  type: "STRING" | "INT" | "FLOAT" | "BOOL" | "SELECT" | "MULTISELECT" | "DATE" | "DATETIME" | "TIME" | "DURATION" | "ARRAY" | "JSON" | "YAML" | "FILE" | "URI" | "SECRET"
  displayName?: string
  description?: string
  required?: boolean
  defaults?: unknown
  values?: string[]
}

export interface ApiWorkflowVariable {
  key: string
  value: string
  type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON"
  description?: string
}

export interface WorkflowSummary {
  id: string
  flowId: string
  name: string
  namespace: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowFull extends WorkflowSummary {
  description: string | null
  nodes: ApiWorkflowNode[]
  edges: ApiWorkflowEdge[]
  inputs: ApiWorkflowInput[]
  variables: ApiWorkflowVariable[]
}
