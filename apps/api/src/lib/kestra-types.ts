/**
 * kestra-types.ts — Kestra API 响应类型定义
 */

export interface KestraLogEntry {
  timestamp: string
  level: string
  message: string
  thread?: string
  taskRunId?: string
  task?: string
}

export interface KestraLogPage {
  results: KestraLogEntry[]
  total: number
}
