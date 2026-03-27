import { useCallback, useRef, useMemo, useEffect, memo, useState, lazy, Suspense } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { Panel, Group, Separator } from "react-resizable-panels";
import type { RunningSnapshot } from "@/stores/workflow";
import type { RightPanel } from "@/stores/types";
import {
  toExecutionSummary,
  inferEdgeType,
  fromApiNode,
  fromApiEdge,
  fromApiInput,
} from "@/lib/apiTransforms";
import { isTerminalState } from "@weave/shared";
import { toCanvasNodes, toCanvasEdges, syncPositions } from "@/lib/canvasTransforms";
import { parseYamlToNodeFields, yamlFromSpec } from "@/lib/yamlNodeUtils";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import type { Connection, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { WorkflowNode as WorkflowNodeComponent } from "@/components/flow/WorkflowNode";
import { WorkflowEdge as WorkflowEdgeComponent } from "@/components/flow/WorkflowEdge";
import { NodeCreatePanel } from "@/components/flow/NodeCreatePanel";
import { TaskConfigPanel } from "@/components/flow/TaskConfigPanel";
import { TriggerPanel } from "@/components/flow/TriggerPanel";
import { InputConfigPanel } from "@/components/flow/InputConfigPanel";
const KestraYamlPanel = lazy(() =>
  import("@/components/flow/KestraYamlPanel").then((mod) => ({ default: mod.KestraYamlPanel })),
);
import { DraftHistory } from "@/components/flow/DraftHistory";
import { cn } from "@/lib/utils";
import { ReleaseHistory } from "@/components/flow/ReleaseHistory";

import { toKestraYaml } from "@/lib/yamlConverter";
import { checkReferences } from "@/lib/referenceChecker";
import { ExecutionHistory } from "@/components/flow/ExecutionHistory";
import { ProductionExecHistory } from "@/components/flow/ProductionExecHistory";
import { NamespaceSettings } from "@/components/flow/NamespaceSettings";
import { InputValuesForm } from "@/components/flow/InputValuesForm";

import { Breadcrumb } from "@/components/flow/Breadcrumb";
import { TemplateDialog } from "@/components/flow/TemplateDialog";
import { EditorTabBar, type TabKey } from "@/components/flow/EditorTabBar";
import { CanvasToolbar } from "@/components/flow/CanvasToolbar";
import { SearchOverlay } from "@/components/flow/SearchOverlay";
import { ReferenceStatusBar } from "@/components/flow/ReferenceStatusBar";
import { KeyboardShortcutsDialog } from "@/components/flow/KeyboardShortcutsDialog";
import type { WorkflowTemplate } from "@/lib/templates";
import { saveUserTemplate } from "@/lib/templates";
import { getLayoutedElements } from "@/lib/autoLayout";
import { filterVisibleNodes, filterVisibleEdges } from "@/lib/containerUtils";
import {
  Rocket,
  Play,
  ScrollText,
  Search,
  Plus,
  ArrowLeft,
  MoreHorizontal,
  FileCode2,
  GitBranch,
  History,
  Settings2,
  Pencil,
  Power,
  Package,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";
import { useEditorHotkeys } from "@/hooks/useEditorHotkeys";
import { useEditorDragDrop } from "@/hooks/useEditorDragDrop";
import { genNodeId, genEdgeId } from "@/lib/ids";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow";
import type { KestraInput } from "@/types/kestra";
import type {
  ApiWorkflowNode,
  ApiWorkflowEdge,
  ApiWorkflowInput,
  ApiWorkflowVariable,
} from "@/types/api";
import { useShallow } from "zustand/react/shallow";
import { useWorkflowStore, useUndo, useRedo, useCanUndo, useCanRedo } from "@/stores/workflow";

// ---- React Flow 自定义类型注册（稳定引用，不随组件重渲染） ----
const nodeTypes = { workflowNode: WorkflowNodeComponent };
const edgeTypes = { workflowEdge: WorkflowEdgeComponent };

// ========== FitView 工具（首次加载自适应） ==========

const FitViewOnMount = memo(function FitViewOnMount() {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 200);
    const handleResize = () => fitView({ padding: 0.2, maxZoom: 1, duration: 200 });
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [fitView]);
  return null;
});

/** 缩放百分比指示器 — 悬浮在画布右下角 */
const ZoomIndicator = memo(function ZoomIndicator({ hasStatusBar }: { hasStatusBar?: boolean }) {
  const { zoom } = useViewport();
  const pct = Math.round(zoom * 100);
  return (
    <div
      className={`absolute ${hasStatusBar ? "bottom-16" : "bottom-3"} right-3 z-10 select-none rounded-md border border-border bg-card/90 backdrop-blur-sm px-2 py-1 text-xs font-mono text-muted-foreground shadow-sm`}
    >
      {pct}%
    </div>
  );
});

// ========== 主组件 ==========

export default function WorkflowEditorPage() {
  const { workflowId } = useParams({ from: "/workflows/$workflowId/edit" });
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();

  // ---- Mobile ----
  const isMobile = useIsMobile();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const longPressTriggeredRef = useRef(false);

  // ---- Zustand store — 合并选择器减少 re-render ----
  const {
    nodes: wfNodes,
    edges: wfEdges,
    inputs,
    wfVariables,
    rightPanel,
    selectedNodeId,
    panelOpen,
    workflowMeta,
    savedWorkflowId,
    viewMode,
    runningSnapshot,
  } = useWorkflowStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      inputs: s.inputs,
      wfVariables: s.variables,
      rightPanel: s.rightPanel,
      selectedNodeId: s.selectedNodeId,
      panelOpen: s.panelOpen,
      workflowMeta: s.workflowMeta,
      savedWorkflowId: s.savedWorkflowId,
      viewMode: s.viewMode,
      runningSnapshot: s.runningSnapshot,
    })),
  );

  // Actions (stable references, safe as individual selectors)
  const setWfNodes = useWorkflowStore((s) => s.setNodes);
  const setWfEdges = useWorkflowStore((s) => s.setEdges);
  const setInputs = useWorkflowStore((s) => s.setInputs);
  const setWfVariables = useWorkflowStore((s) => s.setVariables);
  const setRightPanel = useWorkflowStore((s) => s.setRightPanel);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const setPanelOpen = useWorkflowStore((s) => s.setPanelOpen);
  const setWorkflowMeta = useWorkflowStore((s) => s.setWorkflowMeta);
  const setSavedWorkflowId = useWorkflowStore((s) => s.setSavedWorkflowId);
  const setTriggers = useWorkflowStore((s) => s.setTriggers);
  const enterRunningMode = useWorkflowStore((s) => s.enterRunningMode);
  const exitRunningMode = useWorkflowStore((s) => s.exitRunningMode);

  // ---- 模板功能 ----
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [_nodeCreateDrawerOpen, setNodeCreateDrawerOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // ---- 编辑名称/描述 ----
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // ---- 禁用/启用切换 ----
  const workflowUpdate = trpc.workflow.update.useMutation({
    onSuccess: () => toast.success("已更新"),
    onError: (err) => toast.error(err.message),
  });

  const handleToggleDisabled = useCallback(() => {
    if (!savedWorkflowId) return;
    const newDisabled = !workflowMeta.disabled;
    workflowUpdate.mutate({ id: savedWorkflowId, disabled: newDisabled });
    setWorkflowMeta({ ...workflowMeta, disabled: newDisabled });
  }, [savedWorkflowId, workflowMeta, workflowUpdate, setWorkflowMeta]);

  const handleSaveMeta = useCallback(() => {
    if (!savedWorkflowId) return;
    workflowUpdate.mutate({ id: savedWorkflowId, name: editName, description: editDescription });
    setWorkflowMeta({ ...workflowMeta, name: editName, description: editDescription });
    setEditMetaOpen(false);
  }, [savedWorkflowId, editName, editDescription, workflowMeta, workflowUpdate, setWorkflowMeta]);

  // ---- 引用检测 ----
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"variables" | "secrets">("variables");

  /** 跳转到 Namespace Settings 或 Inputs 面板 */
  const navigateToSettings = useCallback(
    (tab: "variables" | "secrets" | "inputs") => {
      if (tab === "inputs") {
        setRightPanel("inputs");
      } else {
        setSettingsTab(tab);
        setRightPanel("settings");
      }
    },
    [setRightPanel],
  );

  const handleTemplateSelect = useCallback(
    (template: WorkflowTemplate) => {
      setWfNodes(template.nodes);
      setWfEdges(template.edges);
      setInputs(template.inputs);
      toast.success(`已加载模板「${template.name}」`);
    },
    [setWfNodes, setWfEdges, setInputs],
  );

  const handleSaveAsTemplate = useCallback(() => {
    setSaveTemplateOpen(true);
  }, []);

  // ---- 保存为模板对话框 ----
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");

  const handleConfirmSaveTemplate = useCallback(() => {
    const name = templateName.trim();
    if (!name) return;
    const id = `user-${Date.now()}`;
    saveUserTemplate({
      id,
      name,
      description: templateDesc.trim(),
      category: "自定义",
      nodes: wfNodes,
      edges: wfEdges,
      inputs,
    });
    toast.success(`已保存为模板「${name}」`);
    setSaveTemplateOpen(false);
    setTemplateName("");
    setTemplateDesc("");
  }, [templateName, templateDesc, wfNodes, wfEdges, inputs]);

  // ---- 节点搜索定位 (Ctrl+F) ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [_searchHighlightId, setSearchHighlightId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return wfNodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [searchQuery, wfNodes]);

  const handleSearchSelect = useCallback(
    (nodeId: string) => {
      const node = wfNodes.find((n) => n.id === nodeId);
      if (!node) return;
      setSearchHighlightId(nodeId);
      setSelectedNodeId(nodeId);
      void fitView({
        nodes: [{ id: nodeId } as Node],
        padding: 1,
        maxZoom: 1.5,
        duration: 400,
      });
      setSearchOpen(false);
      setSearchQuery("");
      setTimeout(() => setSearchHighlightId(null), 2000);
    },
    [wfNodes, fitView, setSelectedNodeId],
  );

  // ---- 数据源：运行态用 snapshot，编辑态用 draft ----
  const displayNodes = useMemo(
    () => (viewMode === "running" && runningSnapshot ? runningSnapshot.nodes : wfNodes),
    [viewMode, runningSnapshot, wfNodes],
  );
  const displayEdges = useMemo(
    () => (viewMode === "running" && runningSnapshot ? runningSnapshot.edges : wfEdges),
    [viewMode, runningSnapshot, wfEdges],
  );

  // ---- 过滤折叠容器的子节点 ----
  const visibleWfNodes = useMemo(() => filterVisibleNodes(displayNodes), [displayNodes]);
  const visibleNodeIds = useMemo(() => new Set(visibleWfNodes.map((n) => n.id)), [visibleWfNodes]);
  const visibleWfEdges = useMemo(
    () => filterVisibleEdges(displayEdges, visibleNodeIds),
    [displayEdges, visibleNodeIds],
  );

  // ---- 引用检测（每个节点的 spec 中是否有缺失引用） ----
  const inputIds = useMemo(() => inputs.map((i) => i.id), [inputs]);
  const refCheckResult = useMemo(() => {
    const yaml = toKestraYaml(
      wfNodes,
      wfEdges,
      inputs,
      [],
      workflowMeta.flowId,
      workflowMeta.namespace,
    );
    return checkReferences(yaml, { secrets: [], variables: [], inputs: inputIds });
  }, [wfNodes, wfEdges, inputs, inputIds, workflowMeta.flowId, workflowMeta.namespace]);

  const nodesWithMissingRefs = useMemo(() => {
    if (refCheckResult.missing.length === 0) return new Set<string>();
    const missingNames = new Set(refCheckResult.missing.map((r) => r.name));
    const escapedNames = [...missingNames].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const namePattern = new RegExp(`"(${escapedNames.join("|")})"`, "g");
    const set = new Set<string>();
    for (const node of wfNodes) {
      const specStr = JSON.stringify(node.spec);
      if (namePattern.test(specStr)) {
        set.add(node.id);
      }
    }
    return set;
  }, [refCheckResult, wfNodes]);

  const missingRefs = refCheckResult.missing;

  // ---- zustand-travel (undo/redo) ----
  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // ---- 画布状态（从过滤后的业务状态派生） ----
  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] = useNodesState(
    toCanvasNodes(visibleWfNodes, nodesWithMissingRefs),
  );
  const [canvasEdges, setCanvasEdges, onCanvasEdgesChange] = useEdgesState(
    toCanvasEdges(visibleWfEdges),
  );

  const nodeBoundsMap = useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; width: number; height: number; type: string; collapsed: boolean }
    >();
    for (const node of canvasNodes) {
      const nodeData = node.data as Record<string, unknown>;
      const nodeType = typeof nodeData?.type === "string" ? nodeData.type : "";
      const collapsed = typeof nodeData?.collapsed === "boolean" ? nodeData.collapsed : false;
      map.set(node.id, {
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? 200,
        height: node.measured?.height ?? 40,
        type: nodeType,
        collapsed,
      });
    }
    return map;
  }, [canvasNodes]);

  // ---- 过滤后的业务状态变更 → 同步画布 ----
  useEffect(() => {
    setCanvasNodes(toCanvasNodes(visibleWfNodes, nodesWithMissingRefs, dragOverContainerId));
  }, [visibleWfNodes, nodesWithMissingRefs, dragOverContainerId, setCanvasNodes]);

  useEffect(() => {
    setCanvasEdges(toCanvasEdges(visibleWfEdges));
  }, [visibleWfEdges, setCanvasEdges]);

  // ---- 排序 ----
  // ---- 连线（自动推断边类型） ----
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const edgeType = inferEdgeType(params.sourceHandle);
      const newEdge: WorkflowEdge = {
        id: genEdgeId(),
        source: params.source,
        target: params.target,
        type: edgeType,
      };
      setWfEdges((prev) => [...prev, newEdge]);
    },
    [setWfEdges],
  );

  // ---- 节点选中 ----
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      setSelectedNodeId(node.id);
      setRightPanel("task");
    },
    [setSelectedNodeId, setRightPanel],
  );

  // ---- 移动端长按触发右键菜单 ----
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        const pos = screenToFlowPosition({ x: touch.clientX, y: touch.clientY });
        let hitNodeId: string | null = null;
        for (const [nodeId, bounds] of nodeBoundsMap) {
          if (
            pos.x >= bounds.x &&
            pos.x <= bounds.x + bounds.width &&
            pos.y >= bounds.y &&
            pos.y <= bounds.y + bounds.height
          ) {
            hitNodeId = nodeId;
            break;
          }
        }
        if (hitNodeId) {
          setContextMenu({ nodeId: hitNodeId, position: { x: touch.clientX, y: touch.clientY } });
        }
      }, 500);
    },
    [screenToFlowPosition, nodeBoundsMap],
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setRightPanel("none");
    setContextMenu(null);
  }, [setSelectedNodeId, setRightPanel]);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setWfNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, ui: node.position } : n)));
    },
    [setWfNodes],
  );

  // ---- 右键菜单 ----
  const [_contextMenu, setContextMenu] = useState<{
    nodeId: string;
    position: { x: number; y: number };
  } | null>(null);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({ nodeId: node.id, position: { x: e.clientX, y: e.clientY } });
  }, []);

  // ---- 拖拽创建节点 ----
  const { onDragOver, onDrop, onDragLeave } = useEditorDragDrop(
    nodeBoundsMap,
    setDragOverContainerId,
  );

  // ---- 任务配置更新：解析 YAML 回写 spec ----
  const handleTaskUpdate = useCallback(
    (nodeId: string, label: string, taskConfig: string) => {
      const { spec } = parseYamlToNodeFields(taskConfig);
      setWfNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, name: label, spec } : n)));
    },
    [setWfNodes],
  );

  // ---- 删除选中节点 ----
  const handleDeleteSelected = useCallback(() => {
    // 从 store 读实时状态，避免闭包过期（特别是 context menu 中先 setSelectedNodeId 再调用时）
    const state = useWorkflowStore.getState();
    const currentSelectedId = state.selectedNodeId;
    if (!currentSelectedId) return;
    const currentNodes = state.nodes;

    const deletedNode = currentNodes.find((n) => n.id === currentSelectedId);

    // Collect ALL descendant node IDs (BFS - handles nested containers)
    const selectedIds = new Set([currentSelectedId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of currentNodes) {
        if (n.containerId && selectedIds.has(n.containerId) && !selectedIds.has(n.id)) {
          selectedIds.add(n.id);
          changed = true;
        }
      }
    }

    setWfNodes((prev) =>
      prev
        .filter((n) => !selectedIds.has(n.id))
        .map((n) => {
          if (
            deletedNode &&
            n.containerId === deletedNode.containerId &&
            n.sortIndex > deletedNode.sortIndex
          ) {
            return { ...n, sortIndex: n.sortIndex - 1 };
          }
          return n;
        }),
    );
    setWfEdges((prev) =>
      prev.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)),
    );
    // 从 expandedContainers 中移除被删除的容器 ID
    const staleIds = state.expandedContainers.filter((id) => selectedIds.has(id));
    if (staleIds.length > 0) {
      useWorkflowStore.setState({
        expandedContainers: state.expandedContainers.filter((id) => !selectedIds.has(id)),
      });
    }
    setSelectedNodeId(null);
    setRightPanel("none");
  }, [setWfNodes, setWfEdges, setSelectedNodeId, setRightPanel]);

  // ---- 复制节点 ----
  const handleDuplicate = useCallback(() => {
    if (!selectedNodeId) return;
    const sourceNode = wfNodes.find((n) => n.id === selectedNodeId);
    if (!sourceNode) return;

    const maxSort = wfNodes
      .filter((n) => n.containerId === sourceNode.containerId)
      .reduce((max, n) => Math.max(max, n.sortIndex), -1);

    const newNodeId = genNodeId();
    const newNode: WorkflowNode = {
      ...structuredClone(sourceNode),
      id: newNodeId,
      name: sourceNode.name + " (副本)",
      sortIndex: maxSort + 1,
      ui: {
        x: (sourceNode.ui?.x ?? 0) + 50,
        y: (sourceNode.ui?.y ?? 0) + 100,
      },
    };

    // Clone all descendants if the source is a container (recursive)
    const idMap = new Map<string, string>(); // oldId → newId
    idMap.set(sourceNode.id, newNodeId);

    const clonedDescendants: typeof wfNodes = [];
    const queue = [sourceNode.id];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const newParentId = idMap.get(parentId)!;
      for (const child of wfNodes) {
        if (child.containerId === parentId) {
          const newChildId = genNodeId();
          idMap.set(child.id, newChildId);
          clonedDescendants.push({
            ...structuredClone(child),
            id: newChildId,
            containerId: newParentId,
          });
          queue.push(child.id);
        }
      }
    }

    setWfNodes((prev) => [...prev, newNode, ...clonedDescendants]);
  }, [selectedNodeId, wfNodes, setWfNodes]);

  // ---- 自动布局 ----
  const handleAutoLayout = useCallback(async () => {
    const currentCanvasNodes = toCanvasNodes(visibleWfNodes, nodesWithMissingRefs);
    const currentCanvasEdges = toCanvasEdges(visibleWfEdges);
    const { nodes: layoutedNodes } = await getLayoutedElements(
      currentCanvasNodes,
      currentCanvasEdges,
      "TB",
    );
    setWfNodes((prev) => syncPositions(prev, layoutedNodes));
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 50);
  }, [visibleWfNodes, visibleWfEdges, nodesWithMissingRefs, setWfNodes, fitView]);

  // ---- 保存/加载（tRPC useUtils） ----
  const utils = trpc.useUtils();

  const handleLoadFromApi = useCallback(async () => {
    const workflows = await utils.workflow.list.fetch();
    if (!workflows || workflows.length === 0) {
      toast.warning("API 上暂无已保存的工作流");
      return;
    }
    const latest = workflows[0];
    const full = await utils.workflow.get.fetch({ id: latest.id });
    if (!full) return;

    isLoadingRef.current = true;
    setSavedWorkflowId(full.id);
    setWorkflowMeta({
      flowId: full.flowId,
      name: full.name,
      namespace: workflowMeta.namespace,
      description: full.description ?? "",
      disabled: full.disabled ?? false,
    });

    if (full.nodes) setWfNodes((full.nodes as unknown as ApiWorkflowNode[]).map(fromApiNode));
    if (full.edges) setWfEdges((full.edges as unknown as ApiWorkflowEdge[]).map(fromApiEdge));
    if (full.inputs) setInputs((full.inputs as unknown as ApiWorkflowInput[]).map(fromApiInput));
    isLoadingRef.current = false;

    useWorkflowStore.getState().clearExpandedContainers();
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100);
  }, [
    workflowMeta.namespace,
    fitView,
    utils,
    setSavedWorkflowId,
    setWorkflowMeta,
    setWfNodes,
    setWfEdges,
    setInputs,
  ]);

  // ---- 加载状态：API 数据加载完成前显示 loading，避免 fixture 闪现 ----
  const [isLoaded, setIsLoaded] = useState(false);

  // ---- Auto-load workflow from URL param on mount ----
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  useEffect(() => {
    if (!workflowId || hasAutoLoaded) return;
    setHasAutoLoaded(true);
    const loadWorkflow = async () => {
      setIsLoaded(false);
      const full = await utils.workflow.get.fetch({ id: workflowId });
      if (!full) {
        setIsLoaded(true);
        return;
      }
      isLoadingRef.current = true;
      setSavedWorkflowId(full.id);
      setWorkflowMeta({
        flowId: full.flowId,
        name: full.name,
        namespace: workflowMeta.namespace,
        description: full.description ?? "",
        disabled: full.disabled ?? false,
      });
      if (full.nodes) setWfNodes((full.nodes as unknown as ApiWorkflowNode[]).map(fromApiNode));
      if (full.edges) setWfEdges((full.edges as unknown as ApiWorkflowEdge[]).map(fromApiEdge));
      if (full.inputs) setInputs((full.inputs as unknown as ApiWorkflowInput[]).map(fromApiInput));
      if (full.variables) setWfVariables(full.variables as unknown as ApiWorkflowVariable[]);
      isLoadingRef.current = false;
      setIsLoaded(true);
      useWorkflowStore.getState().clearExpandedContainers();
      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100);
    };
    void loadWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // ---- 选中节点数据 ----
  const selectedNode = wfNodes.find((n) => n.id === selectedNodeId);

  // ---- TaskConfigPanel 兼容数据 ----
  const selectedNodeForPanel = useMemo(() => {
    if (!selectedNode) return null;
    return {
      id: selectedNode.id,
      label: selectedNode.name,
      taskConfig: yamlFromSpec(selectedNode.type, selectedNode.name, selectedNode.spec),
    };
  }, [selectedNode]);

  // Input 兼容转换（给旧面板用，M3 重写面板后删除）
  const kestraInputs: KestraInput[] = useMemo(
    () =>
      inputs.map((i) => ({
        id: i.id,
        type: i.type,
        defaults:
          typeof i.defaults === "string"
            ? i.defaults
            : i.defaults != null
              ? JSON.stringify(i.defaults)
              : "",
        description: i.description,
        required: i.required,
      })),
    [inputs],
  );

  // ---- Draft / Release (tRPC) ----
  const [_showPublishDialog, setShowPublishDialog] = useState(false);

  const draftSave = trpc.workflowDraft.save.useMutation({
    onSuccess: (_data, variables) => {
      markSaved();
      if (variables.message !== "自动暂存") {
        toast.success("草稿已保存");
      }
      // Refresh draft list
      if (savedWorkflowId) {
        void utils.workflowDraft.list.invalidate({ workflowId: savedWorkflowId });
      }
    },
    onError: (err, variables) => {
      if (variables.message !== "自动暂存") {
        toast.error(`保存草稿失败: ${err.message}`);
      } else {
        toast.error("自动暂存失败");
      }
    },
  });

  // Save draft action — 缺失引用只 toast 提示，不阻塞
  const handleSaveDraft = useCallback(
    (message?: string) => {
      if (!savedWorkflowId) {
        toast.warning("请先保存工作流到 API");
        return;
      }
      if (missingRefs.length > 0) {
        toast.warning(`有 ${missingRefs.length} 个缺失引用，已保存但请注意修复`);
      }
      draftSave.mutate({
        workflowId: savedWorkflowId,
        message,
        nodes: wfNodes,
        edges: wfEdges,
        inputs,
        variables: wfVariables,
      });
    },
    [savedWorkflowId, draftSave, missingRefs, wfNodes, wfEdges, inputs, wfVariables],
  );

  // ---- 键盘快捷键 ----
  useEditorHotkeys({
    rightPanel,
    selectedNodeId,
    viewMode,
    canUndo,
    canRedo,
    undo,
    redo,
    onSaveDraft: handleSaveDraft,
    onDeleteSelected: handleDeleteSelected,
    onDuplicate: handleDuplicate,
    onAutoLayout: handleAutoLayout,
    searchInputRef,
    setSearchOpen,
    setSearchQuery,
    setContextMenu,
    setHelpOpen,
  });

  const draftRollback = trpc.workflowDraft.rollback.useMutation({
    onError: (err) => {
      toast.error(`回滚失败: ${err.message}`);
    },
  });

  const releasePublish = trpc.workflowRelease.publish.useMutation({
    onSuccess: (result) => {
      setPublishedVersion(result.version);
      toast.success(`版本 v${result.version} 已发布`);
      if (result.kestraStatus === "failed") {
        toast.warning("Kestra 同步失败，请稍后重试");
      }
      setShowPublishDialog(false);
      if (savedWorkflowId) {
        void utils.workflowRelease.list.invalidate({ workflowId: savedWorkflowId });
      }
    },
    onError: (err) => {
      toast.error(`发布失败: ${err.message}`);
    },
  });

  const releaseRollback = trpc.workflowRelease.rollback.useMutation({
    onError: (err) => {
      toast.error(`版本回滚失败: ${err.message}`);
    },
  });

  // Draft/Release list queries (enabled when savedWorkflowId exists)
  const draftsQuery = trpc.workflowDraft.list.useQuery(
    { workflowId: savedWorkflowId! },
    { enabled: !!savedWorkflowId },
  );
  const releasesQuery = trpc.workflowRelease.list.useQuery(
    { workflowId: savedWorkflowId! },
    { enabled: !!savedWorkflowId },
  );
  const { data: triggersData } = trpc.workflowTrigger.list.useQuery(
    { workflowId: savedWorkflowId! },
    { enabled: !!savedWorkflowId },
  );
  useEffect(() => {
    if (triggersData) {
      setTriggers(
        triggersData.items.map((t) => ({
          id: t.id,
          name: t.name,
          type: t.type as "schedule" | "webhook",
          config: t.config as Record<string, unknown>,
          kestraFlowId: t.kestraFlowId,
          disabled: t.disabled,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
        })),
      );
    }
  }, [triggersData, setTriggers]);

  // Sync query data (drafts/releases fetched via tRPC, displayed directly)

  // Draft rollback action
  const handleDraftRollback = useCallback(
    async (draftId: string) => {
      await draftRollback.mutateAsync({ draftId });
      toast.success("已恢复到所选草稿");
      await handleLoadFromApi();
    },
    [draftRollback, handleLoadFromApi],
  );

  // Release rollback action
  const handleReleaseRollback = useCallback(
    async (releaseId: string) => {
      await releaseRollback.mutateAsync({ releaseId });
      toast.success("已恢复到所选版本");
      await handleLoadFromApi();
    },
    [releaseRollback, handleLoadFromApi],
  );

  // Auto-save (30s) — 只在用户实际修改后触发
  const { hasUnsavedChanges, publishedVersion } = useWorkflowStore(
    useShallow((s) => ({
      hasUnsavedChanges: s.hasUnsavedChanges,
      publishedVersion: s.publishedVersion,
    })),
  );
  const markDirty = useWorkflowStore((s) => s.markDirty);
  const markSaved = useWorkflowStore((s) => s.markSaved);
  const setPublishedVersion = useWorkflowStore((s) => s.setPublishedVersion);

  // 首次加载标记：首次渲染不触发 markDirty；已脏时跳过冗余调用
  const isInitialMount = useRef(true);
  // API 数据加载期间跳过 markDirty，避免加载数据误触发脏标记
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isLoadingRef.current) return;
    // 避免在已经 dirty 时重复触发 set
    if (!hasUnsavedChanges) {
      markDirty();
    }
  }, [wfNodes, wfEdges, inputs, markDirty, hasUnsavedChanges]);

  // Auto-save timer (30s) — recursive setTimeout with ref to avoid stale closure
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const handleSaveDraftRef = useRef(handleSaveDraft);
  handleSaveDraftRef.current = handleSaveDraft;
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!savedWorkflowId) return;
    function tick() {
      if (hasUnsavedChangesRef.current && handleSaveDraftRef.current) {
        handleSaveDraftRef.current("自动暂存");
      }
      autoSaveTimerRef.current = setTimeout(tick, 30_000);
    }
    autoSaveTimerRef.current = setTimeout(tick, 30_000);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [savedWorkflowId]);

  // ─── M4: Execution ───
  const { isExecuting, currentExecution, kestraHealthy, kestraError } = useWorkflowStore(
    useShallow((s) => ({
      isExecuting: s.isExecuting,
      currentExecution: s.currentExecution,
      kestraHealthy: s.kestraHealthy,
      kestraError: s.kestraError,
    })),
  );
  const setIsExecuting = useWorkflowStore((s) => s.setIsExecuting);
  const setCurrentExecution = useWorkflowStore((s) => s.setCurrentExecution);
  const setKestraHealthy = useWorkflowStore((s) => s.setKestraHealthy);
  const [showInputForm, setShowInputForm] = useState(false);
  const [_showTriggerForm, setShowTriggerForm] = useState(false);

  // Kestra health check (on mount + every 5 min) — with abort on unmount
  const healthTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    let isMounted = true;
    const utilsRef = utils;
    const check = () => {
      utilsRef.workflowExecution.kestraHealth
        .fetch()
        .then((res: { healthy: boolean; error?: string }) => {
          if (isMounted) setKestraHealthy(res.healthy, res.error);
        })
        .catch((err: unknown) => {
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

  // Execution polling — recursive setTimeout with refs to avoid stale closure & request pileup
  const currentExecutionRef = useRef(currentExecution);
  currentExecutionRef.current = currentExecution;
  const utilsRef = useRef(utils);
  utilsRef.current = utils;
  const setCurrentExecutionRef = useRef(setCurrentExecution);
  setCurrentExecutionRef.current = setCurrentExecution;
  const setIsExecutingRef = useRef(setIsExecuting);
  setIsExecutingRef.current = setIsExecuting;
  const exitRunningModeRef = useRef(exitRunningMode);
  exitRunningModeRef.current = exitRunningMode;
  const pollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const exec = currentExecutionRef.current;
    if (!exec || isTerminalState(exec.state)) {
      if (isExecuting) setIsExecuting(false);
      return;
    }

    let isMounted = true;
    function tick() {
      const exec = currentExecutionRef.current;
      if (!exec || !isMounted) return;
      utilsRef.current.workflowExecution.get
        .fetch({
          executionId: exec.id,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((result: any) => {
          if (!isMounted || !result) return;
          setCurrentExecutionRef.current(toExecutionSummary(result));
          if (isTerminalState(result.state)) {
            setIsExecutingRef.current(false);
            exitRunningModeRef.current();
            if (result.state === "SUCCESS") {
              toast.success("执行完成");
            } else if (result.state === "FAILED") {
              toast.error("执行失败");
            } else if (result.state === "WARNING") {
              toast.warning("执行完成（有警告）");
            } else if (result.state === "KILLED") {
              toast.warning("执行已终止");
            } else if (result.state === "CANCELLED") {
              toast.info("执行已取消");
            }
            return; // stop polling
          }
          pollTimerRef.current = setTimeout(tick, 3000);
        })
        .catch(() => {
          if (isMounted) pollTimerRef.current = setTimeout(tick, 3000);
        });
    }
    pollTimerRef.current = setTimeout(tick, 3000);

    return () => {
      isMounted = false;
      clearTimeout(pollTimerRef.current);
    };
  }, [currentExecution?.id, currentExecution?.state, isExecuting]);

  const executeTest = trpc.workflowExecution.executeTest.useMutation({
    onSuccess: (result) => {
      setIsExecuting(true);
      setCurrentExecution(toExecutionSummary(result));
      // 进入运行态视图 — 使用执行时的节点快照
      const snapshot: RunningSnapshot = {
        nodes: (result.nodes ?? []) as unknown as RunningSnapshot["nodes"],
        edges: (result.edges ?? []) as unknown as RunningSnapshot["edges"],
        inputs: (result.inputs ?? []) as unknown as RunningSnapshot["inputs"],
      };
      enterRunningMode(snapshot, "draft");
      toast.success("测试执行已触发");
      setShowInputForm(false);
    },
    onError: (err) => toast.error(`执行失败: ${err.message}`),
  });

  const handleExecuteTest = useCallback(() => {
    if (!savedWorkflowId) {
      toast.warning("请先保存工作流");
      return;
    }
    if (!kestraHealthy) {
      toast.warning(kestraError ? `Kestra 未连接：${kestraError}` : "Kestra 未连接，请稍后再试");
      return;
    }
    if (inputs.length > 0) {
      setShowInputForm(true);
    } else {
      executeTest.mutate({ workflowId: savedWorkflowId });
    }
  }, [savedWorkflowId, kestraHealthy, kestraError, inputs, executeTest]);

  const handleExecuteWithInputs = useCallback(
    (inputValues: Record<string, string>) => {
      if (!savedWorkflowId) return;
      executeTest.mutate({ workflowId: savedWorkflowId, inputValues });
    },
    [savedWorkflowId, executeTest],
  );

  const productionReplay = trpc.workflowExecution.productionReplay.useMutation({
    onSuccess: () => {
      toast.success("Production Replay 已触发");
    },
    onError: (err) => toast.error(`Replay 失败: ${err.message}`),
  });

  const handleProductionReplay = useCallback(
    (executionId: string, taskRunId: string) => {
      productionReplay.mutate({ executionId, taskRunId });
    },
    [productionReplay],
  );

  // YAML import handler
  const handleYamlImport = useCallback(
    (data: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; inputs: WorkflowInput[] }) => {
      setWfNodes(data.nodes);
      setWfEdges(data.edges);
      setInputs(data.inputs);
      useWorkflowStore.getState().clearExpandedContainers();
      setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1 }), 100);
    },
    [setWfNodes, setWfEdges, setInputs, fitView],
  );

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">加载工作流...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background" tabIndex={0}>
      {/* 第一层：导航 + 核心操作 */}
      <div className="h-11 md:h-12 border-b border-border bg-card flex items-center justify-between px-2 md:px-4 shrink-0">
        <div className="flex items-center gap-1 md:gap-2">
          <Link
            to="/workflows"
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-xs text-muted-foreground hidden sm:inline">工作流</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">&gt;</span>
          <span
            className="text-sm font-semibold truncate max-w-[120px] md:max-w-[200px]"
            title={workflowMeta.name || workflowMeta.flowId}
          >
            {workflowMeta.name || workflowMeta.flowId}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground"
            title="编辑名称和描述"
            onClick={() => {
              setEditName(workflowMeta.name);
              setEditDescription(workflowMeta.description);
              setEditMetaOpen(true);
            }}
          >
            <Pencil className="w-3 h-3" />
          </Button>
          {workflowMeta.disabled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              title="工作流已禁用，点击启用"
              onClick={handleToggleDisabled}
            >
              <Power className="w-3 h-3 mr-1" />
              已禁用
            </Button>
          )}
          {!workflowMeta.disabled && savedWorkflowId && (
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-muted-foreground"
              title="禁用工作流"
              onClick={handleToggleDisabled}
            >
              <Power className="w-3 h-3" />
            </Button>
          )}
          {/* 状态标签 — 桌面端完整显示 */}
          {!isMobile &&
            (viewMode === "running" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700 border border-blue-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  运行中
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => exitRunningMode()}
                >
                  返回编辑
                </Button>
              </span>
            ) : publishedVersion > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-700 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                已发布 v{publishedVersion}
              </span>
            ) : hasUnsavedChanges ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-700 border border-yellow-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                草稿 · 未保存
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-700 border border-yellow-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                草稿
              </span>
            ))}
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {/* Kestra health indicator — 桌面端 */}
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] hidden md:flex transition-colors",
              kestraHealthy
                ? "text-muted-foreground"
                : "bg-red-50 text-red-600 border border-red-200 cursor-help dark:bg-red-950 dark:text-red-400 dark:border-red-800",
            )}
            title={kestraHealthy ? "Kestra 已连接" : kestraError || "Kestra 未连接"}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                kestraHealthy ? "bg-green-500" : "bg-red-400 animate-pulse",
              )}
            />
            <span>
              Kestra
              {!kestraHealthy && kestraError
                ? ` · ${kestraError.slice(0, 40)}${kestraError.length > 40 ? "…" : ""}`
                : ""}
            </span>
          </div>

          {/* === 移动端紧凑按钮 === */}
          {isMobile && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setNodeCreateDrawerOpen(true)}
                className="w-9 h-9 bg-primary/10 text-primary"
                title="添加节点"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
                className="w-9 h-9"
                title="搜索节点"
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteTest}
                disabled={!savedWorkflowId || isExecuting}
                className="h-8 text-xs bg-blue-500 text-white hover:bg-blue-600"
                title="运行测试"
              >
                <Play className="w-3.5 h-3.5" />
              </Button>
              {/* ⋯ 更多菜单 */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  className="w-9 h-9"
                  title="更多操作"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
                {moreMenuOpen && (
                  <>
                    {/* 点击外部关闭的遮罩 */}
                    <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-card border border-border rounded-lg shadow-lg py-1">
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          handleSaveDraft();
                          setMoreMenuOpen(false);
                        }}
                        disabled={!savedWorkflowId || draftSave.isPending}
                      >
                        <ScrollText className="w-4 h-4" />
                        保存草稿
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          setRightPanel("yaml");
                          setSelectedNodeId(null);
                          setMoreMenuOpen(false);
                        }}
                      >
                        <FileCode2 className="w-4 h-4" />
                        YAML
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          setRightPanel("releases");
                          setSelectedNodeId(null);
                          setMoreMenuOpen(false);
                        }}
                      >
                        <GitBranch className="w-4 h-4" />
                        版本
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          setRightPanel("executions");
                          setSelectedNodeId(null);
                          setMoreMenuOpen(false);
                        }}
                      >
                        <History className="w-4 h-4" />
                        执行历史
                      </button>
                      <div className="h-px bg-border my-1" />
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          setShowPublishDialog(true);
                          setMoreMenuOpen(false);
                        }}
                        disabled={!savedWorkflowId || releasePublish.isPending}
                      >
                        <Rocket className="w-4 h-4" />
                        发布
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => {
                          setRightPanel("settings");
                          setSelectedNodeId(null);
                          setMoreMenuOpen(false);
                        }}
                      >
                        <Settings2 className="w-4 h-4" />
                        设置
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* === 桌面端完整按钮 === */}
          {!isMobile && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
                className="w-7 h-7"
                title="搜索节点 (Ctrl+F)"
              >
                <Search className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSaveDraft()}
                disabled={!savedWorkflowId || draftSave.isPending}
                title={!savedWorkflowId ? "请先保存工作流" : "保存当前编辑状态为草稿快照"}
                className="h-8 text-xs"
              >
                <ScrollText className="w-3.5 h-3.5 mr-1" />
                保存草稿
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteTest}
                disabled={!savedWorkflowId || isExecuting}
                title={!savedWorkflowId ? "请先保存工作流" : "运行测试"}
                className="h-8 text-xs bg-blue-500 text-white hover:bg-blue-600"
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                运行
              </Button>
              <Button
                size="sm"
                onClick={() => setShowPublishDialog(true)}
                disabled={!savedWorkflowId || releasePublish.isPending}
                title={!savedWorkflowId ? "请先保存工作流" : "发布当前工作流为新版本"}
                className="h-8 text-xs bg-emerald-500 text-white hover:bg-emerald-600"
              >
                <Rocket className="w-3.5 h-3.5 mr-1" />
                发布
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 第二层：Tab 栏 — 移动端隐藏 */}
      {!isMobile && (
        <EditorTabBar
          activeTab={
            (
              {
                none: "canvas",
                task: "canvas",
                yaml: "yaml",
                inputs: "inputs",
                executions: "executions",
                releases: "versions",
                triggers: "triggers",
                settings: "settings",
                drafts: "canvas",
                "production-executions": "canvas",
              } satisfies Record<RightPanel, TabKey>
            )[rightPanel]
          }
          onTabChange={(tab) => {
            const panelMap: Record<TabKey, RightPanel> = {
              canvas: "none",
              yaml: "yaml",
              inputs: "inputs",
              executions: "executions",
              versions: "releases",
              triggers: "triggers",
              settings: "settings",
            };
            setRightPanel(panelMap[tab] ?? "none");
            setSelectedNodeId(null);
          }}
          onOpenInNewPage={(tab) => {
            const routeMap: Record<string, string> = {
              executions: `/workflows/${workflowId}/executions`,
              versions: `/workflows/${workflowId}/versions`,
              triggers: `/workflows/${workflowId}/triggers`,
            };
            const url = routeMap[tab];
            if (url) {
              window.open(url, "_blank");
            }
          }}
        />
      )}

      <Group orientation="horizontal" className="flex-1">
        {/* 左侧插件面板 — 桌面端，可拖拽调整宽度 */}
        {!isMobile && panelOpen && (
          <>
            <Panel defaultSize={20} minSize={15} maxSize={35}>
              <NodeCreatePanel isOpen={panelOpen} onToggle={() => setPanelOpen(!panelOpen)} />
            </Panel>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
          </>
        )}

        <Panel
          defaultSize={
            rightPanel === "none"
              ? panelOpen && !isMobile
                ? 80
                : 100
              : panelOpen && !isMobile
                ? 50
                : 70
          }
          minSize={30}
        >
          <div className="h-full relative">
            <div
              ref={reactFlowWrapper}
              className="w-full h-full"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchMove}
            >
              <ReactFlow
                nodes={canvasNodes}
                edges={canvasEdges}
                onNodesChange={viewMode === "running" ? undefined : onCanvasNodesChange}
                onEdgesChange={viewMode === "running" ? undefined : onCanvasEdgesChange}
                onConnect={viewMode === "running" ? undefined : onConnect}
                onNodeClick={onNodeClick}
                onNodeDragStop={viewMode === "running" ? undefined : onNodeDragStop}
                onNodeContextMenu={viewMode === "running" ? undefined : onNodeContextMenu}
                onPaneClick={onPaneClick}
                onDragOver={viewMode === "running" ? undefined : onDragOver}
                onDragLeave={viewMode === "running" ? undefined : onDragLeave}
                onDrop={viewMode === "running" ? undefined : onDrop}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={viewMode !== "running"}
                nodesConnectable={viewMode !== "running"}
                elementsSelectable={viewMode !== "running"}
                // 左键操控节点/框选，右键拖拽平移画布
                panOnDrag={viewMode !== "running" ? [1] : true}
                selectionOnDrag={viewMode !== "running"}
                onContextMenu={
                  viewMode !== "running" ? (e: React.MouseEvent) => e.preventDefault() : undefined
                }
                fitView
                fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
                minZoom={0.2}
                maxZoom={2}
                className="bg-muted/30"
                defaultEdgeOptions={{
                  type: "workflowEdge",
                  animated: true,
                }}
              >
                <FitViewOnMount />
                <Controls
                  className={`!bg-card !border !border-border !rounded-lg !shadow-sm !left-3 ${missingRefs.length > 0 ? "!bottom-24" : "!bottom-14"}`}
                  showZoom
                  showFitView
                  showInteractive={false}
                />
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1.2}
                  color="var(--border, #e2e8f0)"
                />
                <MiniMap
                  className="!bg-card !border !border-border !rounded-lg !shadow-sm hidden md:block"
                  nodeColor="var(--muted-foreground, #818cf8)"
                  maskColor="var(--background, rgba(0,0,0,0.15))"
                  pannable
                  zoomable
                />
                <ZoomIndicator hasStatusBar={missingRefs.length > 0} />
              </ReactFlow>
            </div>

            {/* 画布浮动工具栏 — 移动端隐藏（功能在更多菜单中） */}
            {!isMobile && (
              <CanvasToolbar
                onAutoLayout={handleAutoLayout}
                onFitView={() => fitView({ padding: 0.2, maxZoom: 1 })}
                onFromTemplate={() => setTemplateDialogOpen(true)}
                onSaveAsTemplate={handleSaveAsTemplate}
                readOnly={viewMode === "running"}
              />
            )}

            {/* 容器嵌套面包屑 */}
            <Breadcrumb />

            {/* Ctrl+F 搜索定位 */}
            {searchOpen && (
              <SearchOverlay
                searchQuery={searchQuery}
                onQueryChange={setSearchQuery}
                results={searchResults}
                onSelect={handleSearchSelect}
                onClose={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                inputRef={searchInputRef}
              />
            )}

            {/* 左侧插件面板关闭按钮 — 桌面端 */}
            {!isMobile && !panelOpen && (
              <button
                onClick={() => setPanelOpen(true)}
                className="absolute left-3 top-3 z-10 w-9 h-9 rounded-lg bg-card border border-border shadow-sm flex items-center justify-center text-sm hover:bg-muted transition-colors"
                title="插件面板"
              >
                <Package className="w-4 h-4" />
              </button>
            )}
          </div>
        </Panel>

        {rightPanel !== "none" && (
          <>
            <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            <Panel defaultSize={30} minSize={20} maxSize={50}>
              <div className="h-full border-l border-border bg-background overflow-auto">
                {rightPanel === "task" && selectedNodeForPanel && (
                  <TaskConfigPanel
                    nodeId={selectedNodeForPanel.id}
                    label={selectedNodeForPanel.label}
                    taskConfig={selectedNodeForPanel.taskConfig}
                    inputs={kestraInputs}
                    onUpdate={handleTaskUpdate}
                    onClose={() => setRightPanel("none")}
                  />
                )}
                {rightPanel === "inputs" && (
                  <InputConfigPanel
                    inputs={kestraInputs}
                    onUpdate={(ki) =>
                      setInputs(
                        ki.map((k) => ({
                          id: k.id,
                          type: k.type as WorkflowInput["type"],
                          defaults: k.defaults,
                          description: k.description,
                          required: k.required,
                        })),
                      )
                    }
                    onClose={() => setRightPanel("none")}
                  />
                )}
                {rightPanel === "yaml" && (
                  <Suspense
                    fallback={
                      <div className="h-full flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    }
                  >
                    <KestraYamlPanel
                      nodes={wfNodes}
                      edges={wfEdges}
                      inputs={inputs}
                      variables={wfVariables}
                      flowId={workflowMeta.flowId}
                      namespace={workflowMeta.namespace}
                      onImport={handleYamlImport}
                      onClose={() => setRightPanel("none")}
                    />
                  </Suspense>
                )}
                {rightPanel === "drafts" && (
                  <DraftHistory
                    drafts={(draftsQuery.data ?? []).map((d) => ({
                      id: d.id,
                      message: d.message,
                      createdAt:
                        d.createdAt instanceof Date
                          ? d.createdAt.toISOString()
                          : String(d.createdAt),
                    }))}
                    onRollback={handleDraftRollback}
                    onClose={() => setRightPanel("none")}
                  />
                )}
                {rightPanel === "releases" && (
                  <ReleaseHistory
                    releases={(releasesQuery.data?.items ?? []).map((r) => ({
                      id: r.id,
                      version: r.version,
                      name: r.name,
                      yaml: r.yaml,
                      publishedAt:
                        r.publishedAt instanceof Date
                          ? r.publishedAt.toISOString()
                          : String(r.publishedAt),
                    }))}
                    onRollback={handleReleaseRollback}
                    onClose={() => setRightPanel("none")}
                  />
                )}
                {rightPanel === "triggers" && savedWorkflowId && (
                  <TriggerPanel
                    workflowId={savedWorkflowId}
                    onCreate={() => setShowTriggerForm(true)}
                  />
                )}
                {rightPanel === "executions" && savedWorkflowId && (
                  <ExecutionHistory
                    workflowId={savedWorkflowId}
                    onSelect={(exec) => {
                      setCurrentExecution(exec);
                      setRightPanel("none");
                    }}
                    onClose={() => setRightPanel("none")}
                  />
                )}
                {rightPanel === "production-executions" && savedWorkflowId && (
                  <ProductionExecHistory
                    workflowId={savedWorkflowId}
                    onClose={() => setRightPanel("none")}
                    onReplay={handleProductionReplay}
                  />
                )}
              </div>
            </Panel>
          </>
        )}
      </Group>

      {showInputForm && (
        <InputValuesForm
          inputs={inputs}
          onSubmit={handleExecuteWithInputs}
          onCancel={() => setShowInputForm(false)}
        />
      )}

      {rightPanel === "settings" && (
        <NamespaceSettings
          namespaceId={workflowMeta.namespace}
          namespaceName={workflowMeta.namespace}
          onClose={() => setRightPanel("none")}
          defaultTab={settingsTab}
        />
      )}

      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelect={handleTemplateSelect}
      />

      <KeyboardShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {/* 编辑名称/描述 */}
      <Dialog open={editMetaOpen} onOpenChange={setEditMetaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑工作流信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">名称</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="工作流名称"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">描述</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="可选描述"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMetaOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSaveMeta}
              disabled={!editName.trim() || workflowUpdate.isPending}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 保存为模板 */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>保存为模板</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>模板名称</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="输入模板名称"
              />
            </div>
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Textarea
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                placeholder="可选描述"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmSaveTemplate} disabled={!templateName.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 底部状态条：缺失引用 */}
      <ReferenceStatusBar missingRefs={missingRefs} onNavigateToSettings={navigateToSettings} />
    </div>
  );
}
