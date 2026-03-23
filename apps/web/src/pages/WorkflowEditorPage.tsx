import { useCallback, useRef, useMemo, useEffect, memo, useState } from "react"
import { useParams, Link } from "@tanstack/react-router"
import type { TaskRun, ExecutionSummary, RunningSnapshot } from "@/stores/workflow"

function isTerminalState(state: string): boolean {
  return ["SUCCESS", "WARNING", "FAILED", "KILLED", "CANCELLED", "RETRIED"].includes(state)
}

/** 将 API 返回的执行记录转为 store 格式 */
function toExecutionSummary(result: {
  id: string; kestraExecId: string; state: string; taskRuns: unknown;
  triggeredBy: string; createdAt: Date | string; endedAt?: Date | string | null;
}): ExecutionSummary {
  // 规范化 taskRuns：数据库存的是完整 KestraTaskRun（state 是嵌套对象），
  // 前端期望扁平的 state: string
  const raw = (result.taskRuns ?? []) as Record<string, unknown>[]
  const taskRuns: TaskRun[] = raw.map((tr) => ({
    id: String(tr.id ?? ""),
    taskId: String(tr.taskId ?? ""),
    state: typeof tr.state === "string"
      ? tr.state
      : String((tr.state as Record<string, unknown>)?.current ?? "UNKNOWN"),
    startDate: tr.startDate ? String(tr.startDate) : undefined,
    endDate: tr.endDate ? String(tr.endDate) : undefined,
    attempts: typeof tr.attempts === "number" ? tr.attempts : undefined,
    outputs: tr.outputs as Record<string, unknown> | undefined,
  }))
  return {
    id: result.id,
    kestraExecId: result.kestraExecId,
    state: result.state,
    taskRuns,
    triggeredBy: result.triggeredBy,
    createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : String(result.createdAt),
    endedAt: (result as Record<string, unknown>).endedAt
      ? String((result as Record<string, unknown>).endedAt)
      : undefined,
  }
}
import { nameToSlug } from "@/lib/slug"
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
  MarkerType,
} from "@xyflow/react"
import type { Connection, Node, Edge } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { WorkflowNode as WorkflowNodeComponent } from "@/components/flow/WorkflowNode"
import { WorkflowEdge as WorkflowEdgeComponent } from "@/components/flow/WorkflowEdge"
import { NodeCreatePanel } from "@/components/flow/NodeCreatePanel"
import { MobileNodePanel } from "@/components/flow/MobileNodePanel"
import { TaskConfigPanel } from "@/components/flow/TaskConfigPanel"
import { TriggerPanel } from "@/components/flow/TriggerPanel"
import { TriggerCreateForm } from "@/components/flow/TriggerCreateForm"
import { InputConfigPanel } from "@/components/flow/InputConfigPanel"
import { KestraYamlPanel } from "@/components/flow/KestraYamlPanel"
import { DraftHistory } from "@/components/flow/DraftHistory"
import { ReleaseHistory } from "@/components/flow/ReleaseHistory"
import { PublishDialog } from "@/components/flow/PublishDialog"
import { ExecutionDrawer } from "@/components/flow/ExecutionDrawer"
import { fromKestraYaml, toKestraYaml } from "@/lib/yamlConverter"
import { checkReferences } from "@/lib/referenceChecker"
import { ExecutionHistory } from "@/components/flow/ExecutionHistory"
import { ProductionExecHistory } from "@/components/flow/ProductionExecHistory"
import { NamespaceSettings } from "@/components/flow/NamespaceSettings"
import { InputValuesForm } from "@/components/flow/InputValuesForm"
import { ContextMenu as NodeContextMenu } from "@/components/flow/ContextMenu"
import { Breadcrumb } from "@/components/flow/Breadcrumb"
import { TemplateDialog } from "@/components/flow/TemplateDialog"
import { EditorTabBar, type TabKey } from "@/components/flow/EditorTabBar"
import { CanvasToolbar } from "@/components/flow/CanvasToolbar"
import type { WorkflowTemplate } from "@/lib/templates"
import { saveUserTemplate } from "@/lib/templates"
import { getLayoutedElements } from "@/lib/autoLayout"
import { filterVisibleNodes, filterVisibleEdges, getChildCount, canExpandContainer } from "@/lib/containerUtils"
import { isContainer } from "@/types/container"
import {
  Rocket, Play,
  ScrollText,
  Search, X,
  Plus,
  AlertTriangle, ArrowLeft,
  MoreHorizontal, FileCode2, GitBranch, History, Settings2,
  ChevronRight,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"

import { toast } from "sonner"
import { useHotkeys } from "react-hotkeys-hook"
import { useIsMobile } from "@/hooks/use-mobile"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowInput,
  EdgeType,
} from "@/types/workflow"
import { EDGE_STYLES } from "@/types/workflow"
import type { KestraInput } from "@/types/kestra"
import type { ApiWorkflowNode, ApiWorkflowEdge, ApiWorkflowInput, ApiWorkflowVariable } from "@/types/api"
import { useShallow } from "zustand/react/shallow"
import {
  useWorkflowStore,
  useUndo,
  useRedo,
  useCanUndo,
  useCanRedo,
} from "@/stores/workflow"

// ---- 边类型推断 ----
function inferEdgeType(sourceHandle: string | null): EdgeType {
  if (sourceHandle === "then" || sourceHandle === "else") return sourceHandle
  if (sourceHandle?.startsWith("case-")) return "case"
  if (sourceHandle === "sequence") return "sequence"
  return "sequence"
}

// ---- React Flow 自定义类型注册（稳定引用，不随组件重渲染） ----
const nodeTypes = { workflowNode: WorkflowNodeComponent }
const edgeTypes = { workflowEdge: WorkflowEdgeComponent }

// ---- ID 生成：使用 crypto.randomUUID，无冲突风险 ----
const genNodeId = () => `node_${crypto.randomUUID().slice(0, 8)}`
const genEdgeId = () => `edge_${crypto.randomUUID().slice(0, 8)}`

// ========== 数据转换层 ==========

/** 业务节点 → React Flow 节点 */
function toCanvasNodes(wfNodes: WorkflowNode[], nodesWithMissingRefs?: Set<string>, dragOverId?: string | null): Node[] {
  return wfNodes.map((n) => ({
    id: n.id,
    type: "workflowNode" as const,
    position: n.ui ?? { x: 150, y: 50 },
    selected: n.selected ?? false,
    data: {
      label: n.name,
      type: n.type,
      spec: n.spec,
      containerId: n.containerId,
      sortIndex: n.sortIndex,
      isContainer: isContainer(n.type),
      collapsed: n.ui?.collapsed ?? false,
      childCount: getChildCount(n.id, wfNodes),
      hasMissingRefs: nodesWithMissingRefs?.has(n.id) ?? false,
      isDragOver: n.id === dragOverId,
    },
  }))
}

/** 业务边 → React Flow 边 */
function toCanvasEdges(wfEdges: WorkflowEdge[]): Edge[] {
  return wfEdges.map((e) => {
    const style = EDGE_STYLES[e.type]
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.type === "case" ? e.label : undefined,
      targetHandle: undefined,
      type: "workflowEdge" as const,
      data: { edgeType: e.type, label: e.label },
      animated: e.type === "sequence",
      style: {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
        width: 16,
        height: 16,
      },
    }
  })
}

/** React Flow 节点 → 业务节点（同步 position 到 ui），用 Map 优化到 O(n) */
function syncPositions(
  wfNodes: WorkflowNode[],
  canvasNodes: Node[],
): WorkflowNode[] {
  const posMap = new Map(canvasNodes.map((c) => [c.id, c.position]))
  return wfNodes.map((n) => {
    const pos = posMap.get(n.id)
    if (!pos) return n
    return { ...n, ui: { x: pos.x, y: pos.y } }
  })
}

// ========== YAML 工具函数（用 yaml 库） ==========

import * as YAML from "yaml"

/** 从 YAML 字符串解析出 id, type, spec */
function parseYamlToNodeFields(yamlStr: string): {
  id: string
  type: string
  spec: Record<string, unknown>
} {
  const parsed = YAML.parse(yamlStr) as Record<string, unknown> | null
  if (!parsed || typeof parsed !== "object") {
    return { id: "", type: "", spec: {} }
  }
  const { id, type, ...spec } = parsed
  return {
    id: String(id ?? ""),
    type: String(type ?? ""),
    spec: spec as Record<string, unknown>,
  }
}

/** WorkflowNode spec → YAML 字符串 */
function yamlFromSpec(
  type: string,
  name: string,
  spec: Record<string, unknown>,
): string {
  return YAML.stringify({ id: nameToSlug(name), type, ...spec }, { lineWidth: 0 })
}

// ========== 类型转换层（API → 前端） ==========

function fromApiNode(n: ApiWorkflowNode): WorkflowNode {
  return {
    id: n.id,
    type: n.type,
    name: n.name,
    description: n.description,
    containerId: n.containerId,
    sortIndex: n.sortIndex,
    spec: n.spec ?? {},
    ui: n.ui,
  }
}

function fromApiEdge(e: ApiWorkflowEdge): WorkflowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    label: e.label,
  }
}

function fromApiInput(i: ApiWorkflowInput): WorkflowInput {
  return {
    id: i.id,
    type: i.type,
    displayName: i.displayName,
    description: i.description,
    required: i.required,
    defaults: i.defaults,
    values: i.values,
  }
}

// ========== FitView 工具（首次加载自适应） ==========

const FitViewOnMount = memo(function FitViewOnMount() {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 200)
    const handleResize = () => fitView({ padding: 0.2, maxZoom: 1, duration: 200 })
    window.addEventListener("resize", handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", handleResize)
    }
  }, [fitView])
  return null
})

// ========== 主组件 ==========

export default function WorkflowEditorPage() {
  const { workflowId } = useParams({ from: "/workflows/$workflowId/edit" })
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { fitView, screenToFlowPosition, getNodes } = useReactFlow()

  // ---- Mobile ----
  const isMobile = useIsMobile()
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const longPressTriggeredRef = useRef(false)

  // ---- Zustand store — 合并选择器减少 re-render ----
  const {
    nodes: wfNodes,
    edges: wfEdges,
    inputs,
    rightPanel,
    selectedNodeId,
    panelOpen,
    workflowMeta,
    savedWorkflowId,
    viewMode,
    runningSnapshot,
  } = useWorkflowStore(useShallow((s) => ({
    nodes: s.nodes,
    edges: s.edges,
    inputs: s.inputs,
    rightPanel: s.rightPanel,
    selectedNodeId: s.selectedNodeId,
    panelOpen: s.panelOpen,
    workflowMeta: s.workflowMeta,
    savedWorkflowId: s.savedWorkflowId,
    viewMode: s.viewMode,
    runningSnapshot: s.runningSnapshot,
  })))

  // Actions (stable references, safe as individual selectors)
  const setWfNodes = useWorkflowStore((s) => s.setNodes)
  const setWfEdges = useWorkflowStore((s) => s.setEdges)
  const setInputs = useWorkflowStore((s) => s.setInputs)
  const setRightPanel = useWorkflowStore((s) => s.setRightPanel)
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId)
  const setPanelOpen = useWorkflowStore((s) => s.setPanelOpen)
  const setWorkflowMeta = useWorkflowStore((s) => s.setWorkflowMeta)
  const setSavedWorkflowId = useWorkflowStore((s) => s.setSavedWorkflowId)
  const setTriggers = useWorkflowStore((s) => s.setTriggers)
  const enterRunningMode = useWorkflowStore((s) => s.enterRunningMode)
  const exitRunningMode = useWorkflowStore((s) => s.exitRunningMode)

  // ---- 模板功能 ----
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [nodeCreateDrawerOpen, setNodeCreateDrawerOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  // ---- 工作流 Variables（从 API 加载，给 PublishDialog 用） ----
  const [wfVariables, setWfVariables] = useState<ApiWorkflowVariable[]>([])

  // ---- 引用检测 ----
  const [missingRefsExpanded, setMissingRefsExpanded] = useState(false)
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null)
  const [settingsTab, setSettingsTab] = useState<"variables" | "secrets">("variables")

  /** 跳转到 Namespace Settings 的指定 tab */
  const navigateToSettings = useCallback((tab: "variables" | "secrets") => {
    setSettingsTab(tab)
    setRightPanel("settings")
  }, [setRightPanel])

  const handleTemplateSelect = useCallback(
    (template: WorkflowTemplate) => {
      setWfNodes(template.nodes)
      setWfEdges(template.edges)
      setInputs(template.inputs)
      toast.success(`已加载模板「${template.name}」`)
    },
    [setWfNodes, setWfEdges, setInputs],
  )

  const handleSaveAsTemplate = useCallback(() => {
    const name = prompt("模板名称：")
    if (!name) return
    const description = prompt("模板描述：") ?? ""
    const id = `user-${Date.now()}`
    saveUserTemplate({
      id,
      name,
      description,
      category: "自定义",
      nodes: wfNodes,
      edges: wfEdges,
      inputs,
    })
    toast.success(`已保存为模板「${name}」`)
  }, [wfNodes, wfEdges, inputs])

  // ---- 节点搜索定位 (Ctrl+F) ----
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [_searchHighlightId, setSearchHighlightId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return wfNodes.filter((n) => n.name.toLowerCase().includes(q))
  }, [searchQuery, wfNodes])

  const handleSearchSelect = useCallback(
    (nodeId: string) => {
      const node = wfNodes.find((n) => n.id === nodeId)
      if (!node) return
      setSearchHighlightId(nodeId)
      setSelectedNodeId(nodeId)
      // Pan to the node position
      const pos = node.ui ?? { x: 150, y: 50 }
      fitView({ nodes: [{ id: nodeId, position: pos, data: {} } as Node], padding: 1, maxZoom: 1.5, duration: 400 })
      // The fitView with nodes option centers on the specific node
      setSearchOpen(false)
      setSearchQuery("")
      setTimeout(() => setSearchHighlightId(null), 2000)
    },
    [wfNodes, fitView, setSelectedNodeId],
  )

  // ---- 数据源：运行态用 snapshot，编辑态用 draft ----
  const displayNodes = useMemo(
    () => (viewMode === "running" && runningSnapshot ? runningSnapshot.nodes : wfNodes),
    [viewMode, runningSnapshot, wfNodes],
  )
  const displayEdges = useMemo(
    () => (viewMode === "running" && runningSnapshot ? runningSnapshot.edges : wfEdges),
    [viewMode, runningSnapshot, wfEdges],
  )

  // ---- 过滤折叠容器的子节点 ----
  const visibleWfNodes = useMemo(() => filterVisibleNodes(displayNodes), [displayNodes])
  const visibleNodeIds = useMemo(
    () => new Set(visibleWfNodes.map((n) => n.id)),
    [visibleWfNodes],
  )
  const visibleWfEdges = useMemo(
    () => filterVisibleEdges(displayEdges, visibleNodeIds),
    [displayEdges, visibleNodeIds],
  )

  // ---- 引用检测（每个节点的 spec 中是否有缺失引用） ----
  const inputIds = useMemo(() => inputs.map((i) => i.id), [inputs])
  const refCheckResult = useMemo(() => {
    const yaml = toKestraYaml(wfNodes, wfEdges, inputs, [], workflowMeta.flowId, workflowMeta.namespace)
    return checkReferences(yaml, { secrets: [], variables: [], inputs: inputIds })
  }, [wfNodes, wfEdges, inputs, inputIds, workflowMeta.flowId, workflowMeta.namespace])

  const nodesWithMissingRefs = useMemo(() => {
    if (refCheckResult.missing.length === 0) return new Set<string>()
    const missingNames = new Set(refCheckResult.missing.map((r) => r.name))
    const escapedNames = [...missingNames].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const namePattern = new RegExp(`"(${escapedNames.join("|")})"`, "g")
    const set = new Set<string>()
    for (const node of wfNodes) {
      const specStr = JSON.stringify(node.spec)
      if (namePattern.test(specStr)) {
        set.add(node.id)
      }
    }
    return set
  }, [refCheckResult, wfNodes])

  const missingRefs = refCheckResult.missing

  // ---- zundo temporal (undo/redo) ----
  const undo = useUndo()
  const redo = useRedo()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()

  // ---- 画布状态（从过滤后的业务状态派生） ----
  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] = useNodesState(
    toCanvasNodes(visibleWfNodes, nodesWithMissingRefs),
  )
  const [canvasEdges, setCanvasEdges, onCanvasEdgesChange] = useEdgesState(
    toCanvasEdges(visibleWfEdges),
  )

  // ---- 过滤后的业务状态变更 → 同步画布 ----
  useEffect(() => {
    setCanvasNodes(toCanvasNodes(visibleWfNodes, nodesWithMissingRefs, dragOverContainerId))
  }, [visibleWfNodes, nodesWithMissingRefs, dragOverContainerId, setCanvasNodes])

  useEffect(() => {
    setCanvasEdges(toCanvasEdges(visibleWfEdges))
  }, [visibleWfEdges, setCanvasEdges])

  // ---- 排序 ----
  // ---- 连线（自动推断边类型） ----
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      const edgeType = inferEdgeType(params.sourceHandle)
      const newEdge: WorkflowEdge = {
        id: genEdgeId(),
        source: params.source,
        target: params.target,
        type: edgeType,
      }
      setWfEdges((prev) => [...prev, newEdge])
    },
    [setWfEdges],
  )

  // ---- 节点选中 ----
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    setSelectedNodeId(node.id)
    setRightPanel("task")
  }, [setSelectedNodeId, setRightPanel])

  // ---- 移动端长按触发右键菜单 ----
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    longPressTriggeredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      const pos = screenToFlowPosition({ x: touch.clientX, y: touch.clientY })
      const nodes = getNodes()
      let hitNodeId: string | null = null
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        const nw = n.measured?.width ?? 200
        const nh = n.measured?.height ?? 40
        if (pos.x >= n.position.x && pos.x <= n.position.x + nw &&
            pos.y >= n.position.y && pos.y <= n.position.y + nh) {
          hitNodeId = n.id
          break
        }
      }
      if (hitNodeId) {
        setContextMenu({ nodeId: hitNodeId, position: { x: touch.clientX, y: touch.clientY } })
      }
    }, 500)
  }, [screenToFlowPosition, getNodes])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setRightPanel("none")
    setContextMenu(null)
  }, [setSelectedNodeId, setRightPanel])

  // ---- 右键菜单 ----
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string
    position: { x: number; y: number }
  } | null>(null)

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault()
      setContextMenu({ nodeId: node.id, position: { x: e.clientX, y: e.clientY } })
    },
    [],
  )

  // ---- 拖拽创建节点 ----
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"

    // 检测悬浮在哪个展开的容器上方
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    let found: string | null = null
    for (const n of wfNodes) {
      if (!isContainer(n.type) || n.ui?.collapsed) continue
      const w = 220, h = 80
      const nx = n.ui?.x ?? 150, ny = n.ui?.y ?? 50
      if (position.x >= nx && position.x <= nx + w && position.y >= ny && position.y <= ny + h) {
        found = n.id
      }
    }
    setDragOverContainerId(found)
  }, [screenToFlowPosition, wfNodes])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const rawData = event.dataTransfer.getData("application/reactflow")
      if (!rawData) return

      let type: string, name: string, defaultSpec: Record<string, unknown> | undefined
      try {
        const parsed = JSON.parse(rawData)
        type = parsed.type
        name = parsed.name
        defaultSpec = parsed.defaultSpec
      } catch {
        toast.error("拖拽数据异常，请重试")
        return
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      // 从 store 读实时状态，避免闭包过期
      const currentNodes = useWorkflowStore.getState().nodes

      // 判断 drop 位置是否在某个展开的容器节点内
      let targetContainerId: string | null = null
      for (const n of currentNodes) {
        if (!isContainer(n.type) || n.ui?.collapsed) continue
        const w = 220 // min-w-[220px] from WorkflowNode container style
        const h = 80  // approximate container height
        const nx = n.ui?.x ?? 150
        const ny = n.ui?.y ?? 50
        if (
          position.x >= nx && position.x <= nx + w &&
          position.y >= ny && position.y <= ny + h
        ) {
          targetContainerId = n.id
        }
      }

      const siblings = currentNodes.filter((n) => n.containerId === targetContainerId)
      const maxSort = siblings.reduce((max, n) => Math.max(max, n.sortIndex), -1)

      const newNode: WorkflowNode = {
        id: genNodeId(),
        type,
        name,
        containerId: targetContainerId,
        sortIndex: maxSort + 1,
        spec: defaultSpec ?? {},
        ui: { x: position.x, y: position.y },
      }

      setWfNodes((prev) => [...prev, newNode])
      setDragOverContainerId(null)
    },
    [screenToFlowPosition, setWfNodes],
  )

  const onDragLeave = useCallback(() => {
    setDragOverContainerId(null)
  }, [])

  // ---- 任务配置更新：解析 YAML 回写 spec ----
  const handleTaskUpdate = useCallback(
    (nodeId: string, label: string, taskConfig: string) => {
      const { spec } = parseYamlToNodeFields(taskConfig)
      setWfNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, name: label, spec } : n,
        ),
      )
    },
    [setWfNodes],
  )

  // ---- 删除选中节点 ----
  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId) return
    const deletedNode = wfNodes.find((n) => n.id === selectedNodeId)

    // Collect ALL descendant node IDs (BFS - handles nested containers)
    const selectedIds = new Set([selectedNodeId])
    let changed = true
    while (changed) {
      changed = false
      for (const n of wfNodes) {
        if (n.containerId && selectedIds.has(n.containerId) && !selectedIds.has(n.id)) {
          selectedIds.add(n.id)
          changed = true
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
            return { ...n, sortIndex: n.sortIndex - 1 }
          }
          return n
        }),
    )
    setWfEdges((prev) =>
      prev.filter(
        (e) => !selectedIds.has(e.source) && !selectedIds.has(e.target),
      ),
    )
    // 从 expandedContainers 中移除被删除的容器 ID
    const state = useWorkflowStore.getState()
    const staleIds = state.expandedContainers.filter((id) => selectedIds.has(id))
    if (staleIds.length > 0) {
      useWorkflowStore.setState({
        expandedContainers: state.expandedContainers.filter((id) => !selectedIds.has(id)),
      })
    }
    setSelectedNodeId(null)
    setRightPanel("none")
  }, [selectedNodeId, wfNodes, setWfNodes, setWfEdges, setSelectedNodeId, setRightPanel])

  // ---- 复制节点 ----
  const handleDuplicate = useCallback(() => {
    if (!selectedNodeId) return
    const sourceNode = wfNodes.find((n) => n.id === selectedNodeId)
    if (!sourceNode) return

    const maxSort = wfNodes
      .filter((n) => n.containerId === sourceNode.containerId)
      .reduce((max, n) => Math.max(max, n.sortIndex), -1)

    const newNodeId = genNodeId()
    const newNode: WorkflowNode = {
      ...structuredClone(sourceNode),
      id: newNodeId,
      name: sourceNode.name + " (副本)",
      sortIndex: maxSort + 1,
      ui: {
        x: (sourceNode.ui?.x ?? 0) + 50,
        y: (sourceNode.ui?.y ?? 0) + 100,
      },
    }

    // Clone all descendants if the source is a container (recursive)
    const idMap = new Map<string, string>() // oldId → newId
    idMap.set(sourceNode.id, newNodeId)

    const clonedDescendants: typeof wfNodes = []
    const queue = [sourceNode.id]
    while (queue.length > 0) {
      const parentId = queue.shift()!
      const newParentId = idMap.get(parentId)!
      for (const child of wfNodes) {
        if (child.containerId === parentId) {
          const newChildId = genNodeId()
          idMap.set(child.id, newChildId)
          clonedDescendants.push({
            ...structuredClone(child),
            id: newChildId,
            containerId: newParentId,
          })
          queue.push(child.id)
        }
      }
    }

    setWfNodes((prev) => [...prev, newNode, ...clonedDescendants])
  }, [selectedNodeId, wfNodes, setWfNodes])

  // ---- 自动布局 ----
  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes } = getLayoutedElements(
      canvasNodes,
      canvasEdges,
      "TB",
    )
    setWfNodes((prev) => syncPositions(prev, layoutedNodes))
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 50)
  }, [canvasNodes, canvasEdges, setWfNodes, fitView])

  // ---- 键盘快捷键 ----
  // 编辑器面板打开时禁用会与 Monaco 冲突的快捷键
  const isEditorPanelOpen = rightPanel === "task" || rightPanel === "inputs" || rightPanel === "yaml"
  useHotkeys("mod+z", () => undo(), { enabled: canUndo && !isEditorPanelOpen })
  useHotkeys("mod+shift+z", () => redo(), { enabled: canRedo && !isEditorPanelOpen })
  useHotkeys("delete, backspace", () => handleDeleteSelected(), {
    enabled: !!selectedNodeId && !isEditorPanelOpen,
  })
  useHotkeys("mod+s", (e) => {
    e.preventDefault()
    handleSaveDraft()
  }, { enabled: !isEditorPanelOpen })
  useHotkeys("mod+a", (e) => {
    e.preventDefault()
    // Select all visible nodes — mark all as selected in React Flow
    if (visibleWfNodes.length > 0) {
      setWfNodes((prev) =>
        prev.map((n) => ({
          ...n,
          selected: visibleWfNodes.some((v) => v.id === n.id),
        }))
      )
    }
  }, { enabled: !isEditorPanelOpen })
  useHotkeys("mod+d", (e) => {
    e.preventDefault()
    if (selectedNodeId) handleDuplicate()
  }, { enabled: !isEditorPanelOpen })
  useHotkeys("escape", () => {
    setWfNodes((prev) => prev.map((n) => ({ ...n, selected: false })))
    setSelectedNodeId(null)
    setRightPanel("none")
    setContextMenu(null)
    setSearchOpen(false)
    setSearchQuery("")
  })
  useHotkeys("mod+f", (e) => {
    e.preventDefault()
    setSearchOpen(true)
    setSearchQuery("")
    setTimeout(() => searchInputRef.current?.focus(), 50)
  })

  // ---- 保存/加载（tRPC useUtils） ----
  const utils = trpc.useUtils()

  const handleLoadFromApi = useCallback(async () => {
    const workflows = await utils.workflow.list.fetch()
    if (!workflows || workflows.length === 0) {
      toast.warning("API 上暂无已保存的工作流")
      return
    }
    const latest = workflows[0]
    const full = await utils.workflow.get.fetch({ id: latest.id })
    if (!full) return

    isLoadingRef.current = true
    setSavedWorkflowId(full.id)
    setWorkflowMeta({
      flowId: full.flowId,
      name: full.name,
      namespace: workflowMeta.namespace,
      description: full.description ?? "",
    })

    if (full.nodes) setWfNodes((full.nodes as unknown as ApiWorkflowNode[]).map(fromApiNode))
    if (full.edges) setWfEdges((full.edges as unknown as ApiWorkflowEdge[]).map(fromApiEdge))
    if (full.inputs) setInputs((full.inputs as unknown as ApiWorkflowInput[]).map(fromApiInput))
    isLoadingRef.current = false

    useWorkflowStore.getState().clearExpandedContainers()
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100)
  }, [workflowMeta.namespace, fitView, utils, setSavedWorkflowId, setWorkflowMeta, setWfNodes, setWfEdges, setInputs])

  // ---- 加载状态：API 数据加载完成前显示 loading，避免 fixture 闪现 ----
  const [isLoaded, setIsLoaded] = useState(false)

  // ---- Auto-load workflow from URL param on mount ----
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false)
  useEffect(() => {
    if (!workflowId || hasAutoLoaded) return
    setHasAutoLoaded(true)
    const loadWorkflow = async () => {
      setIsLoaded(false)
      const full = await utils.workflow.get.fetch({ id: workflowId })
      if (!full) { setIsLoaded(true); return }
      isLoadingRef.current = true
      setSavedWorkflowId(full.id)
      setWorkflowMeta({
        flowId: full.flowId,
        name: full.name,
        namespace: workflowMeta.namespace,
        description: full.description ?? "",
      })
      if (full.nodes) setWfNodes((full.nodes as unknown as ApiWorkflowNode[]).map(fromApiNode))
      if (full.edges) setWfEdges((full.edges as unknown as ApiWorkflowEdge[]).map(fromApiEdge))
      if (full.inputs) setInputs((full.inputs as unknown as ApiWorkflowInput[]).map(fromApiInput))
      if (full.variables) setWfVariables(full.variables as unknown as ApiWorkflowVariable[])
      isLoadingRef.current = false
      setIsLoaded(true)
      useWorkflowStore.getState().clearExpandedContainers()
      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100)
    }
    loadWorkflow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId])

  // ---- 选中节点数据 ----
  const selectedNode = wfNodes.find((n) => n.id === selectedNodeId)

  // ---- TaskConfigPanel 兼容数据 ----
  const selectedNodeForPanel = useMemo(() => {
    if (!selectedNode) return null
    return {
      id: selectedNode.id,
      label: selectedNode.name,
      taskConfig: yamlFromSpec(
        selectedNode.type,
        selectedNode.name,
        selectedNode.spec,
      ),
    }
  }, [selectedNode])

  // Input 兼容转换（给旧面板用，M3 重写面板后删除）
  const kestraInputs: KestraInput[] = useMemo(
    () =>
      inputs.map((i) => ({
        id: i.id,
        type: i.type,
        defaults: String(i.defaults ?? ""),
        description: i.description,
        required: i.required,
      })),
    [inputs],
  )

  // ---- Draft / Release (tRPC) ----
  const [showPublishDialog, setShowPublishDialog] = useState(false)

  const draftSave = trpc.workflow.draftSave.useMutation({
    onSuccess: (_data, variables) => {
      markSaved()
      if (variables.message !== "自动暂存") {
        toast.success("草稿已保存")
      }
      // Refresh draft list
      if (savedWorkflowId) {
        utils.workflow.draftList.invalidate({ workflowId: savedWorkflowId })
      }
    },
    onError: (err, variables) => {
      if (variables.message !== "自动暂存") {
        toast.error(`保存草稿失败: ${err.message}`)
      } else {
        toast.error("自动暂存失败")
      }
    },
  })

  const draftRollback = trpc.workflow.draftRollback.useMutation({
    onError: (err) => {
      toast.error(`回滚失败: ${err.message}`)
    },
  })

  const releasePublish = trpc.workflow.releasePublish.useMutation({
    onSuccess: (result) => {
      setPublishedVersion(result.version)
      toast.success(`版本 v${result.version} 已发布`)
      if (result.kestraStatus === "failed") {
        toast.warning("Kestra 同步失败，请稍后重试")
      }
      setShowPublishDialog(false)
      if (savedWorkflowId) {
        utils.workflow.releaseList.invalidate({ workflowId: savedWorkflowId })
      }
    },
    onError: (err) => {
      toast.error(`发布失败: ${err.message}`)
    },
  })

  const releaseRollback = trpc.workflow.releaseRollback.useMutation({
    onError: (err) => {
      toast.error(`版本回滚失败: ${err.message}`)
    },
  })

  // Draft/Release list queries (enabled when savedWorkflowId exists)
  const draftsQuery = trpc.workflow.draftList.useQuery(
    { workflowId: savedWorkflowId! },
    { enabled: !!savedWorkflowId },
  )
  const releasesQuery = trpc.workflow.releaseList.useQuery(
    { workflowId: savedWorkflowId! },
    { enabled: !!savedWorkflowId },
  )
  const { data: triggersData } = trpc.workflow.triggerList.useQuery(
    { workflowId: savedWorkflowId! },
    { enabled: !!savedWorkflowId },
  )
  useEffect(() => {
    if (triggersData) {
      setTriggers(triggersData.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type as "schedule" | "webhook",
        config: t.config as Record<string, unknown>,
        kestraFlowId: t.kestraFlowId,
        disabled: t.disabled,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      })))
    }
  }, [triggersData, setTriggers])

  // Sync query data (drafts/releases fetched via tRPC, displayed directly)

  // Save draft action — 缺失引用只 toast 提示，不阻塞
  const handleSaveDraft = useCallback(
    (message?: string) => {
      if (!savedWorkflowId) {
        toast.warning("请先保存工作流到 API")
        return
      }
      if (missingRefs.length > 0) {
        toast.warning(`有 ${missingRefs.length} 个缺失引用，已保存但请注意修复`)
      }
      draftSave.mutate({
        workflowId: savedWorkflowId,
        message,
        nodes: wfNodes,
        edges: wfEdges,
        inputs,
        variables: wfVariables,
      })
    },
    [savedWorkflowId, draftSave, missingRefs, wfNodes, wfEdges, inputs, wfVariables],
  )

  // Publish action — 缺失引用时阻止发布
  const handlePublish = useCallback(
    (name: string, yaml: string) => {
      if (!savedWorkflowId) {
        toast.warning("请先保存工作流到 API")
        return
      }
      if (missingRefs.length > 0) {
        toast.error(`有 ${missingRefs.length} 个缺失引用，请先修复后再发布`)
        setMissingRefsExpanded(true)
        return
      }
      releasePublish.mutate({ workflowId: savedWorkflowId, name, yaml })
    },
    [savedWorkflowId, releasePublish, missingRefs],
  )

  // Draft rollback action
  const handleDraftRollback = useCallback(
    async (draftId: string) => {
      await draftRollback.mutateAsync({ draftId })
      toast.success("已恢复到所选草稿")
      await handleLoadFromApi()
    },
    [draftRollback, handleLoadFromApi],
  )

  // Release rollback action
  const handleReleaseRollback = useCallback(
    async (releaseId: string) => {
      await releaseRollback.mutateAsync({ releaseId })
      toast.success("已恢复到所选版本")
      await handleLoadFromApi()
    },
    [releaseRollback, handleLoadFromApi],
  )

  // Auto-save (30s) — 只在用户实际修改后触发
  const {
    hasUnsavedChanges,
    releases,
    publishedVersion,
  } = useWorkflowStore(useShallow((s) => ({
    hasUnsavedChanges: s.hasUnsavedChanges,
    releases: s.releases,
    publishedVersion: s.publishedVersion,
  })))
  const markDirty = useWorkflowStore((s) => s.markDirty)
  const markSaved = useWorkflowStore((s) => s.markSaved)
  const setPublishedVersion = useWorkflowStore((s) => s.setPublishedVersion)

  // 最新发布版本的 nodes（用于发布前 diff）
  const prevReleaseNodes = useMemo(() => {
    const latest = releasesQuery.data?.[0]
    if (!latest?.yaml) return undefined
    try {
      return fromKestraYaml(latest.yaml).nodes
    } catch {
      return undefined
    }
  }, [releasesQuery.data])

  // 首次加载标记：首次渲染不触发 markDirty；已脏时跳过冗余调用
  const isInitialMount = useRef(true)
  // API 数据加载期间跳过 markDirty，避免加载数据误触发脏标记
  const isLoadingRef = useRef(false)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (isLoadingRef.current) return
    // 避免在已经 dirty 时重复触发 set
    if (!hasUnsavedChanges) {
      markDirty()
    }
  }, [wfNodes, wfEdges, inputs, markDirty, hasUnsavedChanges])

  // Auto-save timer (30s) — recursive setTimeout with ref to avoid stale closure
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges)
  hasUnsavedChangesRef.current = hasUnsavedChanges
  const handleSaveDraftRef = useRef(handleSaveDraft)
  handleSaveDraftRef.current = handleSaveDraft
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!savedWorkflowId) return
    function tick() {
      if (hasUnsavedChangesRef.current && handleSaveDraftRef.current) {
        handleSaveDraftRef.current("自动暂存")
      }
      autoSaveTimerRef.current = setTimeout(tick, 30_000)
    }
    autoSaveTimerRef.current = setTimeout(tick, 30_000)
    return () => clearTimeout(autoSaveTimerRef.current)
  }, [savedWorkflowId])

  // ─── M4: Execution ───
  const {
    isExecuting,
    currentExecution,
    kestraHealthy,
    kestraError,
  } = useWorkflowStore(useShallow((s) => ({
    isExecuting: s.isExecuting,
    currentExecution: s.currentExecution,
    kestraHealthy: s.kestraHealthy,
    kestraError: s.kestraError,
  })))
  const setIsExecuting = useWorkflowStore((s) => s.setIsExecuting)
  const setCurrentExecution = useWorkflowStore((s) => s.setCurrentExecution)
  const setKestraHealthy = useWorkflowStore((s) => s.setKestraHealthy)
  const [showInputForm, setShowInputForm] = useState(false)
  const [showTriggerForm, setShowTriggerForm] = useState(false)

  // Kestra health check (on mount + every 5 min) — with abort on unmount
  const healthTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    let isMounted = true
    const utilsRef = utils
    const check = () => {
      utilsRef.workflow.kestraHealth.fetch().then((res) => {
        if (isMounted) setKestraHealthy(res.healthy, res.error)
      }).catch((err) => {
        if (isMounted) setKestraHealthy(false, err instanceof Error ? err.message : "健康检查失败")
      }).finally(() => {
        if (isMounted) healthTimerRef.current = setTimeout(check, 5 * 60_000)
      })
    }
    check()
    return () => {
      isMounted = false
      clearTimeout(healthTimerRef.current)
    }
  }, [utils, setKestraHealthy])

  // Execution polling — recursive setTimeout with refs to avoid stale closure & request pileup
  const currentExecutionRef = useRef(currentExecution)
  currentExecutionRef.current = currentExecution
  const utilsRef = useRef(utils)
  utilsRef.current = utils
  const setCurrentExecutionRef = useRef(setCurrentExecution)
  setCurrentExecutionRef.current = setCurrentExecution
  const setIsExecutingRef = useRef(setIsExecuting)
  setIsExecutingRef.current = setIsExecuting
  const exitRunningModeRef = useRef(exitRunningMode)
  exitRunningModeRef.current = exitRunningMode
  const pollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const exec = currentExecutionRef.current
    if (!exec || isTerminalState(exec.state)) {
      if (isExecuting) setIsExecuting(false)
      return
    }

    let isMounted = true
    function tick() {
      const exec = currentExecutionRef.current
      if (!exec || !isMounted) return
      utilsRef.current.workflow.executionGet.fetch({
        executionId: exec.id,
      }).then((result) => {
        if (!isMounted || !result) return
        setCurrentExecutionRef.current(toExecutionSummary(result))
        if (isTerminalState(result.state)) {
          setIsExecutingRef.current(false)
          exitRunningModeRef.current()
          if (result.state === "SUCCESS") {
            toast.success("执行完成")
          } else if (result.state === "FAILED") {
            toast.error("执行失败")
          } else if (result.state === "WARNING") {
            toast.warning("执行完成（有警告）")
          } else if (result.state === "KILLED") {
            toast.warning("执行已终止")
          } else if (result.state === "CANCELLED") {
            toast.info("执行已取消")
          }
          return // stop polling
        }
        pollTimerRef.current = setTimeout(tick, 3000)
      }).catch(() => {
        if (isMounted) pollTimerRef.current = setTimeout(tick, 3000)
      })
    }
    pollTimerRef.current = setTimeout(tick, 3000)

    return () => {
      isMounted = false
      clearTimeout(pollTimerRef.current)
    }
  }, [currentExecution?.id, currentExecution?.state, isExecuting])

  const executeTest = trpc.workflow.executeTest.useMutation({
    onSuccess: (result) => {
      setIsExecuting(true)
      setCurrentExecution(toExecutionSummary(result))
      // 进入运行态视图 — 使用执行时的节点快照
      const snapshot: RunningSnapshot = {
        nodes: (result.nodes ?? []) as unknown as RunningSnapshot["nodes"],
        edges: (result.edges ?? []) as unknown as RunningSnapshot["edges"],
        inputs: (result.inputs ?? []) as unknown as RunningSnapshot["inputs"],
      }
      enterRunningMode(snapshot, "draft")
      toast.success("测试执行已触发")
      setShowInputForm(false)
    },
    onError: (err) => toast.error(`执行失败: ${err.message}`),
  })

  const executionReplay = trpc.workflow.executionReplay.useMutation({
    onSuccess: (result) => {
      setIsExecuting(true)
      setCurrentExecution(toExecutionSummary(result))
      // Replay 也进入运行态
      const snapshot: RunningSnapshot = {
        nodes: (result.nodes ?? []) as unknown as RunningSnapshot["nodes"],
        edges: (result.edges ?? []) as unknown as RunningSnapshot["edges"],
        inputs: (result.inputs ?? []) as unknown as RunningSnapshot["inputs"],
      }
      enterRunningMode(snapshot, "draft")
      toast.success("Replay 已触发")
    },
    onError: (err) => toast.error(`Replay 失败: ${err.message}`),
  })

  const handleExecuteTest = useCallback(() => {
    if (!savedWorkflowId) {
      toast.warning("请先保存工作流")
      return
    }
    if (!kestraHealthy) {
      toast.warning(kestraError ? `Kestra 未连接：${kestraError}` : "Kestra 未连接，请稍后再试")
      return
    }
    if (inputs.length > 0) {
      setShowInputForm(true)
    } else {
      executeTest.mutate({ workflowId: savedWorkflowId })
    }
  }, [savedWorkflowId, kestraHealthy, kestraError, inputs, executeTest])

  const handleExecuteWithInputs = useCallback(
    (inputValues: Record<string, string>) => {
      if (!savedWorkflowId) return
      executeTest.mutate({ workflowId: savedWorkflowId, inputValues })
    },
    [savedWorkflowId, executeTest],
  )

  const handleReplay = useCallback(
    (executionId: string, taskRunId: string) => {
      executionReplay.mutate({ executionId, taskRunId })
    },
    [executionReplay],
  )

  // YAML import handler
  const handleYamlImport = useCallback(
    (data: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; inputs: WorkflowInput[] }) => {
      setWfNodes(data.nodes)
      setWfEdges(data.edges)
      setInputs(data.inputs)
      useWorkflowStore.getState().clearExpandedContainers()
      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100)
    },
    [setWfNodes, setWfEdges, setInputs, fitView],
  )

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">加载工作流...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background" tabIndex={0}>
      {/* 第一层：导航 + 核心操作 */}
      <div className="h-11 md:h-12 border-b border-border bg-card flex items-center justify-between px-2 md:px-4 shrink-0">
        <div className="flex items-center gap-1 md:gap-2">
          <Link to="/workflows" className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-xs text-muted-foreground hidden sm:inline">工作流</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">&gt;</span>
          <span className="text-sm font-semibold truncate max-w-[120px] md:max-w-[200px]">
            {workflowMeta.name || workflowMeta.flowId}
          </span>
          {/* 状态标签 — 桌面端完整显示 */}
          {!isMobile && (
            viewMode === "running" ? (
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
            )
          )}
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {/* Kestra health indicator — 桌面端 */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] hidden md:flex transition-colors ${
              kestraHealthy
                ? "text-muted-foreground"
                : "bg-red-50 text-red-600 border border-red-200 cursor-help dark:bg-red-950 dark:text-red-400 dark:border-red-800"
            }`}
            title={kestraHealthy ? "Kestra 已连接" : (kestraError || "Kestra 未连接")}
          >
            <div className={`w-2 h-2 rounded-full ${kestraHealthy ? "bg-green-500" : "bg-red-400 animate-pulse"}`} />
            <span>Kestra{!kestraHealthy && kestraError ? ` · ${kestraError.slice(0, 40)}${kestraError.length > 40 ? "…" : ""}` : ""}</span>
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
                        onClick={() => { handleSaveDraft(); setMoreMenuOpen(false) }}
                        disabled={!savedWorkflowId || draftSave.isPending}
                      >
                        <ScrollText className="w-4 h-4" />
                        保存草稿
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => { setRightPanel("yaml"); setSelectedNodeId(null); setMoreMenuOpen(false) }}
                      >
                        <FileCode2 className="w-4 h-4" />
                        YAML
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => { setRightPanel("releases"); setSelectedNodeId(null); setMoreMenuOpen(false) }}
                      >
                        <GitBranch className="w-4 h-4" />
                        版本
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => { setRightPanel("executions"); setSelectedNodeId(null); setMoreMenuOpen(false) }}
                      >
                        <History className="w-4 h-4" />
                        执行历史
                      </button>
                      <div className="h-px bg-border my-1" />
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => { setShowPublishDialog(true); setMoreMenuOpen(false) }}
                        disabled={!savedWorkflowId || releasePublish.isPending}
                      >
                        <Rocket className="w-4 h-4" />
                        发布
                      </button>
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                        onClick={() => { setRightPanel("settings"); setSelectedNodeId(null); setMoreMenuOpen(false) }}
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
          rightPanel === "task" || rightPanel === "drafts" || rightPanel === "production-executions"
            ? "canvas"
            : rightPanel === "none"
              ? "canvas"
              : rightPanel as TabKey
        }
        onTabChange={(tab) => {
          const panelMap: Record<string, typeof rightPanel> = {
            canvas: "none",
            yaml: "yaml",
            inputs: "inputs",
            executions: "executions",
            versions: "releases",
            triggers: "triggers",
            settings: "settings",
          }
          setRightPanel(panelMap[tab] ?? "none")
          setSelectedNodeId(null)
        }}
        onOpenInNewPage={(tab) => {
          const routeMap: Record<string, string> = {
            executions: `/workflows/${workflowId}/executions`,
            versions: `/workflows/${workflowId}/versions`,
            triggers: `/workflows/${workflowId}/triggers`,
          }
          const url = routeMap[tab]
          if (url) {
            window.open(url, "_blank")
          }
        }}
      />
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <div ref={reactFlowWrapper} className="w-full h-full"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}>
          <ReactFlow
            nodes={canvasNodes}
            edges={canvasEdges}
            onNodesChange={viewMode === "running" ? undefined : onCanvasNodesChange}
            onEdgesChange={viewMode === "running" ? undefined : onCanvasEdgesChange}
            onConnect={viewMode === "running" ? undefined : onConnect}
            onNodeClick={onNodeClick}
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
            <Controls className="!bg-card !border !border-border !rounded-lg !shadow-sm" />
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="#e2e8f0"
            />
            <MiniMap
              className="!bg-card !border !border-border !rounded-lg hidden md:block"
              nodeColor="#818cf8"
            />
          </ReactFlow>
        </div>

        {/* 画布浮动工具栏 — 移动端隐藏（功能在更多菜单中） */}
        {!isMobile && (
          <CanvasToolbar
            onAutoLayout={handleAutoLayout}
            onFitView={() => fitView({ padding: 0.2, maxZoom: 1 })}
            onFromTemplate={() => setTemplateDialogOpen(true)}
            onSaveAsTemplate={handleSaveAsTemplate}
          />
        )}

        {/* 容器嵌套面包屑 */}
        <Breadcrumb />

        {/* Ctrl+F 搜索定位 */}
        {searchOpen && (
          <div className="absolute top-2 left-2 right-2 z-50 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-80 md:max-w-[calc(100%-1rem)] bg-card border border-border rounded-lg shadow-lg">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.length > 0) {
                    handleSearchSelect(searchResults[0].id)
                  }
                }}
                placeholder="搜索节点名称..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setSearchOpen(false); setSearchQuery("") }}
                className="w-5 h-5"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </div>
            {searchQuery.trim() && (
              <div className="max-h-60 overflow-y-auto py-1">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">无匹配节点</div>
                ) : (
                  searchResults.map((node) => (
                    <Button
                      key={node.id}
                      variant="ghost"
                      onClick={() => handleSearchSelect(node.id)}
                      className="w-full text-left px-3 py-1.5 text-sm h-auto justify-start"
                    >
                      <span className="truncate">{node.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{node.type}</span>
                    </Button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 左侧插件面板 — 桌面端 */}
        {!isMobile && (
          <NodeCreatePanel
            isOpen={panelOpen}
            onToggle={() => setPanelOpen(!panelOpen)}
          />
        )}
      </div>

      {/* 移动端节点创建 Drawer */}
      {isMobile && (
        <Drawer open={nodeCreateDrawerOpen} onOpenChange={setNodeCreateDrawerOpen}>
          <DrawerContent className="max-h-[80vh]">
            <DrawerHeader>
              <DrawerTitle>添加节点</DrawerTitle>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <MobileNodePanel />
            </div>
            <div className="px-4 pb-4 pt-2 border-t border-border">
              <Button variant="outline" className="w-full" onClick={() => setNodeCreateDrawerOpen(false)}>
                关闭
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* 右键菜单 */}
      {contextMenu && (() => {
        const ctxNode = wfNodes.find((n) => n.id === contextMenu.nodeId)
        if (!ctxNode) return null
        return (
          <NodeContextMenu
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            onDelete={() => {
              setSelectedNodeId(contextMenu.nodeId)
              handleDeleteSelected()
              setContextMenu(null)
            }}
            onDuplicate={() => {
              setSelectedNodeId(contextMenu.nodeId)
              handleDuplicate()
              setContextMenu(null)
            }}
            isContainer={isContainer(ctxNode.type)}
            isCollapsed={ctxNode.ui?.collapsed ?? false}
            onToggleCollapse={() => {
              const state = useWorkflowStore.getState()
              const node = state.nodes.find((n) => n.id === contextMenu.nodeId)
              // 展开时检查嵌套深度
              if (node?.ui?.collapsed) {
                if (!canExpandContainer(contextMenu.nodeId, state.nodes)) {
                  toast.warning("已达到最大嵌套层级")
                  setContextMenu(null)
                  return
                }
              }
              state.toggleCollapse(contextMenu.nodeId)
              setContextMenu(null)
            }}
          />
        )
      })()}

      {/* 右侧面板 */}
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
          releases={(releasesQuery.data ?? []).map((r) => ({
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
      {showPublishDialog && (
        <PublishDialog
          nodes={wfNodes}
          edges={wfEdges}
          inputs={inputs}
          variables={wfVariables}
          flowId={workflowMeta.flowId}
          namespace={workflowMeta.namespace}
          nextVersion={publishedVersion + 1}
          isPublishing={releasePublish.isPending}
          prevReleaseNodes={prevReleaseNodes}
          onPublish={handlePublish}
          onClose={() => setShowPublishDialog(false)}
        />
      )}

      {showTriggerForm && savedWorkflowId && (
        <TriggerCreateForm
          workflowId={savedWorkflowId}
          releases={releases.map((r) => ({ id: r.id, version: r.version, name: r.name }))}
          onClose={() => setShowTriggerForm(false)}
          onCreated={() => {
            setShowTriggerForm(false)
            utils.workflow.triggerList.invalidate({ workflowId: savedWorkflowId })
          }}
        />
      )}

      {/* M4: Execution */}
      {currentExecution && (
        <ExecutionDrawer
          onClose={() => setCurrentExecution(null)}
          onReplay={handleReplay}
        />
      )}

      {showInputForm && (
        <InputValuesForm
          inputs={inputs}
          onSubmit={handleExecuteWithInputs}
          onCancel={() => setShowInputForm(false)}
        />
      )}

      {rightPanel === "executions" && savedWorkflowId && (
        <ExecutionHistory
          workflowId={savedWorkflowId}
          onSelect={(exec) => {
            setCurrentExecution(exec)
            setRightPanel("none")
          }}
          onClose={() => setRightPanel("none")}
        />
      )}

      {rightPanel === "production-executions" && savedWorkflowId && (
        <ProductionExecHistory
          workflowId={savedWorkflowId}
          onClose={() => setRightPanel("none")}
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

      {/* 底部状态条：缺失引用 */}
      {missingRefs.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-sm">
          <button
            onClick={() => setMissingRefsExpanded(!missingRefsExpanded)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-muted/50 transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {missingRefs.length} 个缺失引用
            </span>
            <span className="text-muted-foreground">
              — 发布前请先修复
            </span>
            <ChevronRight className={`w-3.5 h-3.5 ml-auto text-muted-foreground transition-transform ${missingRefsExpanded ? "rotate-90" : ""}`} />
          </button>

          {missingRefsExpanded && (
            <div className="px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto border-t">
              {missingRefs.map((ref, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded-md px-3 py-1.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      ref.type === "secret" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : ref.type === "variable" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    }`}>
                      {ref.type === "secret" ? "密钥" : ref.type === "variable" ? "变量" : "输入"}
                    </span>
                    <span className="font-mono text-xs">{ref.name}</span>
                  </div>
                  {(ref.type === "secret" || ref.type === "variable") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigateToSettings(ref.type === "secret" ? "secrets" : "variables")
                      }}
                    >
                      去创建
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
