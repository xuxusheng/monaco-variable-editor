# M5 技术设计文档 — 触发器与调度

> **目标**：工作流能定时跑、能被外部系统触发。Trigger 管理界面完整可用。
> **前置**：M4 已完成（Kestra 集成、执行监控、Replay）
> **关键依赖**：M4 的 KestraClient + WorkflowTrigger 表已就绪

---

## 1. M5 范围界定

### 做
| 模块 | 说明 |
|------|------|
| Schedule Trigger | 创建 Cron 定时触发器，推 Kestra Schedule flow |
| Webhook Trigger | 创建 Webhook 触发器，暴露 HTTP endpoint 触发执行 |
| Trigger 管理 UI | 前端面板：创建、编辑、启停、删除触发器 |
| 生产执行记录 | WorkflowExecution 表启用（关联 Release，不再是空壳） |
| 触发执行同步 | Kestra 触发的执行自动写入 WorkflowExecution |
| Trigger 状态展示 | 画布工具栏显示触发器状态（已配置/运行中/已禁用） |

### 不做
| 项目 | 原因 |
|------|------|
| Secrets/Variables 管理 | M6 做 |
| 生产 Replay 带权限控制 | V2 做 |
| 回调通知（Kestra → 平台 webhook） | 后续扩展 |
| 多触发器条件组合 | V2 做 |

---

## 2. 数据模型

### 2.1 WorkflowTrigger（已有，M5 启用）

```prisma
model WorkflowTrigger {
  id            String   @id @default(cuid())
  workflowId    String
  name          String
  type          String   // "schedule" | "webhook"
  config        Json     // type-specific 配置
  inputs        Json     @default("{}")
  kestraFlowId  String   // Kestra 上的 flow ID
  disabled      Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

#### config 字段约定

**schedule 类型：**
```json
{
  "cron": "0 */6 * * *",     // Cron 表达式
  "timezone": "Asia/Shanghai",
  "backfill": false          // 是否补跑错过的执行
}
```

**webhook 类型：**
```json
{
  "secret": "random-uuid",   // Webhook 鉴权密钥
  "allowedOrigins": ["*"]    // 允许的来源（V2 做精细控制）
}
```

### 2.2 WorkflowExecution（已有，M5 启用）

```prisma
model WorkflowExecution {
  id            String            @id @default(cuid())
  workflowId    String
  releaseId     String            // 关联发布版本
  kestraExecId  String
  inputValues   Json              @default("{}")
  state         String
  taskRuns      Json              @default("[]")
  triggeredBy   String            @default("manual")
  startedAt     DateTime?
  endedAt       DateTime?
  createdAt     DateTime          @default(now())

  workflow      Workflow          @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  release       WorkflowRelease   @relation(fields: [releaseId], references: [id])
}
```

---

## 3. 后端设计

### 3.1 Kestra 触发器模型

Kestra 原生支持两种触发机制：

**Schedule Trigger（内置于 Flow）：**
在 flow YAML 中声明 `triggers` 块：
```yaml
id: my-workflow
namespace: company.team
triggers:
  - id: daily_schedule
    type: io.kestra.plugin.core.trigger.Schedule
    cron: "0 9 * * *"
    timezone: Asia/Shanghai
tasks:
  - id: step1
    type: io.kestra.plugin.core.log.Log
    message: "Triggered by schedule"
```

**Webhook Trigger（内置于 Flow）：**
```yaml
triggers:
  - id: webhook
    type: io.kestra.plugin.core.trigger.Webhook
    key: "{{secret}}"
    conditions:
      - type: io.kestra.plugin.core.condition.ExpressionCondition
        expression: "{{ trigger.body is not null }}"
```

**关键决策**：每个 Trigger 在 Kestra 上对应一个独立 flow。

| 触发器 | Kestra Flow ID | 说明 |
|--------|---------------|------|
| Schedule | `__trigger_{workflowId}_{triggerId}` | 包含原 workflow 的 tasks + schedule trigger |
| Webhook | `__trigger_{workflowId}_{triggerId}` | 包含原 workflow 的 tasks + webhook trigger |

### 3.2 tRPC API 扩展

```
workflow.triggerCreate     — 已有，M5 增加 Kestra flow 推送
workflow.triggerUpdate     — 已有，M5 增加 Kestra flow 更新
workflow.triggerDelete     — 已有，M5 增加 Kestra flow 删除
workflow.triggerToggle     — 新增，启用/禁用触发器
workflow.triggerTest       — 新增，手动触发一次（测试用）
workflow.productionExecList — 新增，获取生产执行记录
workflow.productionExecGet — 新增，获取单条生产执行详情
```

#### 3.2.1 triggerCreate 增强

```typescript
triggerCreate: t.procedure
  .input(z.object({
    workflowId: z.string(),
    name: z.string().min(1).max(100),
    type: z.enum(["schedule", "webhook"]),
    config: z.record(z.unknown()),
    inputs: z.record(z.string()).optional(),
  }))
  .mutation(async ({ input }) => {
    // 1. 查 Workflow + namespace + 最新 Release
    const wf = await prisma.workflow.findUnique({
      where: { id: input.workflowId },
      include: { namespace: true, releases: { orderBy: { version: "desc" }, take: 1 } },
    })
    if (!wf) throw new TRPCError({ code: "NOT_FOUND" })
    if (wf.releases.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "请先发布一个版本再创建触发器",
      })
    }

    // 2. 生成 trigger YAML
    const release = wf.releases[0]!
    const triggerFlowId = `__trigger_${wf.id}_${nameToSlug(input.name)}`
    const triggerYaml = buildTriggerFlow({
      namespace: wf.namespace.kestraNamespace,
      flowId: triggerFlowId,
      baseYaml: release.yaml,
      triggerType: input.type,
      triggerConfig: input.config,
    })

    // 3. 推 Kestra
    try {
      const client = getKestraClient()
      await client.upsertFlow(wf.namespace.kestraNamespace, triggerFlowId, triggerYaml)
    } catch {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "推 Kestra 失败，请检查连接",
      })
    }

    // 4. 写数据库
    return prisma.workflowTrigger.create({
      data: {
        workflowId: input.workflowId,
        name: input.name,
        type: input.type,
        config: input.config as Prisma.InputJsonValue,
        inputs: (input.inputs ?? {}) as Prisma.InputJsonValue,
        kestraFlowId: triggerFlowId,
      },
    })
  })
```

#### 3.2.2 triggerToggle（启用/禁用）

```typescript
triggerToggle: t.procedure
  .input(z.object({ id: z.string(), disabled: z.boolean() }))
  .mutation(async ({ input }) => {
    const trigger = await prisma.workflowTrigger.findUnique({
      where: { id: input.id },
      include: { workflow: { include: { namespace: true } } },
    })
    if (!trigger) throw new TRPCError({ code: "NOT_FOUND" })

    // 禁用：删除 Kestra flow（schedule/webhook 不再触发）
    // 启用：重新推送 Kestra flow
    if (input.disabled) {
      try {
        const client = getKestraClient()
        await client.deleteFlow(trigger.workflow.namespace.kestraNamespace, trigger.kestraFlowId)
      } catch { /* best-effort */ }
    } else {
      // 重新生成 YAML 并推送
      // ...（复用 triggerCreate 的 YAML 生成逻辑）
    }

    return prisma.workflowTrigger.update({
      where: { id: input.id },
      data: { disabled: input.disabled },
    })
  })
```

#### 3.2.3 Webhook Endpoint

**方案**：后端暴露 webhook 代理 endpoint，转发到 Kestra。

```
POST /api/webhook/:workflowId/:triggerName
```

```typescript
// 在 index.ts 中添加
app.post("/api/webhook/:workflowId/:triggerName", async (c) => {
  const { workflowId, triggerName } = c.req.param()

  const trigger = await prisma.workflowTrigger.findFirst({
    where: {
      workflowId,
      name: triggerName,
      type: "webhook",
      disabled: false,
    },
    include: { workflow: { include: { namespace: true } } },
  })
  if (!trigger) return c.json({ error: "Trigger not found" }, 404)

  // 验证 secret
  const secret = c.req.header("X-Webhook-Secret")
  const config = trigger.config as { secret?: string }
  if (config.secret && secret !== config.secret) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  try {
    const client = getKestraClient()
    const body = await c.req.json().catch(() => ({}))
    const execution = await client.triggerExecution(
      trigger.workflow.namespace.kestraNamespace,
      trigger.kestraFlowId,
      body as Record<string, string>,
    )

    // 异步写入 WorkflowExecution
    prisma.workflowExecution.create({
      data: {
        workflowId: trigger.workflowId,
        releaseId: trigger.workflow.releases[0]?.id ?? "",
        kestraExecId: execution.id,
        inputValues: body as Prisma.InputJsonValue,
        state: execution.state.current,
        taskRuns: (execution.taskRunList ?? []) as Prisma.InputJsonValue,
        triggeredBy: `webhook:${triggerName}`,
      },
    }).catch(() => {})

    return c.json({ executionId: execution.id, state: execution.state.current })
  } catch {
    return c.json({ error: "Kestra trigger failed" }, 502)
  }
})
```

#### 3.2.4 生产执行同步

在 `syncRunningExecutions` 定时任务中，同时同步 `WorkflowExecution`：

```typescript
// 同步生产执行
const prodRunning = await prisma.workflowExecution.findMany({
  where: { state: { notIn: TERMINAL_STATES } },
})
// ... 与 draft 执行相同的同步逻辑
```

#### 3.2.5 KestraClient 扩展

```typescript
// kestra-client.ts 新增
async deleteFlow(namespace: string, flowId: string): Promise<void> {
  await this.request("DELETE", `/api/v1/flows/${namespace}/${flowId}`)
}
```

### 3.3 Trigger YAML 生成器

新建 `apps/api/src/lib/trigger-yaml.ts`：

```typescript
interface BuildTriggerFlowOpts {
  namespace: string
  flowId: string
  baseYaml: string          // 原始 workflow YAML
  triggerType: "schedule" | "webhook"
  triggerConfig: Record<string, unknown>
}

export function buildTriggerFlow(opts: BuildTriggerFlowOpts): string {
  const { namespace, flowId, baseYaml, triggerType, triggerConfig } = opts

  // 解析 base YAML，提取 tasks
  const base = parseYaml(baseYaml)

  let triggerBlock: string
  if (triggerType === "schedule") {
    triggerBlock = [
      "triggers:",
      "  - id: schedule",
      "    type: io.kestra.plugin.core.trigger.Schedule",
      `    cron: "${triggerConfig.cron ?? "0 0 * * *"}"`,
      `    timezone: "${triggerConfig.timezone ?? "Asia/Shanghai"}"`,
    ].join("\n")
  } else {
    triggerBlock = [
      "triggers:",
      "  - id: webhook",
      "    type: io.kestra.plugin.core.trigger.Webhook",
      `    key: "${triggerConfig.secret ?? ""}"`,
    ].join("\n")
  }

  // 重新组装 YAML（保留 tasks，替换 id/namespace，添加 trigger）
  return [
    `id: ${flowId}`,
    `namespace: ${namespace}`,
    "",
    "// Auto-generated trigger wrapper — DO NOT EDIT",
    "// Managed by Weave trigger management",
    "",
    ...baseYaml
      .split("\n")
      .filter(l => !l.startsWith("id:") && !l.startsWith("namespace:")),
    "",
    triggerBlock,
  ].join("\n")
}
```

---

## 4. 前端设计

### 4.1 新增组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `TriggerPanel` | `components/flow/TriggerPanel.tsx` | 触发器管理面板（右侧面板） |
| `TriggerCreateForm` | `components/flow/TriggerCreateForm.tsx` | 创建/编辑触发器表单 |
| `TriggerList` | `components/flow/TriggerList.tsx` | 触发器列表 + 操作按钮 |
| `ProductionExecHistory` | `components/flow/ProductionExecHistory.tsx` | 生产执行历史（区别于 draft） |

### 4.2 Trigger 管理面板

```
┌──────────────────────────────────┐
│ ⚡ 触发器管理              [关闭] │
├──────────────────────────────────┤
│                                  │
│ [+ 创建触发器]                   │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ ⏰ 每日 9:00 执行       [⋯]  │ │
│ │    schedule · cron: 0 9 * * *│ │
│ │    最近执行: 2026-03-22 09:00 │ │
│ │    状态: 🟢 运行中            │ │
│ │    [启/停] [编辑] [删除]      │ │
│ └──────────────────────────────┘ │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ 🔗 支付回调 webhook     [⋯]  │ │
│ │    webhook · POST /api/...   │ │
│ │    最近触发: 5 分钟前         │ │
│ │    状态: 🟢 启用              │ │
│ │    [启/停] [复制 URL] [删除]  │ │
│ └──────────────────────────────┘ │
│                                  │
│ ── 执行历史 ──────────────────   │
│ [tab: Draft] [tab: Production]   │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ 🟢 03-22 09:00 schedule:... │ │
│ │ 🟢 03-21 09:00 schedule:... │ │
│ │ 🔴 03-20 09:00 FAILED       │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### 4.3 创建触发器表单

**Schedule 类型：**
```
触发器名称: [每日早会数据同步          ]
类型: ○ Schedule  ○ Webhook

── Schedule 配置 ──────────────
Cron 表达式: [0 9 * * *          ]
时区:        [Asia/Shanghai ▾    ]
预览执行时间:
  · 下次: 2026-03-22 09:00 CST
  · 再下次: 2026-03-23 09:00 CST

基于版本: v1 "初始发布" ▾

[取消]  [创建]
```

**Webhook 类型：**
```
触发器名称: [支付回调处理          ]
类型: ○ Schedule  ○ Webhook

── Webhook 配置 ──────────────
Secret: [自动生成 ████████████    ] [🔄 重新生成]
允许来源: ○ 全部  ○ 自定义

Webhook URL（创建后可用）:
  POST https://weave.xuxusheng.com/api/webhook/{workflowId}/{name}

基于版本: v1 "初始发布" ▾

[取消]  [创建]
```

### 4.4 store 扩展

```typescript
// workflow.ts 新增
interface TriggerSummary {
  id: string
  name: string
  type: "schedule" | "webhook"
  config: Record<string, unknown>
  kestraFlowId: string
  disabled: boolean
  createdAt: string
}

interface ProductionExecSummary {
  id: string
  kestraExecId: string
  state: string
  taskRuns: TaskRun[]
  triggeredBy: string
  createdAt: string
}

// WorkflowState 新增
triggers: TriggerSummary[]
productionExecutions: ProductionExecSummary[]
setTriggers: (triggers: TriggerSummary[]) => void
setProductionExecutions: (execs: ProductionExecSummary[]) => void
```

### 4.5 工具栏集成

在画布工具栏添加触发器按钮：
```
[⚡ 触发器 (2)] — 点击打开 TriggerPanel
```

右侧面板枚举扩展：
```typescript
type RightPanel = "none" | "task" | "inputs" | "yaml" 
  | "drafts" | "releases" | "executions" | "triggers" | "prod-executions"
```

### 4.6 Webhook 复制功能

Webhook 类型触发器提供「复制 URL」按钮：
```
URL: POST https://weave.xuxusheng.com/api/webhook/{workflowId}/{triggerName}
Header: X-Webhook-Secret: {secret}

[📋 复制 URL + Secret]
```

---

## 5. 数据流

### 5.1 创建 Schedule 触发器

```
用户填写表单 → triggerCreate API
  → 查询 Workflow + latest Release
  → 生成 trigger YAML（baseYaml + schedule trigger block）
  → KestraClient.upsertFlow(__trigger_xxx)
  → 写入 WorkflowTrigger
  → 前端刷新 triggerList
```

### 5.2 Schedule 触发执行

```
Kestra cron 到达 → Kestra 执行 __trigger_xxx flow
  → 后端 syncExecutions 检测到新执行
  → 创建 WorkflowExecution 记录
  → state 轮询同步直到终态
  → 前端 TriggerPanel 展示执行历史
```

### 5.3 Webhook 触发执行

```
外部系统 → POST /api/webhook/:workflowId/:triggerName
  → 验证 X-Webhook-Secret
  → KestraClient.triggerExecution(__trigger_xxx)
  → 异步创建 WorkflowExecution
  → 返回 { executionId, state }
  → 前端通过 syncExecutions 获取最终结果
```

### 5.4 禁用触发器

```
用户点击「停用」 → triggerToggle(disabled: true)
  → KestraClient.deleteFlow(__trigger_xxx)
  → 更新 WorkflowTrigger.disabled = true
  → Kestra 不再调度此 flow
```

---

## 6. 安全考虑

| 风险 | 缓解措施 |
|------|---------|
| Webhook 被恶意调用 | X-Webhook-Secret header 鉴权 |
| Secret 泄露 | 支持重新生成 secret + 更新 Kestra flow |
| 任意代码执行 | 触发器只能执行已发布的 workflow，不能修改 tasks |
| Kestra 不可达 | 创建/更新 trigger 时必须可达（hard fail），执行同步可 graceful degrade |
| 触发器数量爆炸 | V1 不限制，后续可加 per-workflow 上限 |

---

## 7. 实现顺序

| 步骤 | 内容 | 预计 |
|------|------|------|
| 7.1 | 后端：KestraClient 新增 deleteFlow | 10min |
| 7.2 | 后端：trigger-yaml.ts YAML 生成器 | 30min |
| 7.3 | 后端：triggerCreate/Update/Delete 增加 Kestra push | 30min |
| 7.4 | 后端：triggerToggle 端点 | 15min |
| 7.5 | 后端：webhook proxy endpoint | 30min |
| 7.6 | 后端：生产执行同步（定时任务扩展） | 15min |
| 7.7 | 后端：productionExecList/Get API | 20min |
| 7.8 | 前端：TriggerPanel + TriggerList 组件 | 45min |
| 7.9 | 前端：TriggerCreateForm（Schedule/Webhook 两种形态） | 45min |
| 7.10 | 前端：ProductionExecHistory 组件 | 30min |
| 7.11 | 前端：store 扩展 + 工具栏集成 | 20min |
| 7.12 | 前端：Webhook 复制 URL + Secret | 10min |
| 7.13 | 全量编译 + 代码审查 | 20min |

**总计约 5 小时**

---

## 8. 测试计划

### 手动测试
1. 创建 Schedule 触发器 → 验证 Kestra 上出现对应 flow
2. 等待 cron 到达 → 验证执行记录出现在 TriggerPanel
3. 创建 Webhook 触发器 → 用 curl 调用 webhook endpoint → 验证执行
4. 禁用触发器 → 验证 Kestra 上 flow 被删除
5. 启用触发器 → 验证 Kestra 上 flow 被重新推送
6. 删除触发器 → 验证 Kestra 上 flow 被删除

### 边界场景
- Kestra 不可达时创建触发器 → 应报错
- Webhook secret 错误 → 返回 401
- 触发器基于未发布的版本 → 应拒绝
- 同时有多个触发器 → 互不干扰

---

_画皮先生 · 2026-03-22_
