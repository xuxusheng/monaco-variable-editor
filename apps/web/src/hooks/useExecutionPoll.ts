import { useEffect, useRef } from "react";
import { useWorkflowStore } from "@/stores/workflow";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { toExecutionSummary, isTerminalState } from "@/lib/apiTransforms";

export function useKestraHealthCheck() {
  const utils = trpc.useUtils();
  const setKestraHealthy = useWorkflowStore((s) => s.setKestraHealthy);

  const healthTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let isMounted = true;
    const check = () => {
      utils.workflow.kestraHealth
        .fetch()
        .then((res) => {
          if (isMounted) setKestraHealthy(res.healthy, res.error);
        })
        .catch((err) => {
          if (isMounted)
            setKestraHealthy(false, err instanceof Error ? err.message : "健康检查失败");
        })
        .finally(() => {
          if (isMounted) healthTimerRef.current = setTimeout(check, 5 * 60_000);
        });
    };
    check();
    return () => {
      isMounted = false;
      clearTimeout(healthTimerRef.current);
    };
  }, [utils, setKestraHealthy]);
}

export function useExecutionPoll() {
  const currentExecution = useWorkflowStore((s) => s.currentExecution);
  const isExecuting = useWorkflowStore((s) => s.isExecuting);
  const setCurrentExecution = useWorkflowStore((s) => s.setCurrentExecution);
  const setIsExecuting = useWorkflowStore((s) => s.setIsExecuting);
  const exitRunningMode = useWorkflowStore((s) => s.exitRunningMode);

  const currentExecutionRef = useRef(currentExecution);
  currentExecutionRef.current = currentExecution;

  const { data, isSuccess } = trpc.workflow.executionGet.useQuery(
    { executionId: currentExecution?.id ?? "" },
    {
      enabled: !!currentExecution && isExecuting && !isTerminalState(currentExecution.state),
      refetchInterval: (query) => {
        const state = query.state.data?.state;
        if (state && isTerminalState(state)) return false;
        return 3000;
      },
    },
  );

  useEffect(() => {
    if (!isSuccess || !data) return;

    setCurrentExecution(toExecutionSummary(data));

    if (isTerminalState(data.state)) {
      setIsExecuting(false);
      exitRunningMode();

      if (data.state === "SUCCESS") {
        toast.success("执行完成");
      } else if (data.state === "FAILED") {
        toast.error("执行失败");
      } else if (data.state === "WARNING") {
        toast.warning("执行完成（有警告）");
      } else if (data.state === "KILLED") {
        toast.warning("执行已终止");
      } else if (data.state === "CANCELLED") {
        toast.info("执行已取消");
      }
    }
  }, [data, isSuccess, setCurrentExecution, setIsExecuting, exitRunningMode]);
}
