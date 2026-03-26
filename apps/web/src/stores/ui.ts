import type { RightPanel, ViewMode, RunningSnapshot } from "./types";

export interface UIState {
  rightPanel: RightPanel;
  selectedNodeId: string | null;
  panelOpen: boolean;
  viewMode: ViewMode;
  runningSnapshot: RunningSnapshot | null;
  executionSource: "draft" | "release";
  releaseVersion?: number;
}

export interface UIActions {
  setRightPanel: (panel: RightPanel) => void;
  setSelectedNodeId: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  enterRunningMode: (
    snapshot: RunningSnapshot,
    source: "draft" | "release",
    releaseVersion?: number,
  ) => void;
  exitRunningMode: () => void;
}

export const uiInitialState: UIState = {
  rightPanel: "none",
  selectedNodeId: null,
  panelOpen: true,
  viewMode: "edit",
  runningSnapshot: null,
  executionSource: "draft",
  releaseVersion: undefined,
};

export const createUIActions = (set: (fn: (state: any) => void) => void): UIActions => ({
  setRightPanel: (panel) =>
    set((state) => {
      state.rightPanel = panel;
    }),
  setSelectedNodeId: (id) =>
    set((state) => {
      state.selectedNodeId = id;
    }),
  setPanelOpen: (open) =>
    set((state) => {
      state.panelOpen = open;
    }),
  enterRunningMode: (snapshot, source, releaseVersion) =>
    set((state) => {
      state.viewMode = "running";
      state.runningSnapshot = snapshot;
      state.executionSource = source;
      state.releaseVersion = releaseVersion;
    }),
  exitRunningMode: () =>
    set((state) => {
      state.viewMode = "edit";
      state.runningSnapshot = null;
      state.executionSource = "draft";
      state.releaseVersion = undefined;
    }),
});
