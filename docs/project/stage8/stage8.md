# Stage 8: 意识体系统 — 领域感知与 Context 分层管理

## 1. 概述

### 1.1 要解决的问题

当前 Agent Loop 在长对话中面临严重的 context 退化问题：

| 问题 | 表现 |
|------|------|
| 规则丢失 | 系统提示词中的规则和约束被大量消息淹没，LLM 逐渐遗忘 |
| 记忆稀释 | 早期决策、关键信息在超长 context 中被冲淡 |
| 幻觉加重 | 随 context 增长，LLM 输出准确性持续下降 |
| 效率低下 | 工具执行结果占据大量 token 但信息密度极低 |
| 偏离任务 | 长对话中 agent 逐渐偏离原始目标和约束 |

### 1.2 解决方案：守护意识 + 领域子意识

将 agent 分为两层意识体，核心变化：**子意识不是按任务临时创建，而是按领域持久存在。**

```
┌─────────────────────────────────────────────────────┐
│  守护意识（Guardian）                                 │
│                                                      │
│  职责：                                               │
│  · 意识调度（派生、封存、激活领域子意识）              │
│  · 环境感知（项目状态、用户规则、领域分布）            │
│  · 记忆管理（从子意识回报中积累流水账）                │
│                                                      │
│  绝不：                                               │
│  · 直接回答用户问题                                   │
│  · 直接执行任何工具操作                               │
│  · 修改任何文件                                       │
│                                                      │
│  Context = 历史记忆概括 + 最新消息 + 用户规则          │
│  不保留原始对话，只保留流水账摘要                       │
└──────────┬──────────────┬────────────────────────────┘
           │              │
    ┌──────▼──────┐ ┌─────▼───────┐
    │ 子意识 A     │ │ 子意识 B     │  ← 领域子意识
    │ 领域: 编码    │ │ 领域: 文档   │     跨多轮对话持久存在
    │ 状态: active │ │ 状态: sealed │     可封存、可重新激活
    └─────────────┘ └──────────────┘
```

**守护意识（Guardian / 上层）**
- 不执行任何具体操作，不做任何回答
- 每次用户输入都路由到合适的领域子意识
- 子意识不存在则创建，领域切换时封存旧子意识、激活或创建新子意识
- 接收子意识的阶段性回报，记入记忆流水账
- 维护环境感知（项目状态、文件变更、用户规则）
- Context 动态更新：记忆概括 + 最新消息 + 用户规则

**领域子意识（Domain Child / 下层）**
- 以话题和领域为范围，跨多轮对话持久存在
- 直接处理用户请求、执行工具操作、返回结果
- 判断用户请求是否超出自身领域，超出时上升给守护意识
- 阶段性向守护意识回报（不是全跑完才返回）
- 对外展示为"Tramber"，用户感知不到内部结构

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **守护意识只调度不执行** | 守护意识永远不直接回答用户，所有用户请求都路由给领域子意识 |
| **领域子意识持久化** | 子意识按领域（coding、文档、部署...）划分，跨多轮对话复用 |
| **封存与激活** | 领域切换时封存旧子意识，用户回归时重新激活 |
| **阶段性回报** | 子意识不是全跑完才返回，阶段性地向守护意识汇报进度 |
| **Memory 是流水账** | 每次子意识回报都记入 memory，形成按时间排列的流水账 |
| **Context 动态更新** | 守护意识的 context = 历史记忆概括 + 最新消息 + 用户规则 |
| **用户规则单独管理** | 用户明确提出的规则从对话中提取，单独列出并持久传递 |
| **零外部依赖** | 意识体 = prompt 工程 + 虚拟工具 + 记忆压缩，不依赖外部服务 |

---

## 2. 意识体类型系统

### 2.1 基础类型

```typescript
/** 意识体层级 */
export type ConsciousnessLevel = 'self_awareness' | 'execution';

/** 意识体状态 */
export type ConsciousnessStatus =
  | 'spawning'           // 创建中
  | 'thinking'           // LLM 推理中
  | 'executing'          // 执行工具调用
  | 'active'             // 领域子意识活跃中（跨多轮对话）
  | 'sealed'             // 封存（领域暂不活跃，可重新激活）
  | 'waiting_approval'   // 等待审批
  | 'compressing'        // 压缩结果
  | 'completed'          // 已完成
  | 'failed'             // 执行失败
  | 'cancelled';         // 被父意识取消
```

### 2.2 守护意识状态（SelfAwarenessState）

```typescript
export interface SelfAwarenessState {
  id: string;
  level: 'self_awareness';
  status: ConsciousnessStatus;

  /** 活跃领域 */
  activeDomain: string | null;
  /** 领域 → 子意识 ID 映射 */
  domains: Map<string, string>;         // { "coding": "exec-xxx", "文档": "exec-yyy" }
  /** 封存的领域 */
  sealedDomains: Map<string, string>;   // { "编码": "exec-zzz" }

  /** 用户明确提出的规则（单独管理、持久传递） */
  rules: string[];

  // --- 环境感知 ---
  environment: {
    project: string;
    branch?: string;
    sceneId: string;
  };

  // --- 记忆索引 ---
  memoryIndex: MemoryIndexEntry[];

  // --- 内部维护 ---
  recentDecisions: string[];
  recentResults: string[];
  difficulties: string[];
  filesTouched: string[];
  iteration: number;
  maxIterations: number;
}
```

### 2.3 领域子意识状态（ExecutionContextState）

```typescript
export interface ExecutionContextState {
  id: string;
  level: 'execution';
  status: ConsciousnessStatus;
  parentId: string;

  /** 所属领域（核心：领域标识） */
  domain: string;
  /** 领域描述（帮助 LLM 判断边界） */
  domainDescription: string;

  /** 是否为新创建（首次需要介绍） */
  isNew: boolean;

  // --- 执行上下文 ---
  taskDescription: string;
  constraints: string[];
  allowedTools: string[];
  parentContext: string;
  maxIterations: number;
}
```

### 2.4 记忆系统：双层架构

Memory 分为两层：**Offline Memory**（磁盘持久化）和 **Online Memory**（守护意识实时持有）。

```typescript
/** 记忆条目 — 流水账（Offline Memory 单条） */
export interface MemoryEntry {
  id: string;
  /** 所属会话 ID */
  taskId: string;
  /** 来源：子意识 ID 或 'guardian' */
  sourceId: string;
  /** 所属领域 */
  domain: string;
  /** 记忆类型 */
  type: 'user_turn' | 'progress_report' | 'result_summary' | 'escalation' | 'rule_extracted' | 'domain_switch';
  /** 摘要（流水账一行，≤ 300 字符） */
  summary: string;
  /** 详细内容（原始回报或对话概括，过长会被二次概括） */
  content: string;
  /** 相关文件 */
  relatedFiles: string[];
  createdAt: string;
}

/** Online Memory — 守护意识实时持有的子集 */
export interface OnlineMemory {
  /** 早期概括（Offline 前 N 条的压缩摘要） */
  earlySummary: string;
  /** 近期原始条目（保持原样，不做概括） */
  recentEntries: MemoryEntry[];
  /** 总条目数（Offline 全量） */
  totalCount: number;
}
```

#### Offline Memory（磁盘）

全量流水账，永不丢失。存储在 `.tramber/memory/` 下。

写入时机和内容：

| 来源 | 类型 | 写入时机 | 内容 |
|------|------|---------|------|
| 守护意识 | `user_turn` | 每次用户输入后 | 用户说了什么、归属哪个领域、关键意图 |
| 守护意识 | `domain_switch` | 领域切换时 | 从哪个领域切到哪个领域、为什么 |
| 守护意识 | `rule_extracted` | 用户明确提出规则时 | 规则内容 |
| 子意识 | `progress_report` | 阶段性回报 | 当前做了什么、进度 |
| 子意识 | `result_summary` | 任务完成时 | 最终结果、改了什么文件 |
| 子意识 | `escalation` | 判断超出领域时 | 为什么超出、建议新领域 |

**概括规则**：
- `user_turn`：守护意识自己概括（"用户要求修改 auth 模块"），不是存原文
- `progress_report` / `result_summary`：直接取子意识回报，过长二次概括
- 每条 ≤ 300 字符，保证流水账可快速扫描

#### Online Memory（守护意识 Context 中实时持有）

Offline Memory 的**子集**，注入守护意识的 system prompt。策略类似 LRU：

```
Offline 总条目数 ≤ 1000 时：
  Online = Offline 全量（所有条目原样注入）

Offline 总条目数 > 1000 时：
  Online = {
    earlySummary: "前 N-500 条的压缩概括",  // 用 LLM 生成一段总体摘要
    recentEntries: 最近 500 条原样保留       // 保持精确细节
  }
```

**更新时机**：
- 每次新条目写入 Offline 后，同步更新 Online
- 当 Offline 总量跨过 1000 阈值时，触发一次**早期概括**生成
- 之后每新增 100 条，重新生成一次早期概括（滚动压缩）

**为什么这样设计**：
- Online 始终可控（500 条 × 300 字符 ≈ 150K 字符上限，实际 LLM 会进一步压缩）
- 早期概括保留整体脉络，近期条目保留精确细节
- 守护意识的环境感知 = 早期概括（大图） + 近期条目（细节）
- Offline 全量不丢失，需要时可通过 `recall_memory` 检索

```
┌─────────────────────────────────────────────────────┐
│  Offline Memory（磁盘，全量）                         │
│  mem-001 ──── mem-500 ──── mem-1000 ──── mem-1200   │
│                                                      │
│  ↓ Online Memory 提取                                 │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  earlySummary:                                │   │
│  │  "用户在前 700 条交互中主要做了：               │   │
│  │   1. 搭建了 auth 模块（编码领域）              │   │
│  │   2. 写了 README 和 API 文档（文档领域）       │   │
│  │   3. 规则：所有文件用 UTF-8..."               │   │
│  │                                               │   │
│  │  recentEntries（最近 500 条原样）：            │   │
│  │  mem-701: [user_turn] 用户要求...             │   │
│  │  mem-702: [result_summary] 完成了...          │   │
│  │  ...                                          │   │
│  │  mem-1200: [progress_report] 正在...          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.5 Context 快照

```typescript
/** 守护意识的 Context — 动态更新 */
export interface GuardianContext {
  /** Online Memory（早期概括 + 近期条目） */
  onlineMemory: OnlineMemory;
  /** 最新消息（最近几条原始消息） */
  recentMessages: Array<{ role: string; content: string }>;
  /** 用户规则（单独列出，永久保留） */
  userRules: string[];
  /** 当前领域状态 */
  activeDomain: string | null;
  domainList: Array<{ domain: string; status: 'active' | 'sealed' }>;
}

/** 领域子意识的 Context — 封存后保存、激活后恢复 */
export interface DomainChildContext {
  domain: string;
  /** 该领域的完整对话历史 */
  messages: Array<{ role: string; content: string }>;
  /** 该领域积累的文件操作 */
  filesTouched: string[];
  /** 领域状态 */
  status: 'active' | 'sealed';
  sealedAt?: string;
  activatedAt?: string;
}
```

---

## 3. 核心机制

### 3.1 守护意识调度流程

```
用户输入
  │
  ▼
守护意识判断领域
  │
  ├── 已有匹配的活跃子意识？
  │     └── 是 → 路由消息到该子意识
  │
  ├── 已有匹配的封存子意识？
  │     └── 是 → 激活该子意识，路由消息
  │
  └── 都没有？
        └── 创建新的领域子意识，路由消息

  │
  ▼
领域子意识处理
  │
  ├── 阶段性回报 → 守护意识记入 memory 流水账
  │
  ├── 判断超出领域 → 上升给守护意识
  │     └── 守护意识封存当前子意识，创建/激活新领域子意识
  │
  └── 完成 → 结果返回守护意识 → 转发给用户
```

### 3.2 领域子意识的生命周期

```
创建                  激活                 封存
(spawning) ──▶ (active) ◀──▶ (sealed) ◀──┐
    │              │                        │
    │              │ 超出领域                │ 用户回归
    │              └──▶ 上升给守护意识 ───────┘
    │
    │ 任务彻底结束
    └──▶ (completed)
```

- **创建**：守护意识发现新领域，创建子意识并赋予领域标签
- **活跃**：子意识处理该领域内的所有用户请求
- **封存**：用户切换到其他领域，子意识 context 保存到磁盘
- **激活**：用户回到该领域，从磁盘恢复 context 继续对话
- **完成**：整个会话结束，所有子意识 context 持久化存档

### 3.3 阶段性回报机制

子意识不是全跑完才返回结果，而是在关键节点向守护意识回报：

```
用户输入："帮我修改 auth 模块"
  │
  ▼
守护意识：
  1. 记入 memory: [user_turn] "用户要求修改 auth 模块"
  2. 路由到编码子意识

  │
  ▼
子意识执行过程：
  ┌─ 读取文件 ──────────────────────────────┐
  │  → report_status("已读取 auth.ts，开始分析")  │
  ├─ 执行修改 ──────────────────────────────┤
  │  → report_status("修改了 session.ts 第15行")  │
  ├─ 运行测试 ──────────────────────────────┤
  │  → report_status("测试运行中，3/5 通过")       │
  └─ 完成 ──────────────────────────────────┘
     → 返回最终结果

守护意识接收每次回报：
  → 记入 memory 流水账一条
  → 更新环境感知（已改文件、进度、困难）
  → 不等子意识全部完成，持续感知状态
```

### 3.4 领域边界判断

子意识在 system prompt 中被告知自身领域范围：

```
## 你的领域
领域：编码
描述：代码编写、修改、调试、文件操作相关任务

## 边界判断
如果用户的请求超出你的领域（例如要求写文档、做PPT、规划项目），
使用 escalate 向守护意识报告，不要尝试处理。
```

### 3.5 Context 动态更新

守护意识的 context 不是原始消息堆积，而是动态构建：

```
┌─────────────────────────────────────────────────────┐
│  守护意识的 Context（动态构建）                       │
│                                                      │
│  ## 记忆流水账（完整故事线）                          │
│  1. [user_turn] 用户要求修改 auth 模块               │
│  2. [编码] 读取了 auth.ts 和 session.ts              │
│  3. [编码] 添加了 session 超时处理，测试通过          │
│  4. [user_turn] 用户要求写 README                    │
│  5. [domain_switch] 编码 → 文档                     │
│  6. [文档] 分析项目结构，开始写 README                │
│  7. [rule_extracted] 用户要求所有文件用 UTF-8        │
│  ...                                                 │
│                                                      │
│  ## 用户规则                                         │
│  · 所有文件必须使用 UTF-8 编码                       │
│                                                      │
│  ## 领域状态                                         │
│  · [编码] sealed (exec-xxx)                          │
│  · [文档] active (exec-yyy)                          │
│                                                      │
│  ## 最新消息                                         │
│  · user: "帮我写 API 文档"                            │
│  · ...最近几条                                        │
└─────────────────────────────────────────────────────┘
```

**关键**：流水账中 `[user_turn]` 和 `[progress_report]` `[result_summary]` 交替排列，
守护意识从头到尾扫描即可完整还原：用户要了什么 → 子意识做了什么 → 结果如何 → 用户又要了什么。
这是守护意识环境感知的**唯一信息来源**，必须完整。

每次 memory 更新后，守护意识的 context 重新构建，而非追加原始消息。

### 3.6 Memory 流水账

```
.tramber/memory/
├── index.json              # 流水账索引
└── entries/
    ├── mem-001.json        # [user_turn] 用户要求修改 auth 模块
    ├── mem-002.json        # [progress_report] 读取了 auth.ts...
    ├── mem-003.json        # [result_summary] auth 模块修改完成
    ├── mem-004.json        # [user_turn] 用户要求写 README
    ├── mem-005.json        # [domain_switch] 编码 → 文档
    └── mem-004.json        # [rule_extracted] 用户要求UTF-8
```

**写入时机**：
1. 子意识 `report_status` → 守护意识记入一条 `progress_report`
2. 子意识完成返回结果 → 守护意识记入一条 `result_summary`
3. 子意识判断超出领域 → 记入一条 `escalation`
4. 用户提出规则 → 守护意识提取后记入一条 `rule_extracted`

**二次概括**：如果子意识回报内容超过 300 字符，自动截取概括后存储。

---

## 4. 虚拟工具定义

### 4.1 dispatch_task（替代 spawn_sub_task）

守护意识的路由工具，支持领域复用：

```typescript
{
  id: 'dispatch_task',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: '任务所属领域（如"编码"、"文档"、"部署"）' },
      domainDescription: { type: 'string', description: '领域描述（帮助子意识判断边界）' },
      taskDescription: { type: 'string', description: '具体任务描述' },
      contextForChild: { type: 'string', description: '传递的关键上下文' },
      allowedTools: { type: 'array', items: { type: 'string' } }
    },
    required: ['domain', 'taskDescription']
  }
}
```

**执行逻辑**：
1. 查找是否已有该领域的活跃子意识 → 直接路由
2. 查找是否已有该领域的封存子意识 → 激活后路由
3. 都没有 → 创建新子意识，赋予领域标签

### 4.2 escalate（子意识 → 守护意识，领域外请求上升）

```typescript
{
  id: 'escalate',
  inputSchema: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: '为什么超出领域' },
      suggestedDomain: { type: 'string', description: '建议的新领域' },
      userMessage: { type: 'string', description: '用户原始请求' }
    },
    required: ['reason', 'userMessage']
  }
}
```

### 4.3 report_status（阶段性回报）

```typescript
{
  id: 'report_status',
  inputSchema: {
    type: 'object',
    properties: {
      progress: { type: 'number' },
      summary: { type: 'string', description: '当前状态简述' },
      filesChanged: { type: 'array', items: { type: 'string' } },
      difficulties: { type: 'array', items: { type: 'string' } }
    },
    required: ['progress', 'summary']
  }
}
```

### 4.4 recall_memory / request_approval / compress_and_remember

保留原有设计，调整描述和字段适配新的流水账模式。

---

## 5. 系统提示词模板

### 5.1 守护意识

```
你是 Tramber 的守护意识体，负责意识调度、环境感知和记忆管理。
你**绝不**直接执行任何操作或回答用户问题。
你的唯一工作模式：
1. 理解用户意图，判断所属领域
2. 通过 dispatch_task 路由到对应的领域子意识
3. 接收子意识的阶段性回报，记入记忆流水账
4. 子意识报告超出领域时，封存当前子意识，创建新领域子意识
5. 用户明确提出规则时，提取并单独记录

## 领域状态
{domains 列表，active / sealed}

## 记忆流水账
{memoryIndex 最近 N 条}

## 用户规则
{rules 列表}

---
{工作环境、工具列表等基础信息}
```

### 5.2 领域子意识

```
你是 Tramber 的领域执行意识 {id}，领域：{domain}。
对外你是"Tramber"，用户感知不到你的执行意识身份。
直接完成用户请求并返回结果。

## 你的领域
领域：{domain}
描述：{domainDescription}

## 边界判断
如果用户的请求明显超出你的领域范围，
使用 escalate 向守护意识报告，不要尝试处理。

## 当前任务
{taskDescription}

## 上下文
{parentContext}

## 规则
- 专注于领域内的任务
- 阶段性使用 report_status 回报进度
- 重大变更前用 request_approval 请求审批
- 完成后给出清晰的结果总结

---
{工作环境、工具列表等基础信息}
```

---

## 6. 执行流程示例

### 场景：用户先写代码，再写文档，最后回到代码

```
时间   意识体              操作                            Context 大小
──────────────────────────────────────────────────────────────────────────
T0     [guardian]          用户："帮我写一个 auth 模块"     ~500 tokens
                           判断领域：编码
                           dispatch_task(domain="编码", task="写auth模块")
                               │
T1         └─▶ [exec-编码]  创建，开始工作                    ~600 tokens
                           read_file, write_file...
                           report_status("已创建 auth.ts")
                               │
T2     [guardian]          接收回报，记入 memory              ~500 tokens
                           memory+1: "[编码] 创建了 auth.ts"
                               │
T3         └─▶ [exec-编码]  继续工作                          ~700 tokens
                           完成，返回结果
                               │
T4     [guardian]          转发结果给用户                     ~500 tokens
                           用户："帮我写个 README"
                           判断领域：文档
                           封存 exec-编码，dispatch_task(domain="文档")
                               │
T5         └─▶ [exec-文档]  创建，开始写 README               ~600 tokens
                           report_status("正在分析项目结构")
                               │
T6     [guardian]          接收回报，记入 memory              ~500 tokens
                           memory+1: "[文档] 开始写README"
                               │
T7     [guardian]          用户："回到 auth 模块，加个功能"
                           判断领域：编码
                           激活 exec-编码（恢复 context）
                           dispatch_task(domain="编码", task="加功能")
                               │
T8     [exec-编码]  ◀─      激活，恢复之前的对话上下文          ~700 tokens
                           在已有基础上继续开发
```

### Memory 流水账（index.json）

```json
[
  { "id": "mem-001", "type": "user_turn",        "domain": "编码", "summary": "用户要求写 auth 模块" },
  { "id": "mem-002", "type": "progress_report",   "domain": "编码", "summary": "创建了 auth.ts" },
  { "id": "mem-003", "type": "result_summary",    "domain": "编码", "summary": "auth 模块完成，包含登录/登出/验证" },
  { "id": "mem-004", "type": "user_turn",          "domain": "文档", "summary": "用户要求写 README" },
  { "id": "mem-005", "type": "domain_switch",      "domain": "全局", "summary": "编码 → 文档" },
  { "id": "mem-006", "type": "progress_report",    "domain": "文档", "summary": "开始写 README" },
  { "id": "mem-007", "type": "user_turn",          "domain": "编码", "summary": "用户回到 auth 模块，要加功能" },
  { "id": "mem-008", "type": "domain_switch",      "domain": "全局", "summary": "文档 → 编码（激活旧子意识）" }
]
```

### 守护意识的 Context（动态构建，始终 ≤ 500 tokens）

```
## 记忆流水账
· [编码] 创建了 auth.ts
· [编码] auth 模块完成，包含登录/登出/验证
· [文档] 开始写 README
· [编码] 用户切回编码领域

## 用户规则
（暂无）

## 领域状态
· [编码] active (exec-xxx)
· [文档] sealed (exec-yyy)

## 最新消息
· user: "回到 auth 模块，加个功能"
· ...
```

---

## 7. 目录结构

```
.tramber/
├── contexts/                          # 按会话组织
│   └── conv-xxx/                      # 一个会话
│       ├── guardian.json              # 守护意识的动态 context
│       ├── exec-xxx-coding.json       # 领域子意识（编码）完整对话
│       └── exec-yyy-docs.json         # 领域子意识（文档）完整对话
├── memory/                            # 记忆流水账
│   ├── index.json                     # 索引（按时间排列）
│   └── entries/
│       ├── mem-001.json
│       └── mem-002.json
```

**领域子意识的 context 文件**包含：
- 完整对话历史（system prompt + 所有消息）
- 领域标签、状态（active/sealed）
- 封存时间、激活时间
- 该领域涉及的文件列表

激活子意识时从文件恢复对话历史，子意识可以无缝继续。

---

## 8. 新增/修改文件清单

### 8.1 需要修改的文件

| 文件 | 变更 |
|------|------|
| `consciousness-prompts.ts` | 守护意识 prompt（只调度不执行）、领域子意识 prompt（含领域边界） |
| `consciousness-manager.ts` | 领域子意识管理（创建/查找/封存/激活）、记忆流水账写入 |
| `memory-store.ts` | 适配流水账模式（domain、sourceId 字段） |
| `spawn-sub-task.ts` → `dispatch-task.ts` | 领域路由（查找/激活/创建） |
| `context-storage.ts` | 领域子意识的封存/激活持久化 |
| `loop.ts` | 守护意识不直接回答，总是调用 dispatch_task |
| `engine.ts` | 整合新的调度流程 |
| `consciousness.ts` (types) | 新增 domain、domains、sealedDomains 等字段 |

### 8.2 新增文件

| 文件 | 用途 |
|------|------|
| `virtual-tools/dispatch-task.ts` | 替代 spawn-sub-task，支持领域路由 |
| `virtual-tools/escalate.ts` | 子意识领域外请求上升 |

### 8.3 可移除

| 文件 | 说明 |
|------|------|
| `virtual-tools/spawn-sub-task.ts` | 被 dispatch-task.ts 替代 |

---

## 9. 实施计划

### Phase 1: 类型与记忆改造（1 天）

- 更新类型定义：SelfAwarenessState 加 domain 管理、ExecutionContextState 加 domain
- 改造 MemoryStore：流水账模式（domain、sourceId、二次概括）
- 更新 context-storage：支持领域子意识的封存/激活

### Phase 2: 意识管理器改造（1.5 天）

- ConsciousnessManager 增加领域管理方法：
  - `findChildByDomain(domain)` → 查找已有子意识
  - `sealChild(id)` → 封存子意识
  - `reactivateChild(id)` → 激活子意识
  - `recordToMemory(entry)` → 记入流水账
- 守护意识 context 动态构建：记忆概括 + 最新消息 + 用户规则

### Phase 3: 虚拟工具改造（1 天）

- dispatch-task.ts：领域路由（查找 → 激活 → 创建）
- escalate.ts：子意识领域外上升
- report_status：阶段性回报自动记入 memory
- 移除 spawn-sub-task.ts

### Phase 4: 提示词与主循环（1 天）

- 守护意识 prompt：只调度不执行
- 领域子意识 prompt：领域边界 + 阶段性回报
- 主循环改造：守护意识路由用户消息到领域子意识

### Phase 5: 集成测试（1 天）

- 端到端测试：创建 → 回报 → 封存 → 激活
- Memory 流水账验证
- Context 动态更新验证
- 领域边界判断测试

---

## 10. 架构决策

### 10.1 为什么子意识按领域持久化

临时创建/销毁子意识的问题：
- 每次创建子意识都需要传递完整上下文，token 浪费
- 领域内的连续对话无法保持状态
- 子意识的领域知识无法积累

按领域持久化的好处：
- 同一领域内多轮对话直接继续，无需重复传递上下文
- 领域知识（已读文件、已做操作）自然积累
- 封存/激活机制让 context 管理更高效

### 10.2 为什么守护意识不直接回答

守护意识如果直接回答简单问题：
- 守护意识的 context 会增长（需要维护回答能力）
- 角色混乱：调度者和执行者的身份冲突
- 简单问题的边界模糊（"什么是 REST？" → 简单？复杂？）

统一路由给子意识：
- 守护意识保持极简（只有调度逻辑）
- 所有用户交互都经过子意识，对话历史在子意识中积累
- 子意识可以处理任何类型的请求（简单问候、复杂编码）

### 10.3 为什么是全量流水账

全量流水账 = 用户对话概括 + 子意识执行记录 + 规则提取 + 领域切换，按时间排列。

为什么不只是子意识执行记录：
- 守护意识需要知道**用户说了什么**，才能准确判断意图和领域
- 如果只有子意识回报，守护意识看不到用户请求的上下文
- 用户对话概括提供"为什么做这件事"的信息，子意识回报提供"做了什么"

为什么不是结构化记忆（按阶段/类型分）：
- 需要额外的分类逻辑
- 跨阶段信息难以追踪
- 实际使用中 LLM 倾向于线性时间线

全量流水账的优势：
- 按时间排列，自然反映完整会话故事线
- `user_turn` + `progress_report` + `result_summary` 交替，完整还原"用户要了什么→做了什么→结果如何"
- 每条简洁（≤ 300 字符），信息密度高
- 守护意识从头扫描即可拥有完美环境感知

### 10.4 演进路径

```
Stage 8 (当前)                    Stage 9+ (未来)
─────────────────                 ──────────────────
单智能体领域子意识                  多智能体协作
├── 守护意识（调度器）              ├── 每个 agent 有守护意识
├── 领域子意识（持久化）            ├── agent 间可通信
├── 流水账记忆                     ├── 定制 scene + workflow
└── 动态 Context                   └── TeamOrchestrator
```
