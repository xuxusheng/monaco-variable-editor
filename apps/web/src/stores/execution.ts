import type { ExecutionSummary, TaskRun } from "./types";

export interface ExecutionState {
  isExecuting: boolean;
  currentExecution: ExecutionSummary | null;
  kestraHealthy: boolean;
  kestraError: string | null;
}

export interface ExecutionActions {
  setIsExecuting: (v: boolean) => void;
  setCurrentExecution: (exec: ExecutionSummary | null) => void;
  setKestraHealthy: (v: boolean, error?: string | null) => void;
}

export const executionInitialState: ExecutionState = {
  isExecuting: false,
  currentExecution: null,
  kestraHealthy: false,
  kestraError: null,
};

export const createExecutionActions = (
  set: (fn: (state: any) => void) => void,
): ExecutionActions => ({
  setIsExecuting: (v) =>
    set((state) => {
      state.isExecuting = v;
    }),
  setCurrentExecution: (exec) =>
    set((state) => {
      const prev = state.currentExecution;
      if (prev && exec && prev.id === exec.id && prev.state === exec.state) {
        const prevMap = new Map(prev.taskRuns.map((tr: TaskRun) => [tr.taskId, tr.state]));
        const nextMap = new Map(exec.taskRuns.map((tr: TaskRun) => [tr.taskId, tr.state]));
        let changed = prevMap.size !== nextMap.size;
        if (!changed) {
          for (const [taskId, st] of nextMap) {
            if (prevMap.get(taskId) !== st) {
              changed = true;
              break;
            }
          }
        }
        if (!changed && prev.endedAt !== exec.endedAt) changed = true;
        if (!changed) return;
      }
      state.currentExecution = exec;
    }),
  setKestraHealthy: (v, error) =>
    set((state) => {
      state.kestraHealthy = v;
      state.kestraError = error ?? null;
    }),
});
