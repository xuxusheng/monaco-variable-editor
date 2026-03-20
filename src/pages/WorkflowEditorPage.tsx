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
import type { TaskNodeData } from "@/components/flow/TaskNode"
import { TaskConfigPanel } from "@/components/flow/TaskConfigPanel"
import { InputConfigPanel } from "@/components/flow/InputConfigPanel"
import { KestraYamlPanel } from "@/components/flow/KestraYamlPanel"
import { DEFAULT_TASK_YAML } from "@/types/kestra"
import type { KestraInput } from "@/types/kestra"
import { cn } from "@/lib/utils"

const nodeTypes = { taskNode: TaskNode }

let nodeIdCounter = 0
const getId = () => `task_${++nodeIdCounter}`

type RightPanel = "none" | "task" | "inputs" | "yaml"

const INITIAL_NODES: Node[] = [
  {
    id: "task_1",
    type: "taskNode",
    position: { x: 250, y: 50 },
    data: {
      label: "示例任务",
      taskConfig: `id: example-task
type: io.kestra.plugin.core.log.Log
message: "环境: {{ inputs.env }}, 版本: {{ inputs.version }}"`,
    },
  },
]

const INITIAL_INPUTS: KestraInput[] = [
  { id: "env", type: "STRING", defaults: "dev", description: "运行环境" },
  { id: "version", type: "STRING", defaults: "1.0.0", description: "版本号" },
]

export default function WorkflowEditorPage() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
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

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id)
      setRightPanel("task")
    },
    [],
  )

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
      const type = event.dataTransfer.getData("application/reactflow")
      if (!type) return

      const position = {
        x: event.clientX - 240,
        y: event.clientY - 100,
      }

      pushHistory()
      const newNode: Node = {
        id: getId(),
        type: "taskNode",
        position,
        data: {
          label: `任务 ${nodeIdCounter}`,
          taskConfig: DEFAULT_TASK_YAML,
        },
      }
      setNodes((nds) => nds.concat(newNode))
    },
    [setNodes, pushHistory],
  )

  const onDragStart = useCallback(
    (event: React.DragEvent, nodeType: string) => {
      event.dataTransfer.setData("application/reactflow", nodeType)
      event.dataTransfer.effectAllowed = "move"
    },
    [],
  )

  const handleTaskUpdate = useCallback(
    (nodeId: string, label: string, taskConfig: string) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, label, taskConfig } }
            : node,
        ),
      )
    },
    [setNodes],
  )

  const sortedNodes = useMemo(() => {
    const adjacency = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    for (const n of nodes) {
      adjacency.set(n.id, [])
      inDegree.set(n.id, 0)
    }
    for (const e of edges as Edge[]) {
      adjacency.get(e.source)?.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    const sorted: string[] = []
    while (queue.length > 0) {
      const cur = queue.shift()!
      sorted.push(cur)
      for (const next of adjacency.get(cur) || []) {
        const newDeg = (inDegree.get(next) || 1) - 1
        inDegree.set(next, newDeg)
        if (newDeg === 0) queue.push(next)
      }
    }

    for (const n of nodes) {
      if (!sorted.includes(n.id)) sorted.push(n.id)
    }

    return sorted.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean)
  }, [nodes, edges])

  const getKestraTasks = () => {
    return sortedNodes.map((node) => {
      const data = node.data as unknown as TaskNodeData
      return { id: data.label, taskConfig: data.taskConfig }
    })
  }

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeId) {
      pushHistory()
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
      setEdges((eds: Edge[]) => eds.filter((e: Edge) => e.source !== selectedNodeId && e.target !== selectedNodeId))
      setSelectedNodeId(null)
      setRightPanel("none")
    }
  }, [selectedNodeId, setNodes, setEdges, pushHistory])

  const handleSave = useCallback(() => {
    const data = {
      meta: workflowMeta,
      inputs,
      nodes: sortedNodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: n.data as unknown as TaskNodeData,
      })),
      edges: edges.map((e: Edge) => ({ source: e.source, target: e.target })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${workflowMeta.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [workflowMeta, inputs, sortedNodes, edges])

  const handleImport = useCallback(() => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string)
          pushHistory()
          if (data.meta) setWorkflowMeta(data.meta)
          if (data.inputs) setInputs(data.inputs)
          if (data.nodes) {
            setNodes(data.nodes.map((n: { id: string; position: { x: number; y: number }; data: TaskNodeData }, i: number) => ({
              id: n.id || getId(),
              type: "taskNode",
              position: n.position || { x: 250, y: i * 150 + 50 },
              data: n.data || { label: "未命名", taskConfig: DEFAULT_TASK_YAML },
            })))
          }
          if (data.edges) {
            setEdges(data.edges.map((e: { source: string; target: string }, i: number): Edge => ({
              id: `e-${i}`,
              source: e.source,
              target: e.target,
              animated: true,
              style: { stroke: "#818cf8" },
            })))
          }
        } catch {
          alert("JSON 格式错误")
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }, [setNodes, setEdges, pushHistory])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId) handleDeleteSelected()
      }
    },
    [undo, redo, selectedNodeId, handleDeleteSelected],
  )

  return (
    <div className="h-screen flex flex-col bg-background" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold flex items-center gap-2">🔧 Kestra 工作流编排</h1>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {nodes.length} 个节点 · {edges.length} 条连线
          </span>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={undo} disabled={history.length === 0} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors" title="撤销 (Ctrl+Z)">↩️</button>
            <button onClick={redo} disabled={redoStack.length === 0} className="w-7 h-7 rounded-md text-sm flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors" title="重做 (Ctrl+Shift+Z)">↪️</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleImport} className="px-3 py-1.5 rounded-md text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors">📂 导入</button>
          <button onClick={handleSave} className="px-3 py-1.5 rounded-md text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors">💾 保存</button>
          <button onClick={() => setRightPanel("inputs")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors", rightPanel === "inputs" ? "bg-indigo-100 text-indigo-700" : "bg-muted text-foreground hover:bg-muted/80")}>📥 输入参数</button>
          <button onClick={() => setRightPanel("yaml")} className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors", rightPanel === "yaml" ? "bg-indigo-100 text-indigo-700" : "bg-muted text-foreground hover:bg-muted/80")}>📄 YAML 预览</button>
          {selectedNodeId && <button onClick={handleDeleteSelected} className="px-3 py-1.5 rounded-md text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">🗑️ 删除</button>}
        </div>
      </div>

      <div className="h-12 border-b border-border bg-card/50 flex items-center gap-4 px-4 shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">工作流 ID:</label>
          <input type="text" value={workflowMeta.id} onChange={(e) => setWorkflowMeta({ ...workflowMeta, id: e.target.value })} className="px-2 py-1 rounded border border-input bg-background text-sm font-mono w-40 focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Namespace:</label>
          <input type="text" value={workflowMeta.namespace} onChange={(e) => setWorkflowMeta({ ...workflowMeta, namespace: e.target.value })} className="px-2 py-1 rounded border border-input bg-background text-sm font-mono w-48 focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div className="flex-1 flex relative">
        <div className="w-48 border-r border-border bg-card p-4 shrink-0 z-10">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">任务组件</h3>
          <div className="px-3 py-3 rounded-lg border-2 border-dashed border-muted-foreground/30 text-sm text-center text-muted-foreground hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/50 cursor-grab active:cursor-grabbing transition-colors" onDragStart={(event) => onDragStart(event, "taskNode")} draggable>
            ⚙️ 拖拽添加任务
          </div>
          <div className="mt-6">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">使用提示</h3>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li>· 拖拽左侧组件到画布</li>
              <li>· 点击节点配置 YAML</li>
              <li>· 从上往下连线排列顺序</li>
              <li>· YAML 中可用 <code className="bg-muted px-1 rounded">{`{{ inputs.xxx }}`}</code> 引用参数</li>
              <li>· Ctrl+Z 撤销 / Ctrl+Shift+Z 重做</li>
              <li>· Delete 删除选中节点</li>
            </ul>
          </div>
        </div>

        <div ref={reactFlowWrapper} className="flex-1">
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
            <MiniMap className="!bg-card !border !border-border !rounded-lg" nodeColor="#818cf8" />
          </ReactFlow>
        </div>
      </div>

      {rightPanel === "task" && selectedNode && (
        <TaskConfigPanel
          nodeId={selectedNode.id}
          label={(selectedNode.data as unknown as TaskNodeData).label}
          taskConfig={(selectedNode.data as unknown as TaskNodeData).taskConfig}
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
