import { useCallback, useRef, useMemo, useEffect, memo } from "react"
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
import { InputConfigPanel } from "@/components/flow/InputConfigPanel"
import { KestraYamlPanel } from "@/components/flow/KestraYamlPanel"
import { getLayoutedElements } from "@/lib/autoLayout"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { useHotkeys } from "react-hotkeys-hook"
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowInput,
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

/** 中文名 → slug id */
function nameToSlug(name: string): string {
  return (
    name
      .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "task"
  )
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

  // ---- zundo temporal (undo/redo) ----
  const undo = useUndo()
  const redo = useRedo()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()

  // ---- 画布状态（从业务状态派生） ----
  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] = useNodesState(
    toCanvasNodes(wfNodes),
  )
  const [canvasEdges, setCanvasEdges, onCanvasEdgesChange] = useEdgesState(
    toCanvasEdges(wfEdges),
  )

  // ---- 业务状态变更 → 同步画布 ----
  useEffect(() => {
    setCanvasNodes(toCanvasNodes(wfNodes))
  }, [wfNodes, setCanvasNodes])

  useEffect(() => {
    setCanvasEdges(toCanvasEdges(wfEdges))
  }, [wfEdges, setCanvasEdges])

  // ---- 排序 ----
  const sortedNodes = useMemo(() => {
    return [...wfNodes].sort((a, b) => a.sortIndex - b.sortIndex)
  }, [wfNodes])

  // ---- 连线 ----
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      const newEdge: WorkflowEdge = {
        id: genEdgeId(),
        source: params.source,
        target: params.target,
        type: "sequence",
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
  }, [setSelectedNodeId, setRightPanel])

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

  const kestraTasks = useMemo(
    () =>
      sortedNodes.map((n) => ({
        id: n.name,
        taskConfig: yamlFromSpec(n.type, n.name, n.spec),
      })),
    [sortedNodes],
  )

  return (
    <div className="h-full flex flex-col bg-background" tabIndex={0}>
      {/* Top bar */}
      <div className="h-11 md:h-12 border-b border-border bg-card flex items-center justify-between px-2 md:px-4 shrink-0">
        <div className="flex items-center gap-1 md:gap-2">
          <h1 className="text-sm md:text-base font-semibold">🔧 工作流</h1>
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
            ↩️
          </button>
          <button
            onClick={() => redo()}
            disabled={!canRedo}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted disabled:opacity-30"
            title="重做"
          >
            ↪️
          </button>
          <button
            onClick={() => setRightPanel("inputs")}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
            title="输入参数"
          >
            📥
          </button>
          <button
            onClick={() => setRightPanel("yaml")}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
            title="YAML"
          >
            📄
          </button>
          <button
            onClick={handleAutoLayout}
            className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
            title="自动布局"
          >
            📐
          </button>
          {selectedNodeId && (
            <button
              onClick={handleDuplicate}
              className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted"
              title="复制节点"
            >
              📋
            </button>
          )}
          {selectedNodeId && (
            <button
              onClick={handleDeleteSelected}
              className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-red-50"
              title="删除"
            >
              🗑️
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
          <button
            onClick={handleLoadFromApi}
            className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
          >
            📂 加载
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
                ? "✅ 已保存"
                : saveStatus === "error"
                  ? "❌ 失败"
                  : "💾 保存"}
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
          workflowId={workflowMeta.flowId}
          namespace={workflowMeta.namespace}
          description={workflowMeta.description}
          inputs={kestraInputs}
          tasks={kestraTasks}
          onClose={() => setRightPanel("none")}
        />
      )}
    </div>
  )
}
