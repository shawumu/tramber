# Tramber MVP 任务书 - Coding Scene 最简版

> 目标：快速实现 Coding Scene 核心能力，其他功能渐进式添加

---

## 一、MVP 范围定义

### 1.1 核心目标

**用户可以做什么**：
1. 通过 CLI 输入自然语言描述编程需求
2. AI 分析需求并执行代码操作（读取、编辑、运行）
3. 自动记录成功经验，下次直接复用（Routine）

### 1.2 功能边界

| 类别 | MVP 包含 | 后续迭代 |
|------|---------|----------|
| **Scene** | ✅ Coding Scene（固定配置） | Drawing/Video/Writing Scene |
| **Scene 演进** | ❌ 暂缓 | 动态 Scene → Workflow → 命名 Scene |
| **Workflow** | ❌ 暂缓（MVP 用固定执行流程） | 可组合 Workflow 系统 |
| **Skill** | ✅ 基础 Skill 执行 | Skill 定义文件、技能库 |
| **Routine** | ✅ Skill 自动沉淀 Routine | Routine 分享市场 |
| **Tool** | ✅ 必需工具集 | 更多工具、插件系统 |
| **Experience** | ✅ 简单存储 | 向量检索、智能匹配 |
| **Agent Loop** | ✅ 核心循环 | 更多 Agent 类型 |
| **Provider** | ✅ Anthropic Claude | OpenAI/Gemini |
| **Checkpoint** | ❌ 暂缓 | 快照回滚 |
| **LSP** | ❌ 暂缓 | 代码智能增强 |
| **Client** | ✅ CLI | Web/Telegram/Discord |
| **Plugin** | ❌ 暂缓 | 插件系统 |

### 1.3 MVP 核心流程

```
用户输入需求
     │
     ▼
┌─────────────┐
│  CLI 解析   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│      Agent Loop 执行            │
│  ┌─────────────────────────┐    │
│  │ 1. Gather Context       │    │
│  │    - 读取文件           │    │
│  │    - 加载 Experience    │    │
│  └──────────┬──────────────┘    │
│             ▼                    │
│  ┌─────────────────────────┐    │
│  │ 2. Take Action          │    │
│  │    - AI 决策工具调用    │    │
│  │    - 执行工具           │    │
│  └──────────┬──────────────┘    │
│             ▼                    │
│  ┌─────────────────────────┐    │
│  │ 3. Verify Results       │    │
│  │    - 运行测试           │    │
│  │    - 检查错误           │    │
│  └──────────┬──────────────┘    │
│             │                    │
│      成功?  │                    │
│      ├──是─► 完成任务            │
│      └──否─► 重试（最多10次）    │
└─────────────────────────────────┘
       │
       ▼
┌─────────────┐
│ 记录 Experience │ (成功时)
└─────────────┘
```

---

## 二、MVP 包结构（精简版）

```
tramber/
├── packages/
│   ├── core/                    # ✅ 必需
│   │   └── src/
│   │       ├── agent/           # ✅ Agent Loop
│   │       └── context/         # ✅ 上下文管理
│   │
│   ├── scene/                   # ✅ 必需（简化版）
│   │   └── src/
│   │       ├── types.ts         # ✅ 类型定义
│   │       └── coding.ts        # ✅ Coding Scene 固定配置
│   │
│   ├── skill/                   # ✅ 必需（简化版）
│   │   └── src/
│   │       ├── executor.ts      # ✅ Skill 执行器
│   │       └── types.ts
│   │
│   ├── routine/                 # ✅ 必需（简化版）
│   │   └── src/
│   │       ├── manager.ts       # ✅ Routine 管理器
│   │       ├── solidify.ts      # ✅ Routine 沉淀
│   │       └── types.ts
│   │
│   ├── tool/                    # ✅ 必需
│   │   └── src/
│   │       ├── registry.ts      # ✅ 工具注册表
│   │       ├── builtin/         # ✅ 内置工具
│   │       │   ├── file.ts      # ✅ read/write/edit
│   │       │   ├── search.ts    # ✅ glob/grep
│   │       │   └── execution.ts # ✅ bash
│   │       └── types.ts
│   │
│   ├── experience/              # ✅ 必需（简化版）
│   │   └── src/
│   │       ├── storage.ts       # ✅ 文件存储
│   │       ├── manager.ts       # ✅ 经验管理器
│   │       ├── retrieval.ts     # ✅ 经验检索
│   │       └── types.ts         # ✅ 全维度经验类型
│   │
│   ├── provider/                # ✅ 必需（仅 Anthropic）
│   │   └── src/
│   │       ├── anthropic/       # ✅ Claude
│   │       └── types.ts
│   │
│   ├── shared/                  # ✅ 必需
│   │   └── src/
│   │       ├── types/
│   │       └── utils/
│   │
│   ├── client/
│   │   └── cli/                 # ✅ 必需
│   │       └── src/
│   │           └── cli.ts       # ✅ CLI 入口
│   │
│   └── sdk/                     # ✅ 必需（简化版）
│       └── src/
│           └── client.ts        # ✅ 客户端接口
│
├── .tramber/                    # ✅ 必需
│   ├── settings.json            # ✅ 配置文件
│   └── experiences/             # ✅ Experience 存储
│
├── package.json
└── tsconfig.base.json
```

**暂缓创建的包**（标记为 ❌）：
- workflow/ - MVP 用固定流程
- checkpoint/ - 后续添加
- lsp/ - 后续添加
- plugin/ - 后续添加
- client/web - 后续添加
- client/message/ - 后续添加

---

## 三、开发任务清单

### Phase 1: 基础设施 (1-2天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 1.1 初始化 Monorepo 结构 | P0 | 30min | - | ✅ |
| 1.2 配置 TypeScript + Path Alias | P0 | 30min | 1.1 | ✅ |
| 1.3 配置 pnpm workspace | P0 | 15min | 1.1 | ✅ |
| 1.4 创建 shared 包基础类型 | P0 | 1h | 1.2 | ✅ |
| 1.5 配置 Anthropic SDK | P0 | 30min | - | ✅ |

**验收标准**：
```bash
# 可以成功构建
pnpm install
pnpm build

# Path Alias 可用
# 在 core/src/agent/loop.ts 中可以:
import { Task } from '@tramber/shared/types';
```

---

### Phase 2: Tool 系统 (1天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 2.1 实现 ToolRegistry | P0 | 1h | Phase 1 | ✅ |
| 2.2 实现 file 工具 (read/write/edit) | P0 | 1.5h | 2.1 | ✅ |
| 2.3 实现 search 工具 (glob/grep) | P0 | 1h | 2.1 | ✅ |
| 2.4 实现 execution 工具 (bash) | P0 | 1h | 2.1 | ✅ |
| 2.5 编写工具单元测试 | P1 | 1h | 2.2-2.4 | ✅ |

**文件清单**：
```
packages/tool/src/
├── registry.ts      # ToolRegistry
├── builtin/
│   ├── file.ts       # readFile, writeFile, editFile
│   ├── search.ts     # glob, grep
│   └── execution.ts  # bash
└── types.ts
```

**验收标准**：
```typescript
// 可以注册和执行工具
const registry = new ToolRegistry();
await registry.register(readFileTool);
const result = await registry.execute('read_file', { path: 'test.txt' });
```

**工具权限控制设计** (Phase 2 扩展):

```typescript
// .tramber/settings.json 工具权限配置
{
  "toolPermissions": {
    // 按操作类型分类权限
    "file_read": true,              // 允许读取文件
    "file_write": "confirm",         // 写入需要确认
    "file_delete": false,            // 禁止删除
    "command_execute": ["npm", "git", "ls", "cat"],  // 白名单命令
    "command_dangerous": "deny"      // 危险命令禁止
  },
  "sandbox": {
    "enabled": true,
    "allowedPaths": ["./"],          // 默认允许当前目录
    "deniedPatterns": ["rm -rf", "del /q", "format", "mkfs"],  // 禁止的命令模式
    "maxFileSize": 10485760,         // 最大文件大小 10MB
    "maxExecutionTime": 30000        // 最大执行时间 30秒
  }
}
```

---

### Phase 3: Provider 系统 (0.5天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 3.1 定义 AIProvider 接口 | P0 | 30min | Phase 1 | ✅ |
| 3.2 实现 Anthropic Provider | P0 | 1h | 3.1 | ✅ |
| 3.3 实现 Tool Call 解析 | P0 | 1h | 3.2 | ✅ |

**文件清单**：
```
packages/provider/src/
├── base/
│   └── provider.ts   # AIProvider 接口
├── anthropic/
│   ├── client.ts     # AnthropicClient
│   └── adapter.ts    # Tool Call 适配
└── types.ts
```

**验收标准**：
```typescript
// 可以调用 Claude 并解析工具调用
const provider = new AnthropicProvider({ apiKey: 'xxx' });
const response = await provider.chat({
  messages: [{ role: 'user', content: 'Read package.json' }],
  tools: registry.list()
});
console.log(response.toolCalls); // [{ name: 'read_file', parameters: {...} }]
```

---

### Phase 4: Agent Loop (1天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 4.1 实现 ContextManager | P0 | 1h | Phase 1 | ✅ |
| 4.2 实现 AgenticLoop.gatherContext | P0 | 1.5h | 4.1 | ✅ |
| 4.3 实现 AgenticLoop.takeAction | P0 | 1.5h | Phase 2,3 | ✅ |
| 4.4 实现 AgenticLoop.verifyResults | P0 | 1h | - | ✅ |
| 4.5 实现 AgenticLoop.run (主循环) | P0 | 1.5h | 4.2-4.4 | ✅ |
| 4.6 编写 Agent Loop 测试 | P1 | 1h | 4.5 | 🔄 |

**文件清单**：
```
packages/core/src/
├── agent/
│   ├── loop.ts        # AgenticLoop
│   └── types.ts       # Task, AgentContext, ActionResult, Verification
└── context/
    ├── manager.ts     # ContextManager
    └── builder.ts     # ContextBuilder
```

**验收标准**：
```typescript
// Agent Loop 可以完整执行
const loop = new AgenticLoop(toolRegistry, provider, contextManager);
const task = { id: '1', description: 'Read package.json', sceneId: 'coding' };
const result = await loop.run(task);
console.log(result.isComplete); // true
```

---

### Phase 5: Scene & Skill (1天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 5.1 定义 Coding Scene 配置 | P0 | 30min | Phase 1 | ✅ |
| 5.2 实现 Skill 执行器 | P0 | 1.5h | Phase 4 | ✅ |
| 5.3 实现 Routine 管理器 | P0 | 1.5h | - | ✅ |
| 5.4 实现 Routine 沉淀逻辑 | P0 | 1h | 5.3 | ✅ |
| 5.5 编写单元测试 | P1 | 1h | 5.2-5.4 | ⏸️ 暂缓 |

**文件清单**：
```
packages/scene/src/
├── types.ts         # Scene 接口
└── coding.ts        # Coding Scene 固定配置

packages/skill/src/
├── executor.ts      # SkillExecutor
└── types.ts

packages/routine/src/
├── manager.ts       # RoutineManager
├── solidify.ts      # Routine 沉淀逻辑
└── types.ts
```

**验收标准**：
```typescript
// Scene 可以配置和执行
const scene = loadCodingScene();
const skillExecutor = new SkillExecutor(provider, toolRegistry);
const result = await skillExecutor.execute('fix-bug', context);

// Routine 可以自动沉淀
const routineManager = new RoutineManager();
if (skillExecutor.successCount >= 3) {
  await routineManager.solidify(skillExecutor, 'fix-bug');
}
```

---

### Phase 6: Experience (1天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 6.1 定义全维度 Experience 类型 | P0 | 1h | Phase 1 | ✅ |
| 6.2 实现 Experience 文件存储 | P0 | 1h | 6.1 | ✅ |
| 6.3 实现 Experience 管理器 | P0 | 1.5h | 6.1 | ✅ |
| 6.4 实现自动记录触发机制 | P0 | 1.5h | Phase 5 | ✅ |
| 6.5 实现经验检索（关键词+标签） | P1 | 1h | 6.3 | ✅ |
| 6.6 实现经验反馈更新 | P1 | 1h | 6.3 | ✅ |

**文件清单**：
```
packages/experience/src/
├── types.ts         # 全维度经验类型
├── storage.ts       # 文件存储实现
├── manager.ts       # ExperienceManager
├── retrieval.ts     # 检索策略
└── recorder.ts      # 自动记录触发器
```

**验收标准**：
```typescript
// 1. 全维度经验记录
const manager = new ExperienceManager(storage);

// Skill 使用经验
await manager.record({
  target: 'skill',
  targetId: 'fix-async-error',
  type: 'success',
  category: 'usage',
  content: {
    problem: '异步函数缺少 await',
    solution: '在 Promise 调用前添加 await',
    codeExample: 'async function foo() { await bar(); }',
    bestPractices: ['总是使用 try-catch 包裹 await']
  },
  tags: ['async', 'promise', 'error'],
  confidence: 0.95
});

// Tool 安装经验
await manager.record({
  target: 'tool',
  targetId: 'lsp_definition',
  type: 'pattern',
  category: 'installation',
  content: {
    problem: 'LSP server 无法启动',
    solution: '需要全局安装 typescript-language-server',
    installCommand: 'npm install -g typescript-language-server',
    prerequisites: ['Node.js >= 18']
  },
  tags: ['lsp', 'installation', 'typescript']
});

// 2. 检索相关经验
const results = await manager.search({
  target: 'skill',
  text: 'async error',
  limit: 5
});

// 3. 更新经验有效性
await manager.updateEffectiveness('exp-123', 'positive');
```

---

### Phase 7: SDK & CLI (1天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 7.1 实现 TramberClient 接口 | P0 | 1h | Phase 6 | ✅ |
| 7.2 实现 WebSocket 传输 | P1 | 1.5h | 7.1 | ⏸️ 暂缓 |
| 7.3 实现 CLI 主入口 | P0 | 1.5h | 7.1 | ✅ |
| 7.4 实现 REPL 交互 | P0 | 2h | 7.3 | ✅ |
| 7.5 实现配置文件加载 | P0 | 1h | - | ✅ |

**文件清单**：
```
packages/sdk/src/
├── client.ts        # TramberClient ✅
├── types.ts         # 类型定义 ✅
└── index.ts         # 导出和便捷函数 ✅

packages/client/cli/src/
├── cli.ts           # CLI 主入口 ✅
├── repl.ts          # REPL 交互 ✅
└── config.ts        # 配置加载 ✅
```

**验收标准**：
```bash
# CLI 可以启动和交互
$ tramber
Welcome to Tramber (Coding Scene)
You: 读取 package.json
[AI 分析并执行...]
✓ File read successfully. Found dependencies: ...

You: 修复 tsconfig.json 中的错误
[AI 分析并执行...]
✓ Fixed 2 issues in tsconfig.json

You: 运行测试
[执行中...]
✓ All tests passed
```

---

### Phase 8: 集成测试 (1天) ✅ 已完成

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 8.1 端到端测试：简单需求 | P0 | 1h | Phase 7 | ✅ |
| 8.2 端到端测试：复杂需求 | P0 | 1.5h | 8.1 | ✅ |
| 8.3 端到端测试：Routine 沉淀 | P0 | 1.5h | 8.1 | ✅ |
| 8.4 性能测试 | P1 | 1h | 8.1 | ✅ |
| 8.5 错误处理测试 | P0 | 1h | 8.1 | ✅ |

**验收标准**：
- ✅ 可以完成"读取文件"任务
- ✅ 可以完成"修复 bug"任务
- ✅ 可以完成"运行测试"任务
- ✅ Routine 成功沉淀后可以直接执行

**测试文件**：
```
tests/
├── integration/
│   ├── tool-system.test.ts    # Tool 系统集成测试 ✅
│   └── agent-loop.test.ts     # Agent Loop 集成测试 ✅
├── e2e/
│   ├── e2e.test.ts            # 端到端测试 ✅
│   └── acceptance.test.ts     # 验收测试 ✅
└── helpers/
    └── mock-provider.ts       # Mock Provider ✅
```

---

## 四、MVP 验收标准

### 4.1 功能验收

| 场景 | 验收标准 |
|------|----------|
| **读取文件** | 用户说"读取 package.json"，AI 正确显示内容 |
| **编辑文件** | 用户说"把版本号改为 2.0.0"，AI 正确修改 |
| **运行测试** | 用户说"运行测试"，AI 执行 npm test 并显示结果 |
| **修复 Bug** | 给定一个有 bug 的文件，用户说"修复这个错误"，AI 正确修复 |
| **Routine 沉淀** | 同一操作成功 3 次后，自动沉淀为 Routine，下次直接执行 |
| **Experience 记录** | 自动记录 Skill 成功/失败经验，包含问题和解决方案 |
| **Experience 检索** | 新问题时能自动加载相关经验（基于 target 和 category） |
| **经验反馈** | 用户可对经验效果进行反馈，系统自动更新有效性评分 |

### 4.2 质量验收

| 指标 | 目标 |
|------|------|
| 单元测试覆盖率 | ≥ 60% |
| 核心路径覆盖率 | 100% |
| 类型安全 | 100% (strict mode) |
| 构建时间 | ≤ 10s |
| 冷启动时间 | ≤ 2s |

---

## 五、暂缓功能清单

### 5.1 Scene 系统

- ❌ 动态 Scene 创建
- ❌ Workflow 可组合性
- ❌ Scene 固化机制
- ❌ 其他 Scene (Drawing/Video/Writing)

### 5.2 Workflow 系统

- ❌ Workflow 定义文件
- ❌ Workflow 编辑器
- ❌ Workflow 分享

### 5.3 插件系统

- ❌ Plugin 加载器
- ❌ Plugin 注册表
- ❌ 社区插件

### 5.4 高级功能

- ❌ Checkpoint 快照回滚
- ❌ LSP 代码智能
- ❌ 向量检索 Experience
- ❌ Web 客户端
- ❌ Telegram/Discord Bot
- ❌ 多 Provider 支持

---

## 六、后续迭代路径

### Iteration 1: Workflow 系统 (1周)

```
┌─────────────────────────────────────────────────────────┐
│  M1: Workflow 定义文件                                  │
│  M2: Workflow 执行器                                    │
│  M3: 预置 Workflow 模板                                 │
│  M4: CLI: /workflow 命令                                 │
└─────────────────────────────────────────────────────────┘
```

### Iteration 2: Scene 演进 (1周)

```
┌─────────────────────────────────────────────────────────┐
│  M1: 动态 Scene 创建                                    │
│  M2: Scene 固化机制                                     │
│  M3: Scene 库管理                                       │
│  M4: CLI: /scene 命令                                    │
└─────────────────────────────────────────────────────────┘
```

### Iteration 3: Checkpoint (3天)

```
┌─────────────────────────────────────────────────────────┐
│  M1: 内容寻址存储                                        │
│  M2: 快照管理                                           │
│  M3: 回滚功能                                           │
│  M4: CLI: /rollback 命令                                 │
└─────────────────────────────────────────────────────────┘
```

### Iteration 4: 多 Provider (3天)

```
┌─────────────────────────────────────────────────────────┐
│  M1: OpenAI Provider                                    │
│  M2: Gemini Provider                                    │
│  M3: Provider 切换                                       │
│  M4: 配置文件支持                                        │
└─────────────────────────────────────────────────────────┘
```

### Iteration 5: Web 客户端 (1周)

```
┌─────────────────────────────────────────────────────────┐
│  M1: 基础 UI 框架                                        │
│  M2: 对话界面                                           │
│  M3: Scene 选择                                         │
│  M4: 实时流式输出                                        │
└─────────────────────────────────────────────────────────┘
```

### Iteration 6: 插件系统 (2周)

```
┌─────────────────────────────────────────────────────────┐
│  M1: Plugin 加载器                                       │
│  M2: Plugin API                                         │
│  M3: 内置插件拆分                                        │
│  M4: 社区插件支持                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 七、开发优先级矩阵

```
┌─────────────────────────────────────────────────────────────────┐
│                     P0 (MVP 必需)                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Tool 系统 (file/search/execution)                      │   │
│  │ • Provider (Anthropic)                                   │   │
│  │ • Agent Loop                                              │   │
│  │ • Coding Scene (固定配置)                                 │   │
│  │ • Skill 执行器                                            │   │
│  │ • Routine 管理器 + 沉淀                                   │   │
│  │ • Experience 文件存储                                     │   │
│  │ • CLI 客户端                                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                     P1 (MVP 优化)                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • 单元测试                                                │   │
│  │ • 错误处理                                                │   │
│  │ • 性能优化                                                │   │
│  │ • 用户体验优化                                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                     P2 (后续迭代)                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • Workflow 系统                                           │   │
│  │ • Scene 演进                                              │   │
│  │ • Checkpoint                                              │   │
│  │ • 多 Provider                                             │   │
│  │ • Web 客户端                                              │   │
│  │ • 插件系统                                                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 八、时间估算

| Phase | 内容 | 预估时间 | 状态 |
|-------|------|---------|------|
| Phase 1 | 基础设施 | 1-2 天 | ✅ 已完成 |
| Phase 2 | Tool 系统 | 1 天 | ✅ 已完成 |
| Phase 3 | Provider 系统 | 0.5 天 | ✅ 已完成 |
| Phase 4 | Agent Loop | 1 天 | ✅ 已完成 |
| Phase 5 | Scene & Skill | 1 天 | ✅ 已完成 |
| Phase 6 | Experience | 0.5 天 | ✅ 已完成 |
| Phase 7 | SDK & CLI | 1 天 | ✅ 已完成 |
| Phase 8 | 集成测试 | 1 天 | ✅ 已完成 |
| **总计** | **MVP** | **7-8 天** | **✅ 100% 完成** |

---

## 当前进度总结 (2026-03-24)

### ✅ MVP 已完成! (8/8 Phases)

1. **Phase 1: 基础设施** - Monorepo 结构、TypeScript 配置、Shared 类型
2. **Phase 2: Tool 系统** - ToolRegistry + 12 个内置工具 (file/search/execution) + 单元测试
3. **Phase 3: Provider 系统** - Anthropic Claude Provider (支持工具调用和流式响应)
4. **Phase 4: Agent Loop** - 完整的 Agent 执行循环 (Gather Context → Take Action → Verify Results)
5. **Phase 5: Scene & Skill** - Coding Scene 固定配置、Skill 执行器、Routine 管理器和沉淀逻辑
6. **Phase 6: Experience** - 全维度经验记录、文件存储、检索器和自动记录触发器
7. **Phase 7: SDK & CLI** - TramberClient 接口、CLI 主入口、REPL 交互、配置管理
8. **Phase 8: 集成测试** - 端到端测试、验收测试

### 📦 已创建的包

- ✅ `@tramber/shared` - 共享类型定义
- ✅ `@tramber/tool` - 工具系统 (含内置工具)
- ✅ `@tramber/provider` - AI Provider (Anthropic)
- ✅ `@tramber/agent` - Agent Loop 执行引擎
- ✅ `@tramber/scene` - Scene & Skill 管理 (Coding Scene 固定配置)
- ✅ `@tramber/routine` - Routine 管理器和沉淀逻辑
- ✅ `@tramber/experience` - 全维度经验管理系统
- ✅ `@tramber/sdk` - 统一客户端接口
- ✅ `@tramber/cli` - 命令行工具和 REPL

### 🧪 测试覆盖

- ✅ 集成测试 (Tool System, Agent Loop)
- ✅ 端到端测试 (读取文件、修复 Bug、运行测试、多步骤任务)
- ✅ 验收测试 (所有 MVP 验收标准)

### 🎉 MVP 完成!

**MVP 完成度: 100%**

所有核心功能已实现并通过验收测试。

---

## 九、最小依赖图（MVP）

```
                    ┌─────────────┐
                    │   shared    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
   │    tool     │   │  provider   │   │ experience  │
   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
          │                 │                 │
          └─────────┬───────┴─────────┬───────┘
                    ▼                 ▼
              ┌─────────────┐   ┌─────────────┐
              │    core     │   │   routine   │
              │  (Agent)    │   │             │
              └──────┬──────┘   └──────┬──────┘
                     │                 │
                     └─────────┬───────┘
                               ▼
                        ┌─────────────┐
                        │   scene     │
                        │  (Coding)   │
                        └──────┬──────┘
                               │
                        ┌──────┴──────┐
                        │             │
                        ▼             ▼
                   ┌─────────────┐ ┌─────────────┐
                   │     cli     │ │    sdk      │
                   └─────────────┘ └─────────────┘
```

**虚线部分暂缓**：
- workflow
- checkpoint
- lsp
- plugin
- client/web
- client/message/

---

## 十、架构优化计划（Phase 9）

基于 [architecture-review.md](./architecture-review.md) 的架构分析，以下是已确认的优化方案。

### 10.1 优化目标

| 类别 | 目标 |
|------|------|
| **可靠性** | 解决 Agent Loop 死循环问题，简化控制逻辑 |
| **可维护性** | 分离关注点，明确类型契约 |
| **用户体验** | 改进错误处理，提供可操作的建议 |

### 10.2 已确认的优化方案

#### ✅ 方案 1: 简化 Agent Loop 控制流

**问题**: 文本标记与 ToolCalls 混用，终止判断不清晰

**解决方案**:
```typescript
// 核心逻辑简化
for (let i = 0; i < maxIterations; i++) {
  const response = await callLLM(context);

  // 有工具调用 → 执行并继续
  if (response.toolCalls?.length > 0) {
    await executeTools(response.toolCalls);
    continue;
  }

  // 无工具调用 → 输出给用户，等待回应
  return { success: true, finalAnswer: response.content };
}
```

**影响**:
- ✅ 逻辑简单，不会误判
- ✅ 不会死循环
- ⚠️ 用户需要更频繁输入"继续"

**文件**: `packages/agent/src/loop.ts`

---

#### ✅ 方案 2: 权限类型映射改进

**问题**: `getOperationType()` 字符串匹配不可靠

**解决方案**:
```typescript
// 在 Tool 定义中声明权限类型
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
```

**文件**: `packages/tool/src/types.ts`, `packages/agent/src/loop.ts`

---

#### ✅ 方案 3: 引入 ConversationManager

**目标**: 分离关注点，管理内存中的对话状态

**组件设计**:
```
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
```

**注意**: ConversationManager 仅管理内存状态，不涉及持久化

---

#### ✅ 方案 4: 明确类型契约

**问题**: AgentLoopResult 类型不够明确

**解决方案**:
```typescript
// 使用 discriminated union
type AgentLoopResult =
  | { status: 'completed'; output: string; experiences: Experience[] }
  | { status: 'waiting_user'; prompt: string; options: string[] }
  | { status: 'failed'; error: string; recoverable: boolean }
  | { status: 'max_iterations'; partialResult?: string };
```

---

#### ✅ 方案 5: CLI 错误处理改进

**问题**: 简单的成功/失败输出

**解决方案**:
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

**文件**: `packages/client/cli/src/cli.ts`

---

### 10.3 暂缓的优化

以下优化已确认有价值，但暂缓实施：

| 方案 | 原因 |
|------|------|
| Permission 模块完整重构 | 当前可用，优先完成核心优化 |
| CLI 会话管理 | 功能完整度要求高，需要更多设计 |
| CLI 输出格式多样化 | 非核心功能 |

---

### 10.4 实施优先级

| 优先级 | 方案 | 预估时间 |
|-------|------|---------|
| **P0** | 方案 1: 简化 Agent Loop | 0.5天 |
| **P0** | 方案 2: 权限类型映射 | 0.5天 |
| **P1** | 方案 3: ConversationManager | 1天 |
| **P1** | 方案 4: 类型契约 | 0.5天 |
| **P1** | 方案 5: CLI 错误处理 | 0.5天 |
| **总计** | | **3天** |

---

### 10.5 实施检查清单

- [x] 方案 1: 移除文本标记解析，简化 Agent Loop
- [x] 方案 1: 更新系统提示词
- [x] 方案 2: 在 Tool 定义中添加 permission 字段
- [x] 方案 2: 更新权限检查逻辑
- [x] 方案 3: 创建 ConversationManager
- [x] 方案 3: 创建 ToolExecutor
- [x] 方案 3: 创建 PermissionGuard
- [x] 方案 3: 重构 Agent Loop 使用新组件
- [x] 方案 4: 更新 AgentLoopResult 类型定义
- [x] 方案 5: 实现错误分类和可操作建议
- [x] 测试所有改动
- [x] 更新文档

---

### 10.6 全局调试系统设计 (Phase 9.5)

#### 问题

测试时报错很多时候不知道是发生了什么事，只有一个 "Error"，难以定位问题。仅在 Agent 层添加 debug 不够，问题可能发生在各个层级：

| 层级 | 可能的问题 |
|------|-----------|
| **Provider** | API 调用失败、网络超时、响应解析错误 |
| **Tool** | 文件不存在、沙箱限制、执行超时 |
| **Permission** | 配置加载失败、权限规则匹配错误 |
| **SDK Client** | 配置文件解析、初始化失败 |
| **CLI** | 参数解析、环境变量问题 |

#### 设计方案：全局 Logger

**1. Logger 放在 shared 包**

```typescript
// packages/shared/src/logger.ts

export enum LogLevel {
  ERROR = 'error',     // 仅错误
  BASIC = 'basic',     // 关键步骤 + 错误
  VERBOSE = 'verbose', // 详细信息
  TRACE = 'trace'      // 所有细节
}

export interface LoggerOptions {
  enabled?: boolean;
  level?: LogLevel;
  namespaces?: string[];  // 命名空间过滤，如 ['tramber:agent', 'tramber:tool']
  output?: 'console' | 'file';
  filePath?: string;
}

/**
 * 全局单例 Logger
 *
 * 支持命名空间，方便按模块过滤
 */
export class Logger {
  private static instance: Logger;
  private enabled: boolean;
  private level: LogLevel;
  private namespaces: Set<string>;
  private output: 'console' | 'file';
  private filePath?: string;

  private constructor() {
    // 从环境变量读取配置
    const debugEnv = process.env.TRAMBER_DEBUG;
    this.enabled = debugEnv !== undefined && debugEnv !== 'false' && debugEnv !== '0';

    const levelEnv = process.env.TRAMBER_DEBUG_LEVEL;
    this.level = (levelEnv as LogLevel) ?? LogLevel.BASIC;

    const namespaceEnv = process.env.TRAMBER_DEBUG_NAMESPACES;
    this.namespaces = namespaceEnv
      ? new Set(namespaceEnv.split(',').map(n => n.trim()))
      : new Set();

    this.output = (process.env.TRAMBER_DEBUG_OUTPUT as 'console' | 'file') ?? 'console';
    this.filePath = process.env.TRAMBER_DEBUG_FILE;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 配置 Logger（用于 CLI 选项覆盖环境变量）
   */
  configure(options: LoggerOptions): void {
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
    }
    if (options.level !== undefined) {
      this.level = options.level;
    }
    if (options.namespaces !== undefined) {
      this.namespaces = new Set(options.namespaces);
    }
    if (options.output !== undefined) {
      this.output = options.output;
    }
    if (options.filePath !== undefined) {
      this.filePath = options.filePath;
    }
  }

  /**
   * 静态方法：记录 debug 日志
   *
   * @param namespace - 命名空间，如 'tramber:agent'
   * @param level - 日志级别
   * @param message - 消息
   * @param data - 附加数据
   */
  static debug(namespace: string, level: LogLevel, message: string, data?: unknown): void {
    Logger.getInstance().log(namespace, level, message, data);
  }

  /**
   * 静态方法：记录错误
   */
  static error(namespace: string, message: string, error?: Error | unknown): void {
    const errorData = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { error };
    Logger.debug(namespace, LogLevel.ERROR, message, errorData);
  }

  private log(namespace: string, level: LogLevel, message: string, data?: unknown): void {
    if (!this.enabled) return;
    if (!this.shouldLog(namespace, level)) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    const levelTag = this.levelTag(level);
    const fullMessage = `[${timestamp}] [${namespace}] ${levelTag} ${message}`;

    if (this.output === 'console') {
      console.log(fullMessage);
      if (data !== undefined) {
        console.log(JSON.stringify(data, null, 2));
      }
    } else if (this.output === 'file' && this.filePath) {
      const fs = require('fs');
      const content = data !== undefined
        ? `${fullMessage}\n${JSON.stringify(data, null, 2)}\n`
        : `${fullMessage}\n`;
      fs.appendFileSync(this.filePath, content);
    }
  }

  private shouldLog(namespace: string, level: LogLevel): boolean {
    // 检查命名空间过滤
    if (this.namespaces.size > 0 && !this.namespaces.has(namespace)) {
      return false;
    }

    // 检查级别
    const levels = [LogLevel.ERROR, LogLevel.BASIC, LogLevel.VERBOSE, LogLevel.TRACE];
    return levels.indexOf(level) <= levels.indexOf(this.level);
  }

  private levelTag(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return '[ERROR]';
      case LogLevel.BASIC: return '[INFO]';
      case LogLevel.VERBOSE: return '[VERBOSE]';
      case LogLevel.TRACE: return '[TRACE]';
    }
  }
}

// 便捷函数
export function debug(namespace: string, level: LogLevel, message: string, data?: unknown): void {
  Logger.debug(namespace, level, message, data);
}

export function debugError(namespace: string, message: string, error?: Error | unknown): void {
  Logger.error(namespace, message, error);
}
```

**2. 各层级命名空间定义**

```typescript
// 命名空间规范：tramber:<module>[:<submodule>]

export const NAMESPACE = {
  // CLI 层
  CLI: 'tramber:cli',
  CLI_CONFIG: 'tramber:cli:config',

  // SDK 层
  SDK: 'tramber:sdk',
  SDK_CLIENT: 'tramber:sdk:client',

  // Provider 层
  PROVIDER: 'tramber:provider',
  PROVIDER_ANTHROPIC: 'tramber:provider:anthropic',

  // Agent 层
  AGENT: 'tramber:agent',
  AGENT_LOOP: 'tramber:agent:loop',
  AGENT_CONVERSATION: 'tramber:agent:conversation',

  // Tool 层
  TOOL: 'tramber:tool',
  TOOL_REGISTRY: 'tramber:tool:registry',
  TOOL_FILE: 'tramber:tool:file',
  TOOL_SEARCH: 'tramber:tool:search',
  TOOL_EXEC: 'tramber:tool:exec',

  // Permission 层
  PERMISSION: 'tramber:permission',
  PERMISSION_CHECKER: 'tramber:permission:checker',
  PERMISSION_CONFIG: 'tramber:permission:config',

  // Experience 层
  EXPERIENCE: 'tramber:experience',
  EXPERIENCE_STORAGE: 'tramber:experience:storage',
  EXPERIENCE_MANAGER: 'tramber:experience:manager',

  // Scene 层
  SCENE: 'tramber:scene',
  SCENE_MANAGER: 'tramber:scene:manager',
  SCENE_SKILL: 'tramber:scene:skill',

  // Routine 层
  ROUTINE: 'tramber:routine',
  ROUTINE_MANAGER: 'tramber:routine:manager',
} as const;
```

**3. 各层级使用示例**

```typescript
// packages/provider/src/anthropic/client.ts

import { debug, debugError, NAMESPACE } from '@tramber/shared/logger';

export class AnthropicProvider {
  async chat(request: ChatRequest): Promise<ChatResponse> {
    debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.VERBOSE, 'Sending chat request', {
      messagesCount: request.messages.length,
      toolsCount: request.tools?.length ?? 0,
      model: this.model
    });

    try {
      const response = await this.client.messages.create(...);

      debug(NAMESPACE.PROVIDER_ANTHROPIC, LogLevel.TRACE, 'Raw API response', response);

      return {
        content: response.content[0].text,
        toolCalls: parseToolCalls(response)
      };
    } catch (error) {
      debugError(NAMESPACE.PROVIDER_ANTHROPIC, 'API request failed', error);
      throw error;
    }
  }
}

// packages/tool/src/builtin/file.ts

import { debug, debugError, NAMESPACE } from '@tramber/shared/logger';

export const readFileTool: Tool = {
  id: 'read_file',
  name: 'Read File',
  description: '读取文件内容',
  category: 'file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } },

  async execute(input: unknown) {
    const { path } = input as { path: string };

    debug(NAMESPACE.TOOL_FILE, LogLevel.VERBOSE, 'Reading file', { path });

    try {
      const content = await fs.readFile(path, 'utf-8');

      debug(NAMESPACE.TOOL_FILE, LogLevel.TRACE, 'File content length', { length: content.length });

      return { success: true, data: content };
    } catch (error) {
      debugError(NAMESPACE.TOOL_FILE, `Failed to read file: ${path}`, error);
      return { success: false, error: (error as Error).message };
    }
  }
};

// packages/agent/src/loop.ts

import { debug, debugError, NAMESPACE } from '@tramber/shared/logger';

export class AgentLoop {
  private async runLoop(context: AgentContext): Promise<AgentLoopResult> {
    for (let i = 0; i < maxIterations; i++) {
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `Iteration ${i + 1}/${maxIterations} started`);

      // 调用 LLM
      const response = await this.callLLM(context);
      debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, 'LLM response received', {
        hasToolCalls: (response.toolCalls?.length ?? 0) > 0,
        contentLength: response.content.length
      });

      // 处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, `Processing ${response.toolCalls.length} tool calls`);

        for (const toolCall of response.toolCalls) {
          debug(NAMESPACE.AGENT_LOOP, LogLevel.VERBOSE, `Executing tool: ${toolCall.name}`, {
            parameters: toolCall.parameters
          });

          try {
            const result = await this.toolRegistry.execute(toolCall.name, toolCall.parameters);
            // ...
          } catch (error) {
            debugError(NAMESPACE.AGENT_LOOP, `Tool execution failed: ${toolCall.name}`, error);
          }
        }

        continue;
      }

      // 无工具调用，返回
      debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'No tool calls, returning to user');
      return { success: true, finalAnswer: response.content };
    }

    debug(NAMESPACE.AGENT_LOOP, LogLevel.BASIC, 'Max iterations reached');
    return { success: false, error: 'Max iterations reached' };
  }
}

// packages/sdk/src/client.ts

import { debug, debugError, NAMESPACE } from '@tramber/shared/logger';

export class TramberClient {
  async initialize(): Promise<void> {
    debug(NAMESPACE.SDK_CLIENT, LogLevel.BASIC, 'Initializing TramberClient');

    try {
      // 加载权限配置
      const permissionConfig = await this.configLoader.load();
      debug(NAMESPACE.SDK_CLIENT, LogLevel.VERBOSE, 'Permission config loaded', {
        toolPermissions: Object.keys(permissionConfig.toolPermissions ?? {}),
        sandboxEnabled: permissionConfig.sandbox?.enabled
      });
    } catch (error) {
      debugError(NAMESPACE.SDK_CLIENT, 'Failed to load permission config', error);
      // 使用默认配置
    }
  }
}

// packages/client/cli/src/cli.ts

import { Logger, NAMESPACE } from '@tramber/shared/logger';

program
  .argument('[prompt...]')
  .option('--debug', 'Enable debug mode')
  .option('--debug-level <level>', 'Debug level: error, basic, verbose, trace')
  .option('--debug-namespace <ns...>', 'Debug namespaces: agent, tool, provider, etc.')
  .option('--debug-file <path>', 'Write debug output to file')
  .action(async (prompt: string[], options) => {
    // 配置 Logger
    if (options.debug) {
      Logger.getInstance().configure({
        enabled: true,
        level: options.debugLevel ?? LogLevel.BASIC,
        namespaces: options.debugNamespace,
        output: options.debugFile ? 'file' : 'console',
        filePath: options.debugFile
      });
    }

    debug(NAMESPACE.CLI, LogLevel.BASIC, 'CLI started', {
      prompt: prompt.join(' '),
      model: options.model,
      debugEnabled: options.debug
    });

    // ... 执行任务
  });
```

**4. 环境变量控制**

```bash
# 启用所有 debug 输出
export TRAMBER_DEBUG=true

# 启用特定命名空间
export TRAMBER_DEBUG=true
export TRAMBER_DEBUG_NAMESPACES=tramber:agent,tramber:tool

# 设置日志级别
export TRAMBER_DEBUG_LEVEL=verbose

# 输出到文件
export TRAMBER_DEBUG_OUTPUT=file
export TRAMBER_DEBUG_FILE=debug.log
```

**5. CLI 使用示例**

```bash
# 启用 debug（默认 basic 级别，所有命名空间）
tramber "读取 package.json" --debug

# 只调试 agent 层
tramber "修复 bug" --debug --debug-namespace tramber:agent

# 调试多个层
tramber "运行测试" --debug --debug-namespace tramber:agent --debug-namespace tramber:tool

# 详细级别
tramber "复杂任务" --debug --debug-level verbose

# 输出到文件
tramber "任务" --debug --debug-level trace --debug-file debug.log
```

**6. 输出示例**

```
[10:30:45.123] [tramber:cli] [INFO] CLI started {"prompt":"读取 package.json"}
[10:30:45.125] [tramber:sdk:client] [INFO] Initializing TramberClient
[10:30:45.130] [tramber:permission:config] [INFO] Loading permission config
[10:30:45.135] [tramber:sdk:client] [INFO] Client initialized
[10:30:45.140] [tramber:agent:loop] [INFO] Iteration 1/10 started
[10:30:45.142] [tramber:agent:loop] [VERBOSE] LLM response received {"hasToolCalls":true}
[10:30:45.145] [tramber:agent:loop] [INFO] Processing 1 tool calls
[10:30:45.146] [tramber:agent:loop] [VERBOSE] Executing tool: read_file {"path":"package.json"}
[10:30:45.150] [tramber:tool:file] [VERBOSE] Reading file {"path":"package.json"}
[10:30:45.155] [tramber:tool:file] [TRACE] File content length {"length":523}
[10:30:45.160] [tramber:agent:loop] [INFO] Iteration 2/10 started
[10:30:45.162] [tramber:agent:loop] [INFO] No tool calls, returning to user
[10:30:45.165] [tramber:sdk:client] [INFO] Task completed successfully
```

**7. CLI 交互场景设计**

在 CLI 交互模式下，日志系统需要与用户交互输出分离：

```typescript
// Logger 输出流配置
private logToConsole(message: string, data?: unknown): void {
  // 日志输出到 stderr，不干扰 stdout 的正常输出
  console.error(message);  // 使用 console.error 而非 console.log
  if (data !== undefined) {
    console.error(JSON.stringify(data, null, 2));
  }
}
```

**交互模式下的输出示例：**

```bash
$ tramber --debug --debug-namespace tramber:agent,tramber:tool "修复登录bug"

# Debug 日志（stderr，灰色/黄色）
[14:32:01.234] [tramber:cli] [INFO] CLI started
[14:32:01.456] [tramber:agent:loop] [INFO] Iteration 1/10 started
[14:32:02.123] [tramber:agent:loop] [VERBOSE] LLM response received
[14:32:02.234] [tramber:agent:loop] [VERBOSE] Executing tool: read_file

# 正常 CLI 输出（stdout，用户可见）
🔍 分析需求中...

[14:32:03.456] [tramber:tool:file] [VERBOSE] Reading file {"path":"src/login.ts"}

📖 正在读取相关文件...

[14:32:04.123] [tramber:permission:checker] [ERROR] Permission denied for file_write
[14:32:04.124] [tramber:permission:checker] [ERROR] Required operation: file_write
[14:32:04.125] [tramber:permission:checker] [ERROR] User permission: confirm

# 交互提示（stdout）
⚠️  需要权限确认：
   操作：写入文件 src/login.ts
   允许？(y/n): y

[14:32:05.234] [tramber:agent:loop] [INFO] Permission granted by user

# 正常进度（stdout）
✏️  正在修改文件...

[14:32:06.123] [tramber:tool:file] [VERBOSE] File written successfully

✅ 任务完成！
```

**输出流分离的好处：**

1. **日志捕获**：用户可以单独捕获日志而不影响正常输出
   ```bash
   # 只看正常输出，不看日志
   tramber "任务" --debug 2>/dev/null

   # 保存日志到文件，正常输出显示
   tramber "任务" --debug 2>debug.log

   # 同时保存两者
   tramber "任务" --debug > output.txt 2>debug.log
   ```

2. **管道兼容**：正常输出可以被其他命令处理
   ```bash
   tramber "分析代码" --debug 2>/dev/null | grep "TODO"
   ```

3. **颜色区分**（可选增强）
   ```typescript
   // 使用 chalk 或类似库区分日志级别
   import chalk from 'chalk';

   private formatMessage(level: LogLevel, message: string): string {
     const colors = {
       [LogLevel.ERROR]: chalk.red,
       [LogLevel.BASIC]: chalk.gray,
       [LogLevel.VERBOSE]: chalk.yellow,
       [LogLevel.TRACE]: chalk.dim
     };
     return colors[level](message);
   }
   ```

**交互式 CLI 模式的特殊处理：**

```typescript
// packages/client/cli/src/interactive.ts

import { Logger, NAMESPACE, LogLevel } from '@tramber/shared/logger';

export async function runInteractiveMode() {
  // 禁用 console 输出的日志，避免干扰交互
  Logger.getInstance().configure({
    enabled: true,
    output: 'file',  // 日志只写文件
    filePath: 'tramber-debug.log'
  });

  // 交互模式下手动记录关键步骤到 stdout
  console.log('🐛 Debug 模式已启用，日志将保存到 tramber-debug.log');

  // 用户输入
  const prompt = await readline.question('\n💬 请输入需求: ');

  // 执行任务
  const result = await client.execute(prompt, {
    onProgress: (update) => {
      // 选择性地显示重要信息
      if (update.type === 'step') {
        console.log(`\n${update.content}`);
      }
    }
  });

  // 完成后显示日志位置
  if (result.success) {
    console.log('\n✅ 任务完成！');
    console.log(`📄 详细日志: tramber-debug.log`);
  }
}
```

#### 实施检查清单

- [ ] 在 shared/src 创建 logger.ts
- [ ] 定义命名空间常量
- [ ] Provider 层添加日志输出
- [ ] Tool 层添加日志输出
- [ ] Agent 层添加日志输出
- [ ] SDK 层添加日志输出
- [ ] CLI 添加 --debug 相关选项
- [ ] 支持 TRAMBER_DEBUG 环境变量
- [ ] 测试 debug 模式输出

---

### 10.7 CLI IO 架构重构 (Phase 9.6)

#### 问题背景

经过十几轮的迭代修复，CLI IO 系统仍然存在以下问题：

| 问题 | 现象 |
|------|------|
| **prompt 提前显示** | 任务还在执行时，REPL prompt 就已经显示 |
| **输入被错误处理** | 权限确认的输入有时被当作 REPL 命令处理 |
| **exit 无法正常退出** | 某些情况下 exit 命令无法关闭进程 |
| **输出混乱** | 工具执行结果和 prompt 的显示顺序不正确 |

#### 架构层面的问题根源

**1. 关注点分离失败**

当前 IOManager 承担了太多职责：
- **IO 层**：管理 readline 接口
- **状态层**：管理 REPL/QUESTION 模式
- **业务层**：处理权限确认逻辑
- **UI 层**：控制 prompt 显示时机

**2. 生命周期边界模糊**

三个生命周期纠缠在一起：
- REPL 循环生命周期：何时显示 prompt？何时接受输入？
- 任务执行生命周期：何时开始？何时完成？
- 用户交互生命周期：何时暂停 REPL？何时恢复？

**3. 控制流反转缺失**

当前是"主动调用"的架构，层与层之间紧耦合：
- REPL 需要调用 executeTask
- executeTask 需要调用 ioManager
- ioManager 需要调用 lineHandler

**4. 异步完成时机无法追踪**

`onPermissionRequired` 回调在 agentLoop 执行过程中被调用，需要等待用户输入，返回后继续执行。但是 IOManager 不知道：
- 这个回调什么时候完成
- 任务什么时候真正结束
- 什么时候可以安全地显示 prompt

#### 重新设计方案：三层架构 + 状态机

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

**状态机设计：**

```
     ┌──────────┐
     │  IDLE    │ ←─────────────┐
     └─────┬────┘               │
           │ startTask          │ taskComplete
           ↓                    │
     ┌──────────┐ requestInput  │
     │ EXECUTING│───────────────>│
     └──────────┘               │
           ↑                    │
           │ inputReceived      │
           └────────────────────┘

WAITING_INPUT (等待用户输入，如权限确认)
```

#### 实施步骤

**Step 1: 创建 Interaction Layer**

```typescript
// packages/client/cli/src/interaction-manager.ts

export enum InteractionState {
  IDLE = 'idle',
  EXECUTING = 'executing',
  WAITING_INPUT = 'waiting_input'
}

export interface InteractionManager {
  // 开始任务（返回 Promise，任务完成时 resolve）
  startTask(task: () => Promise<void>): Promise<void>;

  // 请求用户输入（只能在任务执行期间调用）
  requestInput(prompt: string): Promise<string>;

  // 状态查询
  getState(): InteractionState;
}
```

**Step 2: 简化 IO Layer**

```typescript
// packages/client/cli/src/io-manager.ts

export interface IOInterface {
  // 初始化 readline
  init(config: IOConfig): void;

  // 注册输入监听器（回调模式，不关心业务逻辑）
  onLine(callback: (line: string) => void): void;

  // 显示 prompt（由 InteractionManager 决定何时调用）
  showPrompt(): void;

  // 关闭
  close(): void;
}
```

**Step 3: 重构 REPL Layer**

```typescript
// packages/client/cli/src/repl.ts

export async function createRepl(client: TramberClient, interaction: InteractionManager) {
  // 设置输入处理
  interaction.onInput(async (line) => {
    await interaction.startTask(async () => {
      await executeTask(line, client, interaction);
    });
  });
}
```

**Step 4: 重写 executeTask**

```typescript
// packages/client/cli/src/task.ts

export async function executeTask(
  input: string,
  client: TramberClient,
  interaction: InteractionManager
): Promise<void> {
  const result = await client.execute(input, {
    onPermissionRequired: async (tool, op, reason) => {
      const confirmed = await interaction.requestInput(`允许操作 "${op}"?`);
      return confirmed === 'y';
    }
  });
  // 任务完成后，InteractionManager 自动返回 IDLE 状态并显示 prompt
}
```

#### 状态转换规则

| 当前状态 | 允许的转换 | 触发条件 | 转换后动作 |
|---------|-----------|----------|-----------|
| IDLE | → EXECUTING | 用户输入 | 调用 lineHandler |
| EXECUTING | → WAITING_INPUT | requestInput() | 等待用户输入 |
| EXECUTING | → IDLE | lineHandler 完成 | 显示 prompt |
| WAITING_INPUT | → EXECUTING | 收到输入 | 继续任务执行 |

#### 核心改进点

1. **分层解耦**：每层只负责自己的职责
2. **事件驱动**：使用回调而不是主动调用
3. **状态机管理**：明确的状态和转换规则
4. **生命周期清晰**：每一层知道自己的开始和结束
5. **异步完成追踪**：通过 Promise 链追踪任务完成时机

#### 实施优先级

| 优先级 | 任务 | 预估时间 |
|-------|------|---------|
| P0 | 创建 InteractionManager | 0.5天 |
| P0 | 简化 IOManager 为纯 IO 层 | 0.5天 |
| P0 | 重构 REPL 使用 InteractionManager | 0.5天 |
| P1 | 重写 executeTask | 0.5天 |
| P1 | 添加状态转换日志 | 0.2天 |
| P1 | 集成测试 | 0.3天 |
| **总计** | | **2.5天** |

#### 实施检查清单

- [ ] 创建 `interaction-manager.ts`
- [ ] 定义 `InteractionState` 枚举
- [ ] 实现 `startTask()` 方法
- [ ] 实现 `requestInput()` 方法
- [ ] 添加状态转换日志
- [ ] 简化 `io-manager.ts`，移除业务逻辑
- [ ] 重构 `repl.ts` 使用 InteractionManager
- [ ] 重写 `executeTask()` 函数
- [ ] 添加单元测试
- [ ] 添加集成测试
- [ ] 测试权限确认流程
- [ ] 测试 exit 命令
- [ ] 测试输出顺序
- [ ] 更新文档

#### 验收标准

```bash
# 测试场景 1: 正常任务执行
$ tramber
You: 读取 package.json
[执行中...]
✓ 任务完成
You:  ← 正确显示 prompt，时机正确

# 测试场景 2: 权限确认
You: 修改 package.json
⚠️  需要权限确认：file_write
允许? (y/N): y
[执行中...]
✓ 任务完成
You:  ← 权限确认后不提前显示 prompt

# 测试场景 3: exit 命令
You: exit
Goodbye!
$ ← 进程正常退出
```

---

*文档创建时间: 2026-03-23*
*最后更新: 2026-03-27 (添加 Phase 9.6 CLI IO 架构重构)*
