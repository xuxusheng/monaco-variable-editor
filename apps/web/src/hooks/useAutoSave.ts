/**
 * useAutoSave — 30 秒自动暂存 + 脏标记
 */
import { useEffect, useRef } from "react";
import { useWorkflowStore } from "@/stores/workflow";

interface UseAutoSaveOptions {
  savedWorkflowId: string | null;
  onSave: (message?: string) => void;
}

export function useAutoSave({ savedWorkflowId, onSave }: UseAutoSaveOptions) {
  const { hasUnsavedChanges, markDirty, wfNodes, wfEdges, inputs } = useWorkflowStore((s) => ({
    hasUnsavedChanges: s.hasUnsavedChanges,
    markDirty: s.markDirty,
    wfNodes: s.nodes,
    wfEdges: s.edges,
    inputs: s.inputs,
  }));

  // 首次加载标记：首次渲染不触发 markDirty；已脏时跳过冗余调用
  const isInitialMount = useRef(true);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isLoadingRef.current) return;
    if (!hasUnsavedChanges) {
      markDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wfNodes, wfEdges, inputs, markDirty, hasUnsavedChanges]);

  // Auto-save timer (30s) — recursive setTimeout with refs to avoid stale closure
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!savedWorkflowId) return;
    function tick() {
      if (hasUnsavedChangesRef.current && onSaveRef.current) {
        onSaveRef.current("自动暂存");
      }
      timerRef.current = setTimeout(tick, 30_000);
    }
    timerRef.current = setTimeout(tick, 30_000);
    return () => clearTimeout(timerRef.current);
  }, [savedWorkflowId]);

  return { isLoadingRef };
}
