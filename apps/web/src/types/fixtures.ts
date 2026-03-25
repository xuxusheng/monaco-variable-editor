import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "./workflow";

// ========== M1 基础 fixture（保持不变作为 fallback） ==========

export const FIXTURE_NODES: WorkflowNode[] = [
  // ---- 级别 0：顶级节点 ----
  {
    id: "start",
    type: "io.kestra.plugin.core.log.Log",
    name: "开始",
    containerId: null,
    sortIndex: 0,
    spec: { message: "工作流启动" },
    ui: { x: 200, y: 50 },
  },

  // ---- ForEach 容器 ----
  {
    id: "loop",
    type: "io.kestra.plugin.core.flow.ForEach",
    name: "遍历用户列表",
    containerId: null,
    sortIndex: 1,
    spec: { values: ["user1", "user2", "user3"] },
    ui: { x: 200, y: 200 },
  },
  {
    id: "download",
    type: "io.kestra.plugin.core.http.Download",
    name: "下载数据",
    containerId: "loop",
    sortIndex: 0,
    spec: { uri: "https://api.example.com/users" },
    ui: { x: 100, y: 380 },
  },
  {
    id: "parse",
    type: "io.kestra.plugin.core.log.Log",
    name: "解析数据",
    containerId: "loop",
    sortIndex: 1,
    spec: { message: "解析完成: {{ taskrun.value }}" },
    ui: { x: 350, y: 380 },
  },

  // ---- If 容器 ----
  {
    id: "check",
    type: "io.kestra.plugin.core.flow.If",
    name: "检查数据量",
    containerId: null,
    sortIndex: 2,
    spec: { condition: "{{ inputs.count > 0 }}" },
    ui: { x: 200, y: 550 },
  },
  {
    id: "process",
    type: "io.kestra.plugin.scripts.shell.Script",
    name: "处理数据",
    containerId: "check",
    sortIndex: 0,
    spec: { script: "echo 'processing...'" },
    ui: { x: 100, y: 720 },
  },
  {
    id: "alert",
    type: "io.kestra.plugin.core.log.Log",
    name: "发送报警",
    containerId: "check",
    sortIndex: 1,
    spec: { message: "数据为空，跳过处理" },
    ui: { x: 350, y: 720 },
  },

  // ---- 最终 ----
  {
    id: "end",
    type: "io.kestra.plugin.core.log.Log",
    name: "结束",
    containerId: null,
    sortIndex: 3,
    spec: { message: "工作流完成" },
    ui: { x: 200, y: 880 },
  },
];

export const FIXTURE_EDGES: WorkflowEdge[] = [
  // 顶级 sequence
  { id: "e1", source: "start", target: "loop", type: "sequence" },
  { id: "e2", source: "loop", target: "check", type: "sequence" },
  { id: "e3", source: "check", target: "end", type: "sequence" },

  // ForEach containment
  { id: "e4", source: "loop", target: "download", type: "containment" },
  { id: "e5", source: "loop", target: "parse", type: "containment" },
  // ForEach 内 sequence
  { id: "e6", source: "download", target: "parse", type: "sequence" },

  // If containment
  { id: "e7", source: "check", target: "process", type: "containment" },
  { id: "e8", source: "check", target: "alert", type: "containment" },
  // If 分支
  { id: "e9", source: "check", target: "process", type: "then" },
  { id: "e10", source: "check", target: "alert", type: "else" },

  // 错误处理
  { id: "e11", source: "download", target: "alert", type: "errors" },
];

export const FIXTURE_INPUTS: WorkflowInput[] = [
  { id: "env", type: "STRING", defaults: "dev", description: "运行环境" },
  { id: "count", type: "INT", defaults: "10", description: "数据量" },
  { id: "version", type: "STRING", defaults: "1.0.0", description: "版本号" },
];
