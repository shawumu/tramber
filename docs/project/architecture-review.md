# Tramber 架构分析与建议

> 分析日期: 2026-03-25
> 分析范围: Loop, Permission, CLI 核心实现

---

## 一、当前架构概览

### 1.1 核心组件关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI (packages/client/cli)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   cli.ts    │  │   repl.ts   │  │      config.ts          │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────────┘  │
│         │                │                     │                 │
│         └────────────────┼─────────────────────┘                 │
│                          ▼                                       │
│                  ┌───────────────┐                               │
│                  │ TramberClient │ (packages/sdk)               │
│                  └───────┬───────┘                               │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Loop (packages/agent)                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    loop.ts                               │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐  │  │
│  │  │   Context  │→│    LLM     │→│    Tool Calls      │  │  │
│  │  │  Gathering │  │   Calling  │  │    Execution      │  │  │
│  │  └────────────┘  └────────────┘  └────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                        │
│         ┌────────────────┼────────────────┐                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Tool       │  │  Provider   │  │ Permission  │              │
│  │  Registry   │  │  (Anthropic)│  │  Checker    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、核心模块分析

### 2.1 Agent Loop (packages/agent/src/loop.ts)

**当前实现问题：**

#### 问题 1: 文本标记系统与 ToolCalls 冲突

```typescript
// 当前设计中存在两种控制机制
// 机制 A: 标准 ToolCalls (Provider 层处理)
response.toolCalls = [
  { id: 'xxx', name: 'write_file', parameters: {...} }
];

// 机制 B: 文本标记 (Agent 层解析)
content = "[task-summary]\n✓ 已完成操作";
```

**问题分析：**
- AI 可能同时使用两种机制，导致解析混乱
- 当 LLM 使用 toolCalls 时，content 中的文本标记可能不会被正确添加
- 代码同时检查 toolCalls 和文本标记，逻辑复杂

**建议方案：**

```
┌─────────────────────────────────────────────────────────────────┐
│                      建议统一为 ToolCalls 模式                   │
└─────────────────────────────────────────────────────────────────┘

方案 A: 纯 ToolCalls + 控制工具
├─ 所有操作通过 ToolCalls
├─ 添加特殊控制工具
│  ├─ ask_user_choice(prompt)
│  ├─ report_operation(summary)
│  └─ complete_task(summary)
└─ LLM 想与用户交互时调用这些工具

方案 B: ToolCalls + 智能判断
├─ 工具操作: ToolCalls
├─ 对话控制: 分析 content
│  ├─ 包含 "?" → 等待用户选择
│  ├─ 包含 "完成/✓" + 无后续操作 → 可能完成
│  └─ 工具执行后 → 继续对话
└─ 不依赖文本标记
```

#### 问题 2: 权限检查时机和方式

```typescript
// 当前实现
if (response.toolCalls && response.toolCalls.length > 0) {
  if (this.options.permissionChecker) {
    const permissionCheck = await this.checkPermissions(response.toolCalls);
    if (permissionCheck.requiresConfirmation) {
      // 请求用户确认
    }
  }
}
```

**问题分析：**
- 权限检查在每次工具调用前进行
- `getOperationType()` 使用字符串前缀匹配，不够健壮
- 权限类型映射硬编码在 Agent Loop 中

**建议方案：**

```
1. 将权限类型声明移到 Tool 定义中
interface Tool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission?: {
    level: 'safe' | 'dangerous' | 'critical';
    operation: keyof ToolPermissions;
  };
}

2. 权限检查前，先从 Tool 获取所需权限
const tool = this.options.toolRegistry.get(toolCall.name);
const requiredPermission = tool.permission?.operation;
```

#### 问题 3: 迭代终止逻辑不清晰

```typescript
// 当前逻辑混乱
if (response.toolCalls?.length > 0) {
  // 执行工具后 continue
  continue;
}

const marker = this.extractMarker(content);
if (!marker) {
  return { success: true, finalAnswer: content };
}

if (this.isConversationMarker(marker)) {
  return { success: true, finalAnswer: content };
}
```

**问题分析：**
- 没有明确的终止条件
- 依赖 AI 遵循文本标记约定
- 智谱 AI 等模型可能不会严格遵循

**建议方案：**

```
明确终止条件：
1. LLM 返回 stop_reason = "end_turn" 或 "stop_sequence"
2. 内容长度 < 500 且无后续操作请求
3. 达到最大迭代次数
4. 用户主动终止

使用标准 API 提供的 stop_reason，而非内容分析
```

---

### 2.2 Permission (packages/shared/src/types/permission.ts)

**当前设计：**

```typescript
export interface ToolPermissions {
  file_read?: PermissionValue;
  file_write?: PermissionValue;
  file_delete?: PermissionValue;
  file_rename?: PermissionValue;
  command_execute?: PermissionValue;
  command_dangerous?: PermissionValue;
  network_http?: PermissionValue;
  network_https?: PermissionValue;
  system_env?: PermissionValue;
  system_process?: PermissionValue;
}
```

**优点：**
- 清晰的操作类型分类
- 支持多种权限级别 (allow/confirm/deny/readonly/白名单)
- 完善的沙箱配置

**不足与建议：**

#### 不足 1: 缺少细粒度路径权限

```typescript
// 当前只有全局 allowedPaths/deniedPaths
sandbox: {
  allowedPaths: ["./"],
  deniedPaths: []
}

// 建议支持路径级别的权限
file_read: {
  "/src/**": "allow",
  "/.env": "deny",
  "/node_modules/**": "deny"
}
```

#### 不足 2: 命令白名单与权限分离

```typescript
// 当前 command_execute 可以是字符串数组
command_execute: ["npm", "git", "ls", "cat"]

// 建议统一为权限对象
command_execute: {
  mode: "whitelist",
  commands: ["npm", "git", "ls", "cat"],
  args: {
    npm: ["install", "run", "test"],
    git: ["status", "log", "diff"]
  }
}
```

#### 不足 3: 缺少权限审计日志

```typescript
// 建议添加
interface PermissionAuditLog {
  timestamp: Date;
  tool: string;
  operation: string;
  parameters: Record<string, unknown>;
  decision: 'allowed' | 'denied' | 'confirmed';
  reason?: string;
}
```

---

### 2.3 CLI (packages/client/cli/src/cli.ts)

**当前实现：**

```typescript
// 单次命令执行
if (input.length > 0) {
  const result = await client.execute(description, {
    onProgress: (progress) => { /* 显示进度 */ },
    onPermissionRequired: async (toolCall, operation) => {
      // 请求用户确认
    }
  });
}
```

**优点：**
- 清晰的单次/REPL 模式分离
- 支持配置覆盖
- 进度回调机制完善

**不足与建议：**

#### 不足 1: 错误处理过于简单

```typescript
if (result.success) {
  console.log(chalk.green('✓') + ' ' + chalk.white(result.result));
} else {
  console.error(chalk.red('✗') + ' ' + chalk.white(result.error));
  process.exit(1);
}
```

**建议：**

```typescript
// 更详细的错误分类
if (!result.success) {
  switch (result.errorType) {
    case 'permission_denied':
      console.error(chalk.red('权限被拒绝'));
      console.log(chalk.gray('提示: 使用 -y 参数自动确认，或修改配置文件'));
      break;
    case 'api_error':
      console.error(chalk.red('API 错误'));
      console.log(chalk.gray(result.error));
      break;
    case 'max_iterations':
      console.error(chalk.yellow('任务未完成，达到最大迭代次数'));
      console.log(chalk.gray('提示: 可以使用 --max-iterations 增加限制'));
      break;
  }
}
```

#### 不足 2: 缺少会话管理

```typescript
// 建议添加会话支持
interface Session {
  id: string;
  startTime: Date;
  messages: Message[];
  experiences: Experience[];
}

// 命令
program
  .command('session')
  .description('Manage sessions')
  .option('--list', 'List sessions')
  .option('--resume <id>', 'Resume session')
  .action(sessionHandler);
```

#### 不足 3: 输出格式单一

```typescript
// 建议支持多种输出格式
program
  .option('-o, --output <format>', 'Output format', 'pretty')
  // 支持: pretty, json, markdown, silent

// 实现
if (options.output === 'json') {
  console.log(JSON.stringify(result));
} else if (options.output === 'markdown') {
  console.log(formatToMarkdown(result));
}
```

---

## 三、架构改进建议

### 3.1 顶层建议

#### 建议 1: 统一 ToolCalls 控制流

```
当前状态: ToolCalls + 文本标记 混用
目标状态: 完全基于 ToolCalls + API 提供的 stop_reason

实现步骤:
1. 移除文本标记解析逻辑
2. 添加控制工具 (ask_user_choice, report_summary, complete_task)
3. 使用 stop_reason 判断对话结束
4. 在系统提示中说明工具使用方式
```

#### 建议 2: 分离关注点

```
当前: Agent Loop 同时负责:
- LLM 调用
- 工具执行
- 权限检查
- 对话控制

建议拆分:
┌─────────────────────────────────────────────────────────────┐
│  ConversationManager                                        │
│  - 管理对话状态                                             │
│  - 判断是否需要继续                                         │
│  - 处理用户中断                                             │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┐
         ▼              ▼              ▼
    ToolExecutor   PermissionCheck   ResponseParser
```

#### 建议 3: 明确类型契约

```typescript
// 当前: AgentLoopResult 类型不够明确
export interface AgentLoopResult {
  success: boolean;
  finalAnswer?: string;
  // ...
}

// 建议: 使用 discriminated union
type AgentLoopResult =
  | { status: 'completed'; output: string; experiences: Experience[] }
  | { status: 'waiting_user'; prompt: string; options: string[] }
  | { status: 'failed'; error: string; recoverable: boolean }
  | { status: 'max_iterations'; partialResult?: string };
```

### 3.2 优先级矩阵

| 优先级 | 改进项 | 影响 | 工作量 |
|-------|--------|------|-------|
| **P0** | 统一 ToolCalls 控制流 | 解决核心问题 | 1-2天 |
| **P0** | 修复权限类型映射 | 提升可靠性 | 0.5天 |
| **P1** | 改进错误处理 | 提升用户体验 | 0.5天 |
| **P1** | 添加会话管理 | 支持多轮对话 | 1天 |
| **P2** | 路径级权限 | 更细粒度控制 | 1天 |
| **P2** | 审计日志 | 安全合规 | 0.5天 |

---

## 四、待解决问题清单

### 4.1 高优先级

- [ ] **文本标记 vs ToolCalls 冲突**
  - 问题: AI 可能不遵循文本标记约定
  - 解决: 统一使用 ToolCalls + 控制工具

- [ ] **权限类型映射硬编码**
  - 问题: `getOperationType()` 字符串匹配不可靠
  - 解决: 在 Tool 定义中声明权限类型

- [ ] **迭代终止逻辑不清晰**
  - 问题: 依赖内容分析判断是否结束
  - 解决: 使用 API 的 `stop_reason`

### 4.2 中优先级

- [ ] **错误处理改进**
  - 当前: 简单的成功/失败输出
  - 目标: 分类错误 + 可操作建议

- [ ] **配置验证**
  - 当前: 配置加载后无验证
  - 目标: 启动时验证配置完整性

- [ ] **REPL 体验优化**
  - 当前: 基础交互
  - 目标: 历史、多行输入、命令补全

### 4.3 低优先级

- [ ] **输出格式多样化**
- [ ] **会话持久化**
- [ ] **性能分析工具**

---

## 五、附录: 建议的代码结构

### 5.1 改进后的 Agent Loop 结构

```typescript
// packages/agent/src/loop.ts
export class AgentLoop {
  private conversationManager: ConversationManager;
  private toolExecutor: ToolExecutor;
  private permissionGuard: PermissionGuard;

  async execute(task: Task): Promise<AgentLoopResult> {
    const session = this.conversationManager.start(task);

    while (!session.shouldEnd()) {
      // 1. 获取 LLM 响应
      const response = await this.callLLM(session.getContext());

      // 2. 处理工具调用
      if (response.toolCalls) {
        const allowed = await this.permissionGuard.check(response.toolCalls);
        if (!allowed) break;

        const results = await this.toolExecutor.execute(response.toolCalls);
        session.addToolResults(results);
        continue;
      }

      // 3. 检查是否需要结束
      if (this.isCompletion(response)) {
        return this.conversationManager.complete(response);
      }

      // 4. 等待用户输入
      if (this.needsUserInput(response)) {
        return this.conversationManager.waitForUser(response);
      }
    }
  }
}
```

### 5.2 控制工具定义

```typescript
// packages/tool/src/control/
export const askUserChoiceTool: Tool = {
  id: 'ask_user_choice',
  name: 'ask_user_choice',
  description: '当需要用户提供更多信息或做出选择时使用',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '向用户提出的问题' },
      options: { type: 'array', items: { type: 'string' } }
    }
  },
  category: 'control',
  permission: { level: 'safe', operation: 'user_interaction' }
};

export const reportSummaryTool: Tool = {
  id: 'report_summary',
  name: 'report_summary',
  description: '报告操作结果或进度',
  inputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '操作结果摘要' }
    }
  },
  category: 'control',
  permission: { level: 'safe', operation: 'user_interaction' }
};

export const completeTaskTool: Tool = {
  id: 'complete_task',
  name: 'complete_task',
  description: '标记任务已完成',
  inputSchema: {
    type: 'object',
    properties: {
      finalAnswer: { type: 'string', description: '最终答案' }
    }
  },
  category: 'control',
  permission: { level: 'safe', operation: 'user_interaction' }
};
```

---

*文档版本: 1.0*
*创建时间: 2026-03-25*
