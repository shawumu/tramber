# Stage 9: Memory 与 Entity 统一方案

## 1. 背景

当前存在两套独立的数据存储系统，记录同一件事但互不关联：

| 系统 | 来源阶段 | 存储 | 写入者 | 读者 |
|------|---------|------|--------|------|
| Memory entries | Stage 8 | `index.json` + `entries/mem-xxx.json` | `recordMemory()` | 无（已废弃） |
| Entity graph | Stage 9 | `entity-index.json` + `entities/*.json` | `dispatch_task` / `analyze_turn` | `recall_memory`、`assembleExecutionContext` |

### 1.1 调用链分析

```
用户输入
  → Engine.execute()
    → 守护意识 AgentLoop
      → dispatch_task（创建 subtask、执行子 loop）
        → 子意识返回 finalAnswer
        → subtask.result = "执行成功"  ← 太干瘪
        → return { finalAnswer: childFinalAnswer, toolCallSummary }
      → analyze_turn（创建 user_request、analysis、rule，更新 domain_task.summary）
    → Engine 清理 messages
    → cm.recordMemory({ type: 'result_summary', summary: 守护意识最后一句话 })
      → 写入 memory/index.json + entries/mem-xxx.json
      → 更新 state.memoryIndex
      → 但 memoryIndex 不被任何 prompt 使用
```

### 1.2 问题

| # | 问题 | 说明 |
|---|------|------|
| P1 | **数据冗余** | memory entry 的 summary 与 domain_task.summary 内容相同 |
| P2 | **Memory 无人消费** | `state.memoryIndex` 不注入 prompt，`recall_memory` 已改查实体 |
| P3 | **subtask.result 无价值** | 只存 "执行成功"/"用户拒绝了权限请求"，丢失了子意识输出摘要 |
| P4 | **流水账不可恢复** | 如果去掉 memory entries，从实体图谱无法恢复自然语言的结果总结 |

### 1.3 关键洞察

实体图谱在结构化信息上**全面优于** memory entries：

| 维度 | Memory | Entity |
|------|--------|--------|
| 用户原文 | 概括（"发起问候"） | 原文（"你好"） |
| 执行状态 | 无 | pending/completed/blocked |
| 阻塞原因 | 无 | 有（"用户拒绝了权限请求"） |
| 产出资源 | 无 | resourceIds → resource（含文件结构） |
| 分析/规则 | 无 | analysisIds/ruleIds |
| 结果总结 | ✅ 有 | ⚠️ 只有 "执行成功" |

**唯一缺失**：每轮的自然语言结果总结。

## 2. 方案

### 2.1 核心思路

**subtask.result 回填守护意识总结**，使实体图谱具备完整的流水账恢复能力，然后废弃 memory entries。

### 2.2 数据流改造

```
改造前：
  dispatch_task → subtask.result = "执行成功"
  analyze_turn → domain_task.summary = "用户：xxx → 编码子意识：xxx"
  Engine → recordMemory({ summary: 守护意识的最后一句话 })  ← 废弃

改造后：
  dispatch_task → subtask.result = "执行成功"（初始值不变）
  analyze_turn → domain_task.summary 更新
              → subtask.result = params.summary  ← 回填有意义的结果总结
  Engine → 不再调用 recordMemory（或过渡期双写）
```

### 2.3 具体改动

#### 改动 1：analyze_turn 回填 subtask.result

**文件**：`packages/agent/src/virtual-tools/analyze-turn.ts`

analyze_turn 接收 `summary` 参数（守护意识写的一行总结），用这个回填最近的 completed subtask：

```typescript
// 现有逻辑：查找最近完成的 subtask
const recentSubtask = ...;

// 新增：回填 subtask.result
if (recentSubtask && recentSubtask.status === 'completed') {
  memoryStore.updateEntity(taskId, recentSubtask.id, {
    result: params.summary  // 从 "执行成功" 替换为有意义的总结
  });
}
```

#### 改动 2：守护意识 context 从实体图谱组装

**文件**：`packages/agent/src/consciousness-manager.ts`

新增方法 `buildMemoryFromEntities()`，替代 `memoryStore.getIndex()`：

```typescript
/**
 * 从实体图谱组装对话流水账（替代 memory index.json）
 * 按 order 排序，返回 user_request + subtask 的简要摘要
 */
buildMemoryFromEntities(taskId: string): MemoryIndexEntry[] {
  const entities = this.memoryStore.queryEntities({ taskId, limit: 999 });
  const result: MemoryIndexEntry[] = [];

  for (const e of entities) {
    if (e.type === 'subtask') {
      const sub = e as SubtaskEntity;
      // 查找对应的 user_request（同一 domain，order 紧邻）
      result.push({
        id: e.id,
        domain: e.domain,
        type: 'result_summary' as any,
        summary: sub.result || sub.description
      });
    }
  }
  return result;
}
```

#### 改动 3：state.memoryIndex 数据源切换

**文件**：`packages/agent/src/consciousness-manager.ts`

`recordMemory()` 中的 memoryIndex 更新改为从实体图谱组装：

```typescript
recordMemory(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): void {
  // ... 保留写入 memory entries（过渡期双写）

  // 更新守护意识的 memoryIndex — 改为从实体图谱组装
  if (this.root && fullEntry.taskId) {
    const state = this.root.state as SelfAwarenessState;
    state.memoryIndex = this.buildMemoryFromEntities(fullEntry.taskId);
  }
}
```

#### 改动 4：废弃 recordMemory 的 memory entry 写入

**文件**：`packages/sdk/src/engine.ts`

不再调用 `cm.recordMemory()`，改为依赖 analyze_turn 的实体写入：

```typescript
// 删除：
// cm.recordMemory({
//   sourceId: 'guardian',
//   domain: activeDomain,
//   type: 'result_summary',
//   summary: newSummary.content,
//   content: newSummary.content,
//   relatedFiles: []
// });

// 替换为：触发 memoryIndex 刷新
if (this.root && this.currentTaskId) {
  const state = this.root.state as SelfAwarenessState;
  state.memoryIndex = this.consciousnessManager.buildMemoryFromEntities(this.currentTaskId);
}
```

### 2.4 流水账恢复效果

改造后，从实体图谱可恢复完整流水账：

```
按 order 排序：

Turn 1:
  用户：[u:xxx] "你好"
  执行：[s:xxx] 用户问候"你好" → completed
  结果："用户发起问候，等待具体编码任务"
  资源：无

Turn 2:
  用户：[u:xxx] "查看demos目录"
  执行：[s:xxx] 查看demos目录内容 → completed
  结果："发现11个演示项目（2个数据可视化+9个3D场景）"
  资源：[r:xxx] demos/ (fileList: 11个HTML)

Turn 3:
  用户：[u:xxx] "生成一个3D黑洞，白环围绕"
  执行：[s:xxx] 生成3D黑洞场景 → blocked
  结果："用户拒绝了权限请求"
  资源：无

Turn 4:
  用户：[u:xxx] "再生成一下"
  执行：[s:xxx] 再次生成3D黑洞场景 → completed
  结果："已完成二次生成，包含黑洞核心、白色吸积盘、引力透镜效果和粒子系统"
  资源：[r:xxx] demos/blackhole.html (structure: importmap→script→CSS)
```

### 2.5 与原 memory entries 对比

| 原流水账 | 新流水账 |
|----------|----------|
| "用户：发起问候 → 编码子意识：已记录问候" | "你好" → completed → "用户发起问候..." |
| "用户：查看demos → 发现11个演示项目" | "查看demos目录" → completed → "发现11个..." + 资源列表 |
| 无 | "生成3D黑洞" → **blocked** → "用户拒绝了权限请求" |
| 无 | 资源：blackhole.html 含 structure 概览 |

新方案信息量更大：有原文、有状态、有阻塞原因、有资源。

## 3. 实施步骤

### Phase 1：subtask.result 回填 ✅ 已完成

| 任务 | 文件 | 状态 |
|------|------|------|
| analyze_turn 回填 subtask.result | `packages/agent/src/virtual-tools/analyze-turn.ts` | ✅ 用 `params.summary` 回填最近 completed/blocked subtask |
| subtask.result 初始值置空 | `packages/agent/src/virtual-tools/dispatch-task.ts` | ✅ completed 时 `''`，blocked 时保留 error |

### Phase 2：memoryIndex 数据源切换 ✅ 已完成

| 任务 | 文件 | 状态 |
|------|------|------|
| 新增 buildMemoryFromEntities 方法 | `packages/agent/src/consciousness-manager.ts` | ✅ 从 subtask 实体组装 `MemoryIndexEntry[]` |
| recordMemory 切换数据源 | `packages/agent/src/consciousness-manager.ts` | ✅ `state.memoryIndex` 从实体图谱组装（仍保留 memory entry 写入作为过渡） |
| Engine 停止写 result_summary | `packages/sdk/src/engine.ts` | ✅ 删除 `cm.recordMemory()` 调用，改为 `cm.buildMemoryFromEntities()` |

### Phase 3：清理 ⬜ 待实施

| 任务 | 文件 | 说明 |
|------|------|------|
| 评估是否移除 memory entries 写入 | `memory-store.ts` | 过渡期仍写入磁盘，待验证后可移除 store/query/index 逻辑 |
| 评估是否注入流水账到守护意识 prompt | `consciousness-prompts.ts` | 当前 prompt 未注入 memoryIndex，如需要可加 |

## 4. 风险评估

| 风险 | 说明 | 缓解 |
|------|------|------|
| analyze_turn 调用失败时 subtask.result 为空 | 如果 LLM 不调 analyze_turn，subtask.result 停留在初始值 | 保留 dispatch_task 的 "执行成功" 作为 fallback，analyze_turn 只在有 summary 时覆盖 |
| 会话重启后 context 恢复 | 当前没有恢复机制，但实体图谱可支持 | Phase 3 可实现：重启时从实体图谱重建 memoryIndex |
| memoryIndex 类型兼容 | MemoryIndexEntry.type 是 MemoryType 枚举 | subtask 组装的条目 type 用 'result_summary'，保持类型兼容 |

## 5. 收益

| 收益 | 说明 |
|------|------|
| 消除数据冗余 | 不再维护两套独立的对话历史 |
| 单一数据源 | 所有信息从实体图谱出发，无需同步 |
| 流水账更丰富 | 有原文、状态、阻塞原因、资源链接 |
| 为会话恢复打基础 | 重启后从实体图谱即可恢复完整上下文 |
