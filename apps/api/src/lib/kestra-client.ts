/**
 * kestra-client.ts — Kestra API 客户端（单例）
 *
 * 代理所有 Kestra API 调用，Basic Auth 认证。
 * 浏览器永远不直接接触 Kestra。
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

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.url}${path}`

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(),
      },
      body: body ? JSON.stringify(body) : undefined,
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
      await this.request("GET", "/api/v1/health")
      return true
    } catch {
      return false
    }
  }

  async healthCheckDetailed(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.request("GET", "/api/v1/health")
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

  async upsertFlow(namespace: string, flowId: string, yaml: string): Promise<KestraFlow> {
    // Kestra PUT API: body 只需要 id + namespace + source
    return this.request("PUT", `/api/v1/flows/${namespace}/${flowId}`, {
      id: flowId,
      namespace,
      source: yaml,
    })
  }

  async getFlow(namespace: string, flowId: string): Promise<KestraFlow> {
    return this.request("GET", `/api/v1/flows/${namespace}/${flowId}`)
  }

  async deleteFlow(namespace: string, flowId: string): Promise<void> {
    await this.request("DELETE", `/api/v1/flows/${namespace}/${flowId}`)
  }

  // ─── Execution ───

  async triggerExecution(
    namespace: string,
    flowId: string,
    inputs?: Record<string, string>,
  ): Promise<KestraExecution> {
    const qs = inputs ? "?" + new URLSearchParams(inputs).toString() : ""
    return this.request("POST", `/api/v1/executions/${namespace}/${flowId}${qs}`)
  }

  async getExecution(executionId: string): Promise<KestraExecution> {
    return this.request("GET", `/api/v1/executions/${executionId}`)
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
    return this.request("GET", `/api/v1/executions?${qs}`)
  }

  async killExecution(executionId: string): Promise<void> {
    await this.request("DELETE", `/api/v1/executions/${executionId}`)
  }

  async retryExecution(executionId: string): Promise<KestraExecution> {
    return this.request("POST", `/api/v1/executions/${executionId}/retry`)
  }

  async replayExecution(
    executionId: string,
    taskRunId: string,
    latestRevision = true,
  ): Promise<KestraExecution> {
    return this.request(
      "POST",
      `/api/v1/executions/${executionId}/replay/${taskRunId}`,
      { latestRevision },
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
      `/api/v1/logs/${executionId}${qs.size > 0 ? "?" + qs : ""}`,
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

    if (!url || !username || !password) {
      throw new Error("Missing KESTRA_URL / KESTRA_USERNAME / KESTRA_PASSWORD environment variables")
    }

    instance = new KestraClient({ url, username, password })
  }
  return instance
}
