# Tramber Stage 3: 多轮对话与工具增强

> **创建时间**: 2026-03-27
> **前置依赖**: Stage 1 (MVP), Stage 2 (IO 架构重构)
> **预计周期**: 5-6 个工作日

---

## Stage 3 增强后架构图

### 架构定位：Engine 与 Client 分离

Tramber 的长期目标是 **Engine 作为中心服务，多个 Client 通过 WebSocket 连接**。Stage 3 采用方案 B（Client 各自持有 Conversation，Engine 无状态），为后续服务化演进打好基础。

**关键设计原则**：
- **Engine 是纯计算引擎**：不持有任何会话状态（Conversation），只负责 Agent Loop 执行
- **Client 是状态持有者**：管理自己的 Conversation、IO、会话生命周期
- **Engine 和 Client 各自有工具**：Engine 持有核心工具（read/write/edit/glob/grep/exec），Client 持有私有工具（如 CLI 的 readline_input）

```
Stage 3: Engine(无状态) ← 直接调用 ← Client(持有 Conversation)     ← 当前
Stage 4: Engine(无状态) ← WebSocket   ← Client(持有 Conversation)  ← 通信升级
Stage 5: Engine(管理session) ← WebSocket ← Client(只读缓存)        ← 状态升级
```

### 系统架构图（Stage 3）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Client Layer (CLI / Web / Bot)                        │
│                                                                             │
│  Client 的职责:                                                              │
│  · 管理 Conversation（对话历史、token 用量）                                  │
│  · 管理 IO（输入输出、流式显示）                                               │
│  · 持有 Client 私有工具（CLI: readline, clipboard）                            │
│  · 调用 Engine 执行任务，传入 Conversation                                     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │  execute(task, conversation)
                                │  返回: result + updatedConversation
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Engine Layer (TramberEngine)                          │
│                                                                             │
│  Engine 的职责:                                                               │
│  · Agent Loop 执行（纯计算，无状态）                                            │
│  · 持有核心工具（read_file, write_file, edit_file ★, glob, grep, exec）      │
│  · 权限检查（PermissionChecker）                                              │
│  · Scene / Skill / Routine 管理                                               │
│  · Experience 经验管理                                                        │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │  AgentLoop ★     │  │ ToolRegistry     │  │ PermissionChecker          │  │
│  │  (多轮循环)       │  │ ┌──────────────┐ │  │                            │  │
│  │                  │  │ │ readFileTool │ │  │                            │  │
│  │  · 接收外部     │  │ │ writeFileTool│ │  │                            │  │
│  │    conversation │  │ │ editFileTool★│ │  │                            │  │
│  │  · 流式输出 ★   │  │ │ globTool     │ │  │                            │  │
│  │  · 上下文管理 ★ │  │ │ grepTool     │ │  │                            │  │
│  └────────┬─────────┘  │ │ execTool     │ │  └────────────────────────────┘  │
│           │            │ └──────────────┘ │                                │
│           │            └──────────────────┘                                │
│           │                                                                 │
│           ▼                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ Provider         │  │ Scene/Skill      │  │ Experience                 │  │
│  │ (Anthropic)      │  │ Routine          │  │                            │  │
│  │ · chat()         │  │                  │  │                            │  │
│  │ · stream() ★     │  │                  │  │                            │  │
│  └──────────────────┘  └──────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

★ = Stage 3 新增/增强的模块
虚线 = 未来 WebSocket 连接（Stage 4+）
```

### 数据流：多轮对话（Stage 3 — Client 持有 Conversation）

```
用户: "读取 package.json"
  │
  ▼
CLI Client
  ├─ conversation 存在？ 否 → createConversation()
  ├─ 调用 Engine.execute(task, conversation)
  │    └─ AgentLoop: 从 conversation.messages 恢复上下文
  │    └─ 调用 LLM → 工具: read_file → 返回结果
  │    └─ 返回 { result, updatedConversation }
  └─ Client 保存 updatedConversation ←──────┐
                                            │
用户: "添加一个 devDependency"               │ 复用同一个 conversation
  │                                          │
  ▼                                          │
CLI Client                                   │
  ├─ conversation 存在？ 是 ←───────────────┘
  ├─ 调用 Engine.execute(task, conversation)
  │    └─ conversation.messages 包含上一轮完整历史
  │    └─ AI 拥有 package.json 上下文，直接操作
  │    └─ 返回 { result, updatedConversation }
  └─ Client 更新 conversation

用户: "/clear"
  └─ Client 丢弃 conversation，下次输入创建新会话
```

### 数据流：流式输出

```
Provider.stream()
  │
  ├── text_delta 事件 ──→ onStep({ type: 'text_delta', content: "..." })
  │                          └─ CLI: process.stdout.write(delta)  ← 不换行，逐步显示
  │
  ├── tool_use 事件 ──→ 累积 tool_calls（不立即执行）
  │
  └── message_stop ──→ 检查累积的 tool_calls
                         ├─ 有 → 权限检查 → 执行工具 → 继续下一轮
                         └─ 无 → 对话结束
```

### 数据流：上下文窗口管理

```
Client 在每次调用 Engine 前，自行管理 conversation:

conversation.messages 增长
  │
  ▼ Client: tokenEstimate() 估算 token 数
  │
  ├── 未超过阈值 → 正常调用 Engine
  │
  └── 超过阈值 → Client: manageContextWindow()
       │
       ├── Step 1: 截断旧的工具结果（保留摘要行）
       │
       ├── Step 2: 仍超限？→ 调用 Engine 生成摘要替换旧消息
       │    └─ system prompt + summary + recent messages
       │
       └── Step 3: 更新 conversation.hasSummary = true
```

### 演进路线：未来 WebSocket 架构（Stage 4+）

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  CLI Client   │    │  Web Client  │    │ TGBot Client │
│  ┌──────────┐ │    │  ┌──────────┐ │    │  ┌──────────┐ │
│  │ IO Layer │ │    │  │ IO Layer │ │    │  │ IO Layer │ │
│  │ Session  │ │    │  │ Session  │ │    │  │ Session  │ │
│  │CLI Tools │ │    │  │DOM Tools │ │    │  │Bot Tools │ │
│  └────┬─────┘ │    │  └────┬─────┘ │    │  └────┬─────┘ │
└───────┼────────┘    └───────┼────────┘    └───────┼────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │ WebSocket
                              ▼
                    ┌─────────────────────┐
                    │   TramberEngine     │
                    │   (统一服务)         │
                    └─────────────────────┘
```

---

## 一、背景与动机

### 1.1 Stage 1-2 成果回顾

**Stage 1 (MVP)** 完成了核心系统骨架：
- 11 个包：agent, client, experience, permission, provider, routine, scene, sdk, shared, skill, tool
- Agent Loop 执行引擎（Gather Context → Take Action → Verify Results）
- 权限系统（allow/confirm/deny 四级控制）
- Experience 经验系统（文件存储 + 关键词检索）
- Scene/Skill/Routine 基础体系
- CLI 客户端（REPL + 单次命令模式）
- 全局 Logger 调试系统

**Stage 2 (IO 架构重构)** 完成了 CLI 交互层的质量提升：
- 三层架构：IO Layer → Interaction Layer → REPL Layer
- 状态机管理（IDLE/EXECUTING/WAITING_INPUT）
- 统一 OutputManager
- 修复 exec 工具卡死问题
- CommandHandler 分离、SingleCommandExecutor 支持

### 1.2 当前核心问题

经过 Stage 1-2，系统可以运行单次任务，但存在以下**阻塞性问题**：

| # | 问题 | 严重度 | 影响 |
|---|------|--------|------|
| 1 | **不支持多轮对话** | P0 | 每次输入都是全新任务，无法在对话中累积上下文 |
| 2 | **无文件编辑工具** | P0 | AI 只有 read/write，无法精准编辑代码（必须重写整个文件） |
| 3 | **系统提示词过于简陋** | P1 | 缺乏代码规范、行为准则、项目结构感知能力 |
| 4 | **无流式输出** | P1 | 用户等待完整响应，体验差，尤其是长输出 |
| 5 | **上下文窗口管理缺失** | P1 | 长对话会超出 token 限制，无摘要/截断策略 |
| 6 | **工具数量不足** | P1 | 缺少 git、glob 等常用工具的完整实现 |
| 7 | **Experience 未实际接入** | P1 | 系统有经验框架但从未自动记录过任何经验 |

### 1.3 Stage 3 定位

```
Stage 1 (MVP)          → 能跑
Stage 2 (IO 重构)      → 跑得稳
Stage 3 (多轮对话+工具) → 能用  ← 本阶段目标
Stage 4 (生态建设)      → 好用
```

Stage 3 的核心目标是让 Tramber 从 "能跑 demo" 变成 "能日常使用"。多轮对话是最基础的交互模式，没有它就不存在真正的使用体验。工具增强（特别是 edit_file）是 AI 编程助手的核心能力。

---

## 二、设计决策

### 2.1 Engine / Client 架构决策

**核心原则**：Engine 无状态，Client 持有 Conversation。

选择这个方案的原因：
- Stage 3 是 CLI 单用户场景，不需要复杂的服务端状态管理
- Engine 无状态使得 Agent Loop 的测试更简单（纯输入→输出）
- 为 Stage 4 的 WebSocket 服务化演进提供清晰路径（只需加通信层，不改 Engine 逻辑）
- Conversation 数据管理在 Client 侧，Client 对自己的用户体验有最直接的控制

**工具归属**：
- **Engine Tools**（核心，共享）：read_file, write_file, edit_file, glob, grep, exec
- **Client Tools**（私有，按客户端类型）：CLI 可有 readline_input, clipboard 等

### 2.2 多轮对话设计

**核心思路**：Conversation 是纯数据对象，由 Client 创建和持有。每次调用 Engine 时传入，Engine 返回更新后的 Conversation。

```
Client: 创建 Conversation → Engine.execute(task, conversation) → 收到 updatedConversation → 保存
Client: 复用 Conversation → Engine.execute(task, conversation) → 收到 updatedConversation → 保存
Client: /clear → 丢弃 Conversation → 下次创建新的
```

**Conversation 持久化边界**：
- Conversation 存在于 Client 内存中，生命周期 = CLI 会话
- Engine 不持有 Conversation，每次调用都是传入+返回
- 不做文件持久化（Stage 5 再考虑 Checkpoint）
- 每个 CLI 会话只有一个活跃 Conversation

### 2.2 edit_file 工具设计

**核心思路**：基于 "old_string → new_string" 的精准替换模式，而非行号模式。

```typescript
interface EditFileInput {
  file_path: string;
  old_string: string;    // 要替换的原始文本（必须精确匹配）
  new_string: string;    // 替换后的文本
}
```

理由：
- 行号模式在 AI 生成时容易出错（diff 导致行号偏移）
- old_string 模式天然处理了并发编辑场景
- Claude Code、Cursor 等主流工具都采用此模式

### 2.3 系统提示词策略

采用**动态系统提示词**：基础提示词 + 项目感知注入。

```
┌─────────────────────────────────────────────────┐
│  基础系统提示词                                   │
│  - AI 角色定义                                   │
│  - 行为准则                                      │
│  - 工具使用规范                                   │
├─────────────────────────────────────────────────┤
│  项目上下文注入（动态生成）                        │
│  - 项目结构概览                                  │
│  - 技术栈信息                                    │
│  - 用户偏好（如有）                               │
├─────────────────────────────────────────────────┤
│  对话上下文                                      │
│  - 之前的对话历史                                 │
│  - 当前文件状态                                   │
└─────────────────────────────────────────────────┘
```

### 2.4 流式输出设计

采用**事件驱动模型**，与现有 `onStep` 回调兼容：

```typescript
// 流式输出只在 CLI 层面处理，不影响 Agent Loop 逻辑
// Provider 的 stream() 方法已经实现，只需在 SDK/CLI 层接入
```

### 2.5 上下文窗口管理

**策略**：滑动窗口 + 自动摘要

```
┌──────────────────────────────────────────────────────────────┐
│  System Prompt (固定)                                         │
├──────────────────────────────────────────────────────────────┤
│  Recent Messages (保留最近 N 条，确保最新上下文完整)            │
├──────────────────────────────────────────────────────────────┤
│  Summary (较早的对话历史，AI 自动生成的摘要)                   │
├──────────────────────────────────────────────────────────────┤
│  Tool Results (仅保留最近 M 次工具结果，旧的截断)             │
└──────────────────────────────────────────────────────────────┘
```

### 2.6 不包含项

以下内容**不在 Stage 3 范围内**：
- WebSocket 服务化（Stage 4）
- Web 客户端（Stage 4）
- 多 Provider 支持（Stage 4）
- Workflow 系统（Stage 4）
- Checkpoint/回滚（Stage 4）
- 插件系统（Stage 5）
- Scene 固化机制（Stage 4）
- 向量检索（Stage 5）
- Engine 管理 session（Stage 5）
- TramberClient → TramberEngine 重命名（Stage 4 统一重构时进行）

---

## 三、当前架构变更分析

### 3.1 需要修改的包

```
packages/agent/src/loop.ts        → 支持接收外部 Conversation，不再每次创建新上下文
packages/agent/src/types.ts       → 新增 Conversation 类型
packages/sdk/src/engine.ts        → 改为无状态执行引擎，不再管理 Conversation
packages/sdk/src/types.ts         → 新增 Conversation 相关类型
packages/client/cli/src/repl.ts   → Client 持有 Conversation，传入 Engine
packages/client/cli/src/task.ts   → 管理 Conversation 生命周期
packages/tool/src/builtin/file.ts → edit_file 增强为多段替换
packages/shared/src/types/agent.ts → 可能需要调整 AgentContext
```

### 3.2 需要新建的文件

```
packages/agent/src/conversation.ts    → Conversation 纯数据对象 + 工具函数
```

### 3.3 数据流变化

**Before (Stage 2)**:
```
用户输入 → CLI → SDK(TramberClient).execute(description) → AgentLoop.execute(task) → 新建 AgentContext → 返回
```

**After (Stage 3)**:
```
用户输入 → CLI(Client) → 持有 conversation → SDK(TramberEngine).execute(task, conversation) → 返回 updatedConversation
                                                                    ↑
                                              Engine 无状态，不保存 conversation
```

---

## 四、核心类型设计

### 4.1 Conversation 类型

```typescript
// packages/agent/src/conversation.ts

interface Conversation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  /** 系统提示词（创建时确定，后续不变） */
  systemPrompt: string;
  /** 对话消息历史 */
  messages: Message[];
  /** 累计 token 使用量 */
  tokenUsage: TokenUsage;
  /** 累计迭代次数 */
  totalIterations: number;
  /** 项目信息（创建时确定） */
  projectInfo: ProjectInfo;
  /** 上下文窗口管理配置 */
  contextWindow: {
    maxTokens: number;           // 上下文窗口最大 token 数
    summaryThreshold: number;    // 触发摘要的消息条数阈值
    maxToolResults: number;      // 保留的最大工具结果条数
  };
  /** 是否已生成摘要 */
  hasSummary: boolean;
  /** 摘要内容 */
  summary?: string;
}

interface ConversationOptions {
  systemPrompt: string;
  projectInfo: ProjectInfo;
  maxContextTokens?: number;      // 默认 128000
  summaryThreshold?: number;      // 默认 20 条消息
  maxToolResults?: number;        // 默认 10 条
}
```

### 4.2 AgentLoop 接口变更

```typescript
// packages/agent/src/loop.ts 变更

// execute 方法签名变更：接收外部 Conversation，返回更新后的 Conversation
class AgentLoop {
  async execute(task: Task, conversation?: Conversation): Promise<AgentLoopResult & { conversation: Conversation }>;
}
```

### 4.3 SDK (TramberEngine) 接口变更

```typescript
// packages/sdk/src/engine.ts — TramberEngine 改为无状态

class TramberEngine {
  // 不再持有 conversation 成员变量
  // execute() 接收 conversation 参数并返回，不存储
  async execute(task: Task, conversation?: Conversation, options?: ExecuteOptions): Promise<TramberResponse>;

  // 新增：构建系统提示词（由 Client 调用来创建 Conversation）
  buildSystemPrompt(): string;
}
```

### 4.4 Client 侧 Conversation 管理

```typescript
// packages/client/cli/src/ — CLI Client 持有 Conversation

// REPL 模式：Client 持有 conversation，跨轮复用
let conversation: Conversation | undefined;

// 用户输入时
async function handleInput(input: string) {
  if (!conversation) {
    conversation = createConversation({
      systemPrompt: engine.buildSystemPrompt(),
      projectInfo: { rootPath: process.cwd(), name: 'project' }
    });
  }

  const result = await engine.execute({ description: input }, conversation, { ... });
  conversation = result.conversation;  // Client 保存更新后的 conversation
}

// /clear 时
function handleClear() {
  conversation = undefined;  // Client 丢弃，Engine 无感知
}

// 单次命令模式：每次创建新的 conversation，用完即弃
async function handleSingleCommand(input: string) {
  const conv = createConversation({ ... });
  const result = await engine.execute({ description: input }, conv, { ... });
  // conv 不再使用
}
```

### 4.4 edit_file 工具增强

当前 `edit_file` 已存在于 `packages/tool/src/builtin/file/index.ts`，已注册到 SDK，但只支持单段替换。需要增强为多段替换。

**现有实现问题**：
- 只接受 `oldString` + `newString` 单对替换
- `content.replace()` 只替换第一个匹配，但不检测是否唯一
- 不返回变更摘要（多少行被修改）
- old_string 不唯一时静默替换第一个，可能导致错误修改

**增强后的接口设计**：

```typescript
// packages/tool/src/builtin/file/index.ts - editFileTool 增强

// 新增输入参数：edits 数组（与旧的 oldString/newString 兼容）
inputSchema: {
  type: 'object',
  properties: {
    path: { type: 'string', description: '文件路径' },
    edits: {
      type: 'array',
      description: '替换数组，每项包含 oldString 和 newString',
      items: {
        type: 'object',
        properties: {
          oldString: { type: 'string' },
          newString: { type: 'string' }
        },
        required: ['oldString', 'newString']
      }
    },
    // 保留旧参数以向后兼容
    oldString: { type: 'string', description: '单段替换的旧文本（edits 为空时使用）' },
    newString: { type: 'string', description: '单段替换的新文本' }
  }
}

// 增强后的返回值
interface EditFileResult {
  success: boolean;
  data?: {
    editsApplied: number;
    changes: Array<{ index: number; oldLines: number; newLines: number }>;
  };
  error?: string;
}
```

**关键增强点**：
1. **多段替换**：`edits` 数组支持一次调用中批量替换
2. **唯一性检测**：old_string 匹配多个位置时返回错误，附带匹配位置提示
3. **未找到提示**：old_string 不存在时返回错误，提示 AI 重新读取文件
4. **原子性**：从后往前替换，避免位置偏移；所有验证通过后才写入
5. **变更摘要**：返回每次替换的行数变化
6. **向后兼容**：仍支持 `oldString`/`newString` 单对格式

---

## 五、开发任务清单

### Phase 1: Conversation 管理 (0.5 天)

创建 `packages/agent/src/conversation.ts`：

- [x] 定义 `Conversation` 接口和 `ConversationOptions`
- [x] 实现 `createConversation(options)` 工厂函数
- [x] 实现 `addMessage(conversation, message)` -- 添加消息到对话
- [x] 实现 `getMessagesForLLM(conversation)` -- 获取发送给 LLM 的消息列表
- [x] 实现 `updateTokenUsage(conversation, usage)` -- 更新 token 使用量
- [x] 消息格式转换：`Message` ↔ Provider `ChatMessage`
- [x] 单元测试

```typescript
// conversation.ts 核心接口
export function createConversation(options: ConversationOptions): Conversation;
export function addMessage(conversation: Conversation, message: Message): void;
export function getMessagesForLLM(conversation: Conversation): Array<{ role: string; content: string }>;
export function updateTokenUsage(conversation: Conversation, usage: Partial<TokenUsage>): void;
```

### Phase 2: Agent Loop 支持多轮对话 (0.5 天)

修改 `packages/agent/src/loop.ts`：

- [x] `execute()` 方法新增可选 `conversation` 参数
- [x] 如果传入 `conversation`，从 `conversation.messages` 恢复上下文
- [x] 如果未传入 `conversation`，创建新的（兼容单次命令模式）
- [x] 执行完成后，更新 `conversation` 并通过 `AgentLoopResult` 返回
- [x] 将系统提示词的构建移到 `conversation.systemPrompt` 中（创建时一次性生成）
- [x] `AgentLoopResult` 新增 `conversation` 字段
- [x] 单元测试

关键逻辑变更：

```typescript
async execute(task: Task, conversation?: Conversation): Promise<AgentLoopResult> {
  // 如果没有 conversation，创建一个（兼容单次命令）
  if (!conversation) {
    conversation = createConversation({
      systemPrompt: this.buildSystemPrompt(),
      projectInfo: { rootPath: process.cwd(), name: 'project' }
    });
  }

  // 从 conversation 恢复上下文
  const context: AgentContext = {
    task,
    messages: getMessagesForLLM(conversation),  // 复用历史消息
    // ... 其他字段
  };

  // 添加当前用户输入
  context.messages.push({ role: 'user', content: task.description });
  addMessage(conversation, { role: 'user', content: task.description });

  // 运行循环
  const result = await this.runLoop(context);

  // 将 AI 响应和工具结果保存到 conversation
  // ... 更新 conversation.messages
  // ... 更新 conversation.tokenUsage

  // 返回更新后的 conversation
  return { ...result, conversation };
}
```

### Phase 3: SDK 层 Engine 无状态化 (0.5 天)

修改 `packages/sdk/src/engine.ts`（当前为 `client.ts`）：

- [x] 移除 `conversation` 成员变量（Engine 不持有会话状态）
- [x] `execute()` 新增可选 `conversation` 参数，传递给 `AgentLoop`
- [x] `execute()` 返回时包含更新后的 `conversation`，但不存储
- [x] 新增 `buildSystemPrompt()` 公开方法，供 Client 创建 Conversation 时使用
- [x] 文件重命名：`client.ts` → `engine.ts`，类名 `TramberClient` → `TramberEngine`
- [x] 更新 `TramberResponse` 类型：新增 `conversation` 和 `terminatedReason` 字段

### Phase 4: CLI 层多轮对话适配 — Client 持有 Conversation (0.5 天)

修改 `packages/client/cli/src/`：

- [x] `repl.ts`：创建并持有 `conversation` 变量，跨轮复用
- [x] `task.ts`：接收 `conversation` 参数，传递给 `Engine.execute()`，保存返回的 conversation
- [x] `single-command-executor.ts`：单次命令模式，每次创建新的 conversation，用完即弃
- [x] REPL 命令 `/clear`：清除对话历史（已有 CommandHandler 支持）
- [ ] ~~新增 REPL 命令 `/history`：显示对话历史条数和 token 使用量~~ ⏸ 暂缓

### Phase 5: edit_file 工具增强为多段替换 (0.5 天)

修改 `packages/tool/src/builtin/file/index.ts` 中已有的 `editFileTool`：

- [x] 新增 `edits` 数组参数，支持批量替换
- [x] 保留 `oldString`/`newString` 单对参数向后兼容
- [x] 实现唯一性检测：`old_string` 匹配多个位置时返回错误 + 行号上下文
- [x] 实现未找到提示：`old_string` 不存在时返回错误 + 提示 AI 重读文件
- [x] 实现原子替换：从后往前应用 edits，验证全部通过后才写入文件
- [x] 返回变更摘要：`{ editsApplied, changes: [{ index, oldLines, newLines }] }`
- [x] 提取辅助函数：`countOccurrences()`, `findNonUniqueEdit()`, `getOccurrenceContext()`
- [x] 更新单元测试

### Phase 6: 系统提示词增强 (0.5 天)

修改 `packages/agent/src/loop.ts` 的 `buildSystemPrompt()`：

- [x] 增强 AI 角色定义和行为准则
- [x] 添加代码编辑规范（优先使用 edit_file 而非 write_file）
- [x] 添加文件操作规范（先读后改、路径使用规范）
- [x] 添加错误处理准则（工具失败时的恢复策略）
- [x] 添加输出规范（简洁回答、避免重复）
- [x] 系统提示词模板化，便于后续扩展

新的系统提示词结构：

```
你是一个编程助手 {name}，{description}。

## 核心准则
- 优先使用 edit_file 修改代码，仅创建新文件时使用 write_file
- 修改文件前必须先读取确认当前内容
- 简洁回答，不要重复用户已知信息
- 遇到错误时分析原因并尝试恢复

## 工具使用规范
- read_file: 读取文件内容
- edit_file: 修改文件中的指定内容（推荐）
- write_file: 创建新文件或完全重写文件
- glob: 按文件名模式搜索
- grep: 按内容搜索
- exec: 执行 shell 命令

## 工作环境
- 当前工作目录: {cwd}
- 文件路径可以是相对路径或绝对路径

## 可用工具
{tool_list}
```

### Phase 7: 流式输出支持 (1 天)

**7.1 Provider 层**（已有基础）：

- [x] 确认 `AnthropicProvider.stream()` 实现正确
- [x] 测试流式输出的 text_delta 和 tool_use 事件

**7.2 Agent Loop 层**：

- [x] `callLLM()` 新增 `stream: boolean` 选项
- [x] 流式模式下，通过 `onStep` 逐步发送 text delta
- [x] 流式模式下，工具调用事件的处理
- [x] 流式模式下，确保完整收集所有 tool_calls 后再执行

**7.3 SDK 层**：

- [x] `ExecuteOptions.stream` 传递到 `AgentLoop`
- [x] `ProgressUpdate` 新增 `type: 'text_delta'` 用于流式文本
- [ ] ~~`ProgressUpdate` 新增 `type: 'tool_use_start'` 和 `type: 'tool_use_delta'` 用于流式工具调用~~ ⏸ 暂缓

**7.4 CLI 层**：

- [x] 流式文本：直接 `process.stdout.write(delta)`，不换行
- [x] 工具调用：流式模式下，先显示 "调用工具: xxx"，结果完成后显示
- [x] 非 REPL 模式：默认开启流式

```typescript
// 新的 ProgressUpdate 类型
type ProgressUpdate =
  | { type: 'text_delta'; content: string }
  | { type: 'thinking'; iteration: number; content: string }
  | { type: 'tool_call'; iteration: number; toolCall: { name: string; parameters: Record<string, unknown> } }
  | { type: 'tool_result'; iteration: number; toolResult: { success: boolean; data?: unknown; error?: string } }
  | { type: 'step'; content: string }
  | { type: 'complete'; content?: string }
  | { type: 'error'; error: string };
```

### Phase 8: 上下文窗口管理 (0.5 天)

修改 `packages/agent/src/conversation.ts`：

- [x] 实现 `trimConversation(conversation)` -- 消息截断策略
- [x] 实现 `summarizeConversation(conversation, provider)` -- AI 摘要生成
- [x] 截断策略：
  - 保留 system prompt
  - 保留最近 N 条消息（默认 20 条）
  - 较早的工具结果：只保留摘要行（截断 data 字段）
  - 当消息数超过阈值时，触发 AI 生成摘要
- [x] 在 `execute()` 执行前自动检查并管理上下文窗口

```typescript
async function manageContextWindow(
  conversation: Conversation,
  provider: AIProvider,
  options?: { maxTokens?: number; summaryThreshold?: number }
): Promise<void> {
  // 1. 估算当前 token 使用量
  // 2. 如果超过阈值：
  //    a. 截断旧的工具结果（只保留摘要）
  //    b. 如果仍然超限，AI 生成摘要替换旧消息
  // 3. 更新 conversation.hasSummary
}
```

### Phase 9: 集成测试和文档 (0.5 天)

- [ ] ~~多轮对话端到端测试：3 轮对话，验证上下文累积~~ ⏸ 暂缓
- [ ] ~~edit_file 工具端到端测试：各种边界情况~~ ⏸ 暂缓
- [ ] ~~流式输出端到端测试：验证文本逐步输出~~ ⏸ 暂缓
- [ ] ~~上下文窗口管理测试：超长对话的截断和摘要~~ ⏸ 暂缓
- [x] 更新 Stage 3 文档

---

## 六、实施优先级

### P0 -- 必须完成（多轮对话 + edit_file 增强）

```
Phase 1: Conversation 管理           0.5 天
Phase 2: Agent Loop 多轮支持          0.5 天
Phase 3: SDK Conversation 管理        0.5 天
Phase 4: CLI 多轮适配                 0.5 天
Phase 5: edit_file 增强为多段替换      0.5 天
─────────────────────────────────────────
P0 小计                              2.5 天
```

### P1 -- 应该完成（体验优化）

```
Phase 6: 系统提示词增强              0.5 天
Phase 7: 流式输出                   1.0 天
Phase 8: 上下文窗口管理             0.5 天
───────────────────────────────────────
P1 小计                            2.0 天
```

### P2 -- 可选完成

```
Phase 9: 集成测试和文档              0.5 天
```

### 总时间估算

| 优先级 | 时间 | 说明 |
|--------|------|------|
| P0 | 2.5 天 | 多轮对话 + edit_file 增强，Stage 3 核心 |
| P1 | 2 天 | 体验优化，建议完成 |
| P2 | 0.5 天 | 测试和文档 |
| **总计** | **5 天** | |

### 建议实施顺序

```
批次 1 (Day 1):     Phase 1 + Phase 2     → Conversation 核心 + Agent Loop 集成
批次 2 (Day 2):     Phase 3 + Phase 4     → SDK + CLI 适配，完成多轮对话闭环
批次 3 (Day 2.5):   Phase 5              → edit_file 增强为多段替换
批次 4 (Day 3-4):   Phase 6 + Phase 8    → 提示词增强 + 上下文管理
批次 5 (Day 4-5):   Phase 7              → 流式输出
批次 6 (Day 5):     Phase 9              → 测试和文档
```

---

## 七、验收标准

### 7.1 功能验收

| # | 验收项 | 验收方法 |
|---|--------|----------|
| 1 | 多轮对话：用户可以在 REPL 中持续对话，上下文累积 | 启动 REPL，输入 3 轮，验证 AI 能引用之前的对话 |
| 2 | edit_file：AI 可以精准编辑文件 | 让 AI 修改一个文件中的函数，验证只有目标部分被修改 |
| 3 | edit_file 错误处理：old_string 未找到时 AI 能自动修正 | 故意给 AI 过时的文件内容，验证它读到新内容后重试 |
| 4 | 流式输出：长文本逐步显示 | 让 AI 解释一段代码，验证文本逐步出现在终端 |
| 5 | 上下文管理：超长对话不会崩溃 | 模拟 30+ 轮对话，验证系统正常工作 |
| 6 | /clear 命令：清除对话后 AI 不记得之前内容 | 多轮对话后执行 /clear，验证 AI 失去了之前的记忆 |
| 7 | 单次命令兼容：`tramber "read package.json"` 仍然正常工作 | 命令行模式不受多轮对话改动影响 |

### 7.2 架构验收

| # | 验收项 | 说明 |
|---|--------|------|
| 1 | Engine 无状态 | TramberEngine 不持有 conversation，每次 execute 传入+返回 |
| 2 | Client 持有 Conversation | CLI Client 管理 conversation 生命周期 |
| 3 | Conversation 与 AgentLoop 解耦 | Conversation 是纯数据对象，不依赖 AgentLoop |
| 4 | 向后兼容 | 不传 conversation 时，行为与 Stage 2 一致 |
| 5 | 类型安全 | 所有新增类型有完整的 TypeScript 类型定义 |
| 6 | 无循环依赖 | conversation.ts 不依赖 loop.ts 或 engine.ts |
| 7 | 构建成功 | `pnpm build` 全部通过 |

### 7.3 性能验收

| # | 验收项 | 标准 |
|---|--------|------|
| 1 | 构建时间 | 全量构建 ≤ 15s |
| 2 | 冷启动时间 | `tramber` 启动 ≤ 2s |
| 3 | 多轮对话延迟 | 第 N 轮对话的延迟不显著高于第 1 轮（±20%） |

---

## 八、风险评估

### 8.1 技术风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 流式输出与工具调用事件顺序不一致 | 中 | 高 | 流式模式下，先完整收集 tool_calls 再执行 |
| 上下文窗口估算不准确 | 低 | 中 | 使用保守的字符/token 比率（4:1），预留 20% 余量 |
| edit_file 并发编辑冲突 | 低 | 中 | MVP 阶段不考虑并发，用户手动管理 |
| 多轮对话中系统提示词更新问题 | 低 | 中 | 系统提示词在 conversation 创建时固定，后续不变 |

### 8.2 进度风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| 流式输出实现复杂度超预期 | 中 | 中 | P1 可降级为 "流式文本输出"，工具调用不流式 |
| 上下文摘要质量不佳 | 中 | 低 | 摘要功能可降级为简单截断，不影响核心功能 |

---

## 九、后续计划

### 9.1 Stage 3 完成后的状态

完成 Stage 3 后，Tramber 将具备：
- ✅ 多轮对话（日常使用基础）
- ✅ edit_file 工具（AI 编辑代码的核心能力）
- ✅ 流式输出（良好的用户体验）
- ✅ 上下文窗口管理（长对话支持）
- ✅ 增强的系统提示词（更智能的行为）

### 9.2 Stage 4 预览

```
Stage 4: 生态建设
├── WebSocket 通信层（Engine 服务化）
├── Web 客户端基础实现 (Vue 3 + Vite)
├── 多 Provider 支持 (OpenAI, Gemini)
├── TramberClient → TramberEngine 重命名（统一重构）
├── Workflow 系统 (预定义工作流模板)
├── Scene 固化机制 (Dynamic Scene → Named Scene)
├── Checkpoint 系统 (快照 + 回滚)
└── Experience 实际接入 (自动记录 + 检索增强)
```

### 9.3 长期演进路线

```
Stage 1 (MVP)             ✅ 完成
   ↓
Stage 2 (IO 架构重构)     ✅ 完成
   ↓
Stage 3 (多轮对话+工具)   ← 当前阶段 — Engine 无状态，Client 持有 Conversation
   ↓
Stage 4 (服务化+生态)     WebSocket + Web 客户端 + Engine 统一重构 + 多 Provider
   ↓
Stage 5 (智能化)          Engine 管理 session + 插件系统 + 向量检索 + Scene 固化
   ↓
Stage 6 (开放生态)        社区插件 + 市场 + 更多 Scene
```

---

## 十、关键文件清单

### 10.1 Stage 3 新建文件

```
packages/agent/src/
└── conversation.ts           # Conversation 管理模块
```

> 注：`edit_file` 工具已存在于 `packages/tool/src/builtin/file/index.ts`，Stage 3 只需增强，不新建文件。

### 10.2 Stage 3 修改文件

```
packages/agent/src/
├── loop.ts                   # 接收外部 conversation + 流式输出 + 提示词增强
├── types.ts                  # 新增 Conversation 相关类型
└── index.ts                  # 导出 conversation 模块

packages/sdk/src/
├── engine.ts (原 client.ts)  # 重命名为 Engine，无状态化，不持有 conversation
├── index.ts                  # 更新导出 TramberEngine
└── types.ts                  # 更新 ExecuteOptions 和 TramberResponse

packages/tool/src/builtin/
└── file/index.ts             # edit_file 增强为多段替换

packages/client/cli/src/
├── repl.ts                   # Client 持有 conversation，跨轮复用
├── task.ts                   # 传递 conversation 给 Engine，保存返回值
├── single-command-executor.ts # 单次命令：每次新建 conversation
├── output-manager.ts         # 流式输出支持
└── command-handler.ts        # 新增 /history 命令
```

### 10.3 不变文件

```
packages/shared/src/          # 核心类型定义无需修改
packages/permission/src/      # 权限系统无需修改
packages/experience/src/      # 经验系统 Stage 4 再接入
packages/scene/src/           # Scene 管理 Stage 4 再增强
packages/routine/src/         # Routine 系统 Stage 4 再增强
packages/provider/src/        # Provider 层已有 stream() 实现
```

---

*文档创建时间: 2026-03-27*
*预计完成时间: 2026-04-03 (5-6 个工作日)*
*文档版本: 2.0*
