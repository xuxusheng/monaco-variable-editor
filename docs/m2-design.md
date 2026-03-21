# M2 技术设计文档 — 控制流（容器与分支）

## 目标
支持 Kestra 全部控制流模式：容器节点、分支边、错误处理边、多父节点汇聚。

## 范围
- **M2 做**：容器节点渲染、展开/折叠、containment 边、分支边（then/else/case）、错误处理边（errors/finally）、子画布连线
- **M2 不做**：YAML 转换、持久化保存、Kestra 对接

---

## 1. 节点模型扩展

### 1.1 容器节点 vs 普通节点

现有 `WorkflowNode` 接口已经支持 `containerId`，天然支持层级关系。

```typescript
// 已有接口，无需改动
interface WorkflowNode {
  id: string
  type: string                  // 如 "io.kestra.plugin.core.flow.ForEach"
  name: string
  containerId: string | null    // 所属容器 ID（顶级为 null）
  sortIndex: number             // 同容器内排序
  spec: Record<string, unknown>
  ui?: { x: number; y: number; collapsed?: boolean }
}
```

**容器类型判断**：不是新增字段，而是根据 `type` 判断：
- `type.includes("ForEach")` → 容器
- `type.includes("If")` → 容器
- `type.includes("Switch")` → 容器
- `type.includes("Parallel")` → 容器
- `type.includes("Sequential")` → 容器

**建议**：新增 `isContainer()` 工具函数，统一判断逻辑，不要在各组件里散落。

### 1.2 容器标识

容器类型列表定义在常量文件中：

```typescript
// types/container.ts
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
```

---

## 2. 边模型扩展

### 2.1 边类型

现有 7 种边类型定义已完成，M2 需要全部使用：

| 类型 | 画布视觉 | 用途 |
|------|---------|------|
| sequence | 实线靛蓝箭头 | 同层顺序执行 |
| containment | 虚线靛蓝箭头 | 容器包含子任务 |
| then | 实线绿色箭头 | If 的 then 分支 |
| else | 实线红色箭头 | If 的 else 分支 |
| case | 实线蓝色箭头 | Switch 的分支 |
| errors | 虚线红色箭头 | 错误处理 |
| finally | 虚线灰色箭头 | 总是执行 |

**已有**：types/workflow.ts 中 `EdgeType` 联合类型 + `EDGE_STYLES` 样式映射，无需新增。

---

## 3. 画布渲染方案

### 3.1 方案对比

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| **A: 单画布展开** | 所有节点在同一个 React Flow 实例，折叠时隐藏子节点 | 实现简单，无跨实例通信 | 深层嵌套时 viewport 管理复杂 |
| **B: 嵌套 React Flow** | 每个容器一个独立 React Flow 实例 | 层级隔离清晰 | 实例间连线（跨层级）困难，性能差 |
| **C: 单画布 + 布局分组** | 所有节点在一个画布，折叠时用 Group Node 包裹 | React Flow 原生支持 Group | 需要自定义 Group 外观 |

**推荐方案 A：单画布展开/折叠。**

理由：
- React Flow 官方推荐这种方式
- 跨层级连线（如 sequence 边从父容器内节点到外部节点）天然支持
- 性能好（单个实例，节点多时可开启 virtualization）
- n8n 也用类似方案

### 3.2 展开/折叠机制

```
展开状态：
┌─ ForEach [x] ──────────────────┐
│  ┌─── TaskA ──┐  ┌─── TaskB ──┐│
│  │  打印日志   │  │  发送邮件   ││
│  └────────────┘  └────────────┘│
└────────────────────────────────┘

折叠状态：
┌─ ForEach [+] ──────────────────┐
│  📦 2 个子任务                  │
└────────────────────────────────┘
```

**实现思路：**

1. **展开时**：所有节点正常渲染。子节点的 `containerId` 指向父节点，在画布上以视觉分组（边框/背景色）区分。
2. **折叠时**：筛选掉 `containerId` 在折叠路径中的节点和连线。折叠节点替换为摘要卡片（子任务数量）。
3. **状态存储**：`node.ui.collapsed` 字段，已有定义。

**关键逻辑**：

```typescript
// 在 WorkflowEditorPage 中，根据 collapsed 状态过滤画布节点
function filterVisibleNodes(
  nodes: WorkflowNode[], 
  collapsedIds: Set<string>
): WorkflowNode[] {
  // 收集所有在折叠容器中的后代节点 ID
  const hiddenIds = new Set<string>()
  for (const node of nodes) {
    if (collapsedIds.has(node.id)) {
      collectDescendants(node.id, nodes, hiddenIds)
    }
  }
  return nodes.filter(n => !hiddenIds.has(n.id))
}

function collectDescendants(
  containerId: string, 
  nodes: WorkflowNode[], 
  result: Set<string>
) {
  const children = nodes.filter(n => n.containerId === containerId)
  for (const child of children) {
    result.add(child.id)
    collectDescendants(child.id, nodes, result)
  }
}
```

### 3.3 容器节点视觉设计

容器节点和普通节点用不同样式：

```
普通节点（已有）：
┌─────────────────────┐
│ ● type 颜色圆点      │
│   中文名称            │
└─────────────────────┘

容器节点（新增）：
╭─────────────────────╮
│ ⬇ ForEach           │  ← 圆角更大，有 ▶/▼ 展开按钮
│   遍历列表            │  ← 副标题：描述
│   ────────────────  │
│   📦 2 个子任务       │  ← 折叠时显示摘要
╰─────────────────────╯
```

**实现**：扩展 `WorkflowNodeComponent`，根据 `isContainer()` 渲染不同布局。在 `data` 中传入 `isContainer` 和子任务数量。

### 3.4 子节点视觉

子节点在画布上显示在父容器的"区域内"，用视觉线索区分层级：

- **父容器边框**：容器节点周围有虚线边界框，包裹所有子节点
- **子节点背景**：比普通节点背景稍深，暗示层级

**实现**：用 React Flow 的 `<Group>` 组件，或自己画一个绝对定位的 `<div>` 作为"容器背景"。

**建议**：先用自定义 div 实现容器背景框，后续再考虑 React Flow Group。自定义 div 更灵活，能控制样式（圆角、边框虚线、背景色）。

---

## 4. 边的渲染

### 4.1 分支边（then/else/case）

当前已有 `EDGE_STYLES` 配置和 `WorkflowEdgeComponent`。需要做的是：

- 连线时让用户选择边类型（sequence / then / else / case）
- 根据 `data.edgeType` 应用不同颜色

**交互设计**：

方案 A：连线后弹出选择菜单（3 个按钮：sequence / then / else）
方案 B：连接 If 节点时自动根据位置判断（上方=then，下方=else）
方案 C：连线时按住不同修饰键（Shift=then，Alt=else）

**推荐方案 A**：连线完成后弹出小气泡菜单，选择边类型。最直观，不记快捷键。

### 4.2 错误处理边（errors/finally）

同样的气泡菜单，但 errors/finally 作为二级选项。

---

## 5. 多父节点汇聚

**场景**：节点 D 同时依赖 B 和 C。

```
A → B ─┐
       ├→ D
A → C ─┘
```

**现状**：已经支持。React Flow 天然支持多输入边。连线时 D 可以接收来自 B 和 C 两条 sequence 边。

**需要确认**：如果 B 和 C 在不同容器内，连线是否需要跨容器？这属于"跨层级连线"。

### 5.1 跨层级连线

**M2 建议**：先限制在同层级内连线，跨容器连线作为 M2.5 或 M3 的扩展。

理由：
- 跨容器连线在视觉上容易混淆（边穿过容器边界）
- Kestra 的 YAML 中，跨容器引用用 `dependsOn: [ContainerA.TaskB]` 实现，复杂度较高
- M2 先跑通同层级的控制流，再扩展

---

## 6. Fixture 数据扩展

M2 需要测试用 fixture 数据：

```typescript
// types/fixtures.ts — 扩展
export const FIXTURE_CONTAINER_NODES: WorkflowNode[] = [
  // 容器
  { id: "c1", type: "io.kestra.plugin.core.flow.ForEach", name: "遍历用户列表", containerId: null, sortIndex: 0, spec: { values: ["a","b","c"] }, ui: { x: 200, y: 100 } },
  { id: "c2", type: "io.kestra.plugin.core.flow.If", name: "检查条件", containerId: null, sortIndex: 1, spec: { condition: "{{ inputs.enabled }}" }, ui: { x: 600, y: 100 } },
  // 子节点
  { id: "t1", type: "io.kestra.plugin.core.log.Log", name: "打印日志", containerId: "c1", sortIndex: 0, spec: { message: "处理中..." }, ui: { x: 100, y: 250 } },
  { id: "t2", type: "io.kestra.plugin.core.http.Download", name: "下载文件", containerId: "c1", sortIndex: 1, spec: { uri: "..." }, ui: { x: 350, y: 250 } },
  { id: "t3", type: "io.kestra.plugin.core.log.Log", name: "Then: 发送成功", containerId: "c2", sortIndex: 0, spec: { message: "OK" }, ui: { x: 500, y: 250 } },
  { id: "t4", type: "io.kestra.plugin.core.log.Log", name: "Else: 报警", containerId: "c2", sortIndex: 0, spec: { message: "FAIL" }, ui: { x: 750, y: 250 } },
]

export const FIXTURE_CONTAINER_EDGES: WorkflowEdge[] = [
  // 容器到子节点的 containment 边
  { id: "e1", source: "c1", target: "t1", type: "containment" },
  { id: "e2", source: "c1", target: "t2", type: "containment" },
  // 容器内 sequence 边
  { id: "e3", source: "t1", target: "t2", type: "sequence" },
  // If 分支边
  { id: "e4", source: "c2", target: "t3", type: "then" },
  { id: "e5", source: "c2", target: "t4", type: "else" },
  // 容器间 sequence
  { id: "e6", source: "c1", target: "c2", type: "sequence" },
]
```

---

## 7. 文件结构

```
apps/web/src/
├── types/
│   ├── workflow.ts          (已有，无需改动)
│   └── container.ts         (新增：CONTAINER_TYPES, isContainer)
├── components/flow/
│   ├── WorkflowNode.tsx      (扩展：容器样式、展开/折叠按钮)
│   ├── WorkflowEdge.tsx      (已有，微调)
│   ├── ContainerBackground.tsx (新增：容器区域背景框)
│   └── EdgeTypeMenu.tsx      (新增：连线后边类型选择气泡)
├── lib/
│   ├── containerUtils.ts     (新增：filterVisibleNodes, collectDescendants)
│   └── ...
├── stores/
│   └── workflow.ts           (已有，扩展：toggleCollapse action)
└── pages/
    └── WorkflowEditorPage.tsx (扩展：展开/折叠逻辑)
```

---

## 8. 实施计划

### 阶段 1：容器节点基础（2-3 天）
- [ ] 新增 `container.ts` 常量 + `isContainer()` 函数
- [ ] WorkflowNodeComponent 区分容器/普通节点视觉
- [ ] 容器节点展开/折叠按钮 + 点击事件
- [ ] `filterVisibleNodes` 实现
- [ ] store 增加 `toggleCollapse` action

### 阶段 2：容器背景框（1-2 天）
- [ ] ContainerBackground 组件
- [ ] 画布上绘制容器边界框
- [ ] 折叠时显示摘要信息

### 阶段 3：边类型交互（2 天）
- [ ] EdgeTypeMenu 组件（连线后弹出）
- [ ] 连线流程：先连线 → 弹菜单 → 选择类型 → 创建边
- [ ] 错误处理边（errors/finally）同理

### 阶段 4：Fixture + 验收（1 天）
- [ ] 扩展 fixture 数据
- [ ] 端到端验证所有验收标准

**总预估：6-8 天**

---

## 9. 风险

| 风险 | 缓解 |
|------|------|
| 容器嵌套 >3 层时画布性能 | M2 限制最大 3 层，后续考虑虚拟化 |
| 折叠/展开时连线动画抖动 | React Flow 自带动画，但需要测试 |
| containment 边视觉混乱 | 用虚线 + 低透明度区分，不要抢占视觉焦点 |

---

## 10. 开放问题

1. **边类型菜单**：连线后弹气泡 vs 连线时按修饰键？需要 UX 决定
2. **容器展开动画**：是否需要平滑过渡？（React Flow 节点位置变化有动画）
3. **跨层级连线**：M2 是否支持？（建议 M2.5）
