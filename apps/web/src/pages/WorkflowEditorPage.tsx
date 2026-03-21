import { useCallback, useRef, useMemo, useEffect, memo, useState } from "react"
import type { TaskRun, ExecutionSummary } from "@/stores/workflow"

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
import { TaskConfigPanel } from "@/components/flow/TaskConfigPanel"
import { TriggerPanel } from "@/components/flow/TriggerPanel"
import { TriggerCreateForm } from "@/components/flow/TriggerCreateForm"
import { InputConfigPanel } from "@/components/flow/InputConfigPanel"
import { KestraYamlPanel } from "@/components/flow/KestraYamlPanel"
import { DraftHistory } from "@/components/flow/DraftHistory"
import { ReleaseHistory } from "@/components/flow/ReleaseHistory"
import { PublishDialog } from "@/components/flow/PublishDialog"
import { ExecutionDrawer } from "@/components/flow/ExecutionDrawer"
import { ExecutionHistory } from "@/components/flow/ExecutionHistory"
import { ProductionExecHistory } from "@/components/flow/ProductionExecHistory"
import { InputValuesForm } from "@/components/flow/InputValuesForm"
import { ContextMenu as NodeContextMenu } from "@/components/flow/ContextMenu"
import { getLayoutedElements } from "@/lib/autoLayout"
import { filterVisibleNodes, filterVisibleEdges, getChildCount } from "@/lib/containerUtils"
import { isContainer } from "@/types/container"
import {
  Wrench, Save, Download, FileText, LayoutDashboard,
  ClipboardList, Package, Rocket, Play, Zap,
  History, Copy, FolderOpen, ScrollText, Undo2, Redo2, Trash2,
  CheckCircle, XCircle, Globe,
} from "lucide-react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { useHotkeys } from "react-hotkeys-hook"
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowInput,
  EdgeType,
} from "@/types/workflow"
import { EDGE_STYLES } from "@/types/workflow"
import type { KestraInput } from "@/types/kestra"
import type { ApiWorkflowNode, ApiWorkflowEdge, ApiWorkflowInput } from "@/types/api"
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
function toCanvasNodes(wfNodes: WorkflowNode[]): Node[] {
  return wfNodes.map((n) => ({
    id: n.id,
    type: "workflowNode" as const,
    position: n.ui ?? { x: 150, y: 50 },
    data: {
      label: n.name,
      type: n.type,
      spec: n.spec,
      containerId: n.containerId,
      sortIndex: n.sortIndex,
      isContainer: isContainer(n.type),
      collapsed: n.ui?.collapsed ?? false,
      childCount: getChildCount(n.id, wfNodes),
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

// ========== 类型转换层（前端 ↔ API） ==========

function toApiNode(n: WorkflowNode): ApiWorkflowNode {
  return {
    id: n.id,
    type: n.type,
    name: n.name,
    description: n.description,
    containerId: n.containerId,
    sortIndex: n.sortIndex,
    spec: n.spec,
    ui: n.ui,
  }
}

function toApiEdge(e: WorkflowEdge): ApiWorkflowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    label: e.label,
  }
}

function toApiInput(i: WorkflowInput): ApiWorkflowInput {
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
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { fitView, screenToFlowPosition } = useReactFlow()

  // ---- Zustand store ----
  const wfNodes = useWorkflowStore((s) => s.nodes)
  const setWfNodes = useWorkflowStore((s) => s.setNodes)
  const wfEdges = useWorkflowStore((s) => s.edges)
  const setWfEdges = useWorkflowStore((s) => s.setEdges)
  const inputs = useWorkflowStore((s) => s.inputs)
  const setInputs = useWorkflowStore((s) => s.setInputs)
  const rightPanel = useWorkflowStore((s) => s.rightPanel)
  const setRightPanel = useWorkflowStore((s) => s.setRightPanel)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId)
  const panelOpen = useWorkflowStore((s) => s.panelOpen)
  const setPanelOpen = useWorkflowStore((s) => s.setPanelOpen)
  const workflowMeta = useWorkflowStore((s) => s.workflowMeta)
  const setWorkflowMeta = useWorkflowStore((s) => s.setWorkflowMeta)
  const savedWorkflowId = useWorkflowStore((s) => s.savedWorkflowId)
  const setSavedWorkflowId = useWorkflowStore((s) => s.setSavedWorkflowId)
  const triggers = useWorkflowStore((s) => s.triggers)
  const setTriggers = useWorkflowStore((s) => s.setTriggers)

  // ---- 过滤折叠容器的子节点 ----
  const visibleWfNodes = useMemo(() => filterVisibleNodes(wfNodes), [wfNodes])
  const visibleNodeIds = useMemo(
    () => new Set(visibleWfNodes.map((n) => n.id)),
    [visibleWfNodes],
  )
  const visibleWfEdges = useMemo(
    () => filterVisibleEdges(wfEdges, visibleNodeIds),
    [wfEdges, visibleNodeIds],
  )

  // ---- zundo temporal (undo/redo) ----
  const undo = useUndo()
  const redo = useRedo()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()

  // ---- 画布状态（从过滤后的业务状态派生） ----
  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] = useNodesState(
    toCanvasNodes(visibleWfNodes),
  )
  const [canvasEdges, setCanvasEdges, onCanvasEdgesChange] = useEdgesState(
    toCanvasEdges(visibleWfEdges),
  )

  // ---- 过滤后的业务状态变更 → 同步画布 ----
  useEffect(() => {
    setCanvasNodes(toCanvasNodes(visibleWfNodes))
  }, [visibleWfNodes, setCanvasNodes])

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
    setSelectedNodeId(node.id)
    setRightPanel("task")
  }, [setSelectedNodeId, setRightPanel])

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
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const rawData = event.dataTransfer.getData("application/reactflow")
      if (!rawData) return

      const { type, name, defaultSpec } = JSON.parse(rawData) as {
        type: string
        name: string
        defaultSpec?: Record<string, unknown>
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const maxSort = wfNodes
        .filter((n) => n.containerId === null)
        .reduce((max, n) => Math.max(max, n.sortIndex), -1)

      const newNode: WorkflowNode = {
        id: genNodeId(),
        type,
        name,
        containerId: null,
        sortIndex: maxSort + 1,
        spec: defaultSpec ?? {},
        ui: { x: position.x, y: position.y },
      }

      setWfNodes((prev) => [...prev, newNode])
    },
    [screenToFlowPosition, wfNodes, setWfNodes],
  )

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
    setWfNodes((prev) =>
      prev
        .filter((n) => n.id !== selectedNodeId)
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
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    )
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

    const newNode: WorkflowNode = {
      ...structuredClone(sourceNode),
      id: genNodeId(),
      name: sourceNode.name + " (副本)",
      sortIndex: maxSort + 1,
      ui: {
        x: (sourceNode.ui?.x ?? 0) + 50,
        y: (sourceNode.ui?.y ?? 0) + 100,
      },
    }
    setWfNodes((prev) => [...prev, newNode])
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
  useHotkeys("mod+z", () => undo(), { enabled: canUndo })
  useHotkeys("mod+shift+z", () => redo(), { enabled: canRedo })
  useHotkeys("delete, backspace", () => handleDeleteSelected(), {
    enabled: !!selectedNodeId,
  })

  // ---- 保存/加载（tRPC useUtils） ----
  const utils = trpc.useUtils()

  const createWorkflow = trpc.workflow.create.useMutation({
    onSuccess: (result) => {
      setSavedWorkflowId(result.id)
      utils.workflow.list.invalidate()
    },
  })

  const updateWorkflow = trpc.workflow.update.useMutation({
    onSuccess: () => {
      utils.workflow.list.invalidate()
    },
  })

  const handleSaveToApi = useCallback(() => {
    const currentNodes = syncPositions(wfNodes, canvasNodes)
    const apiNodes = currentNodes.map(toApiNode)
    const apiEdges = wfEdges.map(toApiEdge)
    const apiInputs = inputs.map(toApiInput)

    if (savedWorkflowId) {
      updateWorkflow.mutate({
        id: savedWorkflowId,
        flowId: workflowMeta.flowId,
        name: workflowMeta.name,
        description: workflowMeta.description,
        nodes: apiNodes,
        edges: apiEdges,
        inputs: apiInputs,
      })
    } else {
      createWorkflow.mutate({
        flowId: workflowMeta.flowId,
        name: workflowMeta.name,
        namespaceId: "default",
        description: workflowMeta.description,
        nodes: apiNodes,
        edges: apiEdges,
        inputs: apiInputs,
      })
    }
  }, [wfNodes, wfEdges, inputs, workflowMeta, savedWorkflowId, canvasNodes, createWorkflow, updateWorkflow, setSavedWorkflowId])

  const saveStatus = createWorkflow.isPending || updateWorkflow.isPending
    ? "saving"
    : createWorkflow.isSuccess || updateWorkflow.isSuccess
      ? "saved"
      : createWorkflow.isError || updateWorkflow.isError
        ? "error"
        : "idle"

  const handleLoadFromApi = useCallback(async () => {
    const workflows = await utils.workflow.list.fetch()
    if (!workflows || workflows.length === 0) {
      toast.warning("API 上暂无已保存的工作流")
      return
    }
    const latest = workflows[0]
    const full = await utils.workflow.get.fetch({ id: latest.id })
    if (!full) return

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

    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100)
  }, [workflowMeta.namespace, fitView, utils, setSavedWorkflowId, setWorkflowMeta, setWfNodes, setWfEdges, setInputs])

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
    onSuccess: () => {
      markSaved()
      // Refresh draft list
      if (savedWorkflowId) {
        utils.workflow.draftList.invalidate({ workflowId: savedWorkflowId })
      }
    },
    onError: (err) => {
      toast.error(`保存草稿失败: ${err.message}`)
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

  // Save draft action
  const handleSaveDraft = useCallback(
    (message?: string) => {
      if (!savedWorkflowId) {
        toast.warning("请先保存工作流到 API")
        return
      }
      draftSave.mutate({ workflowId: savedWorkflowId, message })
    },
    [savedWorkflowId, draftSave],
  )

  // Publish action
  const handlePublish = useCallback(
    (name: string, yaml: string) => {
      if (!savedWorkflowId) {
        toast.warning("请先保存工作流到 API")
        return
      }
      releasePublish.mutate({ workflowId: savedWorkflowId, name, yaml })
    },
    [savedWorkflowId, releasePublish],
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
  const markDirty = useWorkflowStore((s) => s.markDirty)
  const markSaved = useWorkflowStore((s) => s.markSaved)
  const setPublishedVersion = useWorkflowStore((s) => s.setPublishedVersion)
  const hasUnsavedChanges = useWorkflowStore((s) => s.hasUnsavedChanges)
  const lastSavedAt = useWorkflowStore((s) => s.lastSavedAt)
  const drafts = useWorkflowStore((s) => s.drafts)
  const releases = useWorkflowStore((s) => s.releases)
  const publishedVersion = useWorkflowStore((s) => s.publishedVersion)

  // 首次加载标记：首次渲染不触发 markDirty
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    markDirty()
  }, [wfNodes, wfEdges, inputs, markDirty])

  // Auto-save timer (30s)
  useEffect(() => {
    if (!savedWorkflowId) return
    const timer = setInterval(() => {
      if (hasUnsavedChanges) {
        handleSaveDraft("自动暂存")
      }
    }, 30_000)
    return () => clearInterval(timer)
  }, [savedWorkflowId, hasUnsavedChanges, handleSaveDraft])

  // ─── M4: Execution ───
  const isExecuting = useWorkflowStore((s) => s.isExecuting)
  const setIsExecuting = useWorkflowStore((s) => s.setIsExecuting)
  const currentExecution = useWorkflowStore((s) => s.currentExecution)
  const setCurrentExecution = useWorkflowStore((s) => s.setCurrentExecution)
  const kestraHealthy = useWorkflowStore((s) => s.kestraHealthy)
  const setKestraHealthy = useWorkflowStore((s) => s.setKestraHealthy)
  const [showInputForm, setShowInputForm] = useState(false)
  const [showTriggerForm, setShowTriggerForm] = useState(false)

  // Kestra health check (on mount + every 5 min)
  useEffect(() => {
    const check = () => {
      utils.workflow.kestraHealth.fetch().then((res) => {
        setKestraHealthy(res.healthy)
      }).catch(() => setKestraHealthy(false))
    }
    check()
    const timer = setInterval(check, 5 * 60_000)
    return () => clearInterval(timer)
  }, [utils, setKestraHealthy])

  // Execution polling (3s interval, stops on terminal state)
  useEffect(() => {
    if (!currentExecution || isTerminalState(currentExecution.state)) {
      if (isExecuting) setIsExecuting(false)
      return
    }

    const timer = setInterval(async () => {
      try {
        const result = await utils.workflow.executionGet.fetch({
          executionId: currentExecution.id,
        })
        if (result) {
          setCurrentExecution(toExecutionSummary(result))
          if (isTerminalState(result.state)) {
            setIsExecuting(false)
            if (result.state === "SUCCESS") {
              toast.success("执行完成")
            } else if (result.state === "FAILED") {
              toast.error("执行失败")
            }
          }
        }
      } catch { /* poll error silent */ }
    }, 3000)

    return () => clearInterval(timer)
  }, [currentExecution?.id, currentExecution?.state, isExecuting])

  const executeTest = trpc.workflow.executeTest.useMutation({
    onSuccess: (result) => {
      setIsExecuting(true)
      setCurrentExecution(toExecutionSummary(result))
      toast.success("测试执行已触发")
      setShowInputForm(false)
    },
    onError: (err) => toast.error(`执行失败: ${err.message}`),
  })

  const executionReplay = trpc.workflow.executionReplay.useMutation({
    onSuccess: (result) => {
      setIsExecuting(true)
      setCurrentExecution(toExecutionSummary(result))
      toast.success("Replay 已触发")
    },
    onError: (err) => toast.error(`Replay 失败: ${err.message}`),
  })

  const handleExecuteTest = useCallback(() => {
    if (!savedWorkflowId) {
      toast.warning("请先保存工作流")
      return
    }
    if (inputs.length > 0) {
      setShowInputForm(true)
    } else {
      executeTest.mutate({ workflowId: savedWorkflowId })
    }
  }, [savedWorkflowId, inputs, executeTest])

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
      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100)
    },
    [setWfNodes, setWfEdges, setInputs, fitView],
  )

  return (
    <div className="h-full flex flex-col bg-background" tabIndex={0}>
      {/* Top bar */}
      <div className="h-11 md:h-12 border-b border-border bg-card flex items-center justify-between px-2 md:px-4 shrink-0">
        <div className="flex items-center gap-1 md:gap-2">
          <h1 className="text-sm md:text-base font-semibold flex items-center gap-1.5">
            <Wrench className="w-4 h-4" /> 工作流
          </h1>
          <span className="text-[10px] md:text-xs text-muted-foreground bg-muted px-1.5 md:px-2 py-0.5 rounded hidden sm:inline">
            {wfNodes.length} 节点 · {wfEdges.length} 连线
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => undo()}
            disabled={!canUndo}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted disabled:opacity-30"
            title="撤销"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted disabled:opacity-30"
            title="重做"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setRightPanel("inputs")}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
            title="输入参数"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setRightPanel("yaml")}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
            title="YAML"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={handleAutoLayout}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
            title="自动布局"
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>
          {selectedNodeId && (
            <button
              onClick={handleDuplicate}
              className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
              title="复制节点"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          {selectedNodeId && (
            <button
              onClick={handleDeleteSelected}
              className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-red-50"
              title="删除"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          )}
        </div>
      </div>

      {/* Meta bar */}
      <div className="h-10 border-b border-border bg-card/50 hidden md:flex items-center gap-4 px-4 shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Flow ID:</label>
          <input
            type="text"
            value={workflowMeta.flowId}
            onChange={(e) =>
              setWorkflowMeta({ ...workflowMeta, flowId: e.target.value })
            }
            className="px-2 py-1 rounded border border-input bg-background text-sm font-mono w-36 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">名称:</label>
          <input
            type="text"
            value={workflowMeta.name}
            onChange={(e) =>
              setWorkflowMeta({ ...workflowMeta, name: e.target.value })
            }
            className="px-2 py-1 rounded border border-input bg-background text-sm w-32 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {/* Status indicator */}
          {hasUnsavedChanges && (
            <span className="text-xs text-muted-foreground">
              ● 未保存
            </span>
          )}
          {lastSavedAt && !hasUnsavedChanges && (
            <span className="text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 inline" /> {new Date(lastSavedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}

          {/* Draft actions */}
          <button
            onClick={handleLoadFromApi}
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" /> 加载
          </button>
          <button
            onClick={handleSaveToApi}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              saveStatus === "saving"
                ? "bg-yellow-100 text-yellow-700"
                : saveStatus === "saved"
                  ? "bg-green-100 text-green-700"
                  : saveStatus === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-indigo-500 text-white hover:bg-indigo-600"
            }`}
          >
            {saveStatus === "saving"
              ? "⏳ 保存中..."
              : saveStatus === "saved"
                ? <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> 已保存</span>
                : saveStatus === "error"
                  ? <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> 失败</span>
                  : <span className="flex items-center gap-1"><Save className="w-3.5 h-3.5" /> 保存</span>}
          </button>

          <div className="w-px h-5 bg-border" />

          <button
            onClick={() => handleSaveDraft()}
            disabled={!savedWorkflowId || draftSave.isPending}
            title={!savedWorkflowId ? "请先点击「保存」创建工作流" : "保存当前编辑状态为草稿快照"}
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <ScrollText className="w-3.5 h-3.5" /> 存草稿
          </button>
          <button
            onClick={() => setRightPanel("drafts")}
            title={!savedWorkflowId ? "请先点击「保存」创建工作流" : "查看草稿历史"}
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1"
          >
            <ClipboardList className="w-3.5 h-3.5" /> 草稿 ({drafts.length})
          </button>

          <div className="w-px h-5 bg-border" />

          <button
            onClick={() => setShowPublishDialog(true)}
            disabled={!savedWorkflowId || releasePublish.isPending}
            title={!savedWorkflowId ? "请先点击「保存」创建工作流" : "发布当前工作流为新版本"}
            className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Rocket className="w-3.5 h-3.5" /> 发布 v{publishedVersion + 1}
          </button>
          <button
            onClick={() => setRightPanel("releases")}
            title={!savedWorkflowId ? "请先点击「保存」创建工作流" : "查看已发布版本"}
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1"
          >
            <Package className="w-3.5 h-3.5" /> 版本 ({releases.length})
          </button>
          <button
            onClick={() => setRightPanel("triggers")}
            title="触发器"
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" /> 触发器 ({triggers.length})
          </button>

          <div className="w-px h-5 bg-border" />

          <button
            onClick={() => setRightPanel(rightPanel === "yaml" ? "none" : "yaml")}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              rightPanel === "yaml"
                ? "bg-indigo-500 text-white"
                : "bg-muted hover:bg-muted/80"
            } flex items-center gap-1`}
          >
            <FileText className="w-3.5 h-3.5" /> YAML
          </button>

          <div className="w-px h-5 bg-border" />

          {/* Kestra health indicator */}
          <div className="flex items-center gap-1 px-1" title={kestraHealthy ? "Kestra 已连接" : "Kestra 未连接"}>
            <div className={`w-2 h-2 rounded-full ${kestraHealthy ? "bg-green-500" : "bg-red-400"}`} />
            <span className="text-[10px] text-muted-foreground hidden lg:inline">Kestra</span>
          </div>

          <button
            onClick={handleExecuteTest}
            disabled={!savedWorkflowId || !kestraHealthy || isExecuting}
            title={!savedWorkflowId ? "请先保存工作流" : !kestraHealthy ? "Kestra 未连接" : "运行测试"}
            className="px-2 py-1 rounded-md text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            <Play className="w-3.5 h-3.5" /> 运行
          </button>

          <button
            onClick={() => setRightPanel("executions")}
            title="执行历史"
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1"
          >
            <History className="w-3.5 h-3.5" /> 执行
          </button>

          <button
            onClick={() => setRightPanel("production-executions")}
            title="生产执行"
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1"
          >
            <Globe className="w-3.5 h-3.5" /> 生产执行
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <div ref={reactFlowWrapper} className="w-full h-full">
          <ReactFlow
            nodes={canvasNodes}
            edges={canvasEdges}
            onNodesChange={onCanvasNodesChange}
            onEdgesChange={onCanvasEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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

        {/* 左侧插件面板 */}
        <NodeCreatePanel
          isOpen={panelOpen}
          onToggle={() => setPanelOpen(!panelOpen)}
        />
      </div>

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
            onAddErrors={() => {
              // errors 边：用户选目标后创建
              // TODO: M2 后续完善，当前简化为创建一条 errors 边到下一个同级节点
              toast.info("errors 边：请从节点拖出连线（后续完善目标选择）")
              setContextMenu(null)
            }}
            onAddFinally={() => {
              toast.info("finally 边：请从节点拖出连线（后续完善目标选择）")
              setContextMenu(null)
            }}
            isContainer={isContainer(ctxNode.type)}
            onToggleCollapse={() => {
              useWorkflowStore.getState().toggleCollapse(contextMenu.nodeId)
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
          variables={[]}
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
          variables={[]}
          flowId={workflowMeta.flowId}
          namespace={workflowMeta.namespace}
          nextVersion={publishedVersion + 1}
          isPublishing={releasePublish.isPending}
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

    </div>
  )
}
