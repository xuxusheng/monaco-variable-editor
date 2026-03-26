import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow";

export type RightPanel =
  | "none"
  | "task"
  | "inputs"
  | "yaml"
  | "drafts"
  | "releases"
  | "executions"
  | "triggers"
  | "production-executions"
  | "settings";

export interface WorkflowMeta {
  flowId: string;
  name: string;
  namespace: string;
  description: string;
  disabled: boolean;
}

export interface DraftSummary {
  id: string;
  message: string | null;
  createdAt: string;
}

export interface ReleaseSummary {
  id: string;
  version: number;
  name: string;
  yaml: string;
  publishedAt: string;
}

export interface TaskRun {
  id: string;
  taskId: string;
  state: string;
  startDate?: string;
  endDate?: string;
  attempts?: number;
  outputs?: Record<string, unknown>;
}

export interface ExecutionSummary {
  id: string;
  kestraExecId: string;
  state: string;
  taskRuns: TaskRun[];
  triggeredBy: string;
  createdAt: string;
  endedAt?: string;
}

export interface TriggerSummary {
  id: string;
  name: string;
  type: "schedule" | "webhook";
  config: Record<string, unknown>;
  kestraFlowId: string;
  disabled: boolean;
  createdAt: string;
}

export type ViewMode = "edit" | "running";

export interface RunningSnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputs: WorkflowInput[];
}
