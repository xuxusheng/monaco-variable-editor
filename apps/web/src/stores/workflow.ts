import { create } from "zustand"
import { useStore } from "zustand"
import { immer } from "zustand/middleware/immer"
import { temporal } from "zundo"
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow"
import { FIXTURE_NODES, FIXTURE_EDGES, FIXTURE_INPUTS } from "@/types/fixtures"

type RightPanel = "none" | "task" | "inputs" | "yaml"

interface WorkflowMeta {
  flowId: string
  name: string
  namespace: string
  description: string
}

interface WorkflowState {
  // Data
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowInput[]

  // UI
  rightPanel: RightPanel
  selectedNodeId: string | null
  panelOpen: boolean

  // Meta
  workflowMeta: WorkflowMeta
  savedWorkflowId: string | null

  // Actions
  setNodes: (
    updater: WorkflowNode[] | ((prev: WorkflowNode[]) => WorkflowNode[]),
  ) => void
  setEdges: (
    updater: WorkflowEdge[] | ((prev: WorkflowEdge[]) => WorkflowEdge[]),
  ) => void
  setInputs: (
    updater: WorkflowInput[] | ((prev: WorkflowInput[]) => WorkflowInput[]),
  ) => void
  setRightPanel: (panel: RightPanel) => void
  setSelectedNodeId: (id: string | null) => void
  setPanelOpen: (open: boolean) => void
  setWorkflowMeta: (meta: WorkflowMeta) => void
  setSavedWorkflowId: (id: string | null) => void
}

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

      // Initial meta
      workflowMeta: {
        flowId: "my-workflow",
        name: "我的工作流",
        namespace: "company.team",
        description: "",
      },
      savedWorkflowId: null,

      // Actions
      setNodes: (updater) =>
        set((state) => {
          state.nodes =
            typeof updater === "function" ? updater(state.nodes) : updater
        }),
      setEdges: (updater) =>
        set((state) => {
          state.edges =
            typeof updater === "function" ? updater(state.edges) : updater
        }),
      setInputs: (updater) =>
        set((state) => {
          state.inputs =
            typeof updater === "function" ? updater(state.inputs) : updater
        }),
      setRightPanel: (panel) => set({ rightPanel: panel }),
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),
      setPanelOpen: (open) => set({ panelOpen: open }),
      setWorkflowMeta: (meta) => set({ workflowMeta: meta }),
      setSavedWorkflowId: (id) => set({ savedWorkflowId: id }),
    })),
    {
      limit: 50,
      wrapTemporal: immer,
    },
  ),
)

// Undo/redo hooks
export const useUndo = () =>
  useWorkflowStore.temporal.getState().undo
export const useRedo = () =>
  useWorkflowStore.temporal.getState().redo
export const useCanUndo = () =>
  useStore(useWorkflowStore.temporal, (state) => state.pastStates.length > 0)
export const useCanRedo = () =>
  useStore(useWorkflowStore.temporal, (state) => state.futureStates.length > 0)
