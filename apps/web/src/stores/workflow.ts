import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { travel } from "zustand-travel";
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow";
import type { ApiWorkflowVariable } from "@/types/api";
import { FIXTURE_NODES, FIXTURE_EDGES, FIXTURE_INPUTS } from "@/types/fixtures";

import type { WorkflowMeta, DraftSummary, ReleaseSummary, TriggerSummary } from "./types";

import type { UIState, UIActions } from "./ui";
import { uiInitialState, createUIActions } from "./ui";

import type { ExecutionState, ExecutionActions } from "./execution";
import { executionInitialState, createExecutionActions } from "./execution";

import type { NamespaceState, NamespaceActions } from "./namespace";
import { namespaceInitialState, createNamespaceActions } from "./namespace";

interface WorkflowDataState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputs: WorkflowInput[];
  variables: ApiWorkflowVariable[];
  workflowMeta: WorkflowMeta;
  savedWorkflowId: string | null;
  publishedVersion: number;
  drafts: DraftSummary[];
  releases: ReleaseSummary[];
  hasUnsavedChanges: boolean;
  lastSavedAt: string | null;
  triggers: TriggerSummary[];
  expandedContainers: string[];
}

interface WorkflowDataActions {
  setNodes: (updater: WorkflowNode[] | ((prev: WorkflowNode[]) => WorkflowNode[])) => void;
  setEdges: (updater: WorkflowEdge[] | ((prev: WorkflowEdge[]) => WorkflowEdge[])) => void;
  setInputs: (updater: WorkflowInput[] | ((prev: WorkflowInput[]) => WorkflowInput[])) => void;
  setVariables: (
    updater: ApiWorkflowVariable[] | ((prev: ApiWorkflowVariable[]) => ApiWorkflowVariable[]),
  ) => void;
  setWorkflowMeta: (meta: WorkflowMeta) => void;
  setSavedWorkflowId: (id: string | null) => void;
  setPublishedVersion: (v: number) => void;
  setDrafts: (drafts: DraftSummary[]) => void;
  setReleases: (releases: ReleaseSummary[]) => void;
  markSaved: () => void;
  markDirty: () => void;
  toggleCollapse: (nodeId: string) => void;
  setTriggers: (triggers: TriggerSummary[]) => void;
  expandContainer: (nodeId: string) => void;
  collapseToContainer: (nodeId: string) => void;
  clearExpandedContainers: () => void;
}

export type WorkflowState = WorkflowDataState &
  UIState &
  ExecutionState &
  NamespaceState &
  WorkflowDataActions &
  UIActions &
  ExecutionActions &
  NamespaceActions;

const workflowDataInitialState: WorkflowDataState = {
  nodes: FIXTURE_NODES,
  edges: FIXTURE_EDGES,
  inputs: FIXTURE_INPUTS,
  variables: [],
  workflowMeta: {
    flowId: "my-workflow",
    name: "我的工作流",
    namespace: "company.team",
    description: "",
    disabled: false,
  },
  savedWorkflowId: null,
  publishedVersion: 0,
  drafts: [],
  releases: [],
  hasUnsavedChanges: false,
  lastSavedAt: null,
  triggers: [],
  expandedContainers: [],
};

export const useWorkflowStore = create<WorkflowState>()(
  travel(
    (set) => ({
      ...workflowDataInitialState,
      ...uiInitialState,
      ...executionInitialState,
      ...namespaceInitialState,

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
      setVariables: (updater) =>
        set((state) => {
          state.variables = typeof updater === "function" ? updater(state.variables) : updater;
        }),
      setWorkflowMeta: (meta) =>
        set((state) => {
          state.workflowMeta = meta;
        }),
      setSavedWorkflowId: (id) =>
        set((state) => {
          state.savedWorkflowId = id;
        }),
      setPublishedVersion: (v) =>
        set((state) => {
          state.publishedVersion = v;
        }),
      setDrafts: (drafts) =>
        set((state) => {
          state.drafts = drafts;
        }),
      setReleases: (releases) =>
        set((state) => {
          state.releases = releases;
        }),
      markSaved: () =>
        set((state) => {
          state.hasUnsavedChanges = false;
          state.lastSavedAt = new Date().toISOString();
        }),
      markDirty: () =>
        set((state) => {
          state.hasUnsavedChanges = true;
        }),
      toggleCollapse: (nodeId) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === nodeId);
          if (!node) return;
          if (!node.ui) node.ui = { x: 0, y: 0 };
          node.ui.collapsed = !node.ui.collapsed;
          if (node.ui.collapsed) {
            const idx = state.expandedContainers.indexOf(nodeId);
            if (idx !== -1) {
              state.expandedContainers.splice(idx, 1);
            }
          } else {
            if (!state.expandedContainers.includes(nodeId)) {
              state.expandedContainers.push(nodeId);
            }
          }
        }),
      setTriggers: (triggers) =>
        set((state) => {
          state.triggers = triggers;
        }),
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
          for (const id of state.expandedContainers) {
            const node = state.nodes.find((n) => n.id === id);
            if (node) {
              if (!node.ui) node.ui = { x: 0, y: 0 };
              node.ui.collapsed = true;
            }
          }
          state.expandedContainers = [];
        }),

      ...createUIActions(set),
      ...createExecutionActions(set),
      ...createNamespaceActions(set),
    }),
    { maxHistory: 50 },
  ),
);

const controls = useWorkflowStore.getControls();
export const useUndo = () => controls.back;
export const useRedo = () => controls.forward;
export const useCanUndo = () =>
  useSyncExternalStore(
    useWorkflowStore.subscribe,
    () => controls.canBack(),
    () => false,
  );
export const useCanRedo = () =>
  useSyncExternalStore(
    useWorkflowStore.subscribe,
    () => controls.canForward(),
    () => false,
  );

export type {
  WorkflowMeta,
  DraftSummary,
  ReleaseSummary,
  TaskRun,
  ExecutionSummary,
  TriggerSummary,
  ViewMode,
  RunningSnapshot,
} from "./types";
