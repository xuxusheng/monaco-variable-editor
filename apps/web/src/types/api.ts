// API types (mirrors apps/api/src/types.ts)
export interface ApiTaskNode {
  id: string
  label: string
  taskConfig: string
  position?: { x: number; y: number }
}

export interface ApiEdge {
  source: string
  target: string
}

export interface ApiInput {
  id: string
  type: string
  defaults?: string
  description?: string
  required?: boolean
}

export interface WorkflowSummary {
  id: string
  name: string
  namespace: string
  createdAt: string
  updatedAt: string
}

export interface WorkflowFull extends WorkflowSummary {
  description: string | null
  nodes: ApiTaskNode[]
  edges: ApiEdge[]
  inputs: ApiInput[]
  yaml: string | null
}
