import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { isContainer } from "@/types/container";
import type { WorkflowNode } from "@/types/workflow";
import { useWorkflowStore } from "@/stores/workflow";
import { genNodeId } from "@/lib/ids";

interface NodeBounds {
  type: string;
  collapsed: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useEditorDragDrop(
  nodeBoundsMap: Map<string, NodeBounds>,
  setDragOverContainerId: (id: string | null) => void,
) {
  const { screenToFlowPosition } = useReactFlow();
  const setWfNodes = useWorkflowStore((s) => s.setNodes);

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      let found: string | null = null;
      for (const [nodeId, bounds] of nodeBoundsMap) {
        if (!isContainer(bounds.type) || bounds.collapsed) continue;
        if (
          position.x >= bounds.x &&
          position.x <= bounds.x + bounds.width &&
          position.y >= bounds.y &&
          position.y <= bounds.y + bounds.height
        ) {
          found = nodeId;
        }
      }
      setDragOverContainerId(found);
    },
    [screenToFlowPosition, nodeBoundsMap, setDragOverContainerId],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;

      let type: string, name: string, defaultSpec: Record<string, unknown> | undefined;
      try {
        const parsed = JSON.parse(rawData);
        type = parsed.type;
        name = parsed.name;
        defaultSpec = parsed.defaultSpec;
      } catch {
        toast.error("拖拽数据异常，请重试");
        return;
      }

      if (!type || !name) {
        toast.error("拖拽数据不完整，请重试");
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const currentNodes = useWorkflowStore.getState().nodes;

      let targetContainerId: string | null = null;
      for (const [nodeId, bounds] of nodeBoundsMap) {
        if (!isContainer(bounds.type) || bounds.collapsed) continue;
        if (
          position.x >= bounds.x &&
          position.x <= bounds.x + bounds.width &&
          position.y >= bounds.y &&
          position.y <= bounds.y + bounds.height
        ) {
          targetContainerId = nodeId;
        }
      }

      const siblings = currentNodes.filter((n) => n.containerId === targetContainerId);
      const maxSort = siblings.reduce((max, n) => Math.max(max, n.sortIndex), -1);

      const newNode: WorkflowNode = {
        id: genNodeId(),
        type,
        name,
        containerId: targetContainerId,
        sortIndex: maxSort + 1,
        spec: defaultSpec ?? {},
        ui: { x: position.x, y: position.y },
      };

      setWfNodes((prev) => [...prev, newNode]);
      setDragOverContainerId(null);
    },
    [screenToFlowPosition, setWfNodes, nodeBoundsMap, setDragOverContainerId],
  );

  const onDragLeave = useCallback(() => {
    setDragOverContainerId(null);
  }, [setDragOverContainerId]);

  return { onDragOver, onDrop, onDragLeave };
}
