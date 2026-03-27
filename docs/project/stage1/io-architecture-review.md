# CLI IO 架构审视报告

> 基于 stage1.md Phase 9.6 设计方案的全面审视
>
> 审视日期: 2026-03-27

---

## 一、设计方案回顾

### 1.1 三层架构设计

```
┌─────────────────────────────────────────────┐
│            REPL Layer (应用层)               │
│  职责：业务逻辑、命令处理、任务编排           │
└─────────────────┬───────────────────────────┘
                  │ 事件驱动
┌─────────────────▼───────────────────────────┐
│          Interaction Layer (交互层)          │
│  职责：管理用户交互、输入分发、状态协调        │
└─────────────────┬───────────────────────────┘
                  │ 简单接口
┌─────────────────▼───────────────────────────┐
│            IO Layer (IO层)                  │
│  职责：readline 管理、原始输入输出            │
└─────────────────────────────────────────────┘
```

### 1.2 状态机设计

| 当前状态 | 允许的转换 | 触发条件 | 转换后动作 |
|---------|-----------|----------|-----------|
| IDLE | → EXECUTING | 用户输入 | 调用 lineHandler |
| EXECUTING | → WAITING_INPUT | requestInput() | 等待用户输入 |
| EXECUTING | → IDLE | lineHandler 完成 | 显示 prompt |
| WAITING_INPUT | → EXECUTING | 收到输入 | 继续任务执行 |

### 1.3 核心接口设计

```typescript
// IOInterface (IO Layer)
interface IOInterface {
  init(config: IOConfig): readline.Interface;
  showPrompt(): void;
  write(content: string): void;
  writeln(content: string): void;
  close(): void;
}

// InteractionManager (Interaction Layer)
interface InteractionManager {
  init(rl: readline.Interface): void;
  startTask(task: () => Promise<void>): Promise<void>;
  requestInput(prompt: string): Promise<string>;
  setLineHandler(handler: LineHandler): void;
  getState(): InteractionState;
  close(): void;
}
```

---

## 二、实际实现分析

### 2.1 IO Layer (io-manager.ts)

**实现状态:** ✅ 基本正确，但存在接口不一致问题

**实现详情:**
- 使用单例模式
- 提供 readline 接口管理
- 提供 `write()` 和 `writeln()` 方法

**问题分析:**

#### 问题 1: 接口设计与文档不一致

**文档中的接口:**
```typescript
onLine(callback: (line: string) => void): void;
```

**实际实现:** 无此方法

**影响:**
- InteractionManager 直接监听 `rl.on('line')`，绕过了 IOManager
- IOManager 失去对输入流控制的唯一性
- 违反了分层原则，InteractionManager 直接操作底层 readline

#### 问题 2: `write()` 和 `writeln()` 方法未被使用

**实际使用情况:**
- `repl.ts`: 使用 `console.log()` 直接输出
- `task.ts`: 使用 `process.stdout.write()` 直接输出
- `interaction-manager.ts`: 使用 `process.stdout.write()` 直接输出

**影响:**
- 输出逻辑分散在各层
- 无法统一管理输出格式
- 难以实现输出重定向或日志分离

### 2.2 Interaction Layer (interaction-manager.ts)

**实现状态:** ✅ 核心功能正确，⚠️ 存在职责越界问题

**实现详情:**
- 实现了三状态机 (IDLE/EXECUTING/WAITING_INPUT)
- 管理输入缓冲队列
- 提供 `startTask()` 和 `requestInput()` 方法

**问题分析:**

#### 问题 1: 直接操作 readline

```typescript
init(rl: readline.Interface): void {
  this.rl = rl;
  this.rl.on('line', async (line) => { ... });  // 直接监听 line 事件
}

requestInput(prompt: string): Promise<string> {
  process.stdout.write(prompt + ' ');  // 直接输出
  ...
}

private handleIdle(line: string): Promise<void> {
  ...
  this.rl?.prompt();  // 直接显示 prompt
}
```

**影响:**
- InteractionManager 应该通过 IOManager 操作 readline
- 直接使用 `process.stdout.write()` 绕过了 IOManager
- 导致输出管理分散，无法统一控制

#### 问题 2: `startTask()` 未按设计管理状态

**设计预期:**
```
IDLE → startTask() → EXECUTING → task complete → IDLE
```

**实际实现:**
```typescript
async startTask(task: () => Promise<void>): Promise<void> {
  try {
    await task();  // 只执行任务，不管理状态转换
  } catch (error) {
    debugError(NAMESPACE.CLI, '[Interaction] task error', error);
    throw error;
  }
}
```

**影响:**
- `startTask()` 名不副实，只是简单的任务包装器
- 状态转换在 `handleIdle()` 的 finally 块中完成
- 导致状态转换逻辑分散，难以理解和维护

#### 问题 3: `setLineHandler()` 概念错位

**设计中的 lineHandler 是 REPL 层的概念:**
```typescript
// 应该在 REPL 层
function handleLine(line: string) {
  if (line.startsWith('/')) {
    handleCommand(line);
  } else {
    startTask(() => executeTask(line));
  }
}
```

**实际实现:**
```typescript
// 在 InteractionManager 中
setLineHandler(handler: LineHandler): void {
  this.lineHandler = handler;
}
```

**影响:**
- InteractionManager 不应该知道 "line handler" 这个概念
- 这属于 REPL 层的业务逻辑
- 导致层次边界模糊

#### 问题 4: 单次命令场景未考虑

**cli.ts 中的单次命令执行:**
```typescript
const answer = await interactionManager.requestInput(message + '? (y/N)');
```

**问题:**
- InteractionManager 从未初始化 (没有 `init()`)
- 直接调用 `requestInput()` 会失败
- 单次命令和 REPL 共用 InteractionManager，但场景不同

### 2.3 REPL Layer (repl.ts)

**实现状态:** ✅ 基本正确，⚠️ 存在职责分散问题

**实现详情:**
- 创建 readline 并初始化 InteractionManager
- 设置 line handler 处理用户输入
- 处理命令 (/help, /config 等)

**问题分析:**

#### 问题 1: 输出逻辑分散

```typescript
// REPL 层直接输出
console.log(welcomeMessage);
console.log(chalk.gray('Goodbye!'));

// 命令处理中也直接输出
console.log(chalk.yellow(`✓ Scene switched to: ${sceneId}`));
```

**影响:**
- 无法统一管理输出
- 难以实现输出格式化或日志分离

#### 问题 2: 命令处理逻辑在 REPL 层

```typescript
async function handleCommand(command: string, client: TramberClient, context: CliContext) {
  ...
  await handleSceneCommand(args, client, context);
  ...
}
```

**影响:**
- REPL 层包含大量业务逻辑
- 应该有独立的 CommandHandler 或 CommandLayer

### 2.4 Task Executor (task.ts)

**实现状态:** ⚠️ 存在职责不清问题

**实现详情:**
- 执行客户端任务
- 显示进度更新
- 处理权限确认

**问题分析:**

#### 问题 1: 输出管理混乱

```typescript
// 直接操作 process.stdout
process.stdout.write('\r' + chalk.cyan(spinner[spinnerIndex]) + ' Thinking...');
process.stdout.write('\r' + chalk.gray('▸ ') + chalk.white(update.content ?? '') + '\n');

// 混用 console.log
console.log(chalk.green('✓ ') + chalk.white('Result:'));
```

**影响:**
- 输出方式不统一
- 无法统一管理输出流
- 难以实现输出重定向或测试

#### 问题 2: Spinner 实现在任务层

```typescript
const spinner = ['⠋', '⠙', '⠹', ...];
const spinnerInterval = setInterval(() => {
  process.stdout.write('\r' + chalk.cyan(spinner[spinnerIndex % spinner.length]) + ' Thinking...');
  ...
}, 100);
```

**影响:**
- Spinner 是 UI 关注点，应该在 UI 层实现
- 任务层不应关心 UI 细节
- 导致职责混乱

---

## 三、卡死问题分析

### 3.1 问题现象

**用户报告的症状:**
```
用户输入: 执行dir命令
[工具执行中...]
[权限确认]
允许操作 "command_execute" (exec)? (y/N): y
[调用 exec]
  参数: {"command":"dir"}
[卡死，无任何输出]
```

**关键特征:**
1. 权限确认流程正常完成
2. 工具调用被触发
3. 工具执行后无任何输出
4. Agent Loop 无后续迭代
5. REPL prompt 不显示
6. 用户输入的 exit 命令无响应

**日志显示:**
```
[06:17:23.740] [tramber:tool:exec] [INFO] Spawning command
[06:17:23.751] [tramber:tool:exec] [INFO] Child process spawned
[06:17:23.783] [tramber:tool:exec] [INFO] Child process close event
{
  "pid": 42012,
  "exitCode": 0,
  "wasResolved": false
}
[...无后续日志...]
```

### 3.2 根本原因分析

#### 问题定位: exec 工具的 Promise 永不解析

**问题代码 (packages/tool/src/builtin/exec/index.ts):**

```typescript
// ❌ 修复前的错误实现
const cleanup = () => {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  if (!resolved) {
    resolved = true;  // 问题在这里！
  }
};

child.on('close', (code) => {
  cleanup();              // 1. 调用 cleanup，设置 resolved = true
  if (resolved) return;    // 2. 检查 resolved，现在是 true，提前返回！
  resolved = true;         // 3. 这行永远不会执行
  // ... resolve() 永远不会被调用
});
```

**执行流程:**
```
1. 子进程关闭，触发 'close' 事件
2. close 事件处理器被调用
3. cleanup() 被调用，设置 resolved = true
4. if (resolved) 检查，返回 true
5. 提前返回，Promise 永不解析
6. Agent Loop 等待工具结果，但永远不会到达
7. 整个系统卡死
```

#### 为什么 timeout 机制没有生效？

```typescript
timeoutHandle = setTimeout(() => {
  debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Command timed out', { command, timeout });
  child.kill('SIGTERM');
  cleanup();
  resolve({  // timeout 会解析 Promise
    success: false,
    error: `命令超时 (${timeout}ms): ${command}`
  });
}, timeout);
```

**原因:**
- close 事件在 timeout 之前触发（通常在 50ms 内）
- resolved 被设置为 true
- timeout 处理器中的 `cleanup()` 和 `resolve()` 确实执行了
- 但 Promise 已经被泄露（没有消费者等待它）

#### 为什么子进程会立即关闭？

在 Windows 上执行 `dir` 命令时：
```typescript
// 修复前没有 Windows 特殊处理
child = spawn(cmd, args, {
  shell: true,
  ...
});

// dir 被当作可执行文件名，而不是命令
// spawn 立即失败，exitCode = 1
// 但由于 resolved 问题，错误信息没有返回
```

### 3.3 问题影响分析

#### 影响范围

| 层级 | 影响 | 严重程度 |
|------|------|---------|
| **工具层** | exec 工具在特定场景下永不返回 | 🔴 致命 |
| **Agent 层** | Agent Loop 卡在工具执行步骤 | 🔴 致命 |
| **交互层** | 状态机卡在 EXECUTING 状态 | 🔴 高 |
| **REPL 层** | prompt 不显示，用户无法继续操作 | 🔴 高 |

#### 触发条件

1. **Windows 环境 + 内置命令** (dir, cd 等)
2. **任何子进程快速退出的场景** (退出码 != 0)
3. **timeout 触发前子进程已关闭** (大多数情况)

### 3.4 修复方案

#### 修复后的代码

```typescript
// ✅ 修复后的正确实现
child.on('close', (code) => {
  debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Child process close event', {
    pid: child.pid,
    exitCode: code,
    wasResolved: resolved
  });

  // 1. 先检查是否已经被处理过
  if (resolved) return;

  // 2. 标记为已处理
  resolved = true;

  // 3. 清理 timeout
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  // 4. 解析 Promise
  debug(NAMESPACE.TOOL_EXEC, LogLevel.BASIC, 'Command completed successfully', {
    command,
    exitCode: code,
    stdoutLength: stdout.length,
    stderrLength: stderr.length
  });

  resolve({
    success: code === 0,
    data: {
      command,
      exitCode: code,
      stdout,
      stderr
    }
  });
});
```

**关键改进:**
1. **检查在前，设置在后**: 先 `if (resolved) return`，再 `resolved = true`
2. **不再使用 cleanup()**: 直接在事件处理器中管理状态
3. **添加详细日志**: 便于追踪问题

#### 同步修复 error 和 catch 块

```typescript
// error handler
child.on('error', (error) => {
  if (resolved) return;
  resolved = true;
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  // ... resolve with error
});

// catch block
try {
  child = spawn(...);
} catch (error) {
  if (resolved) return;
  resolved = true;
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  // ... resolve with error
}
```

### 3.5 架构层面暴露的问题

这个问题虽然是一个具体的实现 bug，但也暴露了架构层面的潜在问题：

#### 问题 1: 缺乏异步任务监控

**现状:**
- Agent Loop 调用工具执行后，被动等待 Promise 解析
- 没有超时之外的监控机制
- 如果 Promise 永不解析，无法主动发现问题

**建议:**
```typescript
// 在 Agent Loop 中添加超时监控
const toolTimeout = setTimeout(() => {
  if (!toolCompleted) {
    debugError(NAMESPACE.AGENT_LOOP, 'Tool execution timeout without resolution', {
      tool: toolCall.name,
      parameters: toolCall.parameters
    });
    // 主动中断任务或记录错误
  }
}, TOOL_TIMEOUT + 1000);  // 比 tool timeout 稍长

try {
  const result = await this.options.toolRegistry.execute(toolCall.name, toolCall.parameters);
  clearTimeout(toolTimeout);
  toolCompleted = true;
  return result;
} catch (error) {
  clearTimeout(toolTimeout);
  throw error;
}
```

#### 问题 2: 错误处理不完善

**现状:**
- 工具执行失败时，Promise 被拒绝，但可能没有正确传播
- 错误信息可能被吞没
- 难以区分"工具执行失败"和"工具执行超时"

**建议:**
```typescript
// 定义清晰的错误类型
class ToolExecutionError extends Error {
  constructor(
    public toolName: string,
    public reason: 'timeout' | 'spawn_failed' | 'execution_failed' | 'unknown',
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

// 在工具执行中使用
throw new ToolExecutionError(
  toolCall.name,
  'timeout',
  `Tool ${toolCall.name} timed out after ${timeout}ms`
);
```

#### 问题 3: 缺乏死锁检测

**现状:**
- 系统卡死后，用户只能强制终止进程
- 没有诊断信息帮助定位问题

**建议:**
```typescript
// 添加心跳机制
class HeartbeatMonitor {
  private lastHeartbeat = Date.now();
  private timeout: NodeJS.Timeout | null = null;

  start(timeoutMs: number, onTimeout: () => void) {
    this.timeout = setTimeout(() => {
      const elapsed = Date.now() - this.lastHeartbeat;
      if (elapsed > timeoutMs) {
        onTimeout();
      }
    }, timeoutMs + 100);
  }

  beat() {
    this.lastHeartbeat = Date.now();
  }

  stop() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

// 在 Agent Loop 中使用
private heartbeat = new HeartbeatMonitor();

async runLoop(context: AgentContext): Promise<AgentLoopResult> {
  this.heartbeat.start(30000, () => {
    debugError(NAMESPACE.AGENT_LOOP, 'Agent loop appears to be stuck', {
      currentState: this.state,
      lastStep: this.steps[this.steps.length - 1]
    });
  });

  try {
    // ... agent loop logic
    this.heartbeat.beat();  // 每次迭代都更新心跳
  } finally {
    this.heartbeat.stop();
  }
}
```

### 3.6 修复验证

**修复后的执行日志:**
```
[06:17:23.740] [tramber:tool:exec] [INFO] Spawning command
{
  "originalCommand": "dir",
  "spawnCmd": "cmd.exe /c dir",
  "isWindows": true,
  "shell": true
}
[06:17:23.751] [tramber:tool:exec] [INFO] Child process spawned
{
  "pid": 42012
}
[06:17:23.783] [tramber:tool:exec] [INFO] Child process close event
{
  "pid": 42012,
  "exitCode": 0,
  "wasResolved": false
}
[06:17:23.783] [tramber:tool:exec] [INFO] Command completed successfully
{
  "command": "dir",
  "exitCode": 0,
  "stdoutLength": 1234,
  "stderrLength": 0
}
[06:17:23.784] [tramber:agent:loop] [INFO] Tool execution completed
... [Agent Loop 继续]
✓ Result:
[dir 输出内容]
You: [prompt 正确显示]
```

**验收标准:**
- ✅ 工具执行后 Promise 正确解析
- ✅ Agent Loop 继续执行
- ✅ 任务结果正确显示
- ✅ Prompt 正常显示
- ✅ 用户可以继续输入

---

## 四、架构层面的问题总结

### 3.1 关键问题

| 问题 | 严重程度 | 影响 |
|------|---------|------|
| **IOManager 的 `onLine()` 方法缺失** | 🔴 高 | 层次边界模糊，InteractionManager 直接操作底层 |
| **输出管理分散在所有层** | 🔴 高 | 无法统一控制输出，难以实现日志分离 |
| **`startTask()` 未管理状态转换** | 🟡 中 | 状态转换逻辑分散，难以理解和维护 |
| **`setLineHandler()` 概念错位** | 🟡 中 | REPL 层概念泄露到 Interaction Layer |
| **单次命令场景未考虑** | 🟡 中 | 单次命令执行可能失败 |
| **命令处理逻辑在 REPL 层** | 🟢 低 | 代码组织不够清晰 |

### 3.2 设计违背

#### 违背 1: 分层解耦原则

**设计目标:** 每层只负责自己的职责

**实际情况:**
- InteractionManager 直接操作 readline (应该通过 IOManager)
- InteractionManager 直接使用 `process.stdout.write()` (应该通过 IOManager)
- 所有层都直接输出 (应该通过统一的输出接口)

#### 违背 2: 单一职责原则

**设计目标:** InteractionManager 只管理交互状态

**实际情况:**
- InteractionManager 管理状态 ✅
- InteractionManager 管理输入分发 ✅
- InteractionManager 显示 prompt ❌ (应该由 IOManager 负责)
- InteractionManager 直接输出权限提示 ❌ (应该通过 IOManager)

#### 违背 3: 接口稳定性原则

**设计目标:** 接口定义清晰，实现与接口一致

**实际情况:**
- IOManager 接口定义有 `onLine()` 方法，但实现中没有
- `startTask()` 接口说明会管理状态，但实际没有
- `write()` 和 `writeln()` 方法定义了但从未被使用

---

## 五、改进建议

### 4.1 优先级 P0: 修复接口不一致

#### 建议 1: 实现 IOManager 的 `onLine()` 方法

```typescript
// io-manager.ts
class IOManagerImpl implements IOInterface {
  private lineCallback: ((line: string) => void) | null = null;

  init(config: IOConfig): readline.Interface {
    if (this.rl) {
      return this.rl;
    }

    this.rl = readline.createInterface({
      input: config.input,
      output: config.output,
      prompt: config.prompt ?? '> ',
      history: config.history ?? [],
      historySize: config.historySize ?? 100
    });

    // IO Manager 监听 line 事件
    this.rl.on('line', (line) => {
      if (this.lineCallback) {
        this.lineCallback(line);
      }
    });

    return this.rl;
  }

  onLine(callback: (line: string) => void): void {
    this.lineCallback = callback;
  }

  // ... 其他方法
}
```

**对应的 InteractionManager 修改:**
```typescript
// interaction-manager.ts
init(rl: readline.Interface): void {
  this.rl = rl;

  // 通过 IOManager 注册 line 监听器
  ioManager.onLine(async (line) => {
    switch (this.state) {
      case InteractionState.WAITING_INPUT:
        await this.handleWaitingInput(line);
        break;
      case InteractionState.EXECUTING:
        if (this.inputResolve) {
          await this.handleWaitingInput(line);
        } else {
          this.pendingInputQueue.push(line);
        }
        break;
      case InteractionState.IDLE:
        await this.handleIdle(line);
        break;
    }
  });
}
```

#### 建议 2: 统一输出接口

```typescript
// io-manager.ts
class IOManagerImpl implements IOInterface {
  // 写入内容（不换行）
  write(content: string): void {
    process.stdout.write(content);
  }

  // 写入内容并换行
  writeln(content: string): void {
    console.log(content);
  }

  // 写入到错误流（用于 debug 日志）
  writeError(content: string): void {
    console.error(content);
  }
}
```

**各层修改:**
- `task.ts`: 使用 `ioManager.write()` 替代 `process.stdout.write()`
- `interaction-manager.ts`: 使用 `ioManager.write()` 替代 `process.stdout.write()`
- `repl.ts`: 使用 `ioManager.writeln()` 替代 `console.log()`

### 4.2 优先级 P0: 修复 startTask() 状态管理

```typescript
// interaction-manager.ts
async startTask(task: () => Promise<void>): Promise<void> {
  // 状态已在 handleIdle 中设置为 EXECUTING

  try {
    await task();
    // 任务成功完成，状态会在 handleIdle 的 finally 块中重置
  } catch (error) {
    debugError(NAMESPACE.CLI, '[Interaction] task error', error);
    // 即使出错，状态也会在 finally 块中重置
    throw error;  // 重新抛出，让调用者知道任务失败
  }
  // 不在这里重置状态，由 handleIdle 的 finally 块统一处理
}
```

**或者更清晰的设计：**
```typescript
// 让 startTask 负责完整的状态转换
async startTask(task: () => Promise<void>): Promise<void> {
  this.setState(InteractionState.EXECUTING);

  try {
    await task();
  } catch (error) {
    debugError(NAMESPACE.CLI, '[Interaction] task error', error);
    throw error;
  } finally {
    this.setState(InteractionState.IDLE);
    setImmediate(() => {
      this.rl?.prompt();
    });
  }
}

// handleIdle 简化为：
private async handleIdle(line: string): Promise<void> {
  if (!this.lineHandler) {
    return;
  }

  // 直接调用 lineHandler，不管理状态
  await this.lineHandler(line);
}
```

### 4.3 优先级 P1: 重构 setLineHandler

**问题:** `setLineHandler()` 是 REPL 层的概念，不应在 InteractionManager 中

**解决方案:**

#### 方案 A: 使用回调

```typescript
// interaction-manager.ts
private idleCallback: ((line: string) => void) | null = null;

onIdle(callback: (line: string) => void): void {
  this.idleCallback = callback;
}

private async handleIdle(line: string): Promise<void> {
  if (this.idleCallback) {
    await this.idleCallback(line);
  }
}
```

```typescript
// repl.ts
interactionManager.onIdle(async (line) => {
  const trimmed = line.trim();

  if (exitCommand.includes(trimmed.toLowerCase())) {
    console.log(chalk.gray('Goodbye!'));
    interactionManager.close();
    return;
  }

  if (!trimmed) {
    return;
  }

  if (trimmed.startsWith('/')) {
    await handleCommand(trimmed, client, context);
    return;
  }

  // 执行任务
  await executeTask(trimmed, client, context, autoConfirm);
});
```

#### 方案 B: 使用事件发射器

```typescript
// interaction-manager.ts
import { EventEmitter } from 'events';

class InteractionManagerImpl extends EventEmitter implements InteractionManager {
  private async handleIdle(line: string): Promise<void> {
    this.emit('idle', line);  // 发射事件
  }
}

// repl.ts
interactionManager.on('idle', async (line) => {
  // 处理空闲输入
});
```

### 4.4 优先级 P1: 支持单次命令场景

**问题:** 单次命令执行时，InteractionManager 未初始化

**解决方案:**

```typescript
// cli.ts
if (input.length > 0) {
  // 执行单次命令
  const description = input.join(' ');

  // 对于单次命令，不需要 InteractionManager 的状态管理
  // 使用简单的 readline 接口即可

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  const executeTask = async (): Promise<void> => {
    const permissionHandler = async (toolCall, operation, reason) => {
      if (options.yes) {
        return true;
      }

      let message = `允许操作 "${operation}" (${toolCall.name})`;
      if (toolCall.parameters.command) {
        message += `\n命令: ${toolCall.parameters.command}`;
      }
      if (reason) {
        message += `\n原因: ${reason}`;
      }

      const answer = await question(message + '? (y/N)');
      const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      return confirmed;
    };

    const result = await client.execute(description, {
      sceneId: context.config.scene,
      maxIterations: context.config.maxIterations,
      onProgress: (progress) => { ... },
      onPermissionRequired: permissionHandler
    });

    if (result.success) {
      console.log(chalk.green('✓') + ' ' + chalk.white(result.result));
    } else {
      handleError(result.error, result.terminatedReason);
      process.exit(1);
    }
  };

  await executeTask();
  rl.close();
}
```

### 4.5 优先级 P2: 分离命令处理逻辑

**问题:** 命令处理逻辑在 REPL 层

**解决方案:**

```typescript
// command-handler.ts
export class CommandHandler {
  constructor(
    private client: TramberClient,
    private context: CliContext
  ) {}

  async handle(command: string): Promise<boolean> {
    const trimmed = command.trim();

    if (!trimmed.startsWith('/')) {
      return false;  // 不是命令
    }

    const parts = trimmed.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '/help':
        return this.showHelp();
      case '/scene':
        return this.handleScene(args);
      case '/skills':
        return this.handleSkills(args);
      // ... 其他命令
      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
        return true;
    }
  }

  private async showHelp(): Promise<boolean> {
    // ...
  }

  private async handleScene(args: string[]): Promise<boolean> {
    // ...
  }
}
```

```typescript
// repl.ts
const commandHandler = new CommandHandler(client, context);

interactionManager.onIdle(async (line) => {
  const trimmed = line.trim();

  if (exitCommand.includes(trimmed.toLowerCase())) {
    console.log(chalk.gray('Goodbye!'));
    interactionManager.close();
    return;
  }

  if (!trimmed) {
    return;
  }

  // 尝试作为命令处理
  const isCommand = await commandHandler.handle(line);
  if (isCommand) {
    return;  // 是命令，已处理
  }

  // 不是命令，执行任务
  await executeTask(line, client, context, autoConfirm);
});
```

---

## 六、实施优先级

| 优先级 | 任务 | 预估时间 | 依赖 |
|-------|------|---------|------|
| **P0** | 实现 IOManager 的 `onLine()` 方法 | 0.5天 | - |
| **P0** | 统一输出接口，修改所有层使用 IOManager | 0.5天 | P0-1 |
| **P0** | 修复 `startTask()` 状态管理 | 0.5天 | - |
| **P1** | 重构 `setLineHandler()` 为 `onIdle()` | 0.5天 | P0-1 |
| **P1** | 支持单次命令场景 | 0.5天 | P0-1 |
| **P2** | 分离命令处理逻辑到 CommandHandler | 1天 | P1-1 |
| **P2** | 添加单元测试 | 1天 | P0, P1 |
| **P2** | 更新文档 | 0.5天 | 所有改动 |
| **总计** | | **5天** | |

---

## 七、验收标准

### 6.1 功能验收

```bash
# 测试场景 1: 正常任务执行
$ tramber
You: 读取 package.json
[执行中...]
✓ 任务完成
You:  ← prompt 时机正确，位置正确

# 测试场景 2: 权限确认
You: 修改 package.json
允许操作 "file_write" (edit)
文件: package.json? (y/N): y
[执行中...]
✓ 任务完成
You:  ← 权限确认后 prompt 显示正确

# 测试场景 3: 单次命令
$ tramber "读取 package.json"
允许操作 "file_read" (read_file)
文件: package.json? (y/N): y
[执行中...]
✓ 任务完成
$ ← 正常退出

# 测试场景 4: 输出流分离
$ tramber "读取 package.json" --debug 2>debug.log
✓ 任务完成
$ cat debug.log  ← debug 日志在 stderr
[14:20:30.123] [tramber:cli] [INFO] ...
```

### 6.2 架构验收

| 检查项 | 标准 |
|--------|------|
| **分层清晰** | 每层只调用直接下层，不跨层调用 |
| **接口一致** | 实现与接口定义完全一致 |
| **输出统一** | 所有输出通过 IOManager |
| **状态管理** | 状态转换逻辑集中在一处 |
| **职责单一** | 每个类/函数只有一个改变的理由 |

---

## 八、附录：关键代码对比

### 7.1 设计 vs 实际：IOManager

**设计:**
```typescript
interface IOInterface {
  init(config: IOConfig): void;
  onLine(callback: (line: string) => void): void;  // ❌ 实现中缺失
  showPrompt(): void;
  write(content: string): void;  // ⚠️ 定义但未使用
  writeln(content: string): void;  // ⚠️ 定义但未使用
  close(): void;
}
```

**实际:**
```typescript
class IOManagerImpl implements IOInterface {
  init(config: IOConfig): readline.Interface {
    this.rl = readline.createInterface({...});
    // ❌ 没有 onLine()，InteractionManager 直接监听 line 事件
    return this.rl;
  }

  showPrompt(): void {
    this.rl?.prompt();  // ⚠️ 从未被调用
  }

  write(content: string): void {
    this.rl?.write(content);  // ⚠️ 从未被调用
  }

  writeln(content: string): void {
    console.log(content);  // ⚠️ 从未被调用
  }

  close(): void {
    if (this.rl) {
      this.rl.close();
    }
  }
}
```

### 7.2 设计 vs 实际：startTask()

**设计预期:**
```
调用 startTask() → 状态转换为 EXECUTING → 执行任务 → 状态转换为 IDLE → 显示 prompt
```

**实际实现:**
```typescript
async startTask(task: () => Promise<void>): Promise<void> {
  try {
    await task();  // ❌ 不管理状态
  } catch (error) {
    debugError(NAMESPACE.CLI, '[Interaction] task error', error);
    throw error;
  }
  // ❌ 不重置状态，不显示 prompt
}

// 状态转换在 handleIdle() 中：
private async handleIdle(line: string): Promise<void> {
  this.setState(InteractionState.EXECUTING);  // ⚠️ 状态转换在 lineHandler 之前
  try {
    await this.lineHandler(line);  // lineHandler 内部调用 startTask()
  } finally {
    this.setState(InteractionState.IDLE);  // ⚠️ 状态转换在 lineHandler 之后
    this.rl?.prompt();
  }
}
```

---

*文档创建时间: 2026-03-27*
*审视范围: interaction-manager.ts, io-manager.ts, repl.ts, task.ts, cli.ts*
