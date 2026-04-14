# Stage 9 Problems — 离散型实体实测问题

基于 `task-conv-mnxbfhh1-lqd0mii`（两轮对话：查看 demos → 在 3d moon 加地球）的实测数据。

---

## P1: 实体 ID 碰撞与覆盖

### 现象

同一轮中所有实体共享同一个短 ID 后缀（如 `mnxbf`、`mnxbo`），导致多次写入同一 ID 的 JSON 文件，只保留最后一次的内容。

entity-index.json 中 `r:mnxbf` 出现 **10 次**（order 4-13），但磁盘文件只有 1 个 `r-mnxbf.json`（最后写入的版本）。

```
index 中：
  r:mnxbf  order=4   ← demos/canvas-1.html
  r:mnxbf  order=5   ← demos/canvas-2.html
  ...
  r:mnxbf  order=13  ← demos/3d-earth.html（覆盖了前面的）

磁盘上只有：
  r-mnxbf.json → content: "file://demos/global-stock-indices.html"
```

### 影响

- 先发现的资源被后发现的覆盖，丢失信息
- index 中大量幽灵条目指向已被覆盖的实体
- 无法通过 ID 可靠地定位特定资源

### 根因

ID 生成粒度太粗。当前 ID 格式可能是按轮次或按任务前缀生成，同一轮内多个 discovery 共享同一前缀。

### 修复方向

每个实体使用**唯一 ID**，不共享后缀。参考 topics.md 的 5 位 36 进制方案，每个实体分配独立 ID。

---

## P2: Index 膨胀与幽灵条目

### 现象

entity-index.json 有 44 条记录，但实际磁盘上只有 12 个实体文件。大量 index 条目指向同一个 ID：

| ID | index 出现次数 | 磁盘文件数 |
|----|---------------|-----------|
| r:mnxbf | 10 | 1 |
| e:mnxbn | 11 | 1 |
| e:mnxbm | 6 | 1 |
| e:mnxbf | 6 | 1 |

### 影响

- Index 文件快速膨胀，无用的幽灵条目浪费空间
- 查询效率下降（遍历大量重复条目）
- 无法从 index 准确判断实际有多少不同实体

### 修复方向

- 写入前做去重：同一 ID 不重复添加到 index
- 或者：P1 修复后（每个实体唯一 ID），此问题自然消失

---

## P3: 关系重复写入（修复方案已设计）

### 现象

`r:mnxbm`（3d-moon.html）的 relations 数组中有 6 条重复关系：

```json
"relations": [
  { "type": "produced_by", "target": "t:mnxbf" },
  { "type": "discovered_in", "target": "t:mnxbf" },
  { "type": "produced_by", "target": "t:mnxbf" },
  { "type": "discovered_in", "target": "t:mnxbf" },
  { "type": "produced_by", "target": "t:mnxbf" },
  { "type": "discovered_in", "target": "t:mnxbf" }
]
```

### 影响

- 关系图冗余，遍历时产生重复结果
- 增加 JSON 体积

### 修复方向

写入关系时做去重检查：`(type, target)` 组合唯一。

**修复方案**：详见 entity-restructure.md 第 6.1 节「关系去重修复」。

---

## P4: 跨轮关系断裂（最关键）

### 现象

第二轮任务 `t:mnxbo`（在 3d moon 加地球）**没有关联**到第一轮发现的 `r:mnxbm`（3d-moon.html）。

守护意识给子意识的执行纲领是：

```
## 执行纲领
用户需求 [u:mnxbf] 查看demos目录        ← 第一轮的，不是当前轮
当前任务 [t:mnxbf] 探索demos目录         ← 第一轮的任务，不是"加地球"
上游任务：无
关联资源：无                              ← 3d-moon.html 已在第一轮发现但没关联
```

子意识不知道 3d-moon.html 已经发现了，重新搜索、重新读取，用完 10 次迭代仍未完成。

### 影响

- **执行效率极低**：已有资源无法复用，重复劳动
- **context 浪费**：子意识的 context 被重复的文件读取占满
- **任务失败**：10 次迭代用完还没读完文件

### 根因

1. **analyze_turn 不产生跨轮关系**：守护意识分析时没有建立 `[t:mnxbo].requires → [r:mnxbm]` 的关系
2. **执行纲领组装逻辑有误**：组装的是 `u:mnxbf`/`t:mnxbf`（第一轮实体），而不是当前轮的 `u:mnxbo`/`t:mnxbo`

### 修复方向

1. 守护意识的 `analyze_turn` 应识别新任务与已有资源的关系，写入 `requires` 边
2. 执行纲领组装逻辑应按当前任务的 ID 查询关联实体，而不是取最近的其他任务实体
3. 关键链路：`u:mnxbo` → `t:mnxbo` → `requires` → `r:mnxbm`（3d-moon.html）

---

## P5: 回复重复问题（已修复）

### 现象

用户看到 2-3 次重复回复。

### 根因链

| 层级 | 原因 | 修复 |
|------|------|------|
| 子意识 onStep | 工具进度（pre-step/post-step）被当作 text_delta 发送 | 添加 `!toolCall && !toolResult` 过滤 |
| onChildStep | 流式模式下子意识已通过 onStep 发送文本，onChildStep 再发一遍 | 去掉 onChildStep，由子意识 onStep 统一处理 |
| engine result | 守护意识的 finalAnswer 被当 result 返回给客户端 | 意识体模式下 result 设为 undefined |
| dispatch_task 返回值 | childResult 包含完整文本，前端在工具结果中再次展示 | 去掉 childResult 和 isFinalAnswer |

### 状态

已修复。涉及文件：engine.ts、dispatch-task.ts、loop.ts。

---

## 优先级排序

| 优先级 | 问题 | 影响 | 状态 |
|--------|------|------|------|
| **P0** | P4: 跨轮关系断裂 | 任务失败，执行纲领无效 | 待修复 |
| **P0** | P1: ID 碰撞覆盖 | 信息丢失，实体不可靠 | ✅ 已修复 |
| **P1** | P2: Index 膨胀 | 性能退化，查询低效 | P1 修复后自然消失 |
| **P1** | P3: 关系重复 | 数据冗余 | 📝 方案已设计 |
| **P2** | P5: 回复重复 | 已修复 | ✅ 已修复 |
