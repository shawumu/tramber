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
  id: string;           // 类型前缀 ID，如 "t:a3x7f", "u:b1c2d"
  type: EntityType;     // user_request | task | decision | resource | constraint | event
  order: number;        // 全局排序，按生成顺序递增（1, 2, 3...）
  version: string;      // 版本：数字版本（v1, v2）或时间版本（2026-04-13T08:22）
  domain: string;       // 所属领域（编码、文档、部署...）
  content: string;      // 实体内容（用户需求原文、任务描述、决策内容...）
  relations: Relation[]; // 关系边
  createdAt: string;
}

interface Relation {
  type: RelationType;   // produces | triggers | leads_to | requires | blocked_by | discovered_in
  target: string;      // 目标实体 ID
}
```

**版本策略**：

| 实体类型 | 版本策略 | 说明 |
|---------|---------|------|
| `user_request` | 时间版本 | 用户需求提出时间（首次记录，不变） |
| `task` | 数字版本 | `v1`, `v2` — 状态更新时递增 |
| `decision` | 时间版本 | 决策时间戳 |
| `resource` | 数字版本 | 多次读取时合并更新 |
| `constraint` | 时间版本 | 约束提出时间 |
| `event` | 时间版本 | 事件发生时间 |

### 2.2 实体类型定义

```typescript
type EntityType = 'user_request' | 'task' | 'decision' | 'resource' | 'constraint' | 'event';

type ResourceType = 'file' | 'knowledge' | 'api' | 'pattern';

type RelationType = 
  | 'initiates'     // 用户需求发起任务
  | 'produces'      // 任务产生资源
  | 'triggers'      // 任务触发决策
  | 'leads_to'      // 任务衍生新任务
  | 'requires'      // 任务依赖资源
  | 'blocked_by'    // 任务被约束阻塞
  | 'discovered_in' // 资源在任务中发现
  | 'produced_by'   // 资源由任务产出
  | 'required_by';  // 资源被任务依赖
```

### 2.3 用户需求实体

用户需求是会话的起点，记录用户提出的原始请求：

```typescript
interface UserRequestEntity extends BaseEntity {
  type: 'user_request';
  originalInput: string;   // 用户原始输入文本
  parsedIntent: string;    // 解析后的意图（如"查看目录"、"生成代码"）
  turnNumber: number;      // 第几轮对话（1, 2, 3...）
}
```

**特点**：
- 首次记录后不再变更（时间版本 = 提出时间）
- 是任务实体的上游（关系：`initiates → task`）
- 守护意识在每轮开始时生成

### 2.4 资源实体扩展

```typescript
interface ResourceEntity extends BaseEntity {
  type: 'resource';
  uri: string;           // 唯一标识符：file://path / knowledge://id / api://name
  resourceType: ResourceType;
  summary: ResourceSummary; // 结构化摘要
}

// 结构化摘要（按文件类型）
interface VueSummary {
  template: string[];    // 组件列表：["filter", "table", "pagination"]
  script: {
    vars: number;        // 变量数量
    functions: number;   // 函数数量
  };
}

interface JsTsSummary {
  imports: string[];     // 导入模块
  exports: string[];     // 导出项
  functions: number;     // 函数数量
}

interface JsonSummary {
  keys: string[];        // 顶层键
  nestedDepth: number;   // 嵌套深度
}

interface HtmlSummary {
  elements: string[];    // 主要元素
  scripts: number;       // 脚本数量
}

interface MdSummary {
  sections: string[];    // 章节
  codeBlocks: number;    // 代码块数量
}
```

### 2.5 数据流

```
用户输入 "查看 demos 目录"
  │
  ▼
守护意识 AgentLoop
  │
  ├─▶ 生成 [u:xxx] 用户需求实体（本轮对话起点）
  │
  ├─▶ dispatch_task(domain="编码", task="查看 demos 目录")
  │     │
  │     ▼ assembleExecutionContext
  │     │ 从 Memory 查询关联实体，组装执行纲领
  │     │ 纲领注入子意识 system prompt
  │     │
  │     └─▶ 执行意识 AgentLoop
  │           │
  │           ├─▶ 执行工具调用
  │           │     每轮返回 → record_discovery
  │           │     ├─ [r:xxx] 资源实体：demos 目录结构
  │           │     └─ [e:xxx] 事件实体：glob 调用
  │           │
  │           ├─▶ context 阈值 → rebuild_context
  │           │     从实体图谱重建，质量恒定
  │           │
  │           └─▶ 返回结果给守护意识
  │
  ├─▶ analyze_turn(userRequest="u:xxx", domain="编码", task="查看 demos 目录", result="...")
  │     │
  │     ▼ 生成实体
  │     ├─ [t:xxx] 任务实体（relations: initiates → u:xxx）
  │     ├─ [d:xxx] 决策实体（如有）
  │     ├─ [c:xxx] 约束实体（如有）
  │     └─ [e:xxx] 事件实体
  │
  └─▶ 输出分析总结，写入 Memory
```

### 2.6 两个意识层的读写关系

| 操作 | 守护意识 | 执行意识 |
|------|---------|---------|
| **读** | 全量实体图 → 会话纲领 | 本领域实体图 → 执行纲领 |
| **写** | analyze_turn → u/t/d/c/e 实体 | record_discovery → r/e 实体 |
| **recall** | recall_memory → 实体摘要 | recall_resource → 完整内容 |
| **重建** | 每轮更新纲领 | rebuild_context → 无损组装 |

---

## 3. 虚拟工具

### 3.1 analyze_turn（守护意识）

替代原 `compress_and_remember`，生成结构化实体：

```typescript
{
  id: 'analyze_turn',
  description: '分析本轮交互，生成用户需求、任务、决策、约束实体。dispatch_task 返回后必须调用。',
  inputSchema: {
    type: 'object',
    properties: {
      userRequest: { type: 'string', description: '用户本轮原始输入' },
      userRequestId: { type: 'string', description: '用户需求实体 ID（如 u:b1c2d）' },
      domain: { type: 'string', description: '所属领域' },
      task: { type: 'string', description: '任务描述' },
      taskStatus: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'] },
      decisions: { type: 'array', items: { type: 'string' }, description: '本轮做出的决策' },
      constraints: { type: 'array', items: { type: 'string' }, description: '用户提出的约束' },
      summary: { type: 'string', description: '本轮分析总结（一行）' }
    },
    required: ['userRequest', 'domain', 'task', 'summary']
  }
}
```

**执行逻辑**：
1. 生成 `[u:xxx]` 用户需求实体（originalInput = userRequest）
2. 生成 `[t:xxx]` 任务实体（status = taskStatus，relations: `initiates → u:xxx`）
3. 为 decisions 每条生成 `[d:xxx]` 决策实体
4. 为 constraints 每条生成 `[c:xxx]` 约束实体
5. 生成 `[e:xxx]` 事件实体（领域交互）
6. 建立关系边（用户需求 → 任务 → 决策 → 约束）

### 3.2 record_discovery（执行意识）

每轮执行返回时调用，记录发现和资源：

```typescript
{
  id: 'record_discovery',
  description: '记录执行中的发现，生成资源实体。每轮工具调用后调用。',
  inputSchema: {
    type: 'object',
    properties: {
      taskRef: { type: 'string', description: '关联任务 ID（如 t:a3x7f）' },
      resources: { type: 'array', items: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: '资源 URI（file://path）' },
          resourceType: { type: 'string', enum: ['file', 'knowledge', 'api', 'pattern'] },
          summary: { type: 'object', description: '结构化摘要' }
        }
      }},
      discoveries: { type: 'array', items: { type: 'string' }, description: '本轮发现' },
      progress: { type: 'number', description: '进度 0-100' }
    },
    required: ['taskRef']
  }
}
```

**执行逻辑**：
1. 检查 uri 是否已存在 → 存在则合并（version 递增），不存在则创建
2. 生成 `[r:xxx]` 资源实体（带结构化 summary）
3. 建立关系边：`produced_by → taskRef`、`discovered_in → taskRef`
4. 生成 `[e:xxx]` 进度事件

### 3.3 recall_memory（守护意识）

```typescript
{
  id: 'recall_memory',
  description: '检索历史实体摘要（用户需求、任务、决策、约束、事件）。守护意识使用。',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['user_request', 'task', 'decision', 'constraint', 'event', 'all'] },
      keyword: { type: 'string' },
      domain: { type: 'string' },
      limit: { type: 'number', default: 5 }
    },
    required: []
  }
}
```

**返回**：实体摘要列表（id + content + order），不返回完整内容。

### 3.4 recall_resource（执行意识）

```typescript
{
  id: 'recall_resource',
  description: '检索资源详情（文件完整内容）。执行意识使用。',
  inputSchema: {
    type: 'object',
    properties: {
      uri: { type: 'string', description: '资源 URI（file://demos/xxx.html）' },
      resourceType: { type: 'string', enum: ['file', 'knowledge', 'api', 'pattern'] },
      keyword: { type: 'string', description: '关键词搜索' }
    },
    required: []
  }
}
```

**执行逻辑**：
1. 从 Memory 查找 uri 对应的资源实体
2. 解析 uri（如 `file://demos/xxx.html` → path）
3. 调用 `read_file` 获取完整内容
4. 返回完整内容给执行意识

### 3.5 rebuild_context（执行意识）

```typescript
{
  id: 'rebuild_context',
  description: '重建 context，丢弃旧消息，从实体图谱重新组装。context 阈值触发时调用。',
  inputSchema: {
    type: 'object',
    properties: {
      keepRecent: { type: 'number', default: 3, description: '保留最近 N 轮对话' }
    }
  }
}
```

**执行逻辑**：
1. 丢弃旧消息（保留最近 keepRecent 轮）
2. 调用 `assembleExecutionContext` 重新组装纲领
3. 返回新纲领，注入 system prompt

---

## 4. Context 自组装实现

### 4.1 assembleExecutionContext

在 `ConsciousnessManager` 中新增方法：

```typescript
assembleExecutionContext(taskId: string, domain: string): ExecutionContext {
  // 1. 从 Memory 查询本领域的实体
  const entities = this.memoryStore.query({ domain });

  // 2. 查找当前任务实体
  const currentTask = entities.find(e => 
    e.type === 'task' && e.id === taskId && e.status !== 'completed'
  );

  if (!currentTask) return {纲领: '', 资源索引: [], 最近对话: []};

  // 3. 查询关联实体（通过 relations）
  const related: BaseEntity[] = [];
  for (const rel of currentTask.relations) {
    const entity = this.memoryStore.get(rel.target);
    if (entity) related.push(entity);
  }

  // 4. 查找发起此任务的用户需求
  const userRequest = related.find(e => e.type === 'user_request');

  // 5. 组装执行纲领文本
  const纲领 = `
## 执行纲领
用户需求 [${userRequest?.id ?? '未知'}] ${userRequest?.content ?? '无'}

当前任务 [${currentTask.id}] ${currentTask.content}

上游任务：${related.filter(e => e.type === 'task').map(e => `[${e.id}] ${e.content}`).join('\n') || '无'}

技术决策：${related.filter(e => e.type === 'decision').map(e => `[${e.id}] ${e.content}`).join('\n') || '无'}

关联资源：${related.filter(e => e.type === 'resource').map(e => `[${e.id}] ${e.uri}`).join('\n') || '无'}

约束条件：${entities.filter(e => e.type === 'constraint').map(e => `[${e.id}] ${e.content}`).join('\n') || '无'}
`;

  // 6. 资源索引（摘要列表）
  const 资源索引 = related.filter(e => e.type === 'resource').map(e => ({
    id: e.id,
    uri: (e as ResourceEntity).uri,
    summary: (e as ResourceEntity).summary
  }));

  return {纲领, 资源索引, 最近对话: []};
}
```

### 4.2 dispatch_task 整合

修改 `dispatch-task.ts`：

```typescript
async execute(input: unknown): Promise<ToolResult> {
  const { domain, taskDescription, ... } = input;

  // ... 查找/创建/激活子意识 ...

  // 新增：组装执行纲领
  const execContext = consciousnessManager.assembleExecutionContext(taskId, domain);

  // 修改：将纲领注入 system prompt
  const execPrompt = buildExecutionPrompt(basePrompt, execState, execContext.纲领);

  // 创建 conversation
  const conversation = createConversation({
    systemPrompt: execPrompt,
    projectInfo: { rootPath: process.cwd(), name: 'project' }
  });

  // ... 执行子意识 ...

  // 返回结果
  return {
    success: result.success,
    data: {
      consciousnessId: execState.id,
      domain,
      summary,
      iterations: result.iterations,
      isFinalAnswer: true
    }
  };
}
```

### 4.3 rebuild_context 整合

在 `loop.ts` 中检测 context 阈值，触发重建：

```typescript
// 在 runLoop 中检测
const currentTokenCount = estimateTokens(context.messages);
const threshold = this.options.maxTokens * 0.8;

if (currentTokenCount > threshold && this.options.consciousnessState) {
  // 调用 rebuild_context 虚拟工具
  const rebuildResult = await this.executeToolCalls([
    { name: 'rebuild_context', parameters: { keepRecent: 3 } }
  ]);
  // rebuild_context 会更新 conversation.messages
}
```

---

## 5. MemoryStore 改造

### 5.1 新增方法

```typescript
class MemoryStore {
  // 新增：按领域查询
  queryByDomain(domain: string): BaseEntity[] {
    return this.loadIndex().filter(e => e.domain === domain);
  }

  // 新增：按类型查询
  queryByType(type: EntityType): BaseEntity[] {
    return this.loadIndex().filter(e => e.type === type);
  }

  // 新增：按 ID 获取完整实体
  get(id: string): BaseEntity | null {
    return this.loadEntry(id);
  }

  // 新增：uri 去重检查
  findByUri(uri: string): ResourceEntity | null {
    const index = this.loadIndex();
    const entry = index.find(e => e.type === 'resource' && e.uri === uri);
    return entry ? this.loadEntry(entry.id) : null;
  }

  // 新增：合并资源实体
  mergeResource(uri: string, newSummary: ResourceSummary, newRelations: Relation[]): void {
    const existing = this.findByUri(uri);
    if (existing) {
      // version 递增，relations 累加
      existing.version = `v${parseInt(existing.version.slice(1)) + 1}`;
      existing.relations.push(...newRelations);
      existing.summary = newSummary; // 更新摘要
      this.saveEntity(existing);
    } else {
      // 创建新实体
      this.store({ type: 'resource', uri, ... });
    }
  }
}
```

### 5.2 存储结构

```
.tramber/memory/{taskId}/
├── index.json          # 实体索引（id + type + domain + order）
└── entries/
    ├── u-b1c2d.json    # 用户需求实体
    ├── t-a3x7f.json    # 任务实体
    ├── d-b8k2m.json    # 决策实体
    ├── r-c4m9p.json    # 资源实体
    ├── c-d5n3q.json    # 约束实体
    └── e-f7p1r.json    # 事件实体
```

---

## 6. 实施步骤

### Phase 1: 类型定义与 MemoryStore 改造（1 天）

**目标**：实体类型就绪，MemoryStore 支持实体图谱。

- 修改 `packages/shared/src/types/consciousness.ts`：
  - 新增 `BaseEntity`、`Relation`、`UserRequestEntity`、`ResourceEntity` 类型
  - 新增 `EntityType` 包含 `user_request`
  - 新增 `order`、`version` 字段
  - 新增 `ResourceSummary` 各类型结构
  - 新增 `RelationType` 包含 `initiates`

- 修改 `packages/agent/src/memory-store.ts`：
  - 新增 `queryByDomain`、`queryByType`、`findByUri`、`mergeResource` 方法
  - 修改 `store` 方法支持实体类型

**验收**：
- [ ] 所有类型编译通过
- [ ] MemoryStore 能存储/查询/去重实体

### Phase 2: 虚拟工具实现（1.5 天）

**目标**：analyze_turn、record_discovery、recall_resource、rebuild_context 可用。

- 新建 `packages/agent/src/virtual-tools/analyze-turn.ts`
- 新建 `packages/agent/src/virtual-tools/record-discovery.ts`
- 新建 `packages/agent/src/virtual-tools/recall-resource.ts`
- 新建 `packages/agent/src/virtual-tools/rebuild-context.ts`
- 修改 `packages/agent/src/virtual-tools/index.ts` 注册新工具

**验收**：
- [ ] analyze_turn 能生成 u/t/d/c/e 实体
- [ ] record_discovery 能生成 r 实体并去重
- [ ] recall_resource 能返回文件完整内容
- [ ] rebuild_context 能触发重建

### Phase 3: Context 自组装集成（1 天）

**目标**：dispatch_task 组装执行纲领，子意识 context 可重建。

- 修改 `packages/agent/src/consciousness-manager.ts`：
  - 新增 `assembleExecutionContext` 方法

- 修改 `packages/agent/src/virtual-tools/dispatch-task.ts`：
  - 调用 `assembleExecutionContext` 组装纲领
  - 将纲领注入子意识 system prompt

- 修改 `packages/agent/src/loop.ts`：
  - 检测 context 阈值
  - 触发 rebuild_context

**验收**：
- [ ] 子意识收到任务时自动组装执行纲领
- [ ] context 超阈值时无损重建
- [ ] 重建后质量与首次一致

### Phase 4: Engine 集成与测试（1 天）

**目标**：守护意识调用 analyze_turn，实体写入流程完整。

- 修改 `packages/sdk/src/engine.ts`：
  - dispatch_task 返回后自动调用 analyze_turn

- 修改提示词：
  - `consciousness-prompts.ts` 更新守护意识 prompt（调用 analyze_turn）
  - 更新执行意识 prompt（调用 record_discovery）

- 端到端测试

**验收**：
- [ ] 守护意识每轮生成实体
- [ ] 执行意识每轮记录发现
- [ ] Memory 完整记录会话实体图
- [ ] 会话纲领可从实体图生成

---

## 7. 文件清单

### 7.1 新增文件

| 文件 | 用途 |
|------|------|
| `packages/agent/src/virtual-tools/analyze-turn.ts` | 守护意识分析工具，生成 u/t/d/c/e 实体 |
| `packages/agent/src/virtual-tools/record-discovery.ts` | 执行意识记录工具，生成 r 实体 |
| `packages/agent/src/virtual-tools/recall-resource.ts` | 执行意识资源检索工具 |
| `packages/agent/src/virtual-tools/rebuild-context.ts` | 执行意识 context 重建工具 |

### 7.2 修改文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/types/consciousness.ts` | 新增 BaseEntity、Relation、UserRequestEntity、ResourceEntity、ResourceSummary 类型，EntityType 包含 user_request |
| `packages/agent/src/memory-store.ts` | 新增 queryByDomain、findByUri、mergeResource 方法 |
| `packages/agent/src/consciousness-manager.ts` | 新增 assembleExecutionContext 方法 |
| `packages/agent/src/virtual-tools/dispatch-task.ts` | 组装执行纲领并注入 system prompt |
| `packages/agent/src/virtual-tools/index.ts` | 注册新虚拟工具 |
| `packages/agent/src/loop.ts` | 检测 context 阈值，触发 rebuild_context |
| `packages/agent/src/consciousness-prompts.ts` | 更新提示词（analyze_turn、record_discovery） |
| `packages/sdk/src/engine.ts` | dispatch_task 返回后调用 analyze_turn |

### 7.3 移除文件

| 文件 | 说明 |
|------|------|
| `packages/agent/src/virtual-tools/compress-and-remember.ts` | 被 analyze-turn.ts 替代 |

---

## 8. 架构决策

### 8.1 为什么用实体图谱而非纯文本流水账

纯文本的问题：
- 无法精准引用（"之前那个决策" — 哪个决策？）
- 无法追溯因果（"为什么做这个" — 需要翻历史）
- 压缩失真（LLM 自由发挥，可能漏掉关键分支）

实体图谱解决：
- ID 精准引用（`[u:b1c2d]` `[d:b8k2m]` — 明确标识）
- 关系边追溯因果（`u:b1c2d → initiates → t:a3x7f → triggers → d:c4m9p`）
- 纲领由代码生成，LLM 只提取不编造

### 8.2 为什么 context 重建而非压缩

传统压缩的问题：
- 不可逆损失信息
- 每次压缩质量下降
- 需要额外 LLM 调用

重建的优势：
- 实体离散存储，重建 = 第一次组装
- 无损，质量恒定
- 不依赖额外 LLM 调用

### 8.3 为什么 recall_memory 和 recall_resource 分开

| 工具 | 调用者 | 返回内容 | 使用场景 |
|------|-------|---------|---------|
| recall_memory | 守护意识 | 实体摘要（u/t/d/c/e） | 生成会话纲领 |
| recall_resource | 执行意识 | 文件完整内容 | 执行中需要细节 |

守护意识不关心文件细节，执行意识不需要全局决策摘要。职责分离，各取所需。

### 8.4 为什么 uri 用于资源去重

同一文件可能被多次读取：
- 每次创建新实体 → 冗余膨胀
- 用 uri 合并 → 版本递增，relations 累加

结构化摘要更新而非重建，历史关系保留。

### 8.5 为什么用户需求单独作为实体类型

用户需求与任务的区分：

| 实体类型 | 来源 | 变化 | 职责 |
|---------|------|------|------|
| `user_request` | 用户原始输入 | 不变（时间版本） | 记录意图起点 |
| `task` | 守护意识调度 | 可变（状态更新） | 执行单元 |

**为什么分开**：
- 一个用户需求可能衍生多个任务（如"重构模块" → 拆分为多个子任务）
- 任务状态会变化（pending → in_progress → completed），用户需求不变
- 追溯时需要找到原始意图，而非执行单元
- 纲领中需要展示"用户想要什么"与"我们做了什么"的关系

**关系链**：
```
[u:用户需求] → initiates → [t:任务1] → leads_to → [t:任务2]
                              ↓
                           triggers → [d:决策]
```

### 8.6 演进路径

```
Stage 9（本次）              Stage 10（后续）          Stage 11+（未来）
─────────────────            ──────────────────        ──────────────────
单 Agent 实体图谱              多 Agent 协作              Agent Network
├─ 守护意识生成实体            ├─ Agent 间实体共享         ├─ 通信协议
├─ 执行意识生成实体            ├─ 跨 Agent 任务            ├─ 行业标准 scene
├─ Context 自组装             └─ TeamOrchestrator        └─ 去中心化调度
└─ Recall 工具区分
```