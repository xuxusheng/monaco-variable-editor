import { useState, useCallback, useRef, useMemo } from "react"
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from "@xyflow/react"
import type { Connection, Node, Edge } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { TaskNode } from "@/components/flow/TaskNode"
import { TaskConfigPanel } from "@/components/flow/TaskConfigPanel"
import { InputConfigPanel } from "@/components/flow/InputConfigPanel"
import { KestraYamlPanel } from "@/components/flow/KestraYamlPanel"
import { DEFAULT_TASK_YAML } from "@/types/kestra"
import type { KestraInput } from "@/types/kestra"

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

function getTaskData(node: Node) {
  return node.data as unknown as { label: string; taskConfig: string }
}

export default function WorkflowEditorPage() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
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

  const handleSave = useCallback(() => {
    const blob = new Blob([JSON.stringify({ meta: workflowMeta, inputs, nodes: sortedNodes.map((n) => ({ id: n.id, position: n.position, data: getTaskData(n) })), edges: (edges as Edge[]).map((e) => ({ source: e.source, target: e.target })) }, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${workflowMeta.id}.json`
    a.click()
  }, [workflowMeta, inputs, sortedNodes, edges])

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
          <button onClick={handleSave} className="px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors">💾 保存</button>
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
            className="bg-muted/30"
            defaultEdgeOptions={{ animated: true, style: { stroke: "#818cf8", strokeWidth: 2 } }}
          >
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
