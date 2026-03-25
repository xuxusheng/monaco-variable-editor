/**
 * API 数据转换层 — API ↔ 前端类型
 */
import type { WorkflowNode, WorkflowEdge, WorkflowInput, EdgeType } from "@/types/workflow";
import type { ExecutionSummary, TaskRun } from "@/stores/workflow";
import type { ApiWorkflowNode, ApiWorkflowEdge, ApiWorkflowInput } from "@/types/api";

export function fromApiNode(n: ApiWorkflowNode): WorkflowNode {
  return {
    id: n.id,
    type: n.type,
    name: n.name,
    description: n.description,
    containerId: n.containerId,
    sortIndex: n.sortIndex,
    spec: n.spec ?? {},
    ui: n.ui,
  };
}

export function fromApiEdge(e: ApiWorkflowEdge): WorkflowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    label: e.label,
  };
}

export function fromApiInput(i: ApiWorkflowInput): WorkflowInput {
  return {
    id: i.id,
    type: i.type,
    displayName: i.displayName,
    description: i.description,
    required: i.required,
    defaults: i.defaults,
    values: i.values,
  };
}

/** 根据 sourceHandle 推断边类型 */
export function inferEdgeType(sourceHandle: string | null): EdgeType {
  if (sourceHandle === "then" || sourceHandle === "else") return sourceHandle;
  if (sourceHandle?.startsWith("case-")) return "case";
  return "sequence";
}

export function isTerminalState(state: string): boolean {
  return ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"].includes(state);
}

/** 将 API 返回的执行记录转为 store 格式 */
export function toExecutionSummary(result: {
  id: string;
  kestraExecId: string;
  state: string;
  taskRuns: unknown;
  triggeredBy: string;
  createdAt: Date | string;
  endedAt?: Date | string | null;
}): ExecutionSummary {
  const raw = (result.taskRuns ?? []) as Record<string, unknown>[];
  const taskRuns: TaskRun[] = raw.map((tr) => {
    const idValue = tr.id;
    const taskIdValue = tr.taskId;
    const stateValue = tr.state;

    let stateStr = "UNKNOWN";
    if (typeof stateValue === "string") {
      stateStr = stateValue;
    } else if (typeof stateValue === "object" && stateValue !== null && "current" in stateValue) {
      const currentState = (stateValue as Record<string, unknown>).current;
      stateStr = typeof currentState === "string" ? currentState : "UNKNOWN";
    }

    return {
      id: typeof idValue === "string" ? idValue : idValue != null ? JSON.stringify(idValue) : "",
      taskId:
        typeof taskIdValue === "string"
          ? taskIdValue
          : taskIdValue != null
            ? JSON.stringify(taskIdValue)
            : "",
      state: stateStr,
      startDate:
        tr.startDate instanceof Date
          ? tr.startDate.toISOString()
          : typeof tr.startDate === "string"
            ? tr.startDate
            : undefined,
      endDate:
        tr.endDate instanceof Date
          ? tr.endDate.toISOString()
          : typeof tr.endDate === "string"
            ? tr.endDate
            : undefined,
      attempts: typeof tr.attempts === "number" ? tr.attempts : undefined,
      outputs: tr.outputs as Record<string, unknown> | undefined,
    };
  });
  return {
    id: result.id,
    kestraExecId: result.kestraExecId,
    state: result.state,
    taskRuns,
    triggeredBy: result.triggeredBy,
    createdAt:
      result.createdAt instanceof Date ? result.createdAt.toISOString() : String(result.createdAt),
    endedAt: (result as Record<string, unknown>).endedAt
      ? String((result as Record<string, unknown>).endedAt)
      : undefined,
  };
}
