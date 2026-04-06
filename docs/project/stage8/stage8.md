# Stage 8: 意识体系统 — Context 分层管理

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

### 1.2 解决方案：分层意识体

将 agent 的 context 管理职责分为两层意识体：

**自我感知意识（上层）**
- 维护压缩后的任务概况和历史摘要，**不保留原始对话**
- 实时提取和压缩执行结果，丢弃冗余原始输出
- 始终保持轻量 context（概况 + 规则 + 近期信息）
- 清晰判断下层意识是否偏离规划
- 按领域对对话和任务分段分类，形成结构化记忆
- context 超长时自动派生执行意识，将大任务拆为小而精的子任务

**执行意识（下层）**
- 接收父意识精心准备的 prompt（小而精、任务强关联）
- 在限制好的框架内完成具体任务
- 生命周期短，完成即销毁，结果被父意识压缩吸收
- 始终处于低 context 负载，保持高准确度

### 1.3 设计原则

| 原则 | 说明 |
|------|------|
| **意识体即 context 管理策略** | 核心目标是解决长 context 退化，不是角色分工 |
| **零外部依赖** | 意识体 = prompt 工程 + 虚拟工具 + 记忆压缩 |
| **父意识特调子意识 prompt** | 子意识永远不看到完整历史，只看到父意识筛选后的精要 |
| **同步派生** | 子意识执行时父 loop 暂停，避免并发复杂度 |
| **记忆外部化** | 长对话历史存入记忆系统，意识体只加载索引和摘要 |

### 1.4 架构总览

```
┌─────────────────────────────────────────────────────┐
│  自我感知意识（始终轻量、清醒）                        │
│                                                      │
│  Context 内容（固定小窗口）：                         │
│  · 系统提示词 + 规则（始终存在）                      │
│  · 任务概况 + 进展摘要                               │
│  · 结构化记忆索引                                    │
│  · 近期执行概况（最近 1-2 个子意识结果摘要）          │
│  · 当前决策和约束                                    │
│                                                      │
│  维护的记忆系统（外部存储）：                         │
│  · 分段历史记忆（按任务阶段索引）                     │
│  · 关键决策记录                                      │
│  · 文件修改历史                                      │
│  · 困难记录和解决方案                                │
│                                                      │
│  能力：                                               │
│  · spawn_sub_task：派生执行意识                       │
│  · recall_memory：检索历史记忆                        │
│  · judge_result：判断子意识结果是否偏离               │
│  · compress_and_remember：压缩并存储结果              │
└───────────────┬─────────────────────────────────────┘
                │ 特调 prompt（小而精）
                ▼
┌─────────────────────────────────────────────────────┐
│  执行意识（短命、聚焦）                               │
│                                                      │
│  Context 内容（父意识精心准备）：                     │
│  · 精确的任务描述和约束                               │
│  · 执行所需的最少上下文                              │
│  · 允许使用的工具列表                                │
│                                                      │
│  不看到：                                             │
│  · 完整历史对话                                       │
│  · 其他子意识的执行过程                              │
│  · 全局规则中与当前任务无关的部分                     │
│                                                      │
│  能力：                                               │
│  · report_status：向父意识报告进度                    │
│  · request_approval：请求父意识审批重大变更           │
│  · 物理工具：read_file, write_file, edit_file, exec   │
└─────────────────────────────────────────────────────┘
```

---

## 2. 意识体类型系统

新增文件：`packages/shared/src/types/consciousness.ts`

### 2.1 基础类型

```typescript
/** 意识体层级 */
export type ConsciousnessLevel = 'self_awareness' | 'execution';

/** 意识体状态 */
export type ConsciousnessStatus =
  | 'spawning'           // 创建中
  | 'thinking'           // LLM 推理中
  | 'executing'          // 执行工具调用
  | 'waiting_approval'   // 等待审批
  | 'compressing'        // 压缩子意识结果
  | 'completed'          // 已完成
  | 'failed'             // 执行失败
  | 'cancelled';         // 被父意识取消
```

### 2.2 自我感知状态

```typescript
/**
 * 自我感知意识的状态 — 每轮注入 system prompt
 * 始终保持轻量，是压缩后的精华
 */
export interface SelfAwarenessState {
  id: string;
  level: 'self_awareness';
  status: ConsciousnessStatus;

  // === 始终在 context 中的信息 ===

  /** 当前任务概况（一句话） */
  taskSummary: string;
  /** 进度 0-100 */
  progress: number;
  /** 当前所处阶段描述 */
  currentPhase: string;
  /** 与谁交互（用户/其他 agent） */
  interactingWith: string;
  /** 当前环境概况 */
  environment: {
    project: string;
    branch?: string;
    sceneId: string;
  };
  /** 不可违反的规则和约束 */
  rules: string[];
  /** 活跃的子意识数量 */
  activeChildren: number;
  /** 迭代计数 */
  iteration: number;
  maxIterations: number;

  // === 通过 recall_memory 按需检索 ===

  /** 记忆索引（只有标题和 ID，不包含内容） */
  memoryIndex: MemoryIndexEntry[];

  // === 内部维护（不注入 prompt） ===

  /** 已做关键决策（最近 5 条注入 prompt，完整列表存记忆） */
  recentDecisions: string[];
  /** 最近子意识结果摘要（最近 2 条） */
  recentResults: string[];
  /** 当前遇到的困难 */
  difficulties: string[];
  /** 已修改文件列表（注入 prompt） */
  filesTouched: string[];
}
```

### 2.3 执行意识状态

```typescript
/**
 * 执行意识的状态 — 由父意识准备，保持极简
 */
export interface ExecutionContextState {
  id: string;
  level: 'execution';
  status: ConsciousnessStatus;
  /** 父意识 ID */
  parentId: string;

  /** 父意识特调的任务描述（精确、聚焦） */
  taskDescription: string;
  /** 执行约束 */
  constraints: string[];
  /** 允许使用的工具 */
  allowedTools: string[];
  /** 父意识提供的精要上下文 */
  parentContext: string;
  /** 最大迭代数 */
  maxIterations: number;
}
```

### 2.4 记忆系统

```typescript
/**
 * 记忆条目 — 存储在外部，按需检索
 */
export interface MemoryEntry {
  id: string;
  /** 所属任务阶段 */
  phase: string;
  /** 记忆类型 */
  type: 'decision' | 'result_summary' | 'difficulty' | 'file_change' | 'conversation_summary';
  /** 一句话摘要（用于索引展示） */
  summary: string;
  /** 详细内容 */
  content: string;
  /** 相关文件 */
  relatedFiles: string[];
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 记忆索引条目 — 注入自我感知意识的 prompt
 */
export interface MemoryIndexEntry {
  id: string;
  phase: string;
  type: MemoryEntry['type'];
  summary: string;
}

/**
 * 记忆检索请求
 */
export interface MemoryQuery {
  /** 按阶段过滤 */
  phase?: string;
  /** 按类型过滤 */
  type?: MemoryEntry['type'];
  /** 关键词搜索 */
  keyword?: string;
  /** 最多返回条数 */
  limit?: number;
}
```

### 2.5 Context 持久化存储

原始对话 context（完整消息历史）在子意识压缩后**不丢弃**，而是持久化到按意识体树组织的文件夹结构中，供调试和问题定位。

```typescript
/**
 * Context 快照 — 意识体执行完成后的完整消息快照
 */
export interface ConsciousnessContextSnapshot {
  /** 意识体 ID */
  consciousnessId: string;
  /** 父意识体 ID（根意识为空） */
  parentConsciousnessId?: string;
  /** 意识体层级 */
  level: ConsciousnessLevel;
  /** 任务描述 */
  taskDescription: string;
  /** 完整消息历史（含 system prompt、工具调用和结果） */
  messages: Array<{ role: string; content: string }>;
  /** 迭代次数 */
  iterations: number;
  /** 是否成功 */
  success: boolean;
  /** 终止原因 */
  terminatedReason?: string;
  /** token 消耗 */
  tokenUsage?: { input: number; output: number; total: number };
  /** 创建时间 */
  createdAt: string;
}

/**
 * Context 存储配置
 */
export interface ContextStorageOptions {
  /** 根目录（默认 .tramber/contexts/） */
  rootDir: string;
  /** 每个任务最多保留多少个子意识 context（默认 20） */
  maxSnapshotsPerTask: number;
  /** 是否启用（默认 true） */
  enabled: boolean;
}
```

**目录结构：**

```
.tramber/
├── contexts/                          # 按任务 → 按意识体组织
│   ├── task-20260406-refactor-auth/   # 一个任务（根意识）
│   │   ├── root.json                  # 根意识（自我感知）的完整 context
│   │   ├── exec-research.json         # 子意识：调研
│   │   ├── exec-planner.json          # 子意识：规划
│   │   ├── exec-builder.json          # 子意识：实施
│   │   │   ├── exec-builder.json      # 孙意识：子任务（如有）
│   │   ├── exec-tester.json           # 子意识：测试
│   │   └── exec-fix.json              # 子意识：修复
│   └── task-20260406-add-login/       # 另一个任务
│       ├── root.json
│       └── exec-research.json
├── memory/                            # 结构化记忆（跨任务持久化）
│   ├── index.json                     # 全局记忆索引
│   ├── decisions/                     # 决策记录
│   ├── summaries/                     # 结果摘要
│   └── difficulties/                  # 困难记录
```

**设计要点：**
- 每个意识体完成后，其**完整消息历史**写入对应的 JSON 文件
- 父意识压缩子意识结果后，原始对话**从内存中移除**但**保留在磁盘**
- 文件名使用意识体 ID（可读性好），目录名使用任务 ID
- 调试时可通过文件树追溯完整的意识体执行链路
- 自动清理超出 `maxSnapshotsPerTask` 的旧任务目录

### 2.6 意识体树节点

```typescript
/**
 * 意识体树节点
 */
export interface ConsciousnessNode {
  id: string;
  /** 所属智能体 ID */
  agentId: string;
  /** 状态 */
  state: SelfAwarenessState | ExecutionContextState;
  /** 子意识列表 */
  children: Map<string, ConsciousnessNode>;
  /** 是否活跃 */
  active: boolean;
}

/**
 * 子意识执行结果
 */
export interface ConsciousnessResult {
  consciousnessId: string;
  success: boolean;
  /** 子意识的最终输出 */
  finalAnswer: string;
  /** 子意识修改的文件 */
  filesTouched: string[];
  /** token 消耗 */
  tokenUsage: { input: number; output: number; total: number };
  /** 使用的迭代数 */
  iterations: number;
  /** 父意识压缩后的摘要（原始结果已丢弃） */
  compressedSummary?: string;
  error?: string;
}
```

### 2.7 审批

```typescript
export interface ApprovalRequest {
  id: string;
  requesterId: string;
  action: string;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
  toolCall?: { name: string; parameters: Record<string, unknown> };
  createdAt: Date;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  feedback?: string;
  modifiedParameters?: Record<string, unknown>;
}
```

---

## 3. 多智能体接口预留

当前先实现单智能体多层意识。多智能体通过以下接口预留扩展空间：

### 3.1 预留类型

新增文件：`packages/shared/src/types/team.ts`

```typescript
/**
 * 智能体角色（预留）
 * 多智能体阶段：每个 agent 可定制 scene 和 workflow
 */
export type AgentRole =
  | 'supervisor'
  | 'planner'
  | 'builder'
  | 'reviewer'
  | 'tester'
  | 'researcher'
  | string;  // 允许自定义角色

/**
 * 智能体实例（预留）
 * 每个智能体有完整的分层意识体 + 定制 scene + workflow 编排
 */
export interface AgentInstance {
  id: string;
  name: string;
  role: AgentRole;
  /** 定制的 scene 配置 */
  sceneId: string;
  /** workflow 编排（预留） */
  workflowId?: string;
  temperature: number;
  maxTokens: number;
}

/**
 * 智能体间关系（预留）
 */
export type AgentRelationType = 'supervisor' | 'reviewer' | 'collaborator';

export interface AgentRelation {
  superiorId: string;
  subordinateId: string;
  type: AgentRelationType;
}

/**
 * 智能体团队（预留）
 */
export interface AgentTeam {
  id: string;
  taskDescription: string;
  members: Map<string, AgentInstance>;
  relations: AgentRelation[];
  status: 'forming' | 'active' | 'completed' | 'failed';
}

/**
 * 团队消息（预留）
 */
export interface TeamMessage {
  id: string;
  fromId: string;
  toId: string;
  type: 'task_assignment' | 'result_report' | 'approval_request' | 'approval_response' | 'status_update';
  content: string;
  payload?: unknown;
  timestamp: Date;
}
```

### 3.2 多智能体扩展点

当前实现中以下位置预留多智能体扩展接口：

| 位置 | 当前实现 | 预留接口 |
|------|---------|---------|
| `ConsciousnessNode.agentId` | 固定为当前 agent | 多 agent 时标识归属 |
| `AgentLoopOptions` | 单 agent | 预留 `agentInstance?: AgentInstance` |
| `Engine.execute()` | 直接创建 loop | 预留 `executeAsTeam()` 方法签名 |
| Scene/Workflow | 固定 coding scene | 预留 `sceneId` 和 `workflowId` 参数 |

---

## 4. 意识体核心机制

### 4.1 自我感知意识的 Context 管理

自我感知意识的 system prompt 始终包含以下结构化块，**不随对话增长**：

```
## 自我感知状态
- 任务：{taskSummary}
- 进度：{progress}%
- 阶段：{currentPhase}
- 交互对象：{interactingWith}
- 环境：{project}, 场景 {sceneId}
- 规则：{rules 列表}
- 活跃子意识：{activeChildren} 个
- 迭代：{iteration}/{maxIterations}
- 近期决策：{recentDecisions 最近 5 条}
- 近期结果：{recentResults 最近 2 条}
- 已改文件：{filesTouched}
- 当前困难：{difficulties}

## 记忆索引（可按需检索）
{memoryIndex 列表，每条一句话}
```

**关键设计：** 这部分 context 大小固定（约 500-800 tokens），不随对话增长。所有历史细节存入记忆系统，通过 `recall_memory` 按需加载。

### 4.2 子意识 Prompt 的父意识特调

当自我感知意识派生执行意识时，它不是简单传递任务描述，而是：

```
父意识的 prompt 特调过程：

1. 从自身记忆中提取与子任务相关的信息
2. 过滤掉无关的全局规则，只保留子任务需要的约束
3. 将历史探索结果压缩为精要上下文
4. 设定清晰的完成标准和边界
```

**示例 — 父意识特调的子意识 prompt：**

```
## 你的任务
修复 auth 模块的 3 个失败测试：
1. session-timeout.test.ts — 超时期望从硬编码改为 auth.config.ts 的值
2. token-refresh.test.ts — 新的 AuthenticationError 导致断言失败
3. middleware.test.ts — 导入路径从 './auth' 改为 './auth/index'

## 约束
- 只修改测试文件，不改源码
- 保持测试原始意图
- 验证命令：npm test -- --grep auth

## 上下文
- auth.config.ts 已创建，导出 { sessionTimeout: 3600 }
- 错误处理改为抛出 AuthenticationError（非 Error）
- middleware 导入路径已变更

## 完成标准
所有 auth 相关测试通过
```

这个 prompt 约 200 tokens，比完整对话历史（可能 10000+ tokens）精确得多。

### 4.3 结果压缩与记忆存储

子意识完成后，自我感知意识执行**压缩**：

```
子意识返回（可能很长）:
  "我读取了 session-timeout.test.ts，发现第 15 行期望 timeout 为 3000，
   但现在从 auth.config.ts 读取为 3600。我修改了第 15 行为 3600，
   并添加了从 auth.config 导入。然后运行测试，3 个都通过了。
   修改的文件：session-timeout.test.ts, token-refresh.test.ts, middleware.test.ts"

父意识压缩为:
  "builder-002 修复了 3 个 auth 测试（超时值、错误类型、导入路径），全部通过。
   修改文件：session-timeout.test.ts, token-refresh.test.ts, middleware.test.ts"

  → 存入记忆：{ type: 'result_summary', phase: '测试修复', summary: '...' }
  → 更新状态：progress 85%, recentResults 加入此摘要
  → 原始对话历史：存入 .tramber/contexts/{taskId}/{consciousnessId}/ 供调试（不影响父意识 context）
```

### 4.4 偏离检测

自我感知意识在每轮迭代中评估子意识的行为：

```
自我感知意识的判断逻辑（通过 system prompt 引导）：
- ✅ 子意识正在修改测试文件（符合约束"只修改测试文件"）
- ✅ 子意识运行了 npm test 验证（符合完成标准）
- ⚠️ 子意识试图修改 auth.ts 源码 → 提示"只改测试文件"（轻度偏离）
- ❌ 子意识开始重构 logger 模块 → 终止子意识（严重偏离）
```

### 4.5 Context 超长时的自动派生

当自我感知意识检测到 context 接近阈值时（而非仅任务分解时），自动派生执行意识：

```
触发条件：
- 当前 context token 数 > 阈值 80%
- 或剩余可用迭代 < 3 次
- 或对话中出现大量工具结果导致效率下降

自动处理：
1. 将当前对话中的关键信息压缩存入记忆
2. 派生一个执行意识，把"当前未完成的子任务"作为其任务
3. 执行意识完成后，父意识的 context 被替换为压缩摘要
4. 父意识以轻量状态继续
```

---

## 5. 虚拟工具定义

### 5.1 spawn_sub_task

```typescript
{
  id: 'spawn_sub_task',
  name: 'spawn_sub_task',
  description: '派生执行意识处理子任务。执行意识将独立运行，你会在其完成后收到压缩后的结果摘要。',
  inputSchema: {
    type: 'object',
    properties: {
      taskDescription: {
        type: 'string',
        description: '清晰具体的子任务描述'
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: '子任务必须遵守的约束条件'
      },
      contextForChild: {
        type: 'string',
        description: '传递给执行意识的关键上下文（精要，非完整历史）'
      },
      allowedTools: {
        type: 'array',
        items: { type: 'string' },
        description: '允许执行意识使用的工具列表'
      },
      maxIterations: {
        type: 'number',
        description: '最大迭代次数（默认 10）'
      }
    },
    required: ['taskDescription']
  }
}
```

**执行流程：**
1. `ConsciousnessManager.spawnChild()` 创建执行意识节点
2. 使用父意识特调的 prompt 创建新 `Conversation`
3. 同步执行子 `AgentLoop.execute()`
4. 子完成后，父意识**压缩**结果，存入记忆，丢弃原始对话
5. 返回压缩摘要

### 5.2 recall_memory

```typescript
{
  id: 'recall_memory',
  name: 'recall_memory',
  description: '从记忆系统中检索历史信息。当需要回忆之前的决策、执行结果或对话概况时使用。',
  inputSchema: {
    type: 'object',
    properties: {
      phase: {
        type: 'string',
        description: '按任务阶段过滤（如"调研"、"实现"、"测试"）'
      },
      type: {
        type: 'string',
        enum: ['decision', 'result_summary', 'difficulty', 'file_change', 'conversation_summary'],
        description: '按记忆类型过滤'
      },
      keyword: {
        type: 'string',
        description: '关键词搜索'
      },
      limit: {
        type: 'number',
        description: '最多返回条数（默认 5）'
      }
    }
  }
}
```

**用途：** 自我感知意识不保留完整对话，需要历史细节时通过此工具检索。

### 5.3 request_approval

```typescript
{
  id: 'request_approval',
  name: 'request_approval',
  description: '向父意识请求审批。执行重大变更前使用。',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '需要审批的操作' },
      reason: { type: 'string', description: '为什么需要此操作' },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] }
    },
    required: ['action', 'reason', 'riskLevel']
  }
}
```

**审批路由：**
- 根意识的请求 → 人类用户（复用 `onPermissionRequired`）
- 子意识的请求 → 父意识（专用 LLM 审批调用）

### 5.4 report_status

```typescript
{
  id: 'report_status',
  name: 'report_status',
  description: '向父意识报告执行进度。用于提供更新、报告困难。',
  inputSchema: {
    type: 'object',
    properties: {
      progress: { type: 'number', description: '进度 0-100' },
      summary: { type: 'string', description: '当前状态简述' },
      difficulties: {
        type: 'array',
        items: { type: 'string' },
        description: '遇到的困难'
      }
    },
    required: ['progress', 'summary']
  }
}
```

### 5.5 compress_and_remember（内部工具，仅自我感知意识）

```typescript
{
  id: 'compress_and_remember',
  name: 'compress_and_remember',
  description: '将当前对话中的信息压缩并存入记忆。当对话变长或 context 接近阈值时使用。',
  inputSchema: {
    type: 'object',
    properties: {
      phase: { type: 'string', description: '当前任务阶段标签' },
      summary: { type: 'string', description: '压缩后的概况' },
      keyDecisions: {
        type: 'array',
        items: { type: 'string' },
        description: '关键决策列表'
      },
      relatedFiles: {
        type: 'array',
        items: { type: 'string' },
        description: '相关文件列表'
      }
    },
    required: ['phase', 'summary']
  }
}
```

---

## 6. 系统提示词模板

新增文件：`packages/agent/src/consciousness-prompts.ts`

### 6.1 自我感知意识

```
[基础系统提示词 — 来自 AgentLoop.buildSystemPrompt()]

## 意识体身份
你是自我感知意识，负责整体任务的理解、记忆和监督。
你不直接执行具体操作，而是通过派生执行意识来完成任务。

## 自感知状态
{SelfAwarenessState 序列化}

## 你的核心职责
1. **记忆管理**：使用 compress_and_remember 持续压缩和存储信息
2. **记忆检索**：使用 recall_memory 按需检索历史信息
3. **任务分解**：将复杂任务分解为子任务，通过 spawn_sub_task 派生执行意识
4. **结果评估**：评估执行意识的结果是否合理、是否偏离规划
5. **进度汇报**：向用户报告整体进度和困难

## Context 管理规则
- 对话超过 20 轮时，主动使用 compress_and_remember 压缩早期内容
- 子意识完成后，立即压缩其结果，不保留原始对话
- 需要历史细节时使用 recall_memory，不要在 context 中累积
- 始终保持自身 context 轻量，确保判断清晰

## 派生规则
- 每个子任务必须有清晰的任务描述和约束
- 为执行意识提供精要上下文，不要传递完整历史
- 子意识结果返回后，审查其合理性再继续
- 最多同时 1 个活跃子意识（同步模型）
- 子意识最多可再派生 1 层（共 3 层）
```

### 6.2 执行意识

```
[基础系统提示词 — 来自 AgentLoop.buildSystemPrompt()]

## 意识体身份
你是执行意识 {id}，父意识 {parentId} 派生你来完成一个具体任务。
完成后你的结果会被父意识压缩吸收。

## 任务
{taskDescription}

## 约束
{constraints}

## 父意识提供的上下文
{parentContext}

## 允许的工具
{allowedTools}

## 规则
- 严格专注于分配的任务，不要做范围外的事
- 重大变更（删除文件、修改关键配置）先用 request_approval 请求父意识审批
- 进展或困难时使用 report_status 向父意识报告
- 完成后给出清晰的结果总结
- 如果无法完成，说明原因和建议
```

---

## 7. 执行流程示例

### 任务：重构认证模块，确保所有测试通过

```
时间  意识体                     Context 大小    操作
────────────────────────────────────────────────────────────────────────
T0    [self_awareness:root]       ~800 tokens    接收任务，分析需要分解
                                                  记忆：创建"调研"阶段

T1    [self_awareness:root]       ~900 tokens    spawn_sub_task("调研认证模块")
        │
        └─▶ [execution:research]  ~500 tokens    glob + read_file 探索代码库
                               返回详细分析

T2    [self_awareness:root]       ~1000 tokens   compress_and_remember("调研")
                                  ~800 tokens    压缩后：记忆索引+1，context 恢复轻量
                                                  spawn_sub_task("设计重构方案")

        └─▶ [execution:planner]   ~600 tokens    输出分步重构计划

T3    [self_awareness:root]       ~900 tokens    compress_and_remember("规划")
                                                  spawn_sub_task("实施重构")

        └─▶ [execution:builder]   ~800 tokens    执行修改
              │                                    request_approval("修改 middleware")
              │                                    → root 审批通过 + 反馈
              └── 完成

T4    [self_awareness:root]       ~1000 tokens   compress_and_remember("实现")
                                                  spawn_sub_task("运行测试")

        └─▶ [execution:tester]    ~500 tokens    exec("npm test") → 3 失败

T5    [self_awareness:root]       ~900 tokens    compress_and_remember("测试")
                                                  spawn_sub_task("修复失败测试")

        └─▶ [execution:builder2]  ~600 tokens    修复 3 个测试 → 通过

T6    [self_awareness:root]       ~900 tokens    compress_and_remember("修复")
                                                  输出最终报告
```

### 意识体树

```
[self_awareness:root] "重构认证模块" ✅ context 始终 <1000 tokens
  │
  ├── [execution:research]   ✅ ~500 tokens, 完成后压缩
  ├── [execution:planner]    ✅ ~600 tokens, 完成后压缩
  ├── [execution:builder]    ✅ ~800 tokens, 1 次审批
  ├── [execution:tester]     ✅ ~500 tokens, 完成后压缩
  └── [execution:builder2]   ✅ ~600 tokens, 完成后压缩

记忆系统：
  · [调研] "auth 模块 5 个文件，测试覆盖 60%，3 个重构目标"
  · [规划] "分 3 步：分离验证、提取配置、添加错误处理"
  · [实现] "修改 auth.ts/session.ts/tokens.ts，保持向后兼容"
  · [测试] "3 个测试失败（超时值/错误类型/导入路径）"
  · [修复] "修复 3 个测试，全部通过"
```

**关键指标：** 自我感知意识的 context 始终 <1000 tokens（而非传统模型的 10000+），每个执行意识的 context 也在 500-800 tokens。总 token 消耗降低，准确度提升。

---

## 8. 新增/修改文件清单

### 8.1 新增文件

| 文件 | 包 | 用途 |
|------|-----|------|
| `packages/shared/src/types/consciousness.ts` | shared | 意识体类型定义 |
| `packages/shared/src/types/team.ts` | shared | 多智能体预留类型 |
| `packages/agent/src/consciousness-manager.ts` | agent | 意识体树 + 记忆管理 |
| `packages/agent/src/consciousness-prompts.ts` | agent | 系统提示词模板 |
| `packages/agent/src/memory-store.ts` | agent | 记忆存储与检索 |
| `packages/agent/src/context-storage.ts` | agent | 意识体 Context 文件夹存储（替代原 context-buffer.ts） |
| `packages/agent/src/virtual-tools/index.ts` | agent | 虚拟工具注册 |
| `packages/agent/src/virtual-tools/spawn-sub-task.ts` | agent | 派生执行意识 |
| `packages/agent/src/virtual-tools/request-approval.ts` | agent | 请求审批 |
| `packages/agent/src/virtual-tools/report-status.ts` | agent | 报告状态 |
| `packages/agent/src/virtual-tools/recall-memory.ts` | agent | 检索记忆 |
| `packages/agent/src/virtual-tools/compress-and-remember.ts` | agent | 压缩并存储 |

### 8.2 修改文件

| 文件 | 包 | 变更 |
|------|-----|------|
| `packages/shared/src/types/index.ts` | shared | 添加 consciousness 和 team 导出 |
| `packages/shared/src/logger.ts` | shared | 添加命名空间 |
| `packages/agent/src/loop.ts` | agent | 接受意识状态、注入自感知 prompt、分发虚拟工具 |
| `packages/agent/src/index.ts` | agent | 导出新模块 |
| `packages/sdk/src/engine.ts` | sdk | 意识体模式入口、虚拟工具注册和清理 |
| `packages/sdk/src/types.ts` | sdk | 意识体相关选项和 ProgressUpdate 扩展 |
| `packages/agent/src/context-buffer.ts` | agent | 扩展 ContextSnapshot 以包含意识体树和记忆索引 |

---

## 9. 分阶段实施计划

### Phase 1: 类型与记忆系统（2 天）

**目标：** 类型定义就绪，MemoryStore 能存取和检索记忆。

- 新建：`consciousness.ts`、`team.ts`、`memory-store.ts`
- 修改：`types/index.ts`、`logger.ts`

**验收：**
- [ ] 所有类型编译通过
- [ ] MemoryStore 能存储、检索、按阶段/类型过滤
- [ ] 记忆索引和详细内容分离

### Phase 2: 意识体管理器与 Prompt（2 天）

**目标：** ConsciousnessManager 能管理意识体树，prompt 模板正确注入状态。

- 新建：`consciousness-manager.ts`、`consciousness-prompts.ts`
- 修改：`loop.ts`（接受意识状态参数）

**验收：**
- [ ] ConsciousnessManager 能创建根意识节点
- [ ] 自感知状态正确注入 system prompt
- [ ] 意识体树快照正常

### Phase 3: 虚拟工具与子意识派生（2.5 天）

**目标：** 自我感知意识能派生执行意识，子意识能审批和报告。

- 新建：所有虚拟工具
- 修改：`loop.ts`（虚拟工具分发）

**验收：**
- [ ] `spawn_sub_task` 能创建执行意识并同步执行
- [ ] 子意识结果被父意识压缩后存入记忆
- [ ] `recall_memory` 能检索历史记忆
- [ ] `request_approval` 审批链路正确
- [ ] 父意识 context 在子意识完成后保持轻量

### Phase 4: 引擎集成与 CLI（1.5 天）

**目标：** 意识体模式在 CLI 和 Engine 中可用。

- 修改：`engine.ts`、`sdk/types.ts`、`ws-handler.ts`

**验收：**
- [ ] Engine 支持意识体模式执行
- [ ] CLI/Web 能看到意识体树的进度
- [ ] 端到端完成一个复杂任务，context 保持轻量

### Phase 5: 可视化与调试（1 天）

**目标：** 意识体树和记忆系统可视化。

- 新建：调试和渲染工具
- 修改：`context-buffer.ts`、StatusBar

**验收：**
- [ ] CLI 显示意识体树和记忆索引
- [ ] ContextBuffer 保存树+记忆快照

---

## 10. 架构决策

### 10.1 为什么是同步派生

子意识执行时父 loop 暂停。理由：
- 无并发状态竞争（共享文件系统）
- 调试简单，调用栈清晰
- 单 provider 避免并发 rate limit
- 未来可扩展为异步并行

### 10.2 为什么记忆系统是内部存储而非数据库

当前用 JSON 文件（`.tramber/memory/` 和 `.tramber/contexts/`）。理由：
- 零依赖
- 跨会话持久化
- 可用 git 版本控制
- 未来可替换为向量数据库
- **context 文件夹**按任务→意识体组织，调试时可追溯完整执行链路
- 父意识压缩子意识后从内存移除原始对话，但磁盘保留完整历史

### 10.3 为什么不直接复用 Conversation 的 summary 机制

Conversation 的 `summarizeConversation()` 是简单的对话压缩。意识体的记忆系统是**结构化存储**：
- 按阶段、类型分类
- 支持精确检索（非全文搜索）
- 包含决策记录、文件变更等元数据
- 与意识体生命周期绑定

### 10.4 演进路径

```
Stage 8 (当前)                    Stage 9+ (未来)
─────────────────                 ──────────────────
单智能体多层意识                   多智能体协作
├── 自我感知意识                   ├── 每个 agent 有完整意识体
├── 执行意识                      ├── agent 间可通信
├── 记忆系统                      ├── 定制 scene + workflow
└── 虚拟工具                      └── TeamOrchestrator

扩展点已预留：
- ConsciousnessNode.agentId
- AgentInstance + AgentTeam 类型
- Engine.executeAsTeam() 方法签名
- Scene/Workflow 定制接口
```
