# Stage 10B: 深层任务树 — 意识体 suspend/resume

## 1. 核心思想

执行意识在执行过程中可以 **spawn 子任务**：封存自身状态为实体，代码层 loop 正常结束返回。守护意识收到 spawn 信号后，**先 analyze_turn 记录树形关系并更新自身 prompt**，再 dispatch 子任务。子任务完成后，守护意识再 dispatch_task resume 挂起的父任务。

```
守护意识
  │
  ├ dispatch_task(A)
  │   └ [编码意识] 分析代码 → spawn_task(domain="文档", context="分析结果")
  │   └ dispatch_task 返回 { spawned, suspendedSubtaskId: s:A }
  │
  ├ analyze_turn（记录 A suspended、leads_to 关系、更新 prompt 中的任务树）
  │
  ├ dispatch_task(B, domain="文档")
  │   └ [文档意识] 写文档 → 完成
  │   └ dispatch_task 返回 { completed, finalAnswer }
  │
  ├ analyze_turn（记录 B completed）
  │
  ├ dispatch_task(resumeSubtaskId=s:A, childResult=B的结果)
  │   └ [编码意识] resume → 合并结果 → 完成
  │   └ dispatch_task 返回 { completed }
  │
  └ analyze_turn（记录 A completed，整棵任务树闭环）
```

**关键**：每一步 dispatch_task 后都跟 analyze_turn。守护意识始终能看到最新的任务树。

## 2. 状态机的本质

守护意识状态机只有一条规则：**dispatch_task 返回后必须 analyze_turn**。analyze_turn 后根据挂起栈决定下一步：

```
dispatch_task 返回
  │
  ├→ analyze_turn（始终执行）
  │
  └→ 判断：
       有挂起任务 + 本次是 spawn？  → dispatch_task(子任务)
       有挂起任务 + 本次是完成？    → dispatch_task(resume 父任务)
       无挂起任务 + 本次是完成？    → done
```

analyze_turn 后守护意识的 prompt 已更新（任务树展示、挂起状态），LLM 自然知道下一步该做什么。状态机只需控制 `allowedTools` 交替：

```
dispatch_task → allowedTools=['analyze_turn']
analyze_turn  → allowedTools=['dispatch_task']  (有挂起) / [] (无挂起, done)
```

这与现有逻辑一致，只是去掉了"analyze 后必须结束"的限制。

## 3. 机制拆解

### 3.1 spawn_task 工具（新文件 spawn-task.ts）

执行意识调用 `spawn_task`：

```
spawn_task({
  domain: "文档",
  taskDescription: "根据代码分析写技术文档",
  context: "帆船场景包含13个对象：天空球体、云朵(15)、海洋..."
})
```

**执行逻辑**：

1. 从 `VirtualToolContext` 获取当前 subtask ID 和 conversation
2. 将 conversation.messages + systemPrompt 保存到 subtask 实体的 `suspendedState`
3. 更新 subtask 状态为 `suspended`
4. 返回 spawn 信号

```typescript
async execute(input: unknown): Promise<ToolResult> {
  const { consciousnessManager, currentSubtaskId } = this.context;
  const taskId = consciousnessManager.getTaskId();
  const memoryStore = consciousnessManager.getMemoryStore();

  // 封存状态到实体
  memoryStore.updateEntity(taskId, currentSubtaskId, {
    status: 'suspended',
    suspendedState: {
      messages: this.getCurrentMessages(),  // 从 context 获取
      systemPrompt: this.getCurrentSystemPrompt(),
      spawnReason: params.taskDescription
    }
  });

  return {
    success: true,
    data: {
      spawned: true,
      domain: params.domain,
      taskDescription: params.taskDescription,
      context: params.context
    }
  };
}
```

**subtask 实体扩展**（shared types）：

```typescript
status: 'pending' | 'running' | 'completed' | 'blocked' | 'suspended';
suspendedState?: {
  messages: Array<{ role: string; content: string }>;
  systemPrompt: string;
  spawnReason: string;
};
```

### 3.2 dispatch_task 透传 spawn 信号

dispatch_task 执行子 loop 后，从 steps 中提取 spawn_task 调用信息：

```typescript
// 检查子 loop 中是否有 spawn_task 调用
const spawnStep = steps?.find(s =>
  s.toolCall?.name === 'spawn_task' && s.toolResult?.success
);

// 更新 subtask 状态
memoryStore.updateEntity(taskId, currentSubtaskId, {
  status: spawnStep ? 'suspended' : (result.success ? 'completed' : 'blocked'),
  result: result.success ? (spawnStep ? '' : '') : result.error
});

// 返回值携带 spawn 信息
return {
  success: true,
  data: {
    domain, taskDescription,
    spawned: !!spawnStep,
    spawnDomain: spawnStep?.toolResult?.data?.domain,
    spawnTaskDescription: spawnStep?.toolResult?.data?.taskDescription,
    spawnContext: spawnStep?.toolResult?.data?.context,
    suspendedSubtaskId: spawnStep ? currentSubtaskId : undefined,
    // 正常完成的字段
    iterations: result.iterations,
    finalAnswer: result.success ? childFinalAnswer : '',
    toolCallSummary
  }
};
```

### 3.3 dispatch_task resume 机制

新增参数：

```typescript
resumeSubtaskId: {
  type: 'string',
  description: '要恢复的挂起子任务 ID'
},
childResult: {
  type: 'string',
  description: '子任务的执行结果'
}
```

**resume 逻辑**（在 dispatch_task 的 execute 中，与正常 dispatch 分支）：

```typescript
if (params.resumeSubtaskId) {
  const suspendedSubtask = memoryStore.getEntity(taskId, params.resumeSubtaskId);
  const saved = (suspendedSubtask as any).suspendedState;
  if (!saved) return { success: false, error: 'No suspended state found' };

  // 恢复 conversation
  const conversation = createConversation({
    systemPrompt: saved.systemPrompt,
    projectInfo: { rootPath: process.cwd(), name: 'project' }
  });
  for (const msg of saved.messages) {
    addMessage(conversation, { role: msg.role, content: msg.content });
  }

  // 注入子任务结果
  addMessage(conversation, {
    role: 'system',
    content: `## 子任务完成结果\n${params.childResult}\n\n请基于以上结果继续你的任务。`
  });

  // 更新 subtask 状态
  memoryStore.updateEntity(taskId, params.resumeSubtaskId, {
    status: 'running',
    suspendedState: undefined  // 清除封存状态
  });

  // 执行子 loop（复用现有的 loop 执行逻辑）
  // ...
}
```

### 3.4 守护意识状态机改造（loop.ts）

改动极小：去掉 analyze_turn 后清空 allowedTools 的逻辑，改为根据挂起栈判断。

```typescript
// 现有逻辑：
if (toolResult.some(r => r.toolCall.name === 'dispatch_task')) {
  guardianAllowedTools = ['analyze_turn'];
}
if (toolResult.some(r => r.toolCall.name === 'analyze_turn')) {
  guardianAllowedTools = [];  // ← 这里是问题：强制结束
}

// 改为：
if (toolResult.some(r => r.toolCall.name === 'dispatch_task')) {
  guardianAllowedTools = ['analyze_turn'];
}
if (toolResult.some(r => r.toolCall.name === 'analyze_turn')) {
  // 从 dispatch_task 返回值中提取挂起信息
  const lastDispatchResult = /* 从 steps 中获取最近的 dispatch_task 返回 */;
  const hasSuspended = lastDispatchResult?.spawned || hasPendingResumes();

  if (hasSuspended) {
    guardianAllowedTools = ['dispatch_task'];  // 继续派生
  } else {
    guardianAllowedTools = [];  // 无挂起，结束
  }
}
```

**挂起栈管理**：在 loop 层面维护一个简单的栈。

```typescript
let spawnStack: Array<{ subtaskId: string; domain: string }> = [];

// dispatch_task 返回 spawned 时
spawnStack.push({ subtaskId: data.suspendedSubtaskId, domain: data.domain });

// dispatch_task 返回 completed 且 spawnStack 非空时
// → analyze_turn 后允许 dispatch_task（resume 场景）
```

**深度限制**：

```typescript
const MAX_SPAWN_DEPTH = 3;
if (spawnStack.length >= MAX_SPAWN_DEPTH) {
  guardianAllowedTools = ['analyze_turn'];  // 强制总结，不再派生
}
```

### 3.5 守护意识 prompt 任务树展示

在 `buildSelfAwarenessPrompt` 中新增 spawn/resume 处理指令，并在 `assembleExecutionContext` 的纲领中展示任务树。

**纲领新增**（assembleExecutionContext 中）：

```typescript
// 挂起的子任务
const suspendedSubtasks = subtasks.filter(s => s.status === 'suspended');
if (suspendedSubtasks.length > 0) {
  guideline += `\n## 挂起任务（等待子任务完成后 resume）\n`;
  for (const s of suspendedSubtasks) {
    const leadsTo = s.relations.find(r => r.type === 'leads_to');
    guideline += `- [${s.id}] ${s.description} → leads_to ${leadsTo?.target || '?'}\n`;
  }
}
```

**prompt 新增指令**（buildSelfAwarenessPrompt）：

```
## 任务派生处理

dispatch_task 返回中包含 spawned: true 时：
1. 调用 analyze_turn，记录当前子任务挂起状态和 leads_to 关系
2. analyze_turn 后，dispatch_task 到 spawn 指定的领域
   - domain: spawnDomain
   - taskDescription: spawnTaskDescription
   - contextForChild: spawnContext

dispatch_task 正常完成且存在挂起任务时：
1. 调用 analyze_turn，记录子任务完成
2. dispatch_task 恢复挂起的父任务：
   - resumeSubtaskId: 挂起的子任务 ID
   - domain: 原领域
   - childResult: 子任务结果

dispatch_task 正常完成且无挂起任务时：
1. 调用 analyze_turn，正常结束
```

### 3.6 analyze_turn 处理 leads_to

spawn_task 调用时，dispatch_task 已经知道了原始 subtask ID。在 dispatch_task 处理 spawn 时创建 leads_to 关系：

```typescript
// dispatch_task 中，检测到 spawn 后
if (spawnStep && taskId && currentSubtaskId) {
  // spawn_task 已经在 subtask 实体上设置了 suspendedState
  // 这里只需添加 leads_to 关系
  // leads_to 的目标是将要创建的新 subtask（由下一次 dispatch_task 创建）
  // 在创建新 subtask 时，设置 parentRelation 指回原 subtask
}
```

更简单的做法：在 dispatch_task 创建新 subtask 时，如果是从 spawn 派生的，直接添加 leads_to 关系：

```typescript
// dispatch_task 新增参数 spawnFromSubtaskId
if (params.spawnFromSubtaskId) {
  relations.push({ type: 'leads_to', target: params.spawnFromSubtaskId });
}
```

## 4. 完整流程示例

```
用户: "分析帆船代码并写技术文档"

[Guardian] dispatch_task(domain="编码", task="分析帆船代码并写文档")
  [编码意识] 读取 3d-sailboat.html，分析代码
  [编码意识] spawn_task(domain="文档", context="代码分析: 13个3D对象...")
  [编码意识] loop 结束（代码层完成），subtask s:A 状态=suspended
  → 返回 { spawned:true, spawnDomain:"文档", suspendedSubtaskId:"s:A" }

[Guardian] allowedTools=['analyze_turn'] → analyze_turn
  → 记录 s:A 状态=suspended，纲领更新显示"挂起任务: s:A → 待创建"

[Guardian] allowedTools=['dispatch_task'] → dispatch_task(domain="文档", spawnFromSubtaskId="s:A")
  [文档意识] 写文档 → 完成
  → 返回 { completed:true, finalAnswer:"文档已生成..." }

[Guardian] allowedTools=['analyze_turn'] → analyze_turn
  → 记录 s:B completed，leads_to 关系: s:A → s:B

[Guardian] spawnStack 非空 → allowedTools=['dispatch_task']
  → dispatch_task(resumeSubtaskId="s:A", domain="编码", childResult="文档已生成...")
  [编码意识] resume（恢复 messages + 注入子任务结果）
  [编码意识] 合并结果，完成最终回复
  → 返回 { completed:true }

[Guardian] allowedTools=['analyze_turn'] → analyze_turn
  → 记录 s:A completed，任务树闭环

[Guardian] spawnStack 空 → allowedTools=[] → done
```

## 5. 实施步骤

### Step 1: subtask 实体扩展（shared types + consciousness-manager.ts）
- 新增 `suspended` 状态和 `suspendedState` 字段
- assembleExecutionContext 纲领渲染挂起任务和 leads_to 关系
- **风险**：低

### Step 2: spawn_task 工具（新文件 spawn-task.ts）
- 封存 conversation 状态到 subtask 实体
- 返回 spawn 信号
- 注册到 VirtualToolContext（execution 级别）
- **风险**：低。新文件，不影响现有代码

### Step 3: dispatch_task 增强（dispatch-task.ts）
- 检测子 loop 中的 spawn_task，透传到返回值
- 新增 resumeSubtaskId / childResult / spawnFromSubtaskId 参数
- resume 逻辑：从实体恢复 conversation + 注入子任务结果
- spawn 时创建 leads_to 关系
- **风险**：中

### Step 4: 守护意识状态机改造（loop.ts）
- 去掉 analyze_turn 后强制结束的逻辑
- 新增 spawnStack 管理
- analyze_turn 后根据栈状态决定 allowedTools
- 深度限制 MAX_SPAWN_DEPTH = 3
- **风险**：高

### Step 5: 守护意识 prompt 更新（consciousness-prompts.ts）
- 新增 spawn/resume 处理指令
- analyze_turn 新增 spawnFromSubtaskId 参数
- **风险**：低

## 6. escalate 的定位

保留 escalate，语义不变：

- **escalate**: "这事不归我管" → 守护意识路由到新领域，不 resume
- **spawn_task**: "这事归我管，但需要帮手" → 守护意识派生子任务后 resume 我

## 7. 安全机制

- **MAX_SPAWN_DEPTH = 3**：超过深度限制后强制 analyze_turn 结束
- **spawnStack 完整性**：每次 resume 从栈中 pop，栈空才能结束
- **suspendedState 清理**：resume 后立即清除，避免内存泄漏
- **超时保护**：resume 的子 loop 继承原始任务的 maxIterations 限制
