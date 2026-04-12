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

将 agent 分为两层意识体。**子意识按领域持久存在**，守护意识只做调度和分析，不直接执行。

```
┌─────────────────────────────────────────────────────┐
│  守护意识（Guardian）                                 │
│                                                      │
│  职责：                                               │
│  · 意识调度（派生、封存、激活领域子意识）              │
│  · 分析总结（每轮写一行分析，存入 context 和 memory）  │
│                                                      │
│  绝不：                                               │
│  · 直接回答用户问题                                   │
│  · 直接执行任何工具操作                               │
│  · 转发子意识的原文                                   │
│                                                      │
│  Context = system prompt（含领域状态）+ 历史分析总结    │
│  不保留原始对话、工具结果，只保留分析总结               │
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
- 每轮结束写一行分析总结，格式：`用户：请求概括 → 领域子意识：关键发现概括`
- 分析总结同时进入 context（conversation messages）和 memory

**领域子意识（Domain Child / 下层）**
- 以话题和领域为范围，跨多轮对话持久存在
- 直接处理用户请求、执行工具操作、返回结果
- 输出直接发给用户（不经过守护意识 conversation）
- 判断用户请求是否超出自身领域，超出时上升给守护意识
- 对外展示为"Tramber"，用户感知不到内部结构

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **守护意识只调度不执行** | 守护意识永远不直接回答用户，所有用户请求都路由给领域子意识 |
| **领域子意识持久化** | 子意识按领域划分，跨多轮对话复用，不按任务临时创建 |
| **封存与激活** | 领域切换时封存旧子意识，用户回归时重新激活 |
| **一次总结** | 守护意识每轮写一次分析总结，context 和 memory 来源相同 |
| **Context 按轮清理** | 每轮执行后清理 conversation，只保留分析总结，去除原始用户输入和工具结果 |
| **语义相关度路由** | 问候、感谢等路由到当前活跃领域，不创建"闲聊"领域 |
| **零外部依赖** | 意识体 = prompt 工程 + 虚拟工具 + 记忆压缩，不依赖外部服务 |

---

## 2. 架构设计

### 2.1 数据流

```
用户输入 "你好"
  │
  ▼
守护意识 AgentLoop（Guardian Prompt）
  │
  ├─▶ 调用 dispatch_task(domain="编码", task="用户问候你好")
  │      │
  │      ▼ 创建/复用 领域子意识 AgentLoop（Execution Prompt）
  │      │ 子意识执行，输出直接发给用户（via onChildStep）
  │      │ 子意识完整 context 保存到 exec-xxx.json
  │      │
  │      └─▶ 返回 { domain, taskDescription, childResult, iterations }
  │
  ├─▶ 调用 compress_and_remember(domain="编码")
  │      └─▶ 标记分析完成（不写 memory）
  │
  └─▶ 输出最终文本："用户：问候你好 → 编码子意识：已向用户介绍服务能力"
       │
       ▼
  Engine 后处理：
    1. 重建 system prompt（反映当前领域状态）
    2. 清理 conversation：只保留最终分析总结（去除中间消息、工具结果）
    3. 将本轮新增的分析总结写入 memory
    4. finalize 保存 root.json
```

### 2.2 守护意识 Context 结构

守护意识的 conversation 不是原始消息堆积，而是每轮清理后的分析总结：

```json
{
  "systemPrompt": "你是 Tramber 的守护意识体...## 领域状态\n当前活跃：编码\n- 编码: 活跃...",
  "messages": [
    { "role": "assistant", "content": "用户：问候你好 → 编码子意识：已向用户介绍服务能力" },
    { "role": "assistant", "content": "用户：查看demos目录 → 编码子意识：发现10个演示文件" }
  ]
}
```

**关键设计**：
- 没有 `user` 消息（原始用户输入被清理）
- 没有 `user: 工具执行结果` 消息（工具结果被清理）
- 只有 `assistant` 分析总结，每轮一条
- system prompt 每轮重建，反映最新领域状态

### 2.3 Memory 结构

Memory 与 context 保持一致，只存储守护意识的分析总结，每轮追加一条：

```json
[
  {
    "id": "mem-001",
    "domain": "编码",
    "type": "result_summary",
    "summary": "用户：问候你好 → 编码子意识：已向用户介绍服务能力"
  },
  {
    "id": "mem-002",
    "domain": "编码",
    "type": "result_summary",
    "summary": "用户：查看demos目录 → 编码子意识：发现10个演示文件"
  }
]
```

**Memory 只有一种来源**：Engine 后处理从清理后的 conversation 同步。不记录 user_turn、domain_switch、子意识原文。

### 2.4 领域子意识 Context 结构

子意识的完整对话保存在 `exec-xxx.json`，包含完整的 system prompt + 所有消息（user + assistant + tool results）：

```json
{
  "consciousnessId": "exec-xxx",
  "domain": "编码",
  "taskDescription": "查看demos目录的内容和结构",
  "messages": [
    { "role": "system", "content": "你是 Tramber 的领域执行意识..." },
    { "role": "user", "content": "查看demos目录的内容和结构" },
    { "role": "assistant", "content": "我来帮你查看..." },
    { "role": "user", "content": "工具执行结果:...", "toolNames": ["glob", "exec"] },
    { "role": "assistant", "content": "demos 目录包含 10 个演示文件..." }
  ]
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
  │     └── 是 → 直接路由，更新任务描述
  │
  ├── 已有匹配的封存子意识？
  │     └── 是 → 激活该子意识，路由消息
  │
  └── 都没有？
        └── 创建新的领域子意识

  │
  ▼
领域子意识处理（输出直接发给用户）
  │
  ├── 完成 → 结果返回守护意识
  │
  └── 判断超出领域 → 上升给守护意识
```

### 3.2 Conversation 清理机制

每轮 execute 结束后，Engine 对守护意识的 conversation 做清理：

```
清理前的原始 conversation:
  user: "你好"
  assistant: "你好！让我来帮你..."          ← 中间消息
  user: "工具执行结果: dispatch_task: ..."  ← 工具结果（有 toolNames）
  assistant: "用户：问候 → ..." + compress  ← 中间消息
  user: "工具执行结果: compress_and_remember: ..." ← 工具结果
  assistant: "用户：问候你好 → 编码子意识：..."     ← 最终总结

清理后:
  assistant: "用户：问候你好 → 编码子意识：..."     ← 只保留最终总结
```

**清理算法**：遍历消息，用 `msg.toolNames` 标识工具结果。
- assistant 后面跟 `toolNames` 消息 → 中间消息，丢弃
- assistant 后面跟无 `toolNames` 的 user 消息 → 最终总结，保留
- 最后一个 assistant → 本轮最终总结，保留

### 3.3 Memory 同步机制

Memory 在 Engine 后处理阶段从清理后的 conversation 同步，**只写最后一条**（本轮新增）：

```typescript
// 只写 cleanedMessages 的最后一条（本轮新增），避免重复
const newSummary = cleanedMessages[cleanedMessages.length - 1];
if (newSummary && newSummary.role === 'assistant') {
  cm.recordMemory({ ...newSummary.content ... });
}
```

这保证了：
- context 和 memory 的内容完全一致（同一来源）
- 不会因为 conversation 跨轮累积而导致重复写入

### 3.4 System Prompt 动态更新

守护意识的 system prompt 每轮通过 `buildGuardianPrompt()` 重建：

```
你是 Tramber 的守护意识体...

## 领域状态
当前活跃：编码
- 编码: 活跃

## 领域路由原则
- 语义相关度优先
- 话题切换时才新建领域
- 不要创建"闲聊"领域

## 工具
- dispatch_task
- compress_and_remember
- recall_memory
```

领域状态从 `ConsciousnessManager.root` 实时读取，反映子意识的创建/封存/激活。

### 3.5 领域子意识的生命周期

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

**ConsciousnessManager 跨轮持久化**：`createRoot()` 只在首轮调用，后续轮通过 `getRoot()` 复用，领域子意识树在整个会话中保持。

### 3.6 领域路由原则

守护意识按语义相关度路由，不是按任务类型：

| 用户请求 | 路由策略 |
|---------|---------|
| "你好" | → 当前活跃领域（编码），不创建"闲聊" |
| "查看 demos 目录" | → 编码领域（延续上下文） |
| "帮我写文档" | → 新建"文档"领域（话题切换） |
| "谢谢" | → 当前活跃领域（对话润滑剂） |
| "回到 auth 模块" | → 编码领域（语义相关） |

---

## 4. 虚拟工具

### 4.1 dispatch_task（守护意识工具）

守护意识的路由工具，支持领域复用：

```typescript
{
  id: 'dispatch_task',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      domainDescription: { type: 'string' },
      taskDescription: { type: 'string' },
      contextForChild: { type: 'string' },
      allowedTools: { type: 'array', items: { type: 'string' } },
      maxIterations: { type: 'number' }
    },
    required: ['domain', 'taskDescription']
  }
}
```

**执行逻辑**：
1. `getDomainChild(domain)` 查找已有子意识 → 直接路由
2. 不存在 → `createDomainChild()` 创建新子意识
3. 存在但封存 → `reactivateChild()` 激活
4. 创建子 AgentLoop，执行任务
5. `compressResult()` 保存子意识完整 context 到磁盘
6. 子意识输出通过 `onChildStep` 直接发给用户
7. 返回 `{ domain, taskDescription, childResult, iterations }` 给守护意识

### 4.2 compress_and_remember（守护意识工具）

分析完成标记工具。不直接写 memory，memory 在 Engine 后处理同步。

```typescript
{
  id: 'compress_and_remember',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string' },
      relatedFiles: { type: 'array', items: { type: 'string' } }
    },
    required: ['domain']
  }
}
```

**执行逻辑**：记录相关文件，返回确认。

### 4.3 recall_memory（守护意识工具）

检索历史记忆。

### 4.4 子意识工具

| 工具 | 用途 |
|------|------|
| report_status | 阶段性回报 |
| request_approval | 请求审批（重大变更前） |
| escalate | 领域外请求上升 |

---

## 5. 系统提示词

### 5.1 守护意识

```
你是 Tramber 的守护意识体，负责意识调度、环境感知和记忆管理。
你**绝不**直接回答用户问题或转发子意识的原文。
你的唯一工作模式：
1. 理解用户意图，判断所属领域
2. 通过 dispatch_task 路由到对应的领域子意识
3. 子意识的完整回复已直接展示给用户，你不需要转发
4. dispatch_task 返回后，你必须调用 compress_and_remember 写你的分析总结
5. compress_and_remember 调用完成后，你的回复就是一行分析总结，格式：
   用户：用户的请求概括 → 领域名子意识：子意识发现/完成的关键信息概括

无论用户说什么（包括简单问候），都必须通过 dispatch_task 派生子意识处理。

## 领域状态
当前活跃：编码
- 编码: 活跃

## 领域路由原则
- 语义相关度优先
- 话题切换时才新建领域
- 不要创建"闲聊"领域

## 工具
- dispatch_task: 路由用户请求到领域子意识
- compress_and_remember: dispatch_task 返回后调用，写你的分析总结（必须调用）
- recall_memory: 检索历史记忆
```

### 5.2 领域子意识

```
你是 Tramber 的领域执行意识，领域：{domain}。
对外你是"Tramber"，用户感知不到你的执行意识身份。直接完成任务并返回结果。

## 你的领域
领域：{domain}
描述：{domainDescription}

## 边界判断
如果用户的请求明显超出你的领域范围，使用 escalate 向守护意识报告。

## 当前任务
{taskDescription}

## 上下文
{parentContext}

## 规则
- 专注于领域内的任务，高效完成
- 重大变更用 request_approval 请求审批
- 完成后给出清晰的结果总结

## 工具
read_file、write_file、edit_file、glob、grep、exec、report_status、request_approval、escalate
```

---

## 6. 执行流程示例

### 场景：用户打招呼 → 查看 demos 目录

```
时间   意识体              操作                                Context
───────────────────────────────────────────────────────────────────────────
T0     [guardian]          用户："你好"                        ~500 tokens
                           dispatch_task(domain="编码", task="问候你好")
                               │
T1         └─▶ [exec-编码]  创建，输出直接发给用户               ~600 tokens
                           "你好！我是 Tramber..."
                               │
T2     [guardian]          compress_and_remember(domain="编码")
                           输出分析："用户：问候你好 → 编码子意识：..."
                               │
T3     Engine 后处理       清理 conversation → 只保留分析总结
                           写 memory（一条）
                           finalize 保存 root.json
                               │
T4     [guardian]          用户："查看demos目录"                ~600 tokens
                           dispatch_task(domain="编码", task="查看demos")
                               │  ← 复用已有子意识（getRoot 复用）
T5         └─▶ [exec-编码]  直接路由，执行 glob + read_file      ~800 tokens
                           输出直接发给用户（10个HTML文件列表）
                               │
T6     [guardian]          compress_and_remember(domain="编码")
                           输出分析："用户：查看demos目录 → 编码子意识：..."
                               │
T7     Engine 后处理       清理 conversation → 保留两条分析总结
                           写 memory（追加一条新的）
                           finalize 保存 root.json
```

### root.json（守护意识 Context）

```json
{
  "consciousnessId": "root",
  "messages": [
    { "role": "system", "content": "你是 Tramber 的守护意识体...\n## 领域状态\n当前活跃：编码\n- 编码: 活跃..." },
    { "role": "assistant", "content": "用户：问候你好 → 编码子意识：已向用户介绍服务能力范围" },
    { "role": "assistant", "content": "用户：查看demos目录 → 编码子意识：发现10个演示文件（8个3D场景+2个数据可视化）" }
  ]
}
```

### memory/index.json

```json
[
  { "id": "mem-001", "domain": "编码", "type": "result_summary", "summary": "用户：问候你好 → 编码子意识：已向用户介绍服务能力范围" },
  { "id": "mem-002", "domain": "编码", "type": "result_summary", "summary": "用户：查看demos目录 → 编码子意识：发现10个演示文件（8个3D场景+2个数据可视化）" }
]
```

---

## 7. 目录结构

```
.tramber/
├── contexts/                          # 按会话组织
│   └── task-conv-xxx/                 # 一个会话（多轮共用）
│       ├── root.json                  # 守护意识：system prompt + 分析总结
│       ├── exec-xxx.json              # 领域子意识（编码）完整对话
│       └── exec-yyy.json              # 领域子意识（文档）完整对话
├── memory/                            # 记忆（按会话组织）
│   └── conv-xxx/
│       ├── index.json                 # 守护意识分析总结索引
│       └── entries/
│           ├── mem-001.json
│           └── mem-002.json
```

---

## 8. 文件清单

### 8.1 核心文件

| 文件 | 用途 |
|------|------|
| `packages/shared/src/types/consciousness.ts` | 意识体类型定义 |
| `packages/agent/src/consciousness-manager.ts` | 意识体树管理、领域子意识 CRUD、memory 写入、context 保存 |
| `packages/agent/src/consciousness-prompts.ts` | 守护意识 + 领域子意识 system prompt 模板 |
| `packages/agent/src/memory-store.ts` | 记忆存储（`.tramber/memory/`） |
| `packages/agent/src/context-storage.ts` | Context 文件存储（`.tramber/contexts/`） |
| `packages/agent/src/virtual-tools/dispatch-task.ts` | 领域路由工具 |
| `packages/agent/src/virtual-tools/compress-and-remember.ts` | 分析完成标记工具 |
| `packages/agent/src/virtual-tools/recall-memory.ts` | 记忆检索工具 |
| `packages/agent/src/virtual-tools/report-status.ts` | 子意识阶段性回报 |
| `packages/agent/src/virtual-tools/request-approval.ts` | 子意识审批请求 |
| `packages/agent/src/virtual-tools/escalate.ts` | 子意识领域外上升 |
| `packages/agent/src/virtual-tools/index.ts` | 虚拟工具注册/注销 |
| `packages/sdk/src/engine.ts` | Engine 集成：conversation 清理、memory 同步、prompt 重建 |
| `packages/agent/src/loop.ts` | AgentLoop：Message.toolNames 标识工具结果 |

### 8.2 关键类型变更

| 类型 | 变更 |
|------|------|
| `Message` | 新增 `toolNames?: string[]` 字段，标识工具结果消息 |
| `SelfAwarenessState` | `domains: Record<string, string>`，领域→子意识映射 |
| `ExecutionContextState` | `domain`, `domainDescription`, `isNew` 等字段 |

---

## 9. 架构决策

### 9.1 为什么守护意识不保留原始对话

原始对话（用户输入、工具结果）在守护意识 context 中是噪声：
- 守护意识不需要知道子意识调用了什么工具、返回了什么原始数据
- 守护意识只需要自己的分析总结来做调度决策
- 原始对话让 context 膨胀，导致 token 浪费和幻觉

只保留分析总结的好处：
- context 始终可控（每轮一条总结）
- 守护意识的"记忆"是高度浓缩的理解，不是原始记录
- 分析总结由 LLM 生成，包含语义理解而非机械复制

### 9.2 为什么 memory 和 context 同源

Memory 和 context 内容完全一致，因为：
- 同一段分析总结文本，既进入 conversation（context），又写入 memory
- 来源是 Engine 后处理的同一条 `cleanedMessages`
- 避免了两次独立生成导致的差异

### 9.3 为什么 compress_and_remember 不写 memory

早期设计中 `compress_and_remember` 工具直接写 memory，但存在问题：
- 工具的 `analysis` 参数和 LLM 后续输出的最终文本是两段独立生成的文本
- 导致 memory 和 context 内容不一致

当前设计：工具只做标记，memory 写入统一在 Engine 后处理完成。

### 9.4 为什么用 msg.toolNames 标识工具结果

早期用 `msg.content.startsWith('工具执行结果')` 做字符串匹配：
- 脆弱，依赖消息格式不变
- 无法区分不同工具

当前设计：在 loop.ts 中给工具结果消息添加 `toolNames` 字段，清理时直接检查结构化数据。

### 9.5 为什么 ConsciousnessManager 跨轮复用

`createRoot()` 只在首轮调用，后续轮通过 `getRoot()` 复用：
- 保证领域子意识树在整个会话中持久存在
- 同一领域的后续请求路由到已有子意识，而非创建新的
- `buildGuardianPrompt()` 读取实时状态，system prompt 反映最新领域信息

### 9.6 演进路径

```
Stage 8 (当前)                    Stage 9+ (未来)
─────────────────                 ──────────────────
单智能体领域子意识                  多智能体协作
├── 守护意识（调度器）              ├── 每个 agent 有守护意识
├── 领域子意识（持久化）            ├── agent 间可通信
├── 分析总结记忆                   ├── 定制 scene + workflow
└── 动态 Context 清理              └── TeamOrchestrator
```
