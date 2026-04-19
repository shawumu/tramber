# Stage 10: 多层意识体增强 — 子意识上下文预填充与跨域任务派生

## 1. 目标与范围

### 1.1 背景

Stage 9 完成了实体图谱和 Context 自组装。当前每次 `dispatch_task` 创建全新的空 conversation，子意识完全"失忆"——不记得同领域之前做过什么、读过什么文件。这导致多轮对话中子意识重复劳动（重新读取相同文件、重新发现相同结构）。

此外，当执行中遇到超出当前领域的复杂子任务时，子意识只能 `escalate` 但无法真正协调跨域任务。

### 1.2 目标

Stage 10 解决两个核心问题：
1. **子意识上下文贫血** → 预填充对话历史 + 资源内容
2. **跨域任务派生** → 守护意识协调同级子任务（孙任务）

### 1.3 范围

```
Stage 10 范围                            Stage 11 范围（后续）
─────────────────                        ──────────────────
子意识 Context 预填充                     多 Agent 协作（Partners）
├─ 对话历史注入                           ├─ Agent 间实体共享
├─ 资源内容预附加                         ├─ 跨 Agent 任务分配
├─ Token 预算管理                         └─ TeamOrchestrator
└─ 同级子任务派生
```

---

## 2. 提案一：执行意识 messages → 实体图谱预填充

### 2.1 可行性：高

**现状**：
- `ExecutionContext.最近对话` 字段已定义但始终返回 `[]`（consciousness-manager.ts:615）
- `assembleExecutionContext` 已能查询已完成 subtask 的 result（由 analyze_turn 回填）
- dispatch_task 创建空 conversation（dispatch-task.ts:200）

**方案**：

在 `assembleExecutionContext` 中填充 `最近对话`：

```
最近对话 = 最近 N 个已完成 subtask 的:
  - user message: subtask.description（"查看 demos 目录"）
  - assistant message: subtask.result（"发现13个演示项目..."）
```

在 `dispatch-task.ts` 中，创建 conversation 后将 `最近对话` 注入为历史消息（类似 conversation.ts 的 summary 模式）。

**Token 预算**：预留 128K 的 15%（~19K tokens），约 2-3 个 subtask 历史。超预算时截断为最近 1-2 个。

### 2.2 关键文件

| 文件 | 变更 |
|------|------|
| `packages/agent/src/consciousness-manager.ts` | assembleExecutionContext 填充 最近对话 |
| `packages/agent/src/virtual-tools/dispatch-task.ts` | 注入历史消息到 child conversation |

---

## 3. 提案二：守护意识预附加资源内容

### 3.1 可行性：高

**现状**：
- 资源索引只列 `{id, uri, summary}`，子意识必须调用 `recall_resource` 获取内容
- 浪费 1 轮迭代 + 1 次工具调用
- 对于 "修改你刚创建的文件" 这类任务，需要的资源很明显

### 3.2 方案

两级资源注入策略：

**A. 自动附加**（assembleExecutionContext 中）：
- subtask 的 `requires` 列表中的资源 + 最近 subtask 产出的小文件（<500行 或 <10K字符）
- 内容注入到 ExecutionContext 新增字段 `资源内容: Array<{uri, content}>`

**B. 守护意识显式指定**（dispatch_task 参数）：
- 新增 `attachResources?: string[]` 参数（资源 URI 列表）
- 守护意识 LLM 判断任务需要哪些资源时指定

**Prompt 展示**：
```
## 已加载资源（直接可用）
[r:xxx] demos/3d-earth.html
  {文件内容}

## 可用资源（通过 recall_resource 获取）
[r:yyy] demos/blackhole.html
```

**Token 预算**：与提案一共享预算。系统提示 + 纲领 + 工具约占 5-10K tokens。资源内容预留最多 25%（~30K tokens），约 2-4 个中等文件。

### 3.3 关键文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/types/consciousness.ts` | ExecutionContext 新增 资源内容 字段 |
| `packages/agent/src/consciousness-manager.ts` | assembleExecutionContext 读取文件内容 |
| `packages/agent/src/consciousness-prompts.ts` | buildExecutionPrompt 渲染"已加载资源"与"可用资源" |
| `packages/agent/src/virtual-tools/dispatch-task.ts` | attachResources 参数 |

---

## 4. 提案三：孙任务（跨域同级子任务派生）

### 4.1 可行性：中

**现状**：
- `createLoop` 明确阻止嵌套：`throw new Error('Nested child creation not supported')`（engine.ts:360）
- 子意识只能 `escalate` 但 escalate 只记录日志、不触发行动
- 守护意识状态机严格：dispatch_task → analyze_turn → 结束（loop.ts:283-290）

### 4.2 两种架构对比

| 方案 | 描述 | 复杂度 | 风险 |
|------|------|--------|------|
| A. 真三层树 | 子意识创建孙意识，需暂停/恢复 loop | 极高 | loop.ts 核心重构 |
| B. 同级子任务 | 守护意识协调，在同级之间传递结果 | 中 | 放松状态机 |

**推荐方案 B（同级子任务）**：

```
流程：
1. 子意识 A 执行中发现需要跨域任务 B
2. 子意识 A 调用 escalate(domain="文档", reason="需要写API文档", context="...")
3. escalate 返回特殊结果，触发子意识 A 结束当前任务
4. 守护意识收到 dispatch_task 返回值中的 escalate 标记
5. 守护意识 dispatch_task 到"文档"领域（同级子任务 B）
6. 子任务 B 完成，结果返回守护意识
7. 守护意识再次 dispatch_task 到原始领域，附带子任务 B 的结果
```

### 4.3 关键改动

1. 放松守护意识状态机：允许每轮多次 dispatch_task
2. 增强 escalate：返回结构化上下文 + 中止信号
3. dispatch_task 支持恢复上下文：附带同级任务的结果
4. 实体图谱：subtask A → `leads_to` → subtask B

**依赖提案一**：恢复原始子意识时，需要预填充对话历史（提案一），否则恢复后的子意识会忘记之前的工作。

### 4.4 关键文件

| 文件 | 变更 |
|------|------|
| `packages/agent/src/loop.ts` | 放松守护意识状态机 |
| `packages/agent/src/virtual-tools/escalate.ts` | 结构化上下文 + 中止信号 |
| `packages/agent/src/virtual-tools/dispatch-task.ts` | 恢复上下文参数 |
| `packages/agent/src/consciousness-prompts.ts` | 守护意识升级处理指令 |
| `packages/agent/src/virtual-tools/analyze-turn.ts` | leads_to 关系创建 |

---

## 5. 实施计划

### Phase 10A：上下文预填充（提案一 + 提案二，5-8天）

1. ExecutionContext 新增 `资源内容` 字段
2. assembleExecutionContext 填充 `最近对话` + 读取小文件到 `资源内容`
3. dispatch-task.ts 注入最近对话到 conversation
4. buildExecutionPrompt 渲染已加载/可用资源两部分
5. Token 预算管理（集中预算，15% 对话 + 25% 资源）
6. 守护意识 prompt 更新：支持 attachResources 参数

**验证**：
- 同领域多轮对话：子意识不需要 re-read 相同文件
- 跨领域切换后回来：子意识恢复上下文
- 大文件场景：Token 预算不溢出

### Phase 10B：同级子任务派生（提案三 方案B，3-5天）

1. 放松守护意识状态机（允许多次 dispatch_task）
2. 增强 escalate（结构化上下文 + 子意识中止信号）
3. dispatch_task 支持恢复上下文
4. 守护意识 prompt 添加升级处理指令
5. analyze_turn 处理 leads_to 关系

**验证**：
- 跨域任务场景：子意识 A escalate → 守护意识派生子意识 B → 结果回到 A
- 单域任务不受影响
- escalate 后子意识正常结束，不卡死

---

## 6. 架构决策

### 为什么推荐同级而非三层

- 三层需要 loop.ts 支持暂停/恢复（for 循环 → 状态机），影响面巨大
- 同级方案复用现有 dispatch_task 机制，只改状态机和 escalate
- `leads_to` 关系类型已定义未使用，实体图谱无需新增类型
- 可控的深度：最多两级 dispatch_task，不会无限嵌套

### 为什么提案一 + 提案二同时做

- 两者都解决"子意识上下文不足"，是同一个问题的两个维度
- Token 预算需要统一管理，分开做会导致预算冲突
- 实现都集中在 assembleExecutionContext 和 dispatch-task.ts，改动重叠

### Token 预算分配原则

```
128K context window:
  系统提示（纲领 + 工具描述）: ~8K
  最近对话（提案一）: ~15K（2-3 subtask 历史）
  资源内容（提案二）: ~25K（2-4 个小文件）
  ────────────────────────────────
  子意识工作空间: ~80K
```
