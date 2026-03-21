// ========== Weave 业务模型 ==========

// ----- 边类型 -----
export type EdgeType =
  | "sequence"      // 同层顺序执行（实线靛蓝箭头）
  | "containment"   // 容器包含子任务（虚线灰）
  | "then"          // if 条件为真（实线绿箭头）
  | "else"          // if 条件为假（实线红箭头）
  | "case"          // switch 分支（实线蓝箭头）
  | "errors"        // 错误处理（虚线红）
  | "finally"       // 最终执行（虚线灰）

// ----- 节点模型 -----
export interface WorkflowNode {
  id: string
  type: string                    // Kestra 全名，如 "io.kestra.plugin.core.log.Log"
  name: string                    // 中文名称，必填
  description?: string
  containerId: string | null      // 所属容器 ID（M1 全部为 null）
  sortIndex: number               // 同容器内的执行顺序
  spec: Record<string, unknown>   // Kestra 插件配置
  ui?: {                          // 画布元数据（不传给 Kestra）
    x: number
    y: number
    collapsed?: boolean
  }
}

// ----- 边模型 -----
export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label?: string                  // 条件标签（如 "env=='prod'"）
}

// ----- Input 类型 -----
export type WorkflowInputType =
  | "STRING" | "INT" | "FLOAT" | "BOOL"
  | "SELECT" | "MULTISELECT"
  | "DATE" | "DATETIME" | "TIME" | "DURATION"
  | "ARRAY" | "JSON" | "YAML"
  | "FILE" | "URI" | "SECRET"

export interface WorkflowInput {
  id: string
  type: WorkflowInputType
  displayName?: string
  description?: string
  required?: boolean
  defaults?: unknown
  values?: string[]               // SELECT/MULTISELECT 的选项
  allowCustomValue?: boolean
  itemType?: string               // ARRAY 的元素类型
  allowedFileExtensions?: string[]
  validator?: { regex: string; message: string }
}

// ----- Variable 类型 -----
export type VariableType = "STRING" | "NUMBER" | "BOOLEAN" | "JSON"

export interface WorkflowVariable {
  key: string
  value: string
  type: VariableType
  description?: string
}

// ========== 插件目录 ==========

export interface PluginEntry {
  type: string                    // Kestra 全名
  name: string                    // 中文名称
  category: "flow" | "http" | "script" | "jdbc" | "serdes" | "storage" | "other"
  defaultSpec?: Record<string, unknown>
}

export const PLUGIN_CATALOG: PluginEntry[] = [
  {
    type: "io.kestra.plugin.core.log.Log",
    name: "打印日志",
    category: "flow",
    defaultSpec: { message: "Hello from Weave" },
  },
  {
    type: "io.kestra.plugin.core.http.Request",
    name: "HTTP 请求",
    category: "http",
    defaultSpec: { uri: "https://api.example.com", method: "GET" },
  },
  {
    type: "io.kestra.plugin.core.http.Download",
    name: "HTTP 下载",
    category: "http",
    defaultSpec: { uri: "https://example.com/file.csv" },
  },
  {
    type: "io.kestra.plugin.core.jdbc.Query",
    name: "JDBC 查询",
    category: "jdbc",
    defaultSpec: { url: "jdbc:postgresql://localhost:5432/db", sql: "SELECT 1" },
  },
  {
    type: "io.kestra.plugin.scripts.shell.Script",
    name: "Shell 脚本",
    category: "script",
    defaultSpec: { script: "echo 'Hello'" },
  },
  {
    type: "io.kestra.plugin.scripts.python.Script",
    name: "Python 脚本",
    category: "script",
    defaultSpec: { script: "print('Hello')" },
  },
  {
    type: "io.kestra.plugin.scripts.node.Script",
    name: "Node.js 脚本",
    category: "script",
    defaultSpec: { script: "console.log('Hello')" },
  },
  {
    type: "io.kestra.plugin.core.storage.LocalFiles",
    name: "本地文件",
    category: "storage",
    defaultSpec: {},
  },
]

// ========== 颜色映射 ==========

export type PluginCategory = "flow" | "http" | "script" | "jdbc" | "serdes" | "storage" | "other"

export const CATEGORY_COLORS = {
  flow:    "#818cf8",  // 紫色
  http:    "#3b82f6",  // 蓝色
  script:  "#22c55e",  // 绿色
  jdbc:    "#f59e0b",  // 橙色
  serdes:  "#06b6d4",  // 青色
  storage: "#6b7280",  // 灰色
  other:   "#6366f1",  // 靛蓝
} satisfies Record<PluginCategory, string>

// 根据节点 type 获取颜色
export function getNodeColor(type: string): string {
  if (type.includes(".flow.")) return CATEGORY_COLORS.flow
  if (type.includes(".http.")) return CATEGORY_COLORS.http
  if (type.includes(".scripts.")) return CATEGORY_COLORS.script
  if (type.includes(".jdbc.")) return CATEGORY_COLORS.jdbc
  if (type.includes(".serdes.")) return CATEGORY_COLORS.serdes
  if (type.includes(".storage.")) return CATEGORY_COLORS.storage
  return CATEGORY_COLORS.other
}

// 边样式
export const EDGE_STYLES: Record<EdgeType, { stroke: string; strokeWidth: number; strokeDasharray?: string }> = {
  sequence:    { stroke: "#6366f1", strokeWidth: 2 },
  containment: { stroke: "#9ca3af", strokeWidth: 2, strokeDasharray: "5,5" },
  then:        { stroke: "#22c55e", strokeWidth: 2 },
  else:        { stroke: "#ef4444", strokeWidth: 2 },
  case:        { stroke: "#3b82f6", strokeWidth: 2 },
  errors:      { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5,5" },
  finally:     { stroke: "#9ca3af", strokeWidth: 2, strokeDasharray: "5,5" },
}
