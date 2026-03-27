import { useHotkeys } from "react-hotkeys-hook";
import { useReactFlow } from "@xyflow/react";
import { useWorkflowStore } from "@/stores/workflow";
import type { RightPanel } from "@/stores/types";

interface UseEditorHotkeysOptions {
  rightPanel: RightPanel;
  selectedNodeId: string | null;
  viewMode: string;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  onSaveDraft: () => void;
  onDeleteSelected: () => void;
  onDuplicate: () => void;
  onAutoLayout: () => Promise<void>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setContextMenu: (state: null) => void;
  setHelpOpen: (open: boolean) => void;
}

export function useEditorHotkeys({
  rightPanel,
  selectedNodeId,
  viewMode,
  canUndo,
  canRedo,
  undo,
  redo,
  onSaveDraft,
  onDeleteSelected,
  onDuplicate,
  onAutoLayout,
  searchInputRef,
  setSearchOpen,
  setSearchQuery,
  setContextMenu,
  setHelpOpen,
}: UseEditorHotkeysOptions) {
  const { fitView } = useReactFlow();
  const setWfNodes = useWorkflowStore((s) => s.setNodes);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const setRightPanel = useWorkflowStore((s) => s.setRightPanel);

  const isEditorPanelOpen =
    rightPanel === "task" || rightPanel === "inputs" || rightPanel === "yaml";

  useHotkeys("mod+z", () => undo(), { enabled: canUndo && !isEditorPanelOpen });
  useHotkeys("mod+shift+z", () => redo(), { enabled: canRedo && !isEditorPanelOpen });
  useHotkeys("delete, backspace", () => onDeleteSelected(), {
    enabled: !!selectedNodeId && !isEditorPanelOpen,
  });
  useHotkeys(
    "mod+s",
    (e) => {
      e.preventDefault();
      onSaveDraft();
    },
    { enabled: !isEditorPanelOpen },
  );
  useHotkeys(
    "mod+a",
    (e) => {
      e.preventDefault();
      const { nodes } = useWorkflowStore.getState();
      if (nodes.length > 0) {
        setWfNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
      }
    },
    { enabled: !isEditorPanelOpen },
  );
  useHotkeys(
    "mod+d",
    (e) => {
      e.preventDefault();
      if (selectedNodeId) onDuplicate();
    },
    { enabled: !isEditorPanelOpen },
  );
  useHotkeys("escape", () => {
    setWfNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
    setSelectedNodeId(null);
    setRightPanel("none");
    setContextMenu(null);
    setSearchOpen(false);
    setSearchQuery("");
  });
  useHotkeys("mod+f", (e) => {
    e.preventDefault();
    setSearchOpen(true);
    setSearchQuery("");
    setTimeout(() => searchInputRef.current?.focus(), 50);
  });
  useHotkeys(
    "shift+a",
    (e) => {
      e.preventDefault();
      void onAutoLayout();
    },
    { enabled: !isEditorPanelOpen && viewMode !== "running" },
  );
  useHotkeys("shift+f", (e) => {
    e.preventDefault();
    void fitView({ padding: 0.2, maxZoom: 1 });
  });
  useHotkeys("shift+?", () => {
    setHelpOpen(true);
  });
}
