import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "./workflow"

export const FIXTURE_NODES: WorkflowNode[] = [
  {
    id: "node_1",
    type: "io.kestra.plugin.core.log.Log",
    name: "打印日志",
    containerId: null,
    sortIndex: 0,
    spec: { message: "环境: {{ inputs.env }}" },
    ui: { x: 200, y: 50 },
  },
  {
    id: "node_2",
    type: "io.kestra.plugin.core.http.Request",
    name: "HTTP 请求",
    containerId: null,
    sortIndex: 1,
    spec: { uri: "https://api.example.com/data", method: "GET" },
    ui: { x: 200, y: 200 },
  },
  {
    id: "node_3",
    type: "io.kestra.plugin.scripts.shell.Script",
    name: "Shell 脚本",
    containerId: null,
    sortIndex: 2,
    spec: { script: "echo 'done'" },
    ui: { x: 200, y: 350 },
  },
]

export const FIXTURE_EDGES: WorkflowEdge[] = [
  { id: "edge_1", source: "node_1", target: "node_2", type: "sequence" },
  { id: "edge_2", source: "node_2", target: "node_3", type: "sequence" },
]

export const FIXTURE_INPUTS: WorkflowInput[] = [
  { id: "env", type: "STRING", defaults: "dev", description: "运行环境" },
  { id: "version", type: "STRING", defaults: "1.0.0", description: "版本号" },
]
