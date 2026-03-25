import { create } from "zustand";
import { useStore } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow";
import { FIXTURE_NODES, FIXTURE_EDGES, FIXTURE_INPUTS } from "@/types/fixtures";

type RightPanel =
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

interface WorkflowMeta {
  flowId: string;
  name: string;
  namespace: string;
  description: string;
}

interface DraftSummary {
  id: string;
  message: string | null;
  createdAt: string;
}

interface ReleaseSummary {
  id: string;
  version: number;
  name: string;
  yaml: string;
  publishedAt: string;
}

interface TaskRun {
  id: string;
  taskId: string;
  state: string;
  startDate?: string;
  endDate?: string;
  attempts?: number;
  outputs?: Record<string, unknown>;
}

interface ExecutionSummary {
  id: string;
  kestraExecId: string;
  state: string;
  taskRuns: TaskRun[];
  triggeredBy: string;
  createdAt: string;
  endedAt?: string;
}

interface TriggerSummary {
  id: string;
  name: string;
  type: "schedule" | "webhook";
  config: Record<string, unknown>;
  kestraFlowId: string;
  disabled: boolean;
  createdAt: string;
}

type ViewMode = "edit" | "running";

interface RunningSnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputs: WorkflowInput[];
}

interface WorkflowState {
  // Data
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputs: WorkflowInput[];

  // UI
  rightPanel: RightPanel;
  selectedNodeId: string | null;
  panelOpen: boolean;

  // Running view
  viewMode: ViewMode;
  runningSnapshot: RunningSnapshot | null;
  executionSource: "draft" | "release";
  releaseVersion?: number;

  // Meta
  workflowMeta: WorkflowMeta;
  savedWorkflowId: string | null;
  publishedVersion: number;

  // Draft / Release
  drafts: DraftSummary[];
  releases: ReleaseSummary[];
  hasUnsavedChanges: boolean;
  lastSavedAt: string | null;

  // Execution
  isExecuting: boolean;
  currentExecution: ExecutionSummary | null;
  kestraHealthy: boolean;
  kestraError: string | null;

  // Namespace
  currentNamespace: string | null;
  hasNamespaces: boolean;
  setCurrentNamespace: (id: string) => void;
  setHasNamespaces: (has: boolean) => void;

  // Legacy alias — used by existing components
  namespaceId: string | null;
  setNamespaceId: (id: string) => void;

  // Trigger
  triggers: TriggerSummary[];
  setTriggers: (triggers: TriggerSummary[]) => void;

  // Container breadcrumb
  expandedContainers: string[];
  expandContainer: (nodeId: string) => void;
  collapseToContainer: (nodeId: string) => void;
  clearExpandedContainers: () => void;

  // Actions
  setNodes: (updater: WorkflowNode[] | ((prev: WorkflowNode[]) => WorkflowNode[])) => void;
  setEdges: (updater: WorkflowEdge[] | ((prev: WorkflowEdge[]) => WorkflowEdge[])) => void;
  setInputs: (updater: WorkflowInput[] | ((prev: WorkflowInput[]) => WorkflowInput[])) => void;
  setRightPanel: (panel: RightPanel) => void;
  setSelectedNodeId: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  setWorkflowMeta: (meta: WorkflowMeta) => void;
  setSavedWorkflowId: (id: string | null) => void;
  setPublishedVersion: (v: number) => void;
  setDrafts: (drafts: DraftSummary[]) => void;
  setReleases: (releases: ReleaseSummary[]) => void;
  markSaved: () => void;
  markDirty: () => void;
  toggleCollapse: (nodeId: string) => void;
  setIsExecuting: (v: boolean) => void;
  setCurrentExecution: (exec: ExecutionSummary | null) => void;
  setKestraHealthy: (v: boolean, error?: string | null) => void;

  // Running view
  enterRunningMode: (
    snapshot: RunningSnapshot,
    source: "draft" | "release",
    releaseVersion?: number,
  ) => void;
  exitRunningMode: () => void;
}

export type {
  WorkflowMeta,
  DraftSummary,
  ReleaseSummary,
  TaskRun,
  ExecutionSummary,
  TriggerSummary,
  WorkflowState,
  ViewMode,
  RunningSnapshot,
};

export const useWorkflowStore = create<WorkflowState>()(
  temporal(
    immer((set) => ({
      // Initial data
      nodes: FIXTURE_NODES,
      edges: FIXTURE_EDGES,
      inputs: FIXTURE_INPUTS,

      // Initial UI
      rightPanel: "none" as RightPanel,
      selectedNodeId: null,
      panelOpen: true,

      // Running view
      viewMode: "edit" as ViewMode,
      runningSnapshot: null,
      executionSource: "draft" as "draft" | "release",
      releaseVersion: undefined,

      // Initial meta
      workflowMeta: {
        flowId: "my-workflow",
        name: "我的工作流",
        namespace: "company.team",
        description: "",
      },
      savedWorkflowId: null,
      publishedVersion: 0,

      // Draft / Release
      drafts: [],
      releases: [],
      hasUnsavedChanges: false,
      lastSavedAt: null,

      // Execution
      isExecuting: false,
      currentExecution: null,
      kestraHealthy: false,
      kestraError: null,

      // Namespace
      currentNamespace: null,
      hasNamespaces: false,
      namespaceId: null,

      // Trigger
      triggers: [],

      // Container breadcrumb
      expandedContainers: [],

      // Actions
      setNodes: (updater) =>
        set((state) => {
          state.nodes = typeof updater === "function" ? updater(state.nodes) : updater;
        }),
      setEdges: (updater) =>
        set((state) => {
          state.edges = typeof updater === "function" ? updater(state.edges) : updater;
        }),
      setInputs: (updater) =>
        set((state) => {
          state.inputs = typeof updater === "function" ? updater(state.inputs) : updater;
        }),
      setRightPanel: (panel) => set({ rightPanel: panel }),
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),
      setPanelOpen: (open) => set({ panelOpen: open }),
      setWorkflowMeta: (meta) => set({ workflowMeta: meta }),
      setSavedWorkflowId: (id) => set({ savedWorkflowId: id }),
      setPublishedVersion: (v) => set({ publishedVersion: v }),
      setDrafts: (drafts) => set({ drafts }),
      setReleases: (releases) => set({ releases }),
      markSaved: () => set({ hasUnsavedChanges: false, lastSavedAt: new Date().toISOString() }),
      markDirty: () => set({ hasUnsavedChanges: true }),
      toggleCollapse: (nodeId) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === nodeId);
          if (!node) return;
          if (!node.ui) node.ui = { x: 0, y: 0 };
          node.ui.collapsed = !node.ui.collapsed;
          if (node.ui.collapsed) {
            // 折叠：从 expandedContainers 中移除该节点及其后续层级
            const idx = state.expandedContainers.indexOf(nodeId);
            if (idx !== -1) {
              state.expandedContainers.splice(idx);
            }
          } else {
            // 展开：push 到 expandedContainers
            if (!state.expandedContainers.includes(nodeId)) {
              state.expandedContainers.push(nodeId);
            }
          }
        }),
      setIsExecuting: (v) => set({ isExecuting: v }),
      setCurrentExecution: (exec) =>
        set((state) => {
          // 避免无变化时触发重渲染
          const prev = state.currentExecution;
          if (prev && exec && prev.id === exec.id && prev.state === exec.state) {
            // 比较 taskRuns 逐项状态
            const prevMap = new Map(prev.taskRuns.map((tr) => [tr.taskId, tr.state]));
            const nextMap = new Map(exec.taskRuns.map((tr) => [tr.taskId, tr.state]));
            let changed = prevMap.size !== nextMap.size;
            if (!changed) {
              for (const [taskId, st] of nextMap) {
                if (prevMap.get(taskId) !== st) {
                  changed = true;
                  break;
                }
              }
            }
            // 终态变化或时间戳更新
            if (!changed && prev.endedAt !== exec.endedAt) changed = true;
            if (!changed) return;
          }
          state.currentExecution = exec;
        }),
      setKestraHealthy: (v, error) => set({ kestraHealthy: v, kestraError: error ?? null }),
      setCurrentNamespace: (id) => set({ currentNamespace: id, namespaceId: id }),
      setHasNamespaces: (has) => set({ hasNamespaces: has }),
      setNamespaceId: (id) => set({ currentNamespace: id, namespaceId: id }),
      setTriggers: (triggers) => set({ triggers }),
      expandContainer: (nodeId) =>
        set((state) => {
          if (!state.expandedContainers.includes(nodeId)) {
            state.expandedContainers.push(nodeId);
          }
        }),
      collapseToContainer: (nodeId) =>
        set((state) => {
          const idx = state.expandedContainers.indexOf(nodeId);
          if (idx !== -1) {
            // 折叠该层级以下的所有容器
            const toCollapse = state.expandedContainers.splice(idx + 1);
            for (const id of toCollapse) {
              const node = state.nodes.find((n) => n.id === id);
              if (node) {
                if (!node.ui) node.ui = { x: 0, y: 0 };
                node.ui.collapsed = true;
              }
            }
          }
        }),
      clearExpandedContainers: () =>
        set((state) => {
          // 折叠所有已展开的容器
          for (const id of state.expandedContainers) {
            const node = state.nodes.find((n) => n.id === id);
            if (node) {
              if (!node.ui) node.ui = { x: 0, y: 0 };
              node.ui.collapsed = true;
            }
          }
          state.expandedContainers = [];
        }),

      // Running view
      enterRunningMode: (snapshot, source, releaseVersion) =>
        set({
          viewMode: "running",
          runningSnapshot: snapshot,
          executionSource: source,
          releaseVersion,
        }),
      exitRunningMode: () =>
        set({
          viewMode: "edit",
          runningSnapshot: null,
          executionSource: "draft",
          releaseVersion: undefined,
        }),
    })),
    {
      limit: 50,
      wrapTemporal: immer,
    },
  ),
);

// Undo/redo hooks
export const useUndo = () => useWorkflowStore.temporal.getState().undo;
export const useRedo = () => useWorkflowStore.temporal.getState().redo;
export const useCanUndo = () =>
  useStore(useWorkflowStore.temporal, (state) => state.pastStates.length > 0);
export const useCanRedo = () =>
  useStore(useWorkflowStore.temporal, (state) => state.futureStates.length > 0);
