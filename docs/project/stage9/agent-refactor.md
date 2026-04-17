# Stage 9: Agent 包重构（P0/P1/P2）

## Context

`packages/agent` 经历 Stage 1-9 的迭代，积累了死代码、God Class、职责膨胀等问题。本重构分三级优先级执行，不改变外部行为，仅改善内部结构。

## P0: 死代码清理 ✅ 已完成

删除 5 个完全未使用的文件 + 清理导出：

| 动作 | 文件 | 原因 |
|------|------|------|
| 删除 | `virtual-tools/spawn-sub-task.ts` | 已被 dispatch-task 替代，未注册 |
| 删除 | `virtual-tools/compress-and-remember.ts` | 已被 analyze-turn 替代，未注册 |
| 删除 | `conversation-manager.ts` | 从未被任何模块引用 |
| 删除 | `tool-executor.ts` | loop.ts 内联实现，未委托此类 |
| 删除 | `permission-guard.ts` | loop.ts 内联实现，未委托此类 |
| 修改 | `index.ts` | 移除上述 5 个文件的 export |
| 修改 | `types.ts` | 清理重导出 |

## P1: loop.ts 瘦身 ✅ 已完成

从 1021 行降到 511 行（-50%）：

### P1.1 抽取 `llm-caller.ts`（233 行）

- `call()` 方法（非流式 LLM 调用 + 重试）
- `callStream()` 方法（流式 LLM 调用 + 重试 + onDelta 回调）
- 重试逻辑（maxRetries=3, 指数退避）
- 工具定义构建逻辑

### P1.2 抽取工具结果格式化函数

`formatToolResults()` 独立函数，含 MAX_TOOL_RESULT_CHARS 截断、错误信息构造、required 参数提示。

### P1.3 清理冗余逻辑

- 移除 `gatherContext()` 调用
- 权限检查简化为返回字符串状态码
- 守护意识状态机用 `Array.some()` 替代 `Array.find()`
- 流式 delta 回调内联到 callStream 调用处

## P2: memory-store.ts 拆分 ✅ 已完成

从 646 行降到 308 行（-52%），实体逻辑移入 entity-store.ts（289 行）：

### P2.1 抽取 `entity-store.ts`（289 行）

实体图谱全部方法：storeEntity / getEntity / updateEntity / queryEntities / queryByDomain / queryByType / queryByDomainTask / findByUri / mergeResource / mergeRelations + 所有私有方法。

### P2.2 MemoryStore 委托

MemoryStore 持有 EntityStore 实例，所有实体方法一行委托。外部调用方 API 完全不变。

## 重构前后对比

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 文件数 | 19 | 16（-3 删除 +2 新建） |
| 总行数 | ~4,600 | 4,086（-11%） |
| loop.ts | 1,021 行 | 511 行（-50%） |
| memory-store.ts | 646 行 | 308 行（-52%） |
| 死代码文件 | 5 个 | 0 |

## 文件变更清单

| 文件 | P0 | P1 | P2 |
|------|----|----|-----|
| `index.ts` | ✅ 改 | ✅ 改 | ✅ 改 |
| `types.ts` | ✅ 改 | | |
| `spawn-sub-task.ts` | ✅ 删 | | |
| `compress-and-remember.ts` | ✅ 删 | | |
| `conversation-manager.ts` | ✅ 删 | | |
| `tool-executor.ts` | ✅ 删 | | |
| `permission-guard.ts` | ✅ 删 | | |
| `loop.ts` | | ✅ 大改 | |
| `llm-caller.ts` | | ✅ 新建 | |
| `memory-store.ts` | | | ✅ 大改 |
| `entity-store.ts` | | | ✅ 新建 |
