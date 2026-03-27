/**
 * kestra-client.ts — Kestra SDK 客户端 + 便捷方法
 *
 * 暴露两层 API：
 * 1. `getKestraClient()` — 返回官方 SDK 实例（需要手动传 tenant）
 * 2. `kestra()` — 返回预绑定 tenant 的便捷封装（推荐日常使用）
 *
 * 认证方式（按优先级）：
 * 1. KESTRA_TOKEN — Bearer Token（推荐，Service Account / API Token）
 * 2. KESTRA_USERNAME + KESTRA_PASSWORD — Basic Auth（回退）
 */

import SdkClient from "@kestra-io/kestra-sdk"
import type Execution from "@kestra-io/kestra-sdk/dist/model/Execution"
import type ExecutionControllerExecutionResponse from "@kestra-io/kestra-sdk/dist/model/ExecutionControllerExecutionResponse"
import type FlowWithSource from "@kestra-io/kestra-sdk/dist/model/FlowWithSource"
import { propagation, context, withSpan } from "./tracing.js"
import type { KestraLogPage } from "./kestra-types.js"

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

/** 将 SDK 抛出的错误转为 KestraError */
export function toKestraError(err: unknown): never {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as Record<string, unknown>).status === "number"
  ) {
    const e = err as { status: number; body?: unknown }
    throw new KestraError(
      e.status,
      typeof e.body === "string" ? e.body : JSON.stringify(e.body),
    )
  }
  throw err
}

import { isTerminalState } from "@weave/shared"
export { isTerminalState }

// ========== State ==========

let sdk: InstanceType<typeof SdkClient> | null = null
let _tenant = "main"
let _url = ""
let _authHeader = ""

function ensureInit() {
  if (sdk) return
  const url = process.env.KESTRA_URL
  const token = process.env.KESTRA_TOKEN
  const username = process.env.KESTRA_USERNAME
  const password = process.env.KESTRA_PASSWORD
  _tenant = process.env.KESTRA_TENANT || "main"

  if (!url) throw new Error("Missing KESTRA_URL environment variable")
  if (!token && !(username && password))
    throw new Error("Missing authentication: set KESTRA_TOKEN (recommended) or KESTRA_USERNAME + KESTRA_PASSWORD")

  _url = url
  _authHeader = token
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`

  sdk = new SdkClient(url, token ?? "", username ?? "", password ?? "")
}

// ========== SDK 原始实例 ==========

export function getKestraClient(): InstanceType<typeof SdkClient> {
  ensureInit()
  return sdk!
}

// ========== 便捷封装（预绑定 tenant，单例） ==========

let _kestra: ReturnType<typeof createKestra> | null = null

function createKestra() {
  const c = sdk!
  const t = _tenant

  return {
    // ─── Flow ───
    flows: {
      create: (yaml: string): Promise<FlowWithSource> =>
        withSpan("Kestra flows.create", {}, () =>
          c.flowsApi.createFlow(t, yaml).catch(toKestraError)),
      get: (ns: string, id: string): Promise<FlowWithSource> =>
        withSpan("Kestra flows.get", {}, () =>
          c.flowsApi.flow(ns, id, false, false, t).catch(toKestraError)),
      delete: (ns: string, id: string): Promise<void> =>
        withSpan("Kestra flows.delete", {}, () =>
          c.flowsApi.deleteFlow(ns, id, t).catch(toKestraError)),
    },

    // ─── Execution ───
    executions: {
      trigger: (ns: string, id: string, inputs?: Record<string, string>): Promise<ExecutionControllerExecutionResponse> =>
        withSpan("Kestra executions.trigger", {}, () =>
          c.executionsApi.createExecution(ns, id, false, t, {}, inputs).catch(toKestraError)),
      get: (execId: string): Promise<Execution> =>
        withSpan("Kestra executions.get", {}, () =>
          c.executionsApi.execution(execId, t).catch(toKestraError)),
      kill: (execId: string): Promise<void> =>
        withSpan("Kestra executions.kill", {}, () =>
          c.executionsApi.killExecution(execId, false, t).catch(toKestraError)),
      restart: (execId: string): Promise<Execution> =>
        withSpan("Kestra executions.restart", {}, () =>
          c.executionsApi.restartExecution(execId, t).catch(toKestraError)),
      replay: (execId: string, taskRunId: string): Promise<Execution> =>
        withSpan("Kestra executions.replay", {}, () =>
          c.executionsApi.replayExecution(execId, t, { taskRunId }).catch(toKestraError)),
      /** SDK 未覆盖：带 state 过滤的列表查询 */
      list: (params: { namespace: string; flowId: string; state?: string[]; size?: number; page?: number }) => {
        const qs = new URLSearchParams({
          namespace: params.namespace,
          flowId: params.flowId,
          size: String(params.size ?? 20),
          page: String(params.page ?? 0),
        })
        if (params.state) for (const s of params.state) qs.append("state", s)
        return rawRequest("GET", `/api/v1/${t}/executions?${qs}`)
      },
    },

    // ─── Health ───
    health: {
      check: () => rawRequest("GET", `/api/v1/${t}/healthcheck`).then(() => true).catch(() => false),
      detailed: async (): Promise<{ healthy: boolean; error?: string }> => {
        try {
          await rawRequest("GET", `/api/v1/${t}/healthcheck`)
          return { healthy: true }
        } catch (err) {
          if (err instanceof KestraError) return { healthy: false, error: `HTTP ${err.statusCode}: ${err.responseBody}` }
          if (err instanceof TypeError && err.message.includes("fetch")) return { healthy: false, error: `无法连接到 ${_url}` }
          return { healthy: false, error: err instanceof Error ? err.message : "未知错误" }
        }
      },
    },

    // ─── Logs（SDK 未覆盖）───
    logs: {
      get: (execId: string, params?: { taskRunId?: string; minLevel?: string }): Promise<KestraLogPage> => {
        const qs = new URLSearchParams()
        if (params?.taskRunId) qs.set("taskRunId", params.taskRunId)
        if (params?.minLevel) qs.set("minLevel", params.minLevel)
        return rawRequest("GET", `/api/v1/${t}/logs/${execId}${qs.size > 0 ? "?" + qs : ""}`)
      },
    },

    // ─── 原始请求（SDK 未覆盖的接口，如旧版 Variables API）───
    raw: rawRequest,
  }
}

/** Kestra API 便捷封装（单例），自动处理 tenant */
export function kestra() {
  if (!_kestra) {
    ensureInit()
    _kestra = createKestra()
  }
  return _kestra
}

// ========== 原始请求 ==========

export async function rawRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  contentType = "application/json",
): Promise<T> {
  ensureInit()
  return withSpan(
    `Kestra ${method} ${path}`,
    {
      "http.request.method": method,
      "url.full": `${_url}${path}`,
      "server.address": new URL(_url).hostname,
    },
    async () => {
      const url = `${_url}${path}`
      const headers: Record<string, string> = { Authorization: _authHeader }
      if (contentType) headers["Content-Type"] = contentType
      propagation.inject(context.active(), headers)

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
    },
  )
}
