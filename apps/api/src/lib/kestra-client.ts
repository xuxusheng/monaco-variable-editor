/**
 * kestra-client.ts — Kestra API 客户端（单例）
 *
 * 代理所有 Kestra API 调用，Basic Auth 认证。
 * 浏览器永远不直接接触 Kestra。
 *
 * 兼容 Kestra 1.3.x（API 路径需 {tenant} 前缀）
 */

import type {
  KestraExecution,
  KestraExecutionPage,
  KestraFlow,
  KestraLogPage,
} from "./kestra-types.js"

// ========== Error ==========

export class KestraError extends Error {
  statusCode: number
  responseBody: string

  constructor(statusCode: number, responseBody: string) {
    super(`Kestra API error ${statusCode}: ${responseBody}`)
    this.name = "KestraError"
    this.statusCode = statusCode
    this.responseBody = responseBody
  }
}

// ========== Client ==========

export interface KestraConfig {
  url: string
  username: string
  password: string
  tenant: string
}

const TERMINAL_STATES = new Set([
  "SUCCESS",
  "WARNING",
  "FAILED",
  "KILLED",
  "CANCELLED",
  "RETRIED",
])

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state)
}

export class KestraClient {
  healthy = false
  config: KestraConfig

  constructor(config: KestraConfig) {
    this.config = config
  }

  authHeader(): string {
    return `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64")}`
  }

  /** Kestra 1.3.x API 基础路径 */
  get basePath(): string {
    return `/api/v1/${this.config.tenant}`
  }

  async request<T>(method: string, path: string, body?: unknown, contentType = "application/json"): Promise<T> {
    const url = `${this.config.url}${path}`

    const headers: Record<string, string> = {
      Authorization: this.authHeader(),
    }
    if (contentType) headers["Content-Type"] = contentType

    const res = await fetch(url, {
      method,
      headers,
      body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new KestraError(res.status, text)
    }

    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  // ─── Health ───

  async healthCheck(): Promise<boolean> {
    try {
      // Kestra 1.3.x 没有 /health，用 flows/search 代替
      await this.request("GET", `${this.basePath}/flows/search?size=1`)
      return true
    } catch {
      return false
    }
  }

  async healthCheckDetailed(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.request("GET", `${this.basePath}/flows/search?size=1`)
      return { healthy: true }
    } catch (err) {
      if (err instanceof KestraError) {
        return { healthy: false, error: `HTTP ${err.statusCode}: ${err.responseBody}` }
      }
      if (err instanceof TypeError && err.message.includes("fetch")) {
        return { healthy: false, error: `无法连接到 ${this.config.url}，请检查地址和网络` }
      }
      return { healthy: false, error: err instanceof Error ? err.message : "未知错误" }
    }
  }

  isHealthy(): boolean {
    return this.healthy
  }

  async refreshHealth(): Promise<boolean> {
    this.healthy = await this.healthCheck()
    return this.healthy
  }

  // ─── Flow ───

  async upsertFlow(_namespace: string, _flowId: string, yaml: string): Promise<KestraFlow> {
    // Kestra 1.3.x: POST /api/v1/{tenant}/flows 用 YAML 创建/更新
    // namespace 和 flowId 在 YAML body 中指定，参数保留用于兼容
    return this.request("POST", `${this.basePath}/flows`, yaml, "application/x-yaml")
  }

  async getFlow(namespace: string, flowId: string): Promise<KestraFlow> {
    return this.request("GET", `${this.basePath}/flows/${namespace}/${flowId}`)
  }

  async deleteFlow(namespace: string, flowId: string): Promise<void> {
    await this.request("DELETE", `${this.basePath}/flows/${namespace}/${flowId}`)
  }

  // ─── Execution ───

  async triggerExecution(
    namespace: string,
    flowId: string,
    inputs?: Record<string, string>,
  ): Promise<KestraExecution> {
    const qs = inputs ? "?" + new URLSearchParams(inputs).toString() : ""
    return this.request("POST", `${this.basePath}/executions/${namespace}/${flowId}${qs}`)
  }

  async getExecution(executionId: string): Promise<KestraExecution> {
    return this.request("GET", `${this.basePath}/executions/${executionId}`)
  }

  async listExecutions(params: {
    namespace: string
    flowId: string
    state?: string[]
    size?: number
    page?: number
  }): Promise<KestraExecutionPage> {
    const qs = new URLSearchParams({
      namespace: params.namespace,
      flowId: params.flowId,
      size: String(params.size ?? 20),
      page: String(params.page ?? 0),
    })
    if (params.state) {
      for (const s of params.state) qs.append("state", s)
    }
    return this.request("GET", `${this.basePath}/executions?${qs}`)
  }

  async killExecution(executionId: string): Promise<void> {
    await this.request("DELETE", `${this.basePath}/executions/${executionId}/kill`)
  }

  async retryExecution(executionId: string): Promise<KestraExecution> {
    return this.request("POST", `${this.basePath}/executions/${executionId}/restart`)
  }

  async replayExecution(
    executionId: string,
    taskRunId: string,
    latestRevision = true,
  ): Promise<KestraExecution> {
    return this.request(
      "POST",
      `${this.basePath}/executions/${executionId}/replay`,
      { taskRunId, latestRevision },
    )
  }

  // ─── Logs ───

  async getExecutionLogs(
    executionId: string,
    params?: { taskRunId?: string; minLevel?: string },
  ): Promise<KestraLogPage> {
    const qs = new URLSearchParams()
    if (params?.taskRunId) qs.set("taskRunId", params.taskRunId)
    if (params?.minLevel) qs.set("minLevel", params.minLevel)
    return this.request(
      "GET",
      `${this.basePath}/logs/${executionId}${qs.size > 0 ? "?" + qs : ""}`,
    )
  }
}

// ========== Singleton ==========

let instance: KestraClient | null = null

export function getKestraClient(): KestraClient {
  if (!instance) {
    const url = process.env.KESTRA_URL
    const username = process.env.KESTRA_USERNAME
    const password = process.env.KESTRA_PASSWORD
    const tenant = process.env.KESTRA_TENANT || "main"

    if (!url || !username || !password) {
      throw new Error("Missing KESTRA_URL / KESTRA_USERNAME / KESTRA_PASSWORD environment variables")
    }

    instance = new KestraClient({ url, username, password, tenant })
  }
  return instance
}
