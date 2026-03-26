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

#### 问题 1: 对话控制逻辑复杂且不可靠 ✅ 同意方案

当前系统同时使用两种控制机制，导致逻辑混乱：

```typescript
// 机制 A: 标准 ToolCalls
response.toolCalls = [
  { id: 'xxx', name: 'write_file', parameters: {...} }
];

// 机制 B: 文本标记解析
content = "[task-summary]\n✓ 已完成操作";

// 复杂的终止判断
const marker = this.extractMarker(content);
if (!marker) { /* 不确定是完成还是等待 */ }
if (this.isConversationMarker(marker)) { /* ... */ }
```

**核心问题：**
1. **文本标记不可靠**：智谱 AI 等模型可能不严格遵循标记约定
2. **终止判断模糊**：无法区分"操作报告，继续"和"任务完成，结束"
3. **误判导致死循环**：如果判断为"完成"但实际未完成，用户得不到正确结果

**解决方案：简化为单一控制流**

```typescript
// 新的 Agent Loop 核心逻辑
for (let i = 0; i < maxIterations; i++) {
  const response = await callLLM(context);

  // 情况 1: 有工具调用 → 执行并继续
  if (response.toolCalls?.length > 0) {
    // 1. 检查权限
    // 2. 执行工具
    // 3. 将结果加入上下文
    // 4. continue 进入下一轮
    continue;
  }

  // 情况 2: 无工具调用 → 输出给用户，等待回应
  return {
    success: true,
    finalAnswer: response.content,
    shouldWaitForUser: true
  };
}
```

**设计原则：**
1. **ToolCalls 作为唯一"继续"信号**：有工具 = 需要执行 = 继续循环
2. **无工具 = 等待用户**：默认行为是输出内容并暂停，让用户决定下一步
3. **移除文本标记系统**：不再依赖 `[task-summary]`、`[task-complete]` 等标记
4. **系统提示词简化**：去除标记相关说明，聚焦工具使用

**用户体验影响：**

| 场景 | 旧方案 | 新方案 |
|------|--------|--------|
| 执行操作 | `[task-summary]` 标记 → 可能自动继续 | 输出结果 → 等待用户输入"继续" |
| 多步骤任务 | 可能自动完成多步 | 每步后等待用户确认 |
| 任务完成 | `[task-complete]` 标记 | 输出结果 → 用户自然结束 |

**权衡分析：**
- ✅ 优点：逻辑简单、不会误判、不会死循环
- ⚠️ 缺点：需要用户更频繁地输入"继续"

**可选增强：**

如果希望减少用户交互，可以添加便捷命令：

```typescript
// REPL 中的快捷操作
用户: /continue    // 让 AI 继续执行
用户: /auto        // 开启自动模式（有工具就自动继续）
用户: /step        // 单步模式（每步都暂停）
```

---

#### 问题 2: 权限检查时机和方式 ✅ 同意方案

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

---

### 2.2 Permission (packages/shared/src/types/permission.ts) ⏸️ 暂缓修改

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

#### 不足 1: 错误处理过于简单 ✅ 同意方案

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

#### 不足 2: 缺少会话管理 ⏸️ 暂缓修改

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

#### 不足 3: 输出格式单一 ⏸️ 暂缓修改

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

#### 建议 1: 简化 Agent Loop 控制流 ✅ 同意方案

```
当前状态: ToolCalls + 文本标记 混用
目标状态: 纯 ToolCalls 控制

实现步骤:
1. 移除文本标记解析逻辑（extractMarker, isValidMarker 等）
2. 移除标记相关的系统提示
3. 采用简单判断: 有 toolCalls → 继续，无 toolCalls → 输出给用户
4. stop_reason 仅用于调试警告，不参与控制逻辑
```

**stop_reason 的作用**：

| stop_reason | 行为 | 处理 |
|------------|------|------|
| `tool_use` | 模型想用工具 | 有 toolCalls → 执行并继续 |
| `end_turn` | 模型完成输出 | 无 toolCalls → 输出给用户 |
| `max_tokens` | 达到 token 限制 | 无 toolCalls → 输出给用户（可选警告） |
| `stop_sequence` | 遇到停止序列 | 无 toolCalls → 输出给用户 |

**注意**：简化方案不需要用 stop_reason 判断对话状态，只需检查是否有 toolCalls。

#### 建议 2: 引入 ConversationManager ✅ 同意方案

```
当前: Agent Loop 代码较长，逻辑混杂
目标: 分离关注点，代码更清晰

实现步骤:
1. 创建 ConversationManager - 管理内存中的对话状态
2. 创建 ToolExecutor - 封装工具执行逻辑
3. 创建 PermissionGuard - 封装权限检查逻辑
4. Agent Loop 主循环保持简洁

组件职责:
┌─────────────────────────────────────────────────────────────┐
│  ConversationManager (内存状态管理)                          │
│  - 管理对话状态 (idle/running/waiting_user)                  │
│  - 管理消息历史                                             │
│  - 跟踪迭代次数                                             │
│  - 判断是否需要继续                                         │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┐
         ▼              ▼              ▼
    ToolExecutor   PermissionGuard   ResponseParser
    (执行工具)      (权限检查)      (解析响应)

注意: ConversationManager 仅管理内存状态，不涉及持久化
      会话持久化功能 (CLI 不足2) 暂缓
```

#### 建议 3: 明确类型契约 ✅ 同意方案

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
| **P0** | 简化 Agent Loop 控制流 | 解决核心问题 | 0.5天 |
| **P0** | 修复权限类型映射 | 提升可靠性 | 0.5天 |
| **P1** | 改进错误处理 | 提升用户体验 | 0.5天 |
| **P1** | 添加 /continue 等便捷命令 | 减少用户输入 | 0.5天 |
| **P1** | 添加会话管理 | 支持多轮对话 | 1天 |
| **P2** | 路径级权限 | 更细粒度控制 | 1天 |
| **P2** | 审计日志 | 安全合规 | 0.5天 |

---

## 四、待解决问题清单

### 4.1 高优先级

- [ ] **简化 Agent Loop 控制流** ✅ 同意方案
  - 问题: 文本标记与 ToolCalls 混用，终止判断不清晰
  - 解决: 移除文本标记，采用"有工具继续，无工具等待"的简单逻辑
  - 文件: `packages/agent/src/loop.ts`

- ⏸️ **权限类型映射改进** - 暂缓修改
  - 问题: `getOperationType()` 字符串匹配不可靠
  - 解决: 在 Tool 定义中声明权限类型
  - 文件: `packages/tool/src/types.ts`, `packages/agent/src/loop.ts`

### 4.2 中优先级

- [ ] **错误处理改进** ✅ 同意方案
  - 当前: 简单的成功/失败输出
  - 目标: 分类错误 + 可操作建议

- ⏸️ **配置验证** - 暂缓修改
  - 当前: 配置加载后无验证
  - 目标: 启动时验证配置完整性

- ⏸️ **REPL 体验优化** - 暂缓修改
  - 当前: 基础交互
  - 目标: 历史、多行输入、命令补全

### 4.3 低优先级

- ⏸️ **输出格式多样化** - 暂缓修改
- ⏸️ **会话持久化** - 暂缓修改
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
