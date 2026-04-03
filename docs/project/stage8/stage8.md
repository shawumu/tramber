# Tramber Stage 8: Skill 三级优化体系

> **创建时间**: 2026-04-03
> **前置依赖**: Stage 7 (Web Client)
> **预计周期**: 5-7 个工作日

---

## 1. 背景与动机

### 1.1 问题

市场上/社区提供的 Skill 存在各种质量问题：
- **描述模糊**：Skill 文档不够精确，AI 理解偏差导致执行错误
- **场景受限**：Skill 只覆盖特定场景，遇到变体就失效
- **工具兼容性**：Skill 内部调用的脚本/工具有平台兼容问题（如 Windows vs Linux）
- **代码缺陷**：Skill 依赖的脚本有逻辑错误或缺少错误处理

当前 Skill 每次执行都是"从零理解"，Agent 执行链条长，一次成功率低。缺少从执行过程中学习和改进的机制。

### 1.2 目标

建立三级优化体系，显著提高 Skill **第二次及之后的执行稳定性**，同时丰富 AI 的趁手工具：

```
Skill（市场/社区技能，质量参差不齐）
  │
  ├─ Level 1: Experience 补丁 ── 执行中遇问题 → 记录解决方案 → 下次注入
  │   （不改 Skill，只打补丁）        例：Skill 写了 ls，Experience 记录 "Windows 用 dir"
  │
  ├─ Level 2: Skill 增强 ────── 执行中做了定制 → 记录修改 → 和用户一起输出新 Skill
  │   （创建增强版 Skill）            例：原 Skill 只支持单文件，扩展为支持目录
  │
  └─ Level 3: Tool 提取 ────── 通用工具型 Skill → 成功执行后 → 交互式调试 → 固化为 Tool
      （Skill → 内置工具）            例：SQL 查询 Skill → 提取为 sql_query 工具
```

### 1.3 核心价值

| 价值 | 说明 |
|------|------|
| **越用越稳** | Experience 补丁让同一 Skill 在特定环境下的成功率逐步提升 |
| **能力扩展** | Skill 增强将单次定制转化为可复用的增强版 |
| **工具丰富** | Tool 提取将高频 Skill 转为原生工具，执行更快更可靠 |
| **渐进投入** | 三级成本递增，用户按需选择参与深度 |

---

## 2. 三级体系详细设计

### 2.1 Level 1: Experience 补丁（轻量级）

#### 2.1.1 问题检测

| 信号 | 说明 | 检测方式 |
|------|------|---------|
| **执行报错** | 工具返回 error | Tool result `success: false` |
| **输出不符预期** | AI 认为结果不对，自我修正后成功 | AI 在 context 中表达了不满并重试 |

#### 2.1.2 原因定位

| 原因类别 | 示例 |
|---------|------|
| **AI 理解偏差** | Skill 文档描述复杂/有歧义，AI 理解错误 |
| **工具兼容性** | 脚本在 Windows/macOS/Linux 行为不同 |
| **代码逻辑错误** | Skill 内脚本有 bug |
| **环境差异** | 依赖缺失、版本不兼容 |

#### 2.1.3 存储结构

Experience 记录在 Skill 目录内的 `.experience/` 子目录：

```
.tramber/skills/sql-query/
├── SKILL.md                        # 原始 Skill
├── scripts/
│   └── query.py                    # Skill 脚本
└── .experience/                    # Level 1 补丁目录
    ├── windows-encoding-fix.md     # Experience: Windows 编码问题
    ├── timeout-large-dataset.md    # Experience: 大数据量超时
    └── schema.json                 # 元数据索引
```

**单条 Experience 格式**：

```markdown
---
skill: sql-query
type: compatibility          # understanding | compatibility | logic | environment
trigger: "exec 报错 GBK 编码"
problem: "Windows 下 SQL 查询输出中文乱码"
solution: "执行前添加 chcp 65001 切换编码"
platform: win32
createdAt: 2026-04-03
---
# Windows 编码问题

## 问题
在 Windows 环境下执行 SQL 查询时，中文输出乱码。

## 解决方案
在 exec 工具调用前添加 `chcp 65001 >nul &&` 前缀。
```

#### 2.1.4 注入机制

执行 Skill 时，自动将相关 Experience 注入到 system prompt：

```
1. 读取 SKILL.md
2. 扫描 .experience/ 目录
3. 按 platform/relevance 过滤
4. 拼接到 system prompt 末尾：
   "## 该 Skill 的历史经验：
    - Windows 下需注意编码问题（已记录解决方案）
    - 大数据量需设置 timeout 参数"
5. AI 带着这些经验执行 Skill
```

#### 2.1.5 自动记录流程

```
执行 Skill
  → 遇到问题（报错 / 输出异常）
  → AI 自行修复成功（重试 / 调整参数 / 换工具）
  → Agent Loop 识别到"自我修复"模式
  → 自动生成 Experience 条目
  → 写入 .experience/ 目录
  → 下次执行自动注入
```

---

### 2.2 Level 2: Skill 增强（产出新 Skill）

#### 2.2.1 触发条件

- 原 Skill 功能单一，执行中 AI 做了显著的功能扩展
- 修改涉及 Skill 的核心逻辑/流程，不是简单的兼容性补丁
- 扩展后的功能具有通用复用价值

**与 Level 1 的区别**：
- Level 1：问题能用 Experience 补丁解决（环境适配、参数调整）→ 在原 Skill 目录添加
- Level 2：需要扩展 Skill 本身的功能 → 创建新 Skill

#### 2.2.2 增强工作流

```
1. 执行原 Skill
   → 发现功能不足，AI 做了定制化扩展
   → 任务成功完成

2. AI 识别增强机会
   → 分析本次执行中的扩展操作
   → 判断是否具有通用价值

3. AI 提示用户
   "原 Skill [sql-query] 只支持单表查询，这次我扩展了多表 JOIN 和子查询。
    是否创建增强版 Skill？建议命名：sql-advanced-query"

4. 用户确认/修改
   → 确认名称和范围
   → 或提出额外要求

5. AI 生成新 SKILL.md
   → 包含扩展功能的完整描述
   → 标注来源：enhanced-from: sql-query
   → 继承原 Skill 的 .experience/ 补丁

6. 用户审核
   → 查看新 SKILL.md 内容
   → 确认 / 提出修改

7. 创建新 Skill
   .tramber/skills/sql-advanced-query/
   ├── SKILL.md              # 新 Skill（标注 enhanced-from: sql-query）
   ├── scripts/
   │   └── query.py          # 原脚本（可能需要扩展）
   └── .experience/          # 继承原 Skill 的 Experience
```

#### 2.2.3 新 Skill 的 SKILL.md 格式

```markdown
---
name: sql-advanced-query
version: 1.0.0
enhanced-from: sql-query
createdAt: 2026-04-03
description: 高级 SQL 查询（支持多表 JOIN、子查询、聚合）
---

# SQL 高级查询

## 能力
- 单表查询（继承自 sql-query）
- 多表 JOIN 查询
- 子查询
- 聚合统计（GROUP BY, HAVING）

## 使用方法
...

## 参数
- `query`: SQL 查询语句
- `database`: 数据库路径
- `timeout`: 超时时间（默认 30s）
```

---

### 2.3 Level 3: Tool 提取（最重，需要多种能力）

#### 2.3.1 触发条件

- Skill 是通用工具型（非场景特定）
- 被高频使用（≥ N 次成功执行）
- 执行路径稳定确定（每次调用方式相似）
- 适合固化为有明确 inputSchema 的工具

#### 2.3.2 需要的核心能力

| 能力 | 用途 | 当前状态 |
|------|------|---------|
| **Web Search** | 理解原工具/库的用法、查文档 | 需新增 |
| **代码生成** | 生成 Tool 代码（execute + inputSchema） | 已有（AI 能力） |
| **交互式自测** | 执行生成的 Tool，验证输出，发现边界问题 | 需新增 |
| **用户反馈** | 人工测试、确认边界情况 | 已有 |

#### 2.3.3 Tool 提取流程

```
Phase 1: 分析（1-2 轮交互）
──────────────────────────
1. 识别候选 Skill
   → 统计使用频率和成功率
   → 判断是否适合提取为 Tool

2. 分析 Skill 结构
   → 读取 SKILL.md 和 scripts/
   → 理解输入参数、输出格式、错误处理

3. 研究外部依赖
   → Web Search 查询依赖库/工具的文档
   → 理解 API、版本兼容性、最佳实践

Phase 2: 生成（AI + 用户协作）
──────────────────────────
4. 设计 Tool 定义
   → 提取 inputSchema（参数类型、描述、必填项）
   → 设计 execute 函数签名
   → 规划错误处理策略

5. 生成 Tool 代码
   → 编写 execute 函数
   → 编写错误处理
   → 编写 inputSchema
   → 生成 package 结构

Phase 3: 测试（交互式自测）
──────────────────────────
6. AI 自测
   → 用测试数据执行生成的 Tool
   → 检查输出格式、边界情况
   → 发现问题自动修正代码
   → 反复直到自测通过

7. 用户测试
   → 展示 Tool 定义和代码
   → 用户实际使用测试
   → 反馈问题 → AI 修正

Phase 4: 注册
──────────────────────────
8. 部署 Tool
   → 写入 .tramber/tools/ 或 packages/tool/src/builtin/
   → 自动注册到 ToolRegistry
   → 更新 settings.json 权限配置
```

#### 2.3.4 Tool 存储位置

```
# 用户自定义 Tool（推荐）
.tramber/tools/
├── sql-query/
│   ├── index.ts              # Tool 实现
│   └── package.json          # 元数据
└── pdf-generator/
    ├── index.ts
    └── package.json

# 或内置 Tool（需要项目级集成）
packages/tool/src/builtin/
├── file/
├── search/
├── exec/
├── sql-query/                # 新提取的 Tool
└── pdf-generator/
```

#### 2.3.5 生成的 Tool 格式

```typescript
// .tramber/tools/sql-query/index.ts
import { Tool } from '@tramber/tool/types';

export const sqlQueryTool: Tool = {
  id: 'sql_query',
  name: 'sql_query',
  description: 'Execute SQL query on a database file',
  category: 'database',
  permission: {
    operation: 'database_query',
    riskLevel: 'medium'
  },
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL query statement'
      },
      database: {
        type: 'string',
        description: 'Path to database file'
      },
      timeout: {
        type: 'number',
        description: 'Query timeout in seconds',
        default: 30
      }
    },
    required: ['query', 'database']
  },
  async execute(input: unknown) {
    const { query, database, timeout = 30 } = input as any;
    // ... 实现逻辑
  }
};
```

---

## 3. 包结构变更

### 3.1 调整前

```
packages/
├── skill/          # Skill 类型定义
├── routine/        # RoutineManager、沉淀逻辑
├── experience/     # 经验记录、检索
```

### 3.2 调整后

```
packages/
├── skill/          # Skill 类型 + Skill 增强工作流（Level 2）
├── experience/     # Experience 收集 + Skill 内 .experience/ 注入（Level 1）
├── tool/           # 内置工具 + Tool 提取工作流（Level 3）
└── (routine/)      # 重新定义或合并到 tool/ — Level 3 的 Tool 提取即"沉淀"
```

### 3.3 新增模块

| 模块 | 包 | 说明 |
|------|-----|------|
| **ExperienceCollector** | experience | 在 Agent Loop 执行中自动收集 Experience |
| **ExperienceInjector** | experience | 执行 Skill 时注入相关 Experience |
| **SkillEnhancer** | skill | Level 2 增强工作流（检测、生成、交互） |
| **ToolExtractor** | tool | Level 3 Tool 提取（分析、生成、自测、注册） |
| **VirtualSession** | agent | 交互式自测会话（Tool 提取的自测环节） |
| **WebSearchTool** | tool | Web 搜索能力（Tool 提取的研究环节） |

---

## 4. 开发任务清单

### Phase 1: Level 1 — Experience 补丁系统 (2 天)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 1.1 设计 Experience 存储格式和目录结构 | P0 | 0.5 天 | ⬜ |
| 1.2 实现 ExperienceCollector（Agent Loop 中自动收集） | P0 | 0.5 天 | ⬜ |
| 1.3 实现 ExperienceInjector（执行 Skill 时注入） | P0 | 0.5 天 | ⬜ |
| 1.4 Experience 过滤逻辑（platform/relevance） | P1 | 0.5 天 | ⬜ |
| 1.5 端到端测试（Skill 执行 → 自动记录 → 下次注入） | P0 | 0.5 天 | ⬜ |

**验收标准**：
```
1. 执行一个有问题的 Skill（如 Windows 下用 ls）
2. AI 自行修复成功（换成 dir）
3. .experience/ 目录自动生成 Experience 条目
4. 再次执行同一 Skill
5. 日志显示 Experience 被注入到 system prompt
6. AI 直接用 dir，不再出错
```

---

### Phase 2: Level 2 — Skill 增强工作流 (1.5 天)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 2.1 设计增强检测逻辑（区分 Level 1 补丁 vs Level 2 增强） | P0 | 0.5 天 | ⬜ |
| 2.2 实现增强提示流程（AI 识别机会 → 提示用户） | P0 | 0.5 天 | ⬜ |
| 2.3 实现新 Skill 生成（SKILL.md + enhanced-from 标注） | P0 | 0.5 天 | ⬜ |
| 2.4 用户审核交互（CLI / Web 确认流程） | P1 | 0.5 天 | ⬜ |

**验收标准**：
```
1. 执行 Skill，AI 做了显著功能扩展
2. 任务完成后，AI 提示"是否创建增强版 Skill"
3. 用户确认名称
4. 生成新 SKILL.md，标注 enhanced-from
5. 新 Skill 出现在 skills 列表中
```

---

### Phase 3: Level 3 — Tool 提取基础能力 (2-3 天)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 3.1 新增 Web Search 工具 | P0 | 0.5 天 | ⬜ |
| 3.2 设计 Tool 提取流程框架 | P0 | 0.5 天 | ⬜ |
| 3.3 实现 ToolExtractor（分析 Skill → 生成 Tool 代码） | P0 | 1 天 | ⬜ |
| 3.4 实现用户自定义 Tool 加载（.tramber/tools/） | P0 | 0.5 天 | ⬜ |
| 3.5 实现虚拟交互式自测会话 | P1 | 1 天 | ⬜ |
| 3.6 Tool 注册到 ToolRegistry | P0 | 0.5 天 | ⬜ |

**验收标准**：
```
1. 高频使用的 Skill 被识别为候选
2. AI 分析 Skill 结构，研究外部依赖
3. 生成 Tool 代码（inputSchema + execute）
4. 自测通过（测试数据执行成功）
5. 展示给用户，用户测试确认
6. Tool 注册成功，出现在工具列表中
7. 后续任务可直接调用该 Tool
```

---

### Phase 4: 联调与文档 (1 天)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 4.1 三级体系端到端联调 | P0 | 0.5 天 | ⬜ |
| 4.2 更新 CLAUDE.md 路线图 | P0 | 0.5 天 | ⬜ |
| 4.3 更新 getting-started.md | P1 | 0.5 天 | ⬜ |
| 4.4 更新 tramber-unified-plan.md | P1 | 0.5 天 | ⬜ |

---

## 5. 关键设计决策

### 5.1 Experience 存储在 Skill 目录内

**决策**：Experience 记录在 `.tramber/skills/<skill>/.experience/` 目录，而非集中存储。

**原因**：
- Experience 天然绑定到特定 Skill，就近存储直觉
- 删除 Skill 时 Experience 自动清理
- 导入/导出 Skill 时 Experience 一同迁移

### 5.2 Level 2 生成新 Skill 而非修改原 Skill

**决策**：Level 2 增强创建新 Skill（新目录、新名称），保留原 Skill 不变。

**原因**：
- 原 Skill 可能来自社区，修改会导致更新冲突
- 新 Skill 可能有不同的使用场景和受众
- 保留演化链路（enhanced-from）便于溯源

### 5.3 Level 3 Tool 存储在 .tramber/tools/

**决策**：用户提取的 Tool 存储在项目级 `.tramber/tools/` 目录，而非 packages 内。

**原因**：
- 用户自定义 Tool 不应污染项目源码
- 便于不同项目共享/独立管理
- 与 `.tramber/skills/` 风格一致

### 5.4 Routine 包重新定义

**决策**：将 routine 包的功能重新定义。Routine 不再是 Skill → Routine 的自动沉淀，而是 Level 3 Tool 提取流程的一部分。

**原因**：
- 原有的"自动沉淀"概念在简单 Skill 上收益低
- Level 3 的 Tool 提取更实用，且有人工参与保证质量
- 三级体系已完整覆盖优化场景，不需要额外的 Routine 概念

---

## 6. 与现有系统的集成

### 6.1 Agent Loop 集成

```
Agent Loop 执行流程（增加 Experience 收集）：

1. 加载 Skill → 检查 .experience/ → 注入相关 Experience
2. 调用 LLM 执行
3. 工具调用 → 检查结果
4. 如果 success: false 或 AI 重试 → 标记为"遇到问题"
5. 如果后续成功修复 → 触发 ExperienceCollector
6. 任务完成 → 检查是否触发 Level 2/3 工作流
```

### 6.2 权限系统

| 操作 | 权限 |
|------|------|
| 写入 .experience/ | 自动（无需确认） |
| 创建增强版 Skill | 需用户确认 |
| 提取为 Tool | 需用户确认 |
| 执行自测 Tool | 自动（沙箱内） |

### 6.3 Server/Client 通信

Level 2 和 Level 3 的交互通过现有 WebSocket 协议扩展：
- `skill_enhance_request`：AI 提议增强 Skill
- `skill_enhance_confirm`：用户确认/修改
- `tool_extract_progress`：Tool 提取进度
- `tool_extract_test`：自测结果展示

---

## 7. 时间估算

| Phase | 内容 | 预估时间 |
|-------|------|---------|
| Phase 1 | Level 1 Experience 补丁 | 2 天 |
| Phase 2 | Level 2 Skill 增强 | 1.5 天 |
| Phase 3 | Level 3 Tool 提取 | 2-3 天 |
| Phase 4 | 联调与文档 | 1 天 |
| **总计** | | **6.5-7.5 天** |

---

## 8. 风险与挑战

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Level 1 Experience 记录过于频繁，注入信息过多 | system prompt 膨胀 | 限制注入条数，按相关性排序 |
| Level 2 增强判断不准确 | 频繁打扰用户 | 设置阈值，仅在显著扩展时触发 |
| Level 3 Tool 提取生成的代码不可靠 | 用户信任度下降 | 强制自测 + 用户测试环节 |
| 虚拟交互式自测实现复杂 | 开发周期延长 | MVP 先跳过自测，依赖用户测试 |
| Web Search 工具的 API 选择 | 成本/可用性 | 支持多种搜索 API（Bing/Google/Serper） |

---

*文档创建时间: 2026-04-03*
*文档版本: 1.0*
