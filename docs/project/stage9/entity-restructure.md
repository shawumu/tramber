# Stage 9: 实体结构重构方案

## 1. 背景

当前实体系统存在结构性问题，实体未能发挥预期作用：

| 问题 | 现状 | 影响 |
|------|------|------|
| `decision` 实体无实际用途 | 仅记录"做了什么决策"，但决策内容与任务描述重复 | 实体冗余，无追溯价值 |
| `task` 实体粒度不当 | 每轮生成一个 task，但同一领域的多轮对话应属于同一任务主题 | 缺少任务主题聚合 |
| `constraint` 命名误导 | 实际上是规则/规范，而非阻塞约束 | 命名不匹配语义 |
| `event` 实体冗余 | Session 已追踪交互轨迹，event 实体重复记录 | 数据冗余 |

## 2. 重构目标

**核心思路**：实体图谱应形成 **领域任务 → 子任务 → 分析** 的层次结构，守护意识每轮生成/更新任务图谱。

| 重构项 | 原实体 | 新实体 | 说明 |
|--------|--------|--------|------|
| 任务主题聚合 | `task`（每轮一个） | `domain_task` + `subtask` | domain_task 聚合同一领域的多个 subtask |
| 决策实体语义 | `decision` | `analysis` | 记录分析结论而非"决策" |
| 规则实体 | `constraint` | `rule` | 分为 user_rule 和 analysis_rule |
| 移除冗余 | `event` | 删除 | Session 已追踪，无需重复 |

## 3. 新实体类型定义

### 3.1 EntityType 重构

```typescript
// packages/shared/src/types/consciousness.ts

type EntityType =
  | 'user_request'   // 保留：用户需求起点
  | 'domain_task'    // 新增：领域任务（任务主题）
  | 'subtask'        // 重命名：原 task → subtask
  | 'analysis'       // 重命名：原 decision → analysis
  | 'rule'           // 重命名：原 constraint → rule
  | 'resource';      // 保留：资源实体

// 删除：'event'、'constraint'、'decision'、'task'
```

### 3.2 DomainTaskEntity（新增）

领域任务实体，聚合同一任务主题下的多个子任务：

```typescript
interface DomainTaskEntity extends BaseEntity {
  type: 'domain_task';
  title: string;            // 领域描述（如 "代码编写、修改、调试相关"），来自 domainDescription
  domain: string;           // 所属领域，如 "编码"
  status: 'active' | 'completed' | 'paused';
  subtaskIds: string[];     // 关联的子任务 ID 列表 [s:xxx, s:yyy]
  startedAt: string;        // 任务开始时间
  updatedAt: string;        // 最后更新时间
  summary: string;          // 任务进度摘要（守护意识每轮更新）
}
```

### 3.3 SubtaskEntity（原 TaskEntity）

子任务实体，每轮执行的具体任务：

```typescript
interface SubtaskEntity extends BaseEntity {
  type: 'subtask';
  domainTaskId: string;     // 所属领域任务 [dt:xxx]
  description: string;      // 本轮具体任务描述
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  analysisIds: string[];    // 关联的分析 [a:xxx, a:yyy]
  ruleIds: string[];        // 关联的规则 [r:xxx]
  resourceIds: string[];    // 发现的资源 [r:xxx]
  requires?: string[];      // 跨轮依赖的资源 ID（用于 context 自组装）
  result?: string;          // 执行结果摘要
}
```

### 3.4 AnalysisEntity（原 DecisionEntity）

分析实体，记录本轮的分析结论：

```typescript
interface AnalysisEntity extends BaseEntity {
  type: 'analysis';
  subtaskId: string;        // 所属子任务 [s:xxx]
  content: string;          // 分析内容：发现、结论、洞察
  category: 'discovery' | 'conclusion' | 'insight' | 'action_plan';
}
```

### 3.5 RuleEntity（原 ConstraintEntity）

规则实体，分为用户规则和分析规则：

```typescript
interface RuleEntity extends BaseEntity {
  type: 'rule';
  subtaskId: string;        // 所属子任务 [s:xxx]
  content: string;          // 规则内容
  source: 'user' | 'analysis';  // 来源
  scope: 'local' | 'global';    // 作用范围
}
```

### 3.6 RelationType

```typescript
type RelationType =
  | 'initiates'       // user_request → domain_task
  | 'contains'        // subtask → domain_task（反向归属）
  | 'analyzes'        // analysis → subtask
  | 'constrained_by'  // rule → subtask
  | 'requires'        // subtask → resource（跨轮依赖）
  | 'produced_by'     // resource → subtask（资源由子任务产出，反向关系）
  | 'leads_to';       // subtask → subtask（子任务衍生）
```

**注意**：`contains` 存储在 subtask 上指向 domain_task（反向归属）；`analyzes` 存储在 analysis 上指向 subtask；`produced_by` 存储在 resource 上指向 subtask。正向关联通过 `subtaskIds`、`analysisIds`、`ruleIds`、`resourceIds` 数组维护。

## 4. 实体图谱结构示例

```
用户输入 "查看 demos 目录"
  │
  ▼
[u:mnxvvea7] 用户需求：查看 demos 目录
  │
  └─ initiates → [dt:mnxvv001] 领域任务：代码编写、修改、调试相关
                   │ domain: 编码
                   │ status: active
                   │
                   ├─ subtaskIds → [s:mnxvv002] 子任务1：查看目录结构
                   │              │
                   │              ├─ analysisIds → [a:mnxvv003] 结论：核心技术栈为 Three.js + ECharts
                   │              │                category: conclusion
                   │              │
                   │              ├─ resourceIds → [r:mnxwf001] 资源：demos/earth-3d.html
                   │              │                （resource 实体有 produced_by → s:mnxvv002）
                   │              │
                   │              └─ resourceIds → [r:mnxwf002] 资源：demos/moon-3d.html
                   │
                   ├─ subtaskIds → [s:mnxwh001] 子任务2：查看 earth-3d.html 内容
                   │              │
                   │              ├─ requires → [r:mnxwf001]（依赖上一轮发现的资源）
                   │              │
                   │              ├─ analysisIds → [a:mnxwh002] 洞察：earth 和 moon 组件共享 CameraModule
                   │              │
                   │              └─ ruleIds → [r:mnxwh003] 用户规则：不删除现有文件
                   │
                   └─ subtaskIds → [s:mnxwi001] 子任务3：添加 3D Moon 页面
                                  │
                                  ├─ requires → [r:mnxwf001]、[r:mnxwf002]
                                  │
                                  └─ analysisIds → [a:mnxwi003] 发现：earth 的 import 路径需从相对路径改为 ES Module
```

## 5. 实体质量规范（关键新增）

> 实体重构已基本完成，但实际运行中发现大量"废实体"——analysis 记录的是废话，rule 记录的是系统行为。
> 本节定义实体创建的质量门槛，从源头杜绝废实体。

### 5.1 Analysis 质量标准

**原则：analysis 只在发现组件/配置/规则之间的联系时才创建。**

| 应该创建 ✅ | 不应该创建 ❌ |
|-------------|--------------|
| 发现两个组件共享同一模块（如 "earth 和 moon 共享 CameraModule"） | "用户发起问候，建立编码领域的初始交互" |
| 发现配置项之间的依赖关系（如 "tsconfig paths 与 vite alias 必须同步"） | "编码领域已激活，可开始处理编码相关任务" |
| 发现文件结构与命名规范的联系（如 "新增文件遵循现有 *-3d.html 命名风格"） | "等待用户提出具体的编码需求" |
| 发现技术栈选型影响后续决策（如 "Three.js ES Module 限制 importmap 写法"） | "成功创建了 3D 汽车行驶场景演示文件" |
| 发现资源之间的复用关系（如 "3d-beach 的波浪算法可复用于 ocean 场景"） | "demos目录包含10个独立HTML演示文件"（这是 resource 的 summary 该记的） |

**核心判断**：analysis 是 **连接性知识**（A 与 B 的关系），不是 **描述性知识**（A 是什么）或 **状态性知识**（做了什么）。

### 5.2 Rule 质量标准

**原则：rule 只在用户明确提出约束时才创建。**

| 应该创建 ✅ | 不应该创建 ❌ |
|-------------|--------------|
| 用户说："不要删除现有文件" → user rule | "问候语应路由到当前活跃领域" — 系统行为 |
| 用户说："用 TypeScript，不要用 JS" → user rule | "demos目录文件可直接在浏览器打开运行" — 事实描述 |
| 用户说："修改前先备份" → user rule | "3D演示使用Three.js引擎" — 已在 resource summary 中 |
| 从跨组件分析推导出规范 → analysis rule（极少使用） | "复用了现有3D演示的技术栈和代码风格" — 这是 analysis |

**核心判断**：rule 是 **用户约束** 或 **从联系中推导出的强制性规范**，不是事实陈述、不是系统行为、不是 analysis 内容。

### 5.3 Resource Summary 规范

**原则：resource summary 应包含文件结构概览，让后续意识无需读文件即可判断内容组织。**

按文件类型要求不同字段：

| 文件类型 | 必填字段 | 说明 |
|----------|---------|------|
| HTML/前端 | `title`, `techStack`, `features`, **`structure`** | structure 列出关键代码段：如 `<script type="importmap">`, `<canvas>`, CSS modules |
| 配置文件 | `title`, `purpose`, **`keyFields`** | keyFields 列出核心配置项及其当前值 |
| TypeScript/JS | `title`, `exports`, **`dependencies`** | exports 列出导出的函数/类/接口 |
| Markdown | `title`, **`sections`** | sections 列出文档的章节标题 |
| 目录 | `title`, **`fileList`** | fileList 列出子文件/目录名称 |

**示例**（HTML 文件）：

```json
{
  "title": "3D汽车行驶场景",
  "techStack": ["Three.js", "WebGL"],
  "features": ["环形道路", "3辆自动行驶汽车", "路灯系统"],
  "structure": {
    "importmap": "Three.js ES Module 映射",
    "canvas": "#scene 容器",
    "script": "场景初始化 → 道路生成 → 汽车模型 → 灯光 → 动画循环",
    "style": "全屏 canvas + HUD 覆盖层"
  },
  "interaction": "鼠标拖动旋转 | 滚轮缩放"
}
```

### 5.4 守护意识 Prompt 修改（质量门槛注入）

```typescript
// packages/agent/src/consciousness-prompts.ts - buildSelfAwarenessPrompt

## analyze_turn 参数填写
- userRequest: 用户本轮原始输入（原文）
- domain: 所属领域（你判断的领域，同领域自动合并到同一 domain_task）
- analyses: 本轮分析结论（⚠️ 只在发现**联系**时填写）
  - discovery: 发现了组件/配置/规则之间的联系（如"X 和 Y 共享 Z"）
  - conclusion: 从联系中得出影响后续决策的结论（如"A 限制 B 的写法"）
  - insight: 从联系中获得可复用的洞察（如"X 的算法可复用于 Y"）
  - action_plan: 基于联系推导出的行动计划
  - ❌ 不要填：状态描述（"任务完成"）、事实列举（"目录有10个文件"）、废话（"等待用户"）
  - 💡 大多数情况下 analyses 可以为空数组或不填
- rules: 本轮发现的规则（⚠️ 只在用户**明确提出**时填写）
  - source: user（用户明确说出的约束）或 analysis（极少：从联系推导出的强制规范）
  - ❌ 不要填：系统行为、事实描述、已在 resource summary 中的信息
  - 💡 大多数情况下 rules 可以为空数组或不填
- summary: 本轮分析总结（一行）
```

### 5.5 执行意识 Prompt 修改（resource summary 质量）

```typescript
// packages/agent/src/consciousness-prompts.ts - buildExecutionPrompt

## 规则
- ...
- 每轮工具调用后，使用 record_discovery 记录发现的资源
  - **重要**：subtaskRef 必须使用当前子任务 ID（上面标注的）
  - **summary 质量要求**：
    - HTML/前端文件：必须包含 title、techStack、features、structure（代码结构概览）
    - 配置文件：必须包含 title、purpose、keyFields（核心配置项）
    - 目录扫描：必须包含 title、fileList（子文件列表）
    - 不要只写 features，要让后续意识无需读文件就能理解文件组织
```

## 6. 守护意识逻辑（已实施）

### 6.1 analyze_turn 工具（当前实际实现）

```typescript
{
  id: 'analyze_turn',
  description: '分析本轮交互，更新领域任务图谱。dispatch_task 返回后必须调用。',
  inputSchema: {
    type: 'object',
    properties: {
      userRequest: { type: 'string', description: '用户本轮原始输入' },
      domain: { type: 'string', description: '所属领域' },
      summary: { type: 'string', description: '本轮分析总结（一行）' },
      analyses: { type: 'array', items: { /* analysis 对象 */ } },
      rules: { type: 'array', items: { /* rule 对象 */ } }
    },
    required: ['userRequest', 'domain', 'summary']
  }
}
```

**注意**：`isNewDomainTask`、`domainTaskId`、`subtaskDescription`、`requires` 等旧参数已移除。domain_task 按 domain 自动聚合。

### 6.2 analyze_turn 执行逻辑（当前实际实现）

```typescript
async execute(input: unknown): Promise<ToolResult> {
  // 1. 生成 user_request 实体
  // 2. 按 domain 查找活跃 domain_task，更新 summary
  // 3. 查找最近完成的 subtask
  // 4. 生成 analysis 实体，更新 subtask.analysisIds
  // 5. 生成 rule 实体，更新 subtask.ruleIds
}
```

**关键区别**：subtask 由 `dispatch_task` 预创建（pending → completed），`analyze_turn` 不再创建 subtask。

**Stage 9 后续**：analyze_turn 新增回填 `subtask.result` 逻辑 — 用 `params.summary`（守护意识总结）替换 dispatch_task 写入的空字符串，使实体图谱可恢复完整流水账。详见 `docs/project/stage9/memory-unify.md`。

### 6.3 dispatch_task 中的 subtask 创建

```typescript
// dispatch_task.execute() 中：
// 1. 创建 domain_task（如果没有活跃的）— title 用 domainDescription
// 2. 创建 subtask（pending 状态）
// 3. 执行子 loop
// 4. 更新 subtask 状态为 completed/blocked
```

## 7. Context 自组装（已实施）

### 7.1 assembleExecutionContext

```typescript
assembleExecutionContext(taskId: string, domain: string): ExecutionContext {
  // 1. 查找活跃 domain_task
  // 2. 通过 subtaskIds 查找 subtask（倒序）
  // 3. 通过 analysisIds/ruleIds/resourceIds 查找关联实体
  // 3.1 反向查询：resource 的 produced_by 关系指向当前 subtask（兼容历史数据）
  // 4. 组装纲领：领域任务 + 已完成子任务 + 关键分析 + 适用规则
  // 5. 资源索引（独立于纲领，不重复显示）
}
```

**已修复**：纲领不再包含"可用资源"段，避免与"资源索引"重复。

### 7.2 关系去重（P3 修复）

`mergeRelations` 方法确保 `(type, target)` 组合唯一：

```typescript
mergeRelations(existing: Relation[], newRelations: Relation[]): Relation[] {
  const existingKeys = new Set(existing.map(r => `${r.type}:${r.target}`));
  const dedupedNew = newRelations.filter(r => {
    const key = `${r.type}:${r.target}`;
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  return [...existing, ...dedupedNew];
}
```

## 8. 已修复问题

| 问题 | 修复内容 | 文件 |
|------|---------|------|
| P2: domain_task title 不准确 | title 从 taskDescription 改为 domainDescription | `dispatch-task.ts` |
| P3: 关系重复 | 新增 mergeRelations 去重方法 | `memory-store.ts` |
| P4: 跨轮关系断裂 | domain_task 按 domain 聚合 + produced_by 反向查询 | `consciousness-manager.ts` |
| 多个 domain_task | 移除 isNewDomainTask，按 domain 自动聚合 | `analyze-turn.ts`, `dispatch-task.ts` |
| 可用资源为空 | subtask.resourceIds 更新 + produced_by 反向查询 | `record-discovery.ts`, `consciousness-manager.ts` |
| subtask ID 未传入执行意识 | dispatch_task 预创建 subtask，注入 ID 到执行 prompt | `dispatch-task.ts`, `consciousness-prompts.ts` |
| 资源重复显示 | 纲领移除"可用资源"段，只保留独立"资源索引" | `consciousness-manager.ts` |
| prompt 残留无效参数 | 移除 subtaskDescription/requires 说明，移除"生成子任务"行 | `consciousness-prompts.ts` |

## 9. 待修复问题（均已修复）

### 9.1 [Bug] analysisIds/ruleIds 循环覆盖 ✅ 已修复

修复：先收集所有新 ID，循环结束后一次性 updateEntity。

**文件**：`packages/agent/src/virtual-tools/analyze-turn.ts`

### 9.2 [质量] 守护意识 prompt 注入质量门槛 ✅ 已修复

修复：analysis 只在发现组件/配置/规则间联系时创建，rule 只在用户明确要求时创建。

**文件**：`packages/agent/src/consciousness-prompts.ts`

### 9.3 [质量] 执行意识 prompt 注入 resource summary 质量要求 ✅ 已修复

修复：按文件类型要求 structure/keyFields/exports/fileList 字段。

**文件**：`packages/agent/src/consciousness-prompts.ts`

### 9.4 [设计] 简单交互的 subtask 处理 ✅ 方案 A 验证通过

修复 9.2 后 LLM 自然不再为问候生成废实体（实测验证：0 analysis、0 rule）。无需额外代码。

## 10. 实施步骤

### Phase 1: 类型定义重构 ✅ 已完成

| 任务 | 文件 |
|------|------|
| 修改 EntityType 定义 | `packages/shared/src/types/consciousness.ts` |
| 新增 DomainTaskEntity 类型 | 同上 |
| 重命名 TaskEntity → SubtaskEntity | 同上 |
| 重命名 DecisionEntity → AnalysisEntity | 同上 |
| 重命名 ConstraintEntity → RuleEntity | 同上 |
| 删除 EventEntity 类型 | 同上 |
| 重构 RelationType | 同上 |

### Phase 2: MemoryStore 重构 ✅ 已完成

| 任务 | 文件 |
|------|------|
| 修改 storeEntity 支持新类型 | `packages/agent/src/memory-store.ts` |
| 新增 queryByDomainTask 方法 | 同上 |
| 修改 getTypePrefix（dt/s/a/rl/r/u） | 同上 |
| 新增 mergeRelations 去重方法 | 同上 |
| 修改 mergeResource 使用去重逻辑 | 同上 |

### Phase 3: analyze_turn 重构 ✅ 已完成

| 任务 | 文件 |
|------|------|
| 简化参数 schema（移除 isNewDomainTask 等） | `packages/agent/src/virtual-tools/analyze-turn.ts` |
| 移除 subtask 创建逻辑（由 dispatch_task 负责） | 同上 |
| 按 domain 自动聚合 domain_task | 同上 |

### Phase 4: dispatch_task 重构 ✅ 已完成

| 任务 | 文件 |
|------|------|
| 预创建 subtask（pending → completed） | `packages/agent/src/virtual-tools/dispatch-task.ts` |
| 注入 currentSubtaskId 到执行 prompt | 同上 |
| domain_task title 用 domainDescription | 同上 |

### Phase 5: Context 自组装重构 ✅ 已完成

| 任务 | 文件 |
|------|------|
| assembleExecutionContext 从图谱组装 | `packages/agent/src/consciousness-manager.ts` |
| produced_by 反向查询 | 同上 |
| 纲领移除重复"可用资源"段 | 同上 |

### Phase 6: 守护意识 Prompt 修复 ✅ 已完成

| 任务 | 文件 |
|------|------|
| 移除 isNewDomainTask 引导 | `packages/agent/src/consciousness-prompts.ts` |
| 移除无效参数说明（subtaskDescription/requires） | 同上 |
| 移除"生成子任务"描述 | 同上 |

### Phase 7: 质量治理 ✅ 已完成

| 任务 | 优先级 | 文件 |
|------|--------|------|
| 修复 analysisIds/ruleIds 循环覆盖 bug | P0 | `packages/agent/src/virtual-tools/analyze-turn.ts` ✅ |
| 守护意识 prompt 注入 analysis 质量标准 | P0 | `packages/agent/src/consciousness-prompts.ts` ✅ |
| 守护意识 prompt 注入 rule 质量标准 | P0 | `packages/agent/src/consciousness-prompts.ts` ✅ |
| 执行意识 prompt 注入 resource summary 质量要求 | P1 | `packages/agent/src/consciousness-prompts.ts` ✅ |

### Phase 8: Memory 与 Entity 统一 ✅ 已完成

详见 `docs/project/stage9/memory-unify.md`

| 任务 | 文件 |
|------|------|
| analyze_turn 回填 subtask.result（守护意识总结） | `packages/agent/src/virtual-tools/analyze-turn.ts` ✅ |
| dispatch_task 初始 result 置空（等待回填） | `packages/agent/src/virtual-tools/dispatch-task.ts` ✅ |
| 新增 buildMemoryFromEntities 方法 | `packages/agent/src/consciousness-manager.ts` ✅ |
| recordMemory memoryIndex 改用实体图谱组装 | `packages/agent/src/consciousness-manager.ts` ✅ |
| Engine 停止写 result_summary 到 memory entries | `packages/sdk/src/engine.ts` ✅ |

## 11. 文件变更清单

| 文件 | 已改 | 待改 |
|------|------|------|
| `packages/shared/src/types/consciousness.ts` | EntityType/RelationType/实体类型重构 | — |
| `packages/agent/src/memory-store.ts` | storeEntity/queryByDomainTask/mergeRelations | — |
| `packages/agent/src/virtual-tools/analyze-turn.ts` | 简化参数/移除 subtask 创建/修复循环覆盖/回填 result | — |
| `packages/agent/src/virtual-tools/dispatch-task.ts` | 预创建 subtask/title 修复/result 初始置空 | — |
| `packages/agent/src/virtual-tools/record-discovery.ts` | produced_by/subtask.resourceIds 更新 | — |
| `packages/agent/src/consciousness-prompts.ts` | 移除无效参数/移除重复显示/质量门槛注入 | — |
| `packages/agent/src/consciousness-manager.ts` | assembleExecutionContext/去重/反向查询/buildMemoryFromEntities | — |
| `packages/sdk/src/engine.ts` | 停止写 result_summary，改用 buildMemoryFromEntities | — |

## 12. 重构收益

| 收益 | 说明 |
|------|------|
| 任务主题聚合 | domain_task 聚合相关子任务，便于追溯任务全貌 |
| 分析实体语义化 | analysis 记录连接性知识（A 与 B 的关系），不记录废话 |
| 规则精准化 | rule 只记录用户明确约束，不记录系统行为 |
| 资源可追溯 | resource summary 包含文件结构概览，后续意识无需读文件 |
| 数据去冗余 | 删除 event，mergeRelations 去重，质量门槛减少废实体 |
| Context 恒定质量 | 从任务图谱自组装，无压缩失真，无重复显示 |
