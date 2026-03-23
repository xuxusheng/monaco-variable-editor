// types/container.ts — 容器类型常量与工具函数

export const CONTAINER_TYPES = new Set([
  "io.kestra.plugin.core.flow.ForEach",
  "io.kestra.plugin.core.flow.ForEachItem",
  "io.kestra.plugin.core.flow.If",
  "io.kestra.plugin.core.flow.Switch",
  "io.kestra.plugin.core.flow.Parallel",
  "io.kestra.plugin.core.flow.Sequential",
])

export function isContainer(type: string): boolean {
  return CONTAINER_TYPES.has(type)
}

/** 容器类型的短名（ForEach, If, Switch ...） */
export function getContainerShortName(type: string): string {
  return type.split(".").pop() ?? type
}

/** 容器的子任务字段名（Kestra YAML 中的 key） */
export function getChildFieldName(type: string): string {
  const short = type.split(".").pop()
  switch (short) {
    case "If":
      return "then/else"
    case "Switch":
      return "cases"
    default:
      return "tasks"
  }
}

/** 容器节点的输出 Handle 配置 */
export interface OutputHandle {
  id: string
  label: string
  color: string
}

/** 获取容器节点的输出 Handle 列表 */
export function getOutputHandles(type: string, spec?: Record<string, unknown>): OutputHandle[] {
  const short = type.split(".").pop()
  switch (short) {
    case "If":
      return [
        { id: "then", label: "then", color: "#22c55e" },
        { id: "else", label: "else", color: "#ef4444" },
      ]
    case "Switch": {
      const cases = spec?.cases as Record<string, unknown> | undefined
      if (!cases || Object.keys(cases).length === 0) {
        return [{ id: "default", label: "default", color: "#6366f1" }]
      }
      const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]
      return Object.keys(cases).map((key, i) => ({
        id: key,
        label: key,
        color: colors[i % colors.length],
      }))
    }
    default:
      return [{ id: "sequence", label: "", color: "#6366f1" }]
  }
}
