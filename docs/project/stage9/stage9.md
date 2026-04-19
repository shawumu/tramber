# Stage 9: 意识体深度演化 — 实体图谱与 Context 自组装

## 1. 目标与范围

### 1.1 背景

Stage 8 完成了双层意识体的基础架构：
- 守护意识：调度、领域路由、分析总结
- 领域子意识：执行、直接输出

**当前问题**：
- 守护意识的分析总结是纯文本流水账，缺少全局视野（会话纲领）
- 子意识的 context 是传统 conversation 累积模式，膨胀后压缩导致质量下降
- 缺少实体结构化存储，无法追溯因果关系

### 1.2 目标

引入 **A+B+C 实体图谱方案**：

| 方案 | 解决问题 |
|------|---------|
| A 类型前缀 ID | 纯文本缺少标识，无法精准引用 |
| B 实体关系图 | 流水账无法追溯因果，缺少关联 |
| C 结构化条目 | 纯文本压缩失真，纲领由 LLM 自由发挥 |

**核心突破**：执行意识的 context 从实体图谱**自组装**，膨胀时**重建而非压缩**，质量恒定。

### 1.3 范围

```
Stage 9 范围                          Stage 10 范围（后续）
─────────────────                      ──────────────────
单 Agent 内部实体图谱                    多 Agent 协作（Partners）
├─ 守护意识生成实体                      ├─ Agent 间实体共享
├─ 执行意识生成实体                      ├─ 跨 Agent 任务分配
├─ Context 自组装                       └─ TeamOrchestrator
└─ Recall 工具区分
```

---

## 2. 架构设计

### 2.1 实体图谱结构

所有实体共享基础参数：

```typescript
interface BaseEntity {
  id: string;           // 类型前缀 ID，如 "dt:a3x7f", "s:b1c2d", "r:c4m9p"
  type: EntityType;     // user_request | domain_task | subtask | analysis | rule | resource
  order: number;        // 全局排序，按生成顺序递增（1, 2, 3...）
  version: string;      // 版本：数字版本（v1, v2）或时间版本（2026-04-13T08:22）
  domain: string;       // 所属领域（编码、文档、部署...）
  content: string;      // 实体内容
  relations: Relation[];
  createdAt: string;
}
```

### 2.2 实体类型（重构后）

```typescript
type EntityType =
  | 'user_request'   // 用户需求起点
  | 'domain_task'    // 领域任务（任务主题，聚合同 domain 的多个 subtask）
  | 'subtask'        // 子任务（每轮执行的具体任务，由 dispatch_task 创建）
  | 'analysis'       // 分析结论（发现组件/配置/规则之间的联系）
  | 'rule'           // 规则（用户明确约束或分析推导出的强制规范）
  | 'resource';      // 资源实体（文件、代码结构、配置）
```

**实体类型演进**：

| 原类型 | 新类型 | 变更原因 |
|--------|--------|----------|
| `task` | `domain_task` + `subtask` | 同领域的多轮对话需聚合到同一任务主题 |
| `decision` | `analysis` | 记录分析结论（连接性知识）而非"做了什么决策" |
| `constraint` | `rule` | 语义更准确：用户规则或分析规则 |
| `event` | 删除 | Session 已追踪交互轨迹，实体重复 |

### 2.3 关系类型

```typescript
type RelationType =
  | 'initiates'       // user_request → domain_task
  | 'contains'        // subtask → domain_task（反向归属）
  | 'analyzes'        // analysis → subtask
  | 'constrained_by'  // rule → subtask
  | 'requires'        // subtask → resource（跨轮依赖）
  | 'produced_by'     // resource → subtask（反向关系）
  | 'leads_to';       // subtask → subtask（子任务衍生）
```

### 2.4 关键实体详细定义

```typescript
// 领域任务实体
interface DomainTaskEntity extends BaseEntity {
  type: 'domain_task';
  title: string;            // domainDescription
  domain: string;
  status: 'active' | 'completed' | 'paused';
  subtaskIds: string[];
  summary: string;          // 守护意识每轮更新
}

// 子任务实体（由 dispatch_task 创建，analyze_turn 回填 result）
interface SubtaskEntity extends BaseEntity {
  type: 'subtask';
  domainTaskId: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  analysisIds: string[];
  ruleIds: string[];
  resourceIds: string[];
  requires?: string[];
  result?: string;           // 初始为空，analyze_turn 回填守护意识总结
}

// 资源实体
interface ResourceEntity extends BaseEntity {
  type: 'resource';
  uri: string;
  resourceType: ResourceType;
  summary: ResourceSummary;
}
```

### 2.5 数据流

```
用户输入 "查看 demos 目录"
  │
  ▼
守护意识 AgentLoop
  │
  ├─▶ dispatch_task(domain="编码", task="查看 demos 目录")
  │     │
  │     ├─ 创建 [dt:xxx] domain_task（如果无活跃的）
  │     ├─ 创建 [s:xxx] subtask（pending）
  │     │
  │     │ assembleExecutionContext
  │     │ 从实体图谱组装执行纲领 → 注入子意识 prompt
  │     │
  │     └─▶ 执行意识 AgentLoop
  │           │
  │           ├─▶ 执行工具调用（glob, read_file...）
  │           ├─▶ record_resource（静默工具）
  │           │     └─ [r:xxx] 资源实体，produced_by → s:xxx
  │           │
  │           └─▶ 返回结果
  │
  │     subtask.result = ""（等待回填）
  │
  ├─▶ analyze_turn(userRequest, domain, summary, analyses, rules)
  │     ├─ [u:xxx] user_request 实体
  │     ├─ 更新 domain_task.summary
  │     ├─ 回填 subtask.result = summary
  │     └─ 创建 analysis / rule 实体（如果有）
  │
  └─▶ 输出分析总结
```

### 2.6 两层读写关系

| 操作 | 守护意识 | 执行意识 |
|------|---------|---------|
| **写** | analyze_turn → u/dt/a/rl 实体 | record_resource → r 实体 |
| **读** | 全量实体 → 会话纲领 | 本领域实体 → 执行纲领 |
| **recall** | recall_memory → 实体摘要 | recall_resource → 完整内容 |
| **重建** | 每轮更新纲领 | rebuild_context → 无损组装 |

---

## 3. 虚拟工具

### 3.1 analyze_turn（守护意识）

替代原 `compress_and_remember`，dispatch_task 返回后必须调用：

```typescript
{
  id: 'analyze_turn',
  inputSchema: {
    userRequest: string,     // 用户本轮原始输入
    domain: string,          // 所属领域（同 domain 自动合并到 domain_task）
    analyses: array,         // 分析结论（只在发现联系时填写）
    rules: array,            // 规则（只在用户明确提出约束时填写）
    summary: string          // 本轮总结（一行）
  }
}
```

**执行逻辑**：
1. 生成 `[u:xxx]` user_request
2. 按 domain 查找活跃 domain_task，更新 summary
3. 查找最近 completed subtask，回填 `result = params.summary`
4. 生成 analysis 实体（如有）
5. 生成 rule 实体（如有）

**注意**：subtask 由 `dispatch_task` 预创建，analyze_turn 不创建 subtask。

### 3.2 record_resource（执行意识，静默工具）

原 `record_discovery`，重命名为 `record_resource`。标记为 `silent = true`，执行结果不返回给 LLM。

```typescript
{
  id: 'record_resource',
  silent: true,
  inputSchema: {
    subtaskRef: string,      // 自动填充，无需手动指定
    resources: [{
      uri: string,
      resourceType: 'file' | 'knowledge' | 'api' | 'pattern',
      summary: object
    }]
  }
}
```

**静默工具机制**：
- `Tool.silent = true`：工具正常执行，但结果不喂回 LLM
- `loop.ts` 检测到所有工具都是静默时，追加 "已记录，请继续" 提示 LLM 继续
- LLM 自然在只输出文本（无工具调用）时结束循环，不会提前终止

**subtaskRef 自动填充**：
- `dispatch_task` 创建 subtask 后，将 ID 写入 `VirtualToolContext.currentSubtaskId`
- `record_resource` 执行时自动从 context 获取，LLM 无需传递
- 父子 context 通过 `Object.create()` 原型继承共享

### 3.3 recall_memory（守护意识）

```typescript
{
  id: 'recall_memory',
  inputSchema: {
    type?: string, keyword?: string, domain?: string, limit?: number
  }
}
```

返回实体摘要列表（id + content + order），不返回完整内容。

### 3.4 recall_resource（执行意识）

```typescript
{
  id: 'recall_resource',
  inputSchema: {
    uri?: string, resourceType?: string, keyword?: string
  }
}
```

从实体图谱查找资源，解析 uri，返回完整内容。

### 3.5 rebuild_context（执行意识）

context 超阈值时调用，丢弃旧消息，从实体图谱重新组装纲领。

---

## 4. Context 自组装

### 4.1 assembleExecutionContext

```typescript
assembleExecutionContext(taskId: string, domain: string): ExecutionContext {
  // 1. 查找活跃 domain_task
  // 2. 通过 subtaskIds 查找 subtask（倒序）
  // 3. 通过 analysisIds/ruleIds/resourceIds 查找关联实体
  // 4. 反向查询：resource 的 produced_by 关系
  // 5. 组装纲领 + 资源索引
}
```

### 4.2 dispatch_task 整合

dispatch_task 中：
1. 创建 domain_task（无活跃时）
2. 创建 subtask（pending）
3. 调用 `assembleExecutionContext` 组装纲领
4. 注入纲领到子意识 system prompt
5. 执行子 loop
6. 更新 subtask 状态

### 4.3 Memory 与 Entity 统一

废弃原 memory entries 双写，单一数据源为实体图谱：

- `subtask.result` 由 analyze_turn 回填守护意识总结
- `buildMemoryFromEntities()` 从实体图谱组装对话流水账
- Engine 不再调用 `recordMemory()`，改为从实体图谱刷新

---

## 5. 实体质量治理

### 5.1 Analysis 质量标准

**原则：analysis 只在发现组件/配置/规则之间的联系时才创建。**

| 应该创建 | 不应该创建 |
|---------|-----------|
| 发现两个组件共享同一模块 | "用户发起问候" |
| 发现配置项之间的依赖关系 | "编码领域已激活" |
| 发现文件结构与命名规范的联系 | "等待用户" |
| 发现资源之间的复用关系 | "目录包含10个文件"（这是 resource 的 summary） |

### 5.2 Rule 质量标准

**原则：rule 只在用户明确提出约束时才创建。**

| 应该创建 | 不应该创建 |
|---------|-----------|
| 用户说"不要删除文件" | "问候语应路由到活跃领域" |
| 用户说"用 TypeScript" | "文件可在浏览器打开" |

### 5.3 Resource Summary 规范

按文件类型要求不同字段：

| 文件类型 | 必填字段 |
|----------|---------|
| HTML/前端 | `title`, `techStack`, `features`, `structure` |
| 配置文件 | `title`, `purpose`, `keyFields` |
| TypeScript/JS | `title`, `exports`, `dependencies` |
| 目录 | `title`, `fileList` |

---

## 6. Prompt 重构

### 6.1 执行意识 Prompt（工作流程化）

从平铺规则改为编号工作流程：

```
## 工作方式

1. **判断**：任务是否需要使用工具？
   - 不需要 → 直接回答，不调用工具
   - 需要 → 进入步骤 2

2. **执行并记录**：使用工具完成任务
   - 使用 glob 发现文件/目录结构后，用 record_resource 记录
   - 使用 read_file 读取文件内容后，用 record_resource 记录
   - record_resource 传入 resources 数组

3. **总结**：纯文本回复
```

### 6.2 守护意识 Prompt

注入 analysis/rule 质量门槛：
- analyses 只在发现**联系**时填写
- rules 只在用户**明确提出**约束时填写
- 大多数情况下两者可以为空

---

## 7. Agent 包重构

### 7.1 死代码清理（P0）

| 动作 | 文件 | 原因 |
|------|------|------|
| 删除 | `spawn-sub-task.ts` | 被 dispatch-task 替代 |
| 删除 | `compress-and-remember.ts` | 被 analyze-turn 替代 |
| 删除 | `conversation-manager.ts` | 从未被引用 |
| 删除 | `tool-executor.ts` | loop.ts 内联实现 |
| 删除 | `permission-guard.ts` | loop.ts 内联实现 |

### 7.2 loop.ts 瘦身（P1）

从 1021 行降到 511 行（-50%）：

| 抽取 | 内容 | 行数 |
|------|------|------|
| `llm-caller.ts` | LLM 调用 + 重试 + 流式 | 233 行 |
| `formatToolResults()` | 工具结果格式化 + 截断 | 独立函数 |

### 7.3 memory-store.ts 拆分（P2）

从 646 行降到 308 行（-52%）：

| 抽取 | 内容 | 行数 |
|------|------|------|
| `entity-store.ts` | 实体图谱全部方法 | 289 行 |
| `memory-store.ts` | 委托层，API 不变 | 308 行 |

### 7.4 重构前后对比

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| loop.ts | 1,021 行 | 511 行（-50%） |
| memory-store.ts | 646 行 | 308 行（-52%） |
| 死代码文件 | 5 个 | 0 |

---

## 8. 工具系统增强

### 8.1 静默工具机制

```typescript
// packages/tool/src/types.ts
interface Tool {
  /** 静默工具：执行但不返回结果给 LLM（如 record_resource） */
  silent?: boolean;
}
```

**loop.ts 处理逻辑**：

```
工具结果返回后：
├─ 全部静默 → 保留 LLM 文本到对话，追加"已记录，请继续"，继续循环
├─ 全部非静默 → 格式化结果，喂回 LLM，继续循环
└─ 混合 → 只喂回非静默工具结果，继续循环
```

LLM 自然在只输出文本（无工具调用）时结束循环，不会因静默工具提前终止。

### 8.2 read_file 工具升级

增加按行分段读取能力：

```typescript
{
  id: 'read_file',
  inputSchema: {
    path: string,            // 文件路径
    startLine?: number,      // 起始行号（1-based），默认 1
    endLine?: number         // 结束行号，默认文件末尾
  }
}
```

**返回结构化数据**：

```typescript
{
  content: string,        // 带行号的内容 + 元信息头
  totalLines: number,
  totalChars: number,
  startLine: number,
  endLine: number,
  hasMore: boolean
}
```

**输出格式**：

```
[文件: demos/3d-earth.html] 共 500 行, 25000 字符。显示第 1-100 行。
  1 | <!DOCTYPE html>
  2 | <html>
  ...
```

### 8.3 formatToolResults 适配

- `MAX_TOOL_RESULT_CHARS` 提升至 32000
- 识别 read_file 结构化数据，直接输出 content 字段
- 截断时提示使用 startLine/endLine 分段读取

### 8.4 VirtualToolContext 原型继承

```typescript
// packages/sdk/src/engine.ts
const childCtx: VirtualToolContext = Object.create(virtualToolCtx);
```

父 context 的 `currentSubtaskId` 通过原型链自动共享给子 context。

---

## 9. 实施步骤

### Phase 1: 类型定义与 MemoryStore 改造 ✅

- EntityType 重构（domain_task/subtask/analysis/rule）
- MemoryStore 新增 queryByDomain/queryByType/findByUri/mergeResource/mergeRelations

### Phase 2: 虚拟工具实现 ✅

- analyze-turn.ts / record-resource.ts / recall-resource.ts / rebuild-context.ts

### Phase 3: Context 自组装集成 ✅

- assembleExecutionContext + dispatch_task 纲领注入

### Phase 4: Engine 集成 ✅

- 守护意识调用 analyze_turn，Memory 与 Entity 统一

### Phase 5: Agent 包重构 ✅

- P0 死代码清理 / P1 loop.ts 瘦身 / P2 memory-store.ts 拆分

### Phase 6: 实体质量治理 ✅

- analysis/rule 质量门槛注入 prompt
- analysisIds/ruleIds 循环覆盖 bug 修复

### Phase 7: Prompt 重构与工具增强 ✅

- 执行意识 prompt 工作流程化
- 静默工具机制（Tool.silent）
- read_file 按行分段读取
- record_discovery → record_resource 重命名
- formatToolResults 结构化数据适配

---

## 10. 文件清单

### 新增文件

| 文件 | 用途 |
|------|------|
| `packages/agent/src/virtual-tools/analyze-turn.ts` | 守护意识分析工具 |
| `packages/agent/src/virtual-tools/record-resource.ts` | 执行意识资源记录（静默工具） |
| `packages/agent/src/virtual-tools/recall-resource.ts` | 执行意识资源检索 |
| `packages/agent/src/virtual-tools/rebuild-context.ts` | Context 重建 |
| `packages/agent/src/llm-caller.ts` | LLM 调用 + 重试（从 loop.ts 抽取） |
| `packages/agent/src/entity-store.ts` | 实体图谱存储（从 memory-store.ts 抽取） |

### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/types/consciousness.ts` | 实体类型重构（domain_task/subtask/analysis/rule） |
| `packages/agent/src/memory-store.ts` | 委托 entity-store，API 不变 |
| `packages/agent/src/consciousness-manager.ts` | assembleExecutionContext + buildMemoryFromEntities |
| `packages/agent/src/consciousness-prompts.ts` | 工作流程化 + 质量门槛 |
| `packages/agent/src/virtual-tools/dispatch-task.ts` | 预创建 subtask + 纲领注入 |
| `packages/agent/src/virtual-tools/index.ts` | 注册新工具 + VirtualToolContext |
| `packages/agent/src/loop.ts` | 静默工具处理 + formatToolResults 适配 |
| `packages/sdk/src/engine.ts` | 废弃 recordMemory，改用实体图谱 |
| `packages/tool/src/types.ts` | Tool.silent 属性 |
| `packages/tool/src/registry.ts` | list() 传递 silent 字段 |
| `packages/tool/src/builtin/file/index.ts` | read_file 按行读取 + 结构化返回 |

### 移除文件

| 文件 | 说明 |
|------|------|
| `virtual-tools/spawn-sub-task.ts` | 被 dispatch-task 替代 |
| `virtual-tools/compress-and-remember.ts` | 被 analyze-turn 替代 |
| `conversation-manager.ts` | 从未引用 |
| `tool-executor.ts` | loop.ts 内联 |
| `permission-guard.ts` | loop.ts 内联 |

---

## 11. 架构决策

### 为什么用实体图谱而非纯文本流水账

- ID 精准引用（`[dt:a3x7f]` `[s:b1c2d]`）
- 关系边追溯因果（`u → initiates → dt → contains → s → produced_by → r`）
- 纲领由代码生成，LLM 只提取不编造

### 为什么 context 重建而非压缩

- 实体离散存储，重建 = 第一次组装
- 无损，质量恒定
- 不依赖额外 LLM 调用

### 为什么 domain_task 聚合 subtask

- 同领域的多轮对话（"查看 demos" → "分析 3d-earth" → "加个月球"）属于同一任务主题
- domain_task 按 domain 自动聚合，守护意识只需判断领域
- 跨轮依赖通过 `subtask.requires → resource` 追溯

### 为什么静默工具

- `record_resource` 是副作用工具，LLM 不需要看到执行结果
- 避免结果喂回后 LLM 陷入循环（重复调用、空调用）
- LLM 只需在最终纯文本回复中总结

### 为什么 read_file 按行分段

- 大文件（20KB+）截断后 LLM 浪费多次迭代用 exec+cat+tail 补读
- 按行分段让 LLM 精准获取需要的部分
- 结构化元信息（totalLines、hasMore）帮助 LLM 判断是否继续读取

### 演进路径

```
Stage 9（本次）              Stage 10（后续）          Stage 11+（未来）
─────────────────            ──────────────────        ──────────────────
单 Agent 实体图谱              多 Agent 协作              Agent Network
├─ 守护意识生成实体            ├─ Agent 间实体共享         ├─ 通信协议
├─ 执行意识生成实体            ├─ 跨 Agent 任务            ├─ 行业标准 scene
├─ Context 自组装             └─ TeamOrchestrator        └─ 去中心化调度
└─ Recall 工具区分
```
