# M3 技术设计文档 — 持久化与版本管理

> **目标**：工作流可保存、可发布、可回滚、可转换 YAML。
> **前置**：M2 已完成（容器节点、多输出 Handle、折叠/展开、右键菜单）
> **后端零变更**：Workflow 表已有 nodes/edges/inputs/variables JSON 字段，WorkflowDraft/WorkflowRelease 需要新增数据库表

---

## 1. M3 范围界定

### 做
| 模块 | 说明 |
|------|------|
| 保存草稿 | `WorkflowDraft` 表，快照当前编辑状态 |
| 自动暂存 | 每 30s 检测变更，静默创建 Draft（message="自动暂存"） |
| 草稿历史列表 | 查看/回滚到历史保存 |
| 发布版本 | `WorkflowRelease` 表，版本号驱动，发布时预存 YAML |
| 版本历史列表 | 查看/回滚到历史版本 |
| YAML 转换层 | `toKestraYaml()` — 扁平 nodes/edges → Kestra 嵌套 YAML |
| YAML 导入 | `fromKestraYaml()` — Kestra YAML → 扁平 nodes/edges |
| YAML 预览面板 | 只读实时预览（已有 KestraYamlPanel，需重写） |
| 对比与 Diff | 草稿 vs 最新版本的差异可视化 |

### 不做
| 项目 | 原因 |
|------|------|
| 推送 Kestra | M4 做 |
| 测试运行 | M4 做 |
| Kestra 代理层 | M4 做 |
| 执行监控 | M4 做 |
| Trigger 系统 | M5 做 |

---

## 2. 数据库 Schema 变更

### 2.1 新增 WorkflowDraft 表

```prisma
model WorkflowDraft {
  id          String   @id @default(cuid())
  workflowId  String
  nodes       Json
  edges       Json
  inputs      Json
  variables   Json
  message     String?  // 保存说明（可选）
  createdAt   DateTime @default(now())

  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@index([workflowId, createdAt(sort: Desc)])
  @@map("workflow_drafts")
}
```

**说明**：
- 每次保存自动创建新快照，不覆盖旧的（时间驱动，无版本号）
- `message` 是可选的保存说明，用户填写
- 按时间降序索引，快速获取最新草稿
- `savedBy` 暂缺（无用户认证系统），M4 随用户系统补

### 2.2 新增 WorkflowRelease 表

```prisma
model WorkflowRelease {
  id          String   @id @default(cuid())
  workflowId  String
  version     Int      // 1, 2, 3... 自增
  name        String   // 版本名称，如 "v1.0 正式版"
  nodes       Json
  edges       Json
  inputs      Json
  variables   Json
  yaml        String   // 生成的 Kestra YAML
  publishedAt DateTime @default(now())
  createdAt   DateTime @default(now())

  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@unique([workflowId, version])
  @@index([workflowId, version(sort: Desc)])
  @@map("workflow_releases")
}
```

**说明**：
- 版本号 `version` 自增，与 `publishedVersion` 字段（当前 Workflow 上）配合
- `yaml` 字段存储发布时生成的 Kestra YAML，避免每次重新生成

### 2.3 Workflow 表变更

无需新增字段。现有 `publishedVersion` 字段（Int, default 0）已是最新发布版本号。

### 2.4 Prisma 迁移

```bash
cd apps/api
npx prisma migrate dev --name add_draft_and_release
```

---

## 3. YAML 双向转换（核心难点）

### 3.1 数据流设计

```
                    ┌─────────────────┐
                    │   Workflow 表    │
                    │  nodes/edges    │
                    │  (扁平存储)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ 画布渲染    │  │ toKestraYaml│  │ 保存草稿    │
     │ React Flow  │  │ 扁平 → 嵌套 │  │ 快照存储    │
     └────────────┘  └─────┬──────┘  └────────────┘
                           │
                    ┌──────▼──────┐
                    │ Kestra YAML │
                    │ (序列化产物) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ fromKestra  │
                    │ 嵌套 → 扁平  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ 画布渲染     │
                    │ (导入模式)   │
                    └─────────────┘
```

### 3.2 toKestraYaml() — 平台 → Kestra

**输入**：`nodes: WorkflowNode[]`, `edges: WorkflowEdge[]`, `inputs: WorkflowInput[]`, `variables: ApiWorkflowVariable[]`

**输出**：Kestra YAML 字符串

**核心算法**：

```typescript
function toKestraYaml(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  inputs: WorkflowInput[],
  variables: ApiWorkflowVariable[],
): string {
  const topLevel = nodes.filter(n => n.containerId === null)
    .sort((a, b) => a.sortIndex - b.sortIndex)

  const tasks = topLevel.map(n => convertTask(n, nodes, edges))

  const flow: Record<string, unknown> = {
    id: "workflow",  // 后续从 Workflow.flowId 取
    namespace: "company.team",  // 后续从 Namespace.kestraNamespace 取
  }

  if (inputs.length > 0) {
    flow.inputs = inputs.map(convertInput)
  }

  if (variables.length > 0) {
    flow.variables = Object.fromEntries(
      variables.map(v => [v.key, v.value])
    )
  }

  flow.tasks = tasks

  // 处理顶级的 errors/finally 边
  const topErrors = edges.filter(e => e.type === "errors" && nodes.find(n => n.id === e.source && n.containerId === null))
  const topFinally = edges.filter(e => e.type === "finally" && nodes.find(n => n.id === e.source && n.containerId === null))

  if (topErrors.length > 0) {
    flow.errors = topErrors.map(e => convertTask(
      nodes.find(n => n.id === e.target)!, nodes, edges
    ))
  }

  if (topFinally.length > 0) {
    flow.finally = topFinally.map(e => convertTask(
      nodes.find(n => n.id === e.target)!, nodes, edges
    ))
  }

  return YAML.stringify(flow, { lineWidth: 0 })
}

function convertTask(node: WorkflowNode, allNodes: WorkflowNode[], edges: WorkflowEdge[]): Record<string, unknown> {
  const base = {
    id: nameToSlug(node.name),
    type: node.type,
    ...(node.description ? { description: node.description } : {}),
    ...node.spec,
  }

  const shortType = node.type.split(".").pop()

  switch (shortType) {
    case "ForEach":
    case "Sequential":
    case "Parallel": {
      const children = getChildren(node.id, allNodes)
      const childTasks = children.map(c => convertTask(c, allNodes, edges))
      // children 内部的 sequence 边已经在 convertTask 递归中处理
      // 但如果 child 有 dependsOn（多入边），需要在 childTask 上设置
      for (const ct of childTasks) {
        const childNode = children.find(c => nameToSlug(c.name) === ct.id)!
        const seqEdges = edges.filter(e =>
          e.target === childNode.id &&
          e.type === "sequence" &&
          children.some(c => c.id === e.source)
        )
        if (seqEdges.length > 1) {
          ct.dependsOn = seqEdges.map(e => nameToSlug(
            allNodes.find(n => n.id === e.source)!.name
          ))
        }
      }
      return { ...base, tasks: childTasks }
    }

    case "If": {
      const children = getChildren(node.id, allNodes)
      const thenEdges = edges.filter(e => e.source === node.id && e.type === "then")
      const elseEdges = edges.filter(e => e.source === node.id && e.type === "else")

      const result: Record<string, unknown> = { ...base }

      if (thenEdges.length > 0) {
        result.then = thenEdges.map(e => {
          const target = allNodes.find(n => n.id === e.target)!
          return convertTask(target, allNodes, edges)
        })
      }

      if (elseEdges.length > 0) {
        result.else = elseEdges.map(e => {
          const target = allNodes.find(n => n.id === e.target)!
          return convertTask(target, allNodes, edges)
        })
      }

      return result
    }

    case "Switch": {
      const caseEdges = edges.filter(e => e.source === node.id && e.type === "case")
      const result: Record<string, unknown> = { ...base }

      // 按 label 分组（label = case 值）
      const caseGroups = new Map<string, string[]>()
      for (const ce of caseEdges) {
        const caseLabel = ce.label || "default"
        const targetSlug = nameToSlug(allNodes.find(n => n.id === ce.target)!.name)
        if (!caseGroups.has(caseLabel)) caseGroups.set(caseLabel, [])
        caseGroups.get(caseLabel)!.push(targetSlug)
      }

      result.cases = Object.fromEntries(caseGroups)

      return result
    }

    default: {
      // 普通节点：检查是否有 errors/finally
      const result: Record<string, unknown> = { ...base }

      const errorEdges = edges.filter(e => e.source === node.id && e.type === "errors")
      const finallyEdges = edges.filter(e => e.source === node.id && e.type === "finally")

      if (errorEdges.length > 0) {
        result.errors = errorEdges.map(e =>
          convertTask(allNodes.find(n => n.id === e.target)!, allNodes, edges)
        )
      }

      if (finallyEdges.length > 0) {
        result.finally = finallyEdges.map(e =>
          convertTask(allNodes.find(n => n.id === e.target)!, allNodes, edges)
        )
      }

      return result
    }
  }
}
```

### 3.3 fromKestraYaml() — Kestra → 平台

**输入**：Kestra YAML 字符串

**输出**：`{ nodes: WorkflowNode[], edges: WorkflowEdge[], inputs: WorkflowInput[] }`

**核心算法**：

```typescript
function fromKestraYaml(yamlStr: string): {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowInput[]
} {
  const flow = YAML.parse(yamlStr)
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []
  let sortIdx = 0

  // 转换顶级 tasks
  if (Array.isArray(flow.tasks)) {
    for (const task of flow.tasks) {
      flattenTask(task, null, sortIdx++, nodes, edges)
    }
  }

  // 转换顶级 errors/finally
  if (Array.isArray(flow.errors)) {
    for (const errTask of flow.errors) {
      flattenTask(errTask, null, sortIdx++, nodes, edges, "errors")
    }
  }

  if (Array.isArray(flow.finally)) {
    for (const finTask of flow.finally) {
      flattenTask(finTask, null, sortIdx++, nodes, edges, "finally")
    }
  }

  // 转换 inputs
  const inputs = (flow.inputs || []).map(convertFromKestraInput)

  // 自动布局
  autoLayout(nodes)

  return { nodes, edges, inputs }
}

function flattenTask(
  task: Record<string, unknown>,
  containerId: string | null,
  sortIndex: number,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  parentEdgeType?: string,
): string {
  const id = generateId()
  const node: WorkflowNode = {
    id,
    type: task.type as string,
    name: (task.name as string) || (task.id as string),
    description: task.description as string | undefined,
    containerId,
    sortIndex,
    spec: extractSpec(task),
    ui: { x: 0, y: 0 },  // autoLayout 会重新计算
  }
  nodes.push(node)

  // 如果有 parentEdgeType（errors/finally），创建边
  if (containerId && parentEdgeType && parentEdgeType !== "sequence" && parentEdgeType !== "containment") {
    edges.push({
      id: generateId(),
      source: containerId,
      target: id,
      type: parentEdgeType as any,
    })
  }

  // 容器节点：递归处理子任务
  const shortType = (task.type as string).split(".").pop()

  switch (shortType) {
    case "ForEach":
    case "Sequential":
    case "Parallel": {
      if (Array.isArray(task.tasks)) {
        let childSort = 0
        for (const child of task.tasks) {
          const childId = flattenTask(child, id, childSort++, nodes, edges)
          edges.push({
            id: generateId(),
            source: id,
            target: childId,
            type: "containment",
          })
        }
      }
      break
    }

    case "If": {
      if (Array.isArray(task.then)) {
        for (const t of task.then) {
          const childId = flattenTask(t, id, 0, nodes, edges)
          edges.push({
            id: generateId(),
            source: id,
            target: childId,
            type: "then",
          })
        }
      }
      if (Array.isArray(task.else)) {
        for (const t of task.else) {
          const childId = flattenTask(t, id, 1, nodes, edges)
          edges.push({
            id: generateId(),
            source: id,
            target: childId,
            type: "else",
          })
        }
      }
      break
    }

    case "Switch": {
      const cases = task.cases as Record<string, string[]> | undefined
      if (cases) {
        // Switch cases 在 Kestra YAML 中是 { caseLabel: [taskSlug1, taskSlug2] }
        // 需要解析：
        // 1. 遍历每个 caseLabel
        // 2. 找到每个 taskSlug 对应的完整 task 定义（在 flow.tasks 中按 id 匹配）
        // 3. 递归 flattenTask，containerId 设为当前 Switch 节点
        // 4. 创建 case 边（source=Switch, target=子节点, type="case", label=caseLabel）
        // TODO: 需要将 flow.tasks 平坦化为 Map<slugId, taskDef> 后才能解析
      }
      break
    }

    default: {
      // 普通节点的 errors/finally
      if (Array.isArray(task.errors)) {
        for (const err of task.errors) {
          flattenTask(err, containerId, sortIndex + 1, nodes, edges, "errors")
          // errors 边指向当前节点
          edges[edges.length - 1].source = id
        }
      }
      if (Array.isArray(task.finally)) {
        for (const fin of task.finally) {
          flattenTask(fin, containerId, sortIndex + 2, nodes, edges, "finally")
          edges[edges.length - 1].source = id
        }
      }
      break
    }
  }

  return id
}
```

### 3.4 nameToSlug() — 统一命名（防碰撞）

```typescript
function nameToSlug(name: string): string {
  return (
    name
      .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "task"
  )
}

/** 带防碰撞的 slug 生成 */
function uniqueSlug(name: string, existingSlugs: Set<string>): string {
  let slug = nameToSlug(name)
  let final = slug
  let counter = 1
  while (existingSlugs.has(final)) {
    final = `${slug}-${counter++}`
  }
  existingSlugs.add(final)
  return final
}
```

> ⚠️ 已存在于 WorkflowEditorPage.tsx，M3 需要提取到 `lib/slug.ts` 共享。`toKestraYaml` 中用 `uniqueSlug` 代替 `nameToSlug`，确保 YAML 中的 task ID 唯一。

### 3.5 extractSpec() — 提取 spec 字段

```typescript
function extractSpec(task: Record<string, unknown>): Record<string, unknown> {
  const excluded = new Set([
    "id", "type", "name", "description", "tasks",
    "then", "else", "cases", "errors", "finally",
    "retry", "timeout", "disabled",  // Kestra 通用属性
  ])
  return Object.fromEntries(
    Object.entries(task).filter(([k]) => !excluded.has(k))
  )
}
```

> ⚠️ `extractSpec` 和 `nameToSlug` 都会作为 `lib/slug.ts` 和 `lib/yamlConverter.ts` 的共享函数。`nameToSlug` 需要防碰撞机制（见 3.4）。

### 3.6 convertInput() — Kestra Input 双向转换

```typescript
function convertInput(input: WorkflowInput): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: input.id,
    type: input.type,
  }
  if (input.displayName) result.displayName = input.displayName
  if (input.description) result.description = input.description
  if (input.required !== undefined) result.required = input.required
  if (input.defaults !== undefined) result.defaults = input.defaults
  if (input.values) result.values = input.values
  if (input.allowCustomValue !== undefined) result.allowCustomValue = input.allowCustomValue
  return result
}
```

---

## 4. 前端改造

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/yamlConverter.ts` | toKestraYaml + fromKestraYaml + helper 函数 |
| `lib/slug.ts` | nameToSlug 共享函数 |
| `lib/autoLayout.ts` | 导入时自动布局算法 |
| `components/flow/DraftHistory.tsx` | 草稿历史列表面板 |
| `components/flow/ReleaseHistory.tsx` | 版本历史列表面板 |
| `components/flow/DiffViewer.tsx` | 版本差异对比 |

### 4.2 改动文件

| 文件 | 改动 |
|------|------|
| `stores/workflow.ts` | 新增 `drafts`/`releases` 状态 + saveDraft/publishRelease/rollbackDraft/rollbackRelease |
| `pages/WorkflowEditorPage.tsx` | 集成草稿/版本 UI，保存/发布按钮 |
| `components/flow/KestraYamlPanel.tsx` | 重写，用新 yamlConverter 替代旧的 toKestraTask |
| `components/flow/TaskConfigPanel.tsx` | 更新 Input 类型映射 |
| `lib/yamlValidation.ts` | 更新验证逻辑（配合新的类型系统） |

### 4.3 Zustand Store 扩展

```typescript
interface WorkflowState {
  // ... 现有字段 ...

  // M3 新增
  drafts: WorkflowDraft[]
  releases: WorkflowRelease[]
  isLoadingDrafts: boolean
  isLoadingReleases: boolean
  hasUnsavedChanges: boolean
  lastSavedAt: string | null

  // Actions
  saveDraft: (message?: string) => Promise<void>
  loadDrafts: () => Promise<void>
  loadReleases: () => Promise<void>
  publishRelease: (name: string) => Promise<void>
  rollbackToDraft: (draftId: string) => void
  rollbackToRelease: (releaseId: string) => Promise<void>
  generateYaml: () => string
  importYaml: (yamlStr: string) => void
}
```

### 4.4 YAML 预览面板改进

已有 `KestraYamlPanel.tsx`，需重写：

**当前问题**：
- 用旧的 `KestraInput` 类型
- `yamlFromSpec` 只转换单个节点，不处理容器嵌套
- 不处理 errors/finally 边

**M3 改进**：
- 用 `toKestraYaml()` 转换完整工作流（nodes + edges + inputs + variables）
- 实时预览，每 300ms 自动刷新
- 支持复制 YAML 内容
- 支持导入模式（粘贴 YAML → 画布自动填充）

### 4.5 保存草稿流程

**手动保存**（用户主动点击）：
```
用户点击「保存」
  → 弹出输入框让用户填写 message（可选）
  → 读取当前 store 中的 nodes/edges/inputs/variables
  → 调用 trpc.workflow.draft.save.mutate()
  → 创建 WorkflowDraft 记录
  → 更新 store.lastSavedAt = now
  → toast.success("草稿已保存")
```

**自动暂存**（后台静默执行）：
```
Store 监听 nodes/edges/inputs/variables 变更
  → 设置 hasUnsavedChanges = true
  → 启动 30s 定时器
  → 30s 后如果 hasUnsavedChanges = true:
    → 调用 trpc.workflow.draft.save.mutate({ message: "自动暂存" })
    → 设置 hasUnsavedChanges = false
    → 更新 store.lastSavedAt（静默，不 toast）
  → 如果用户在 30s 内手动保存，重置定时器
```

**自动暂存 vs 手动保存对比：**
| | 自动暂存 | 手动保存 |
|---|---|---|
| 触发方式 | 每 30s 后台检测 | 用户主动点击 |
| message | "自动暂存" | 用户填写 |
| 反馈 | 无 toast，状态栏显示"已暂存" | toast 提示 |
| 用途 | 防丢失，开发中保护 | 正式保存里程碑 |

### 4.6 发布版本流程

```
用户点击「发布」
  → 弹出对话框：版本名称（默认 "v{N+1}"）
  → 调用 toKestraYaml() 生成 YAML
  → 调用 trpc.workflow.release.publish.mutate()
  → 创建 WorkflowRelease 记录（version = publishedVersion + 1）
  → 更新 Workflow.publishedVersion
  → toast.success("版本已发布")
  → 检测 Kestra 连通性（M4 实现推 Kestra）
```

### 4.7 回滚流程

**草稿回滚**：
```
用户在草稿历史面板选择某条草稿
  → 点击「回滚到此」
  → 将该草稿的 nodes/edges/inputs/variables 写回 Workflow 表
  → 重新加载画布
  → toast.success("已恢复到 {time} 的草稿")
```

**版本回滚**：
```
用户在版本历史面板选择某个版本
  → 点击「从此版本创建草稿」
  → 读取该版本的 nodes/edges/inputs/variables
  → 更新 Workflow 表（用户画布立即恢复）
  → 创建 Draft 记录（message="从版本 v{N} 回滚"，作为回滚记录）
  → toast.success("已恢复到 v{N}，请继续编辑")
```

---

## 5. 后端 API 扩展

### 5.1 Draft API（在 workflowRouter 内扩展）

```typescript
// 保存草稿
draftSave: t.procedure
  .input(z.object({
    workflowId: z.string(),
    message: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const wf = await prisma.workflow.findUnique({ where: { id: input.workflowId } })
    if (!wf) throw new TRPCError({ code: "NOT_FOUND" })

    return prisma.workflowDraft.create({
      data: {
        workflowId: input.workflowId,
        nodes: wf.nodes,
        edges: wf.edges,
        inputs: wf.inputs,
        variables: wf.variables,
        message: input.message,
      },
    })
  }),

// 草稿列表
draftList: t.procedure
  .input(z.object({ workflowId: z.string() }))
  .query(({ input }) => {
    return prisma.workflowDraft.findMany({
      where: { workflowId: input.workflowId },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
  }),

// 回滚草稿
draftRollback: t.procedure
  .input(z.object({ draftId: z.string() }))
  .mutation(async ({ input }) => {
    const draft = await prisma.workflowDraft.findUnique({
      where: { id: input.draftId },
    })
    if (!draft) throw new TRPCError({ code: "NOT_FOUND" })

    // 将草稿内容写回 Workflow
    return prisma.workflow.update({
      where: { id: draft.workflowId },
      data: {
        nodes: draft.nodes,
        edges: draft.edges,
        inputs: draft.inputs,
        variables: draft.variables,
      },
    })
  }),
```

### 5.2 Release API（在 workflowRouter 内扩展）

```typescript
// 发布版本
releasePublish: t.procedure
  .input(z.object({
    workflowId: z.string(),
    name: z.string(),
    yaml: z.string().max(500_000),  // 500KB 上限
  }))
  .mutation(async ({ input }) => {
    // YAML 轻量校验（格式 + 必填字段）
    try {
      const parsed = YAML.parse(input.yaml)
      if (!parsed || typeof parsed !== "object") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "YAML 格式无效" })
      }
      if (!parsed.id || !parsed.namespace || !Array.isArray(parsed.tasks)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "YAML 缺少 id/namespace/tasks" })
      }
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "YAML 解析失败" })
    }

    const wf = await prisma.workflow.findUnique({ where: { id: input.workflowId } })
    if (!wf) throw new TRPCError({ code: "NOT_FOUND" })

    const nextVersion = wf.publishedVersion + 1

    const release = await prisma.workflowRelease.create({
      data: {
        workflowId: input.workflowId,
        version: nextVersion,
        name: input.name,
        nodes: wf.nodes,
        edges: wf.edges,
        inputs: wf.inputs,
        variables: wf.variables,
        yaml: input.yaml,
      },
    })

    // 更新 Workflow 的 publishedVersion
    await prisma.workflow.update({
      where: { id: input.workflowId },
      data: { publishedVersion: nextVersion },
    })

    return release
  }),

// 版本列表
releaseList: t.procedure
  .input(z.object({ workflowId: z.string() }))
  .query(({ input }) => {
    return prisma.workflowRelease.findMany({
      where: { workflowId: input.workflowId },
      orderBy: { version: "desc" },
    })
  }),

// 回滚版本
releaseRollback: t.procedure
  .input(z.object({ releaseId: z.string() }))
  .mutation(async ({ input }) => {
    const release = await prisma.workflowRelease.findUnique({
      where: { id: input.releaseId },
    })
    if (!release) throw new TRPCError({ code: "NOT_FOUND" })

    // 创建新草稿（内容=该版本快照）
    const draft = await prisma.workflowDraft.create({
      data: {
        workflowId: release.workflowId,
        nodes: release.nodes,
        edges: release.edges,
        inputs: release.inputs,
        variables: release.variables,
        message: `从版本 v${release.version} 回滚`,
      },
    })

    // 同时更新 Workflow 表
    await prisma.workflow.update({
      where: { id: release.workflowId },
      data: {
        nodes: release.nodes,
        edges: release.edges,
        inputs: release.inputs,
        variables: release.variables,
      },
    })

    return draft
  }),
```

---

## 6. UI 交互设计

### 6.1 顶部工具栏

```
┌──────────────────────────────────────────────────────────────┐
│ ← 返回   工作流名称   [编辑]   │  💾 保存  ▶ 发布  │  YAML │
│          namespace/flowId      │   📜 草稿  📦 版本  │  预览  │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 草稿历史面板

```
┌─────────────────────────────────┐
│ 📜 草稿历史                      │
├─────────────────────────────────┤
│  03-21 20:30  "添加容器节点"  ← 最新
│  03-21 18:15  "修改 HTTP 请求"
│  03-21 14:00  "初始版本"
├─────────────────────────────────┤
│  [回滚到此]  [查看差异]          │
└─────────────────────────────────┘
```

### 6.3 版本历史面板

```
┌─────────────────────────────────┐
│ 📦 版本历史                      │
├─────────────────────────────────┤
│  v2  03-21  "正式版"   ← 当前
│  v1  03-20  "首次发布"
├─────────────────────────────────┤
│  [从此版本创建草稿]  [查看 YAML]  │
└─────────────────────────────────┘
```

### 6.4 发布对话框

```
┌────────────────────────────────────┐
│ 发布新版本                          │
├────────────────────────────────────┤
│ 版本名称:  [v2              ]       │
│ 说明:      [正式发布        ]       │
│                                    │
│ ✅ YAML 已生成（预览）              │
│                                    │
│ [取消]  [发布版本]                  │
└────────────────────────────────────┘
```

### 6.5 YAML 预览面板（改进）

```
┌────────────────────────────────────┐
│ YAML 预览                    [复制] │
├────────────────────────────────────┤
│ id: my-workflow                    │
│ namespace: company.team            │
│                                    │
│ inputs:                            │
│   - id: env                        │
│     type: STRING                   │
│     defaults: dev                  │
│                                    │
│ tasks:                             │
│   - id: for-each                   │
│     type: io.kestra.plugin...ForEach│
│     values: "{{ inputs.items }}"   │
│     tasks:                         │
│       - id: download               │
│         type: io.kestra...Http     │
│         uri: "https://..."         │
│       - id: parse                  │
│         type: io.kestra...Log      │
│         message: "Done"            │
├────────────────────────────────────┤
│ [粘贴导入]  [下载 .yaml]            │
└────────────────────────────────────┘
```

---

## 7. 实现计划

### 阶段 1：数据库 + 后端 API（2 天）
- [ ] Prisma schema 新增 WorkflowDraft + WorkflowRelease
- [ ] 后端 tRPC router 扩展（draftSave/draftList/draftRollback/releasePublish/releaseList/releaseRollback）
- [ ] Prisma migrate
- [ ] 后端编译验证

### 阶段 2：YAML 转换层（2 天）
- [ ] `lib/slug.ts` — nameToSlug 提取
- [ ] `lib/yamlConverter.ts` — toKestraYaml + fromKestraYaml
- [ ] 单元测试：fixture 数据 → YAML → 还原 → 与原始对比
- [ ] 修复 `yamlFromSpec` 对嵌套对象的输出问题

### 阶段 3：前端集成（2 天）
- [ ] Store 扩展（drafts/releases/actions）
- [ ] 保存/发布按钮 + 对话框
- [ ] DraftHistory 面板
- [ ] ReleaseHistory 面板
- [ ] KestraYamlPanel 重写
- [ ] 导入 YAML 功能

### 阶段 4：回滚 + 差异对比（1 天）
- [ ] 草稿回滚逻辑
- [ ] 版本回滚逻辑
- [ ] DiffViewer 组件

**总工期：7 天**

---

## 8. 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `apps/api/prisma/schema.prisma` | 新增 WorkflowDraft + WorkflowRelease 模型 |
| `apps/web/src/lib/yamlConverter.ts` | YAML 双向转换（核心） |
| `apps/web/src/lib/slug.ts` | nameToSlug 共享 |
| `apps/web/src/lib/autoLayout.ts` | 导入时自动布局 |
| `apps/web/src/components/flow/DraftHistory.tsx` | 草稿历史面板 |
| `apps/web/src/components/flow/ReleaseHistory.tsx` | 版本历史面板 |
| `apps/web/src/components/flow/DiffViewer.tsx` | 差异对比组件 |
| `apps/web/src/components/flow/PublishDialog.tsx` | 发布对话框 |

### 改动

| 文件 | 改动 |
|------|------|
| `apps/api/src/routers/workflow.ts` | 新增 6 个 draft/release API |
| `apps/web/src/stores/workflow.ts` | 新增 drafts/releases 状态 + actions |
| `apps/web/src/pages/WorkflowEditorPage.tsx` | 集成保存/发布 UI，移除旧 yamlFromSpec |
| `apps/web/src/components/flow/KestraYamlPanel.tsx` | 重写用 yamlConverter |
| `apps/web/src/components/flow/TaskConfigPanel.tsx` | 更新 Input 类型 |

---

## 9. 验收标准

- [ ] 编辑工作流 → 保存草稿 → 刷新页面 → 画布恢复
- [ ] 草稿历史面板显示所有历史保存，可回滚
- [ ] 发布版本 → 版本列表显示 v1
- [ ] 版本回滚 → 创建新草稿，画布恢复到该版本
- [ ] YAML 预览面板显示正确的 Kestra YAML（含容器嵌套、分支、错误处理）
- [ ] 粘贴 Kestra YAML → 画布自动还原节点
- [ ] ForEach 容器内的子任务在 YAML 中正确嵌套
- [ ] If 节点的 then/else 分支在 YAML 中正确生成
- [ ] errors/finally 边在 YAML 中正确输出
- [ ] Input 类型完整映射（STRING/INT/FLOAT/BOOL/SELECT/DATE/DATETIME/ARRAY/JSON/FILE/URI/SECRET）

---

## 10. 风险与应对

| 风险 | 影响 | 缓解 |
|------|------|------|
| fromKestraYaml 还原后容器层级丢失 | 导入不完整 | 用 fixture YAML 做 round-trip 测试 |
| yamlFromSpec 嵌套对象输出不完整 | YAML 不正确 | 重写为 toKestraYaml 统一处理 |
| KestraYamlPanel 与旧代码冲突 | 重构工作量 | 直接重写，不留旧代码 |
| 草稿数量无限增长 | 数据膨胀 | 只保留最近 20 条，定时清理旧草稿 |
