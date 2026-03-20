import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react"
import type { Connection, Node, Edge } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { TaskNode } from "@/components/flow/TaskNode"
import { TaskConfigPanel } from "@/components/flow/TaskConfigPanel"
import { InputConfigPanel } from "@/components/flow/InputConfigPanel"
import { KestraYamlPanel } from "@/components/flow/KestraYamlPanel"
import { DEFAULT_TASK_YAML } from "@/types/kestra"
import type { KestraInput } from "@/types/kestra"
import type { TaskNodeData } from "@/components/flow/TaskNode"
import { validateTaskConfig } from "@/lib/yamlValidation"
import { getLayoutedElements } from "@/lib/autoLayout"
import { trpcClient } from "@/lib/trpc"
import type { ApiTaskNode, ApiEdge, ApiInput } from "@/types/api"

// Auto-fit the view on mount and window resize
function FitViewOnMount() {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100)
    const handleResize = () => fitView({ padding: 0.2, maxZoom: 1 })
    window.addEventListener("resize", handleResize)
    return () => { clearTimeout(timer); window.removeEventListener("resize", handleResize) }
  }, [fitView])
  return null
}

const nodeTypes = { taskNode: TaskNode }

let nodeIdCounter = 0
const getId = () => `task_${++nodeIdCounter}`

type RightPanel = "none" | "task" | "inputs" | "yaml"

const INITIAL_NODES: Node[] = [
  {
    id: "task_1",
    type: "taskNode",
    position: { x: 150, y: 50 },
    data: {
      label: "打印日志",
      taskConfig: `id: print-log
type: io.kestra.plugin.core.log.Log
message: "环境: {{ inputs.env }}, 版本: {{ inputs.version }}"`,
    },
  },
  {
    id: "task_2",
    type: "taskNode",
    position: { x: 150, y: 200 },
    data: {
      label: "HTTP 请求",
      taskConfig: `id: api-call
type: io.kestra.plugin.core.http.Request
uri: "https://api.example.com/data"
method: GET
timeout: PT30S`,
    },
  },
  {
    id: "task_3",
    type: "taskNode",
    position: { x: 150, y: 350 },
    data: {
      label: "引用不存在的参数",
      taskConfig: `id: bad-ref
type: io.kestra.plugin.core.log.Log
message: "用户: {{ inputs.nonExistentParam }}"`,
    },
  },
  {
    id: "task_4",
    type: "taskNode",
    position: { x: 150, y: 500 },
    data: {
      label: "缺少必填字段",
      taskConfig: `id: ""
type: ""
message: "这个任务缺少 id 和 type"`,
    },
  },
]

const INITIAL_INPUTS: KestraInput[] = [
  { id: "env", type: "STRING", defaults: "dev", description: "运行环境" },
  { id: "version", type: "STRING", defaults: "1.0.0", description: "版本号" },
  { id: "apiKey", type: "STRING", description: "API 密钥", required: true },
]

function getTaskData(node: Node): TaskNodeData {
  return node.data as unknown as TaskNodeData
}

export default function WorkflowEditorPage() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([
    { id: "e1-2", source: "task_1", target: "task_2", animated: true, style: { stroke: "#818cf8" } },
    { id: "e2-3", source: "task_2", target: "task_3", animated: true, style: { stroke: "#818cf8" } },
    { id: "e3-4", source: "task_3", target: "task_4", animated: true, style: { stroke: "#818cf8" } },
  ])
  const [rightPanel, setRightPanel] = useState<RightPanel>("none")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [inputs, setInputs] = useState<KestraInput[]>(INITIAL_INPUTS)
  const [workflowMeta, setWorkflowMeta] = useState({
    id: "my-workflow",
    namespace: "company.team",
    description: "",
  })

  const [history, setHistory] = useState<Array<{ nodes: Node[]; edges: Edge[] }>>([])
  const [redoStack, setRedoStack] = useState<Array<{ nodes: Node[]; edges: Edge[] }>>([])

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-20), { nodes: [...nodes], edges: [...edges] }])
    setRedoStack([])
  }, [nodes, edges])

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setRedoStack((r) => [...r, { nodes: [...nodes], edges: [...edges] }])
      setNodes(prev.nodes)
      setEdges(prev.edges)
      return h.slice(0, -1)
    })
  }, [nodes, edges, setNodes, setEdges])

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r
      const next = r[r.length - 1]
      setHistory((h) => [...h, { nodes: [...nodes], edges: [...edges] }])
      setNodes(next.nodes)
      setEdges(next.edges)
      return r.slice(0, -1)
    })
  }, [nodes, edges, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection) => {
      pushHistory()
      setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "#818cf8" } } as Edge, eds))
    },
    [setEdges, pushHistory],
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setRightPanel("task")
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setRightPanel("none")
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (!event.dataTransfer.getData("application/reactflow")) return
      pushHistory()
      const newNode: Node = {
        id: getId(),
        type: "taskNode",
        position: { x: event.clientX - 240, y: event.clientY - 100 },
        data: { label: `任务 ${nodeIdCounter}`, taskConfig: DEFAULT_TASK_YAML },
      }
      setNodes((nds) => nds.concat(newNode))
    },
    [setNodes, pushHistory],
  )

  const handleTaskUpdate = useCallback(
    (nodeId: string, label: string, taskConfig: string) => {
      setNodes((nds) =>
        nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, label, taskConfig } } : n),
      )
    },
    [setNodes],
  )

  const sortedNodes = useMemo(() => {
    const adj = new Map<string, string[]>()
    const deg = new Map<string, number>()
    for (const n of nodes) { adj.set(n.id, []); deg.set(n.id, 0) }
    for (const e of edges as Edge[]) { adj.get(e.source)?.push(e.target); deg.set(e.target, (deg.get(e.target) || 0) + 1) }
    const q: string[] = []
    for (const [id, d] of deg) if (d === 0) q.push(id)
    const sorted: string[] = []
    while (q.length) { const c = q.shift()!; sorted.push(c); for (const nx of adj.get(c) || []) { const nd = (deg.get(nx) || 1) - 1; deg.set(nx, nd); if (nd === 0) q.push(nx) } }
    for (const n of nodes) if (!sorted.includes(n.id)) sorted.push(n.id)
    return sorted.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean)
  }, [nodes, edges])

  const getKestraTasks = () => sortedNodes.map((n) => { const d = getTaskData(n); return { id: d.label, taskConfig: d.taskConfig } })

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId) return
    pushHistory()
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
    setEdges((eds: Edge[]) => eds.filter((e: Edge) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
    setRightPanel("none")
  }, [selectedNodeId, setNodes, setEdges, pushHistory])

  // Validate all nodes and update their status
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const data = getTaskData(n)
        const result = validateTaskConfig(data.taskConfig, inputs)
        return {
          ...n,
          data: {
            ...data,
            validationStatus: result.status,
            validationMessages: result.messages,
          },
        }
      })
    )
  }, [nodes.map((n) => getTaskData(n).taskConfig).join("||"), inputs])

  // Auto-layout with dagre
  const handleAutoLayout = useCallback(() => {
    pushHistory()
    const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges as Edge[], "TB")
    setNodes(layoutedNodes)
    setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 50)
  }, [nodes, edges, setNodes, pushHistory, fitView])

  // Duplicate selected node
  const handleDuplicate = useCallback(() => {
    if (!selectedNodeId) return
    const sourceNode = nodes.find((n) => n.id === selectedNodeId)
    if (!sourceNode) return
    pushHistory()
    const data = getTaskData(sourceNode)
    const newNode: Node = {
      id: getId(),
      type: "taskNode",
      position: { x: sourceNode.position.x + 50, y: sourceNode.position.y + 100 },
      data: { ...data, label: data.label + " (副本)" },
    }
    setNodes((nds) => nds.concat(newNode))
  }, [selectedNodeId, nodes, setNodes, pushHistory])

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [savedWorkflowId, setSavedWorkflowId] = useState<string | null>(null)

  const handleSaveToApi = useCallback(async () => {
    setSaveStatus("saving")
    try {
      const apiNodes: ApiTaskNode[] = sortedNodes.map((n) => {
        const d = getTaskData(n)
        return { id: n.id, label: d.label, taskConfig: d.taskConfig }
      })
      const apiEdges: ApiEdge[] = (edges as Edge[]).map((e) => ({ source: e.source, target: e.target }))
      const apiInputs: ApiInput[] = inputs.map((i) => ({
        id: i.id,
        type: i.type,
        defaults: i.defaults,
        description: i.description,
        required: i.required,
      }))

      if (savedWorkflowId) {
        await trpcClient.workflow.update({
          id: savedWorkflowId,
          name: workflowMeta.id,
          namespace: workflowMeta.namespace,
          description: workflowMeta.description,
          nodes: apiNodes,
          edges: apiEdges,
          inputs: apiInputs,
        })
      } else {
        const result = await trpcClient.workflow.create({
          name: workflowMeta.id,
          namespace: workflowMeta.namespace,
          description: workflowMeta.description,
          nodes: apiNodes,
          edges: apiEdges,
          inputs: apiInputs,
        })
        setSavedWorkflowId(result.id)
      }
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch (e) {
      console.error("Save failed:", e)
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }, [sortedNodes, edges, inputs, workflowMeta, savedWorkflowId])

  const handleLoadFromApi = useCallback(async () => {
    try {
      const workflows = await trpcClient.workflow.list()
      if (workflows.length === 0) {
        alert("API 上暂无已保存的工作流")
        return
      }
      // Simple: load the most recently updated one
      const latest = workflows[0]
      const full = await trpcClient.workflow.get(latest.id)
      if (!full) return

      setSavedWorkflowId(full.id)
      setWorkflowMeta({ id: full.name, namespace: full.namespace, description: full.description ?? "" })

      // Restore inputs
      const restoredInputs: KestraInput[] = (full.inputs as ApiInput[]).map((i) => ({
        id: i.id,
        type: i.type,
        defaults: i.defaults,
        description: i.description,
        required: i.required,
      }))
      setInputs(restoredInputs)

      // Restore nodes
      const restoredNodes: Node[] = (full.nodes as ApiTaskNode[]).map((n, idx) => ({
        id: n.id,
        type: "taskNode",
        position: n.position ?? { x: 150, y: idx * 150 + 50 },
        data: { label: n.label, taskConfig: n.taskConfig },
      }))
      setNodes(restoredNodes)

      // Restore edges
      const restoredEdges: Edge[] = (full.edges as ApiEdge[]).map((e, idx) => ({
        id: `e-${idx}`,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: "#818cf8" },
      }))
      setEdges(restoredEdges)

      setTimeout(() => fitView({ padding: 0.2, maxZoom: 1 }), 100)
    } catch (e) {
      console.error("Load failed:", e)
      alert("从 API 加载失败，请确认后端已启动")
    }
  }, [setNodes, setEdges, fitView])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  return (
    <div className="h-full flex flex-col bg-background" tabIndex={0}>
      {/* Top bar — compact on mobile */}
      <div className="h-11 md:h-12 border-b border-border bg-card flex items-center justify-between px-2 md:px-4 shrink-0">
        <div className="flex items-center gap-1 md:gap-2">
          <h1 className="text-sm md:text-base font-semibold">🔧 工作流</h1>
          <span className="text-[10px] md:text-xs text-muted-foreground bg-muted px-1.5 md:px-2 py-0.5 rounded hidden sm:inline">
            {nodes.length} 节点
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={history.length === 0} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted disabled:opacity-30" title="撤销">↩️</button>
          <button onClick={redo} disabled={redoStack.length === 0} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted disabled:opacity-30" title="重做">↪️</button>
          <button onClick={() => setRightPanel("inputs")} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted" title="输入参数">📥</button>
          <button onClick={() => setRightPanel("yaml")} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted" title="YAML">📄</button>
          <button onClick={handleAutoLayout} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted" title="自动布局">📐</button>
          {selectedNodeId && <button onClick={handleDuplicate} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted" title="复制节点">📋</button>}
          {selectedNodeId && <button onClick={handleDeleteSelected} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-red-50" title="删除">🗑️</button>}
        </div>
      </div>

      {/* Meta bar — hide on small screens */}
      <div className="h-10 border-b border-border bg-card/50 hidden md:flex items-center gap-4 px-4 shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">ID:</label>
          <input type="text" value={workflowMeta.id} onChange={(e) => setWorkflowMeta({ ...workflowMeta, id: e.target.value })} className="px-2 py-1 rounded border border-input bg-background text-sm font-mono w-36 focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Namespace:</label>
          <input type="text" value={workflowMeta.namespace} onChange={(e) => setWorkflowMeta({ ...workflowMeta, namespace: e.target.value })} className="px-2 py-1 rounded border border-input bg-background text-sm font-mono w-40 focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={handleLoadFromApi} className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors">📂 加载</button>
          <button
            onClick={handleSaveToApi}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              saveStatus === "saving" ? "bg-yellow-100 text-yellow-700" :
              saveStatus === "saved" ? "bg-green-100 text-green-700" :
              saveStatus === "error" ? "bg-red-100 text-red-700" :
              "bg-indigo-500 text-white hover:bg-indigo-600"
            }`}
          >
            {saveStatus === "saving" ? "⏳ 保存中..." :
             saveStatus === "saved" ? "✅ 已保存" :
             saveStatus === "error" ? "❌ 失败" :
             "💾 保存到 API"}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Add button for mobile (replace sidebar) */}
        <button
          onClick={() => {
            pushHistory()
            const newNode: Node = {
              id: getId(),
              type: "taskNode",
              position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
              data: { label: `任务 ${nodeIdCounter}`, taskConfig: DEFAULT_TASK_YAML },
            }
            setNodes((nds) => nds.concat(newNode))
          }}
          className="absolute bottom-4 right-4 z-10 w-12 h-12 rounded-full bg-indigo-500 text-white shadow-lg flex items-center justify-center text-xl hover:bg-indigo-600 active:scale-95 transition-all md:hidden"
          title="添加任务"
        >
          +
        </button>

        <div ref={reactFlowWrapper} className="w-full h-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            className="bg-muted/30"
            defaultEdgeOptions={{ animated: true, style: { stroke: "#818cf8", strokeWidth: 2 } }}
          >
            <FitViewOnMount />
            <Controls className="!bg-card !border !border-border !rounded-lg !shadow-sm" />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
            <MiniMap className="!bg-card !border !border-border !rounded-lg hidden md:block" nodeColor="#818cf8" />
          </ReactFlow>
        </div>
      </div>

      {/* Right panels — full width on mobile */}
      {rightPanel === "task" && selectedNode && (
        <TaskConfigPanel
          nodeId={selectedNode.id}
          label={getTaskData(selectedNode).label}
          taskConfig={getTaskData(selectedNode).taskConfig}
          inputs={inputs}
          onUpdate={handleTaskUpdate}
          onClose={() => setRightPanel("none")}
        />
      )}
      {rightPanel === "inputs" && (
        <InputConfigPanel inputs={inputs} onUpdate={setInputs} onClose={() => setRightPanel("none")} />
      )}
      {rightPanel === "yaml" && (
        <KestraYamlPanel
          workflowId={workflowMeta.id}
          namespace={workflowMeta.namespace}
          description={workflowMeta.description}
          inputs={inputs}
          tasks={getKestraTasks()}
          onClose={() => setRightPanel("none")}
        />
      )}
    </div>
  )
}
