import type { WorkflowNode, WorkflowEdge, WorkflowInput } from "@/types/workflow"

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowInput[]
}

export const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "scheduled-sync",
    name: "定时数据同步",
    description: "通过 Schedule 触发器定时执行 Shell 脚本并调用 HTTP 接口同步数据",
    category: "数据同步",
    nodes: [
      {
        id: "ts-1",
        type: "io.kestra.plugin.scripts.shell.Script",
        name: "执行同步脚本",
        containerId: null,
        sortIndex: 0,
        spec: { script: "echo '开始数据同步...'" },
        ui: { x: 200, y: 50 },
      },
      {
        id: "ts-2",
        type: "io.kestra.plugin.core.http.Request",
        name: "调用同步接口",
        containerId: null,
        sortIndex: 1,
        spec: { uri: "https://api.example.com/sync", method: "POST" },
        ui: { x: 200, y: 200 },
      },
      {
        id: "ts-3",
        type: "io.kestra.plugin.core.log.Log",
        name: "同步完成通知",
        containerId: null,
        sortIndex: 2,
        spec: { message: "数据同步完成" },
        ui: { x: 200, y: 350 },
      },
    ],
    edges: [
      { id: "te-1", source: "ts-1", target: "ts-2", type: "sequence" },
      { id: "te-2", source: "ts-2", target: "ts-3", type: "sequence" },
    ],
    inputs: [
      { id: "sync_url", type: "STRING", defaults: "https://api.example.com/sync", description: "同步接口地址" },
      { id: "cron", type: "STRING", defaults: "0 2 * * *", description: "定时调度表达式" },
    ],
  },
  {
    id: "etl-pipeline",
    name: "ETL 管道",
    description: "遍历数据源，逐条转换后加载到目标系统",
    category: "数据处理",
    nodes: [
      {
        id: "te-1",
        type: "io.kestra.plugin.core.http.Download",
        name: "拉取源数据",
        containerId: null,
        sortIndex: 0,
        spec: { uri: "https://example.com/data.csv" },
        ui: { x: 200, y: 50 },
      },
      {
        id: "te-2",
        type: "io.kestra.plugin.core.flow.ForEach",
        name: "逐条处理",
        containerId: null,
        sortIndex: 1,
        spec: { values: "{{ inputs.items }}" },
        ui: { x: 200, y: 200 },
      },
      {
        id: "te-3",
        type: "io.kestra.plugin.scripts.python.Script",
        name: "数据转换",
        containerId: "te-2",
        sortIndex: 0,
        spec: { script: "import json\nprint(json.dumps({'transformed': True}))" },
        ui: { x: 100, y: 380 },
      },
      {
        id: "te-4",
        type: "io.kestra.plugin.core.jdbc.Query",
        name: "写入目标库",
        containerId: "te-2",
        sortIndex: 1,
        spec: { url: "jdbc:postgresql://localhost:5432/warehouse", sql: "INSERT INTO staging VALUES (?)", sqlFormat: "QUERY" },
        ui: { x: 350, y: 380 },
      },
      {
        id: "te-5",
        type: "io.kestra.plugin.core.log.Log",
        name: "ETL 完成",
        containerId: null,
        sortIndex: 2,
        spec: { message: "ETL 管道执行完成" },
        ui: { x: 200, y: 550 },
      },
    ],
    edges: [
      { id: "tee-1", source: "te-1", target: "te-2", type: "sequence" },
      { id: "tee-2", source: "te-2", target: "te-5", type: "sequence" },
      { id: "tee-3", source: "te-2", target: "te-3", type: "containment" },
      { id: "tee-4", source: "te-2", target: "te-4", type: "containment" },
      { id: "tee-5", source: "te-3", target: "te-4", type: "sequence" },
    ],
    inputs: [
      { id: "source_url", type: "STRING", defaults: "https://example.com/data.csv", description: "源数据地址" },
      { id: "db_url", type: "STRING", defaults: "jdbc:postgresql://localhost:5432/warehouse", description: "目标数据库" },
    ],
  },
  {
    id: "error-handling",
    name: "错误处理",
    description: "带错误捕获和 finally 清理的可靠任务执行模板",
    category: "可靠性",
    nodes: [
      {
        id: "eh-1",
        type: "io.kestra.plugin.core.log.Log",
        name: "开始执行",
        containerId: null,
        sortIndex: 0,
        spec: { message: "任务开始" },
        ui: { x: 200, y: 50 },
      },
      {
        id: "eh-2",
        type: "io.kestra.plugin.scripts.shell.Script",
        name: "核心任务",
        containerId: null,
        sortIndex: 1,
        spec: { script: "echo '执行核心业务逻辑'" },
        ui: { x: 200, y: 200 },
      },
      {
        id: "eh-3",
        type: "io.kestra.plugin.core.http.Request",
        name: "错误通知",
        containerId: null,
        sortIndex: 2,
        spec: { uri: "https://hooks.example.com/alert", method: "POST", body: '{"error": "{{ error.message }}"}' },
        ui: { x: 100, y: 380 },
      },
      {
        id: "eh-4",
        type: "io.kestra.plugin.core.log.Log",
        name: "清理资源",
        containerId: null,
        sortIndex: 3,
        spec: { message: "执行清理操作" },
        ui: { x: 350, y: 380 },
      },
      {
        id: "eh-5",
        type: "io.kestra.plugin.core.log.Log",
        name: "结束",
        containerId: null,
        sortIndex: 4,
        spec: { message: "任务完成（含清理）" },
        ui: { x: 200, y: 530 },
      },
    ],
    edges: [
      { id: "ehe-1", source: "eh-1", target: "eh-2", type: "sequence" },
      { id: "ehe-2", source: "eh-2", target: "eh-5", type: "sequence" },
      { id: "ehe-3", source: "eh-2", target: "eh-3", type: "errors" },
      { id: "ehe-4", source: "eh-3", target: "eh-4", type: "finally" },
      { id: "ehe-5", source: "eh-2", target: "eh-4", type: "finally" },
    ],
    inputs: [
      { id: "alert_url", type: "STRING", defaults: "https://hooks.example.com/alert", description: "告警通知地址" },
    ],
  },
  {
    id: "multi-branch-approval",
    name: "多分支审批",
    description: "根据条件路由到不同审批分支，适用于多角色审批流",
    category: "审批流程",
    nodes: [
      {
        id: "ma-1",
        type: "io.kestra.plugin.core.log.Log",
        name: "提交申请",
        containerId: null,
        sortIndex: 0,
        spec: { message: "收到审批请求" },
        ui: { x: 200, y: 50 },
      },
      {
        id: "ma-2",
        type: "io.kestra.plugin.core.flow.Switch",
        name: "按金额分流",
        containerId: null,
        sortIndex: 1,
        spec: { value: "{{ inputs.amount }}" },
        ui: { x: 200, y: 200 },
      },
      {
        id: "ma-3",
        type: "io.kestra.plugin.core.http.Request",
        name: "主管审批",
        containerId: null,
        sortIndex: 2,
        spec: { uri: "https://approval.example.com/manager", method: "POST" },
        ui: { x: 50, y: 380 },
      },
      {
        id: "ma-4",
        type: "io.kestra.plugin.core.http.Request",
        name: "总监审批",
        containerId: null,
        sortIndex: 3,
        spec: { uri: "https://approval.example.com/director", method: "POST" },
        ui: { x: 200, y: 380 },
      },
      {
        id: "ma-5",
        type: "io.kestra.plugin.core.http.Request",
        name: "CEO 审批",
        containerId: null,
        sortIndex: 4,
        spec: { uri: "https://approval.example.com/ceo", method: "POST" },
        ui: { x: 350, y: 380 },
      },
      {
        id: "ma-6",
        type: "io.kestra.plugin.core.log.Log",
        name: "审批完成",
        containerId: null,
        sortIndex: 5,
        spec: { message: "审批流程结束" },
        ui: { x: 200, y: 530 },
      },
    ],
    edges: [
      { id: "mae-1", source: "ma-1", target: "ma-2", type: "sequence" },
      { id: "mae-2", source: "ma-2", target: "ma-3", type: "case", label: "< 1万" },
      { id: "mae-3", source: "ma-2", target: "ma-4", type: "case", label: "1万-10万" },
      { id: "mae-4", source: "ma-2", target: "ma-5", type: "case", label: "> 10万" },
      { id: "mae-5", source: "ma-3", target: "ma-6", type: "sequence" },
      { id: "mae-6", source: "ma-4", target: "ma-6", type: "sequence" },
      { id: "mae-7", source: "ma-5", target: "ma-6", type: "sequence" },
    ],
    inputs: [
      { id: "amount", type: "INT", defaults: "5000", description: "申请金额" },
      { id: "applicant", type: "STRING", defaults: "", description: "申请人" },
    ],
  },
  {
    id: "parallel-fetch",
    name: "并行数据拉取",
    description: "同时从多个数据源并行拉取数据，汇总后处理",
    category: "数据同步",
    nodes: [
      {
        id: "pf-1",
        type: "io.kestra.plugin.core.log.Log",
        name: "开始拉取",
        containerId: null,
        sortIndex: 0,
        spec: { message: "开始并行数据拉取" },
        ui: { x: 200, y: 50 },
      },
      {
        id: "pf-2",
        type: "io.kestra.plugin.core.flow.Parallel",
        name: "并行拉取",
        containerId: null,
        sortIndex: 1,
        spec: {},
        ui: { x: 200, y: 200 },
      },
      {
        id: "pf-3",
        type: "io.kestra.plugin.core.http.Download",
        name: "拉取数据源 A",
        containerId: "pf-2",
        sortIndex: 0,
        spec: { uri: "https://source-a.example.com/data" },
        ui: { x: 50, y: 380 },
      },
      {
        id: "pf-4",
        type: "io.kestra.plugin.core.http.Download",
        name: "拉取数据源 B",
        containerId: "pf-2",
        sortIndex: 1,
        spec: { uri: "https://source-b.example.com/data" },
        ui: { x: 250, y: 380 },
      },
      {
        id: "pf-5",
        type: "io.kestra.plugin.core.http.Download",
        name: "拉取数据源 C",
        containerId: "pf-2",
        sortIndex: 2,
        spec: { uri: "https://source-c.example.com/data" },
        ui: { x: 450, y: 380 },
      },
      {
        id: "pf-6",
        type: "io.kestra.plugin.scripts.shell.Script",
        name: "汇总合并",
        containerId: null,
        sortIndex: 2,
        spec: { script: "echo '合并所有数据源'" },
        ui: { x: 200, y: 550 },
      },
    ],
    edges: [
      { id: "pfe-1", source: "pf-1", target: "pf-2", type: "sequence" },
      { id: "pfe-2", source: "pf-2", target: "pf-6", type: "sequence" },
      { id: "pfe-3", source: "pf-2", target: "pf-3", type: "containment" },
      { id: "pfe-4", source: "pf-2", target: "pf-4", type: "containment" },
      { id: "pfe-5", source: "pf-2", target: "pf-5", type: "containment" },
    ],
    inputs: [
      { id: "source_a_url", type: "STRING", defaults: "https://source-a.example.com/data", description: "数据源 A 地址" },
      { id: "source_b_url", type: "STRING", defaults: "https://source-b.example.com/data", description: "数据源 B 地址" },
      { id: "source_c_url", type: "STRING", defaults: "https://source-c.example.com/data", description: "数据源 C 地址" },
    ],
  },
]

const STORAGE_KEY = "weave-user-templates"

export function getUserTemplates(): WorkflowTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WorkflowTemplate[]
  } catch {
    return []
  }
}

export function saveUserTemplate(template: WorkflowTemplate): void {
  const templates = getUserTemplates()
  templates.push(template)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export function deleteUserTemplate(id: string): void {
  const templates = getUserTemplates().filter((t) => t.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}
