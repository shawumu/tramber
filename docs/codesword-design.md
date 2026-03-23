# CodeSword 项目设计方案

## 概述

融合 **OpenCode** 和 **Claude Code** 两大优秀项目的核心设计思想，使用原生 Node.js + npm 实现的 AI 代码助手项目。

### 设计目标
- 纯 Node.js 生态系统，不依赖 Bun
- 使用 npm workspaces 管理 monorepo
- Code Server + CLI/WebApp 架构
- 完整的扩展系统 (Skills / MCP / Subagents / Hooks)
- 三种权限模式 + Checkpoint 系统

---

# 融合架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CodeSword Fusion Architecture                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                           Client Layer                              │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │    │
│  │  │   CLI    │  │  WebApp  │  │  IDE Ext │  │ Desktop  │            │    │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘            │    │
│  └────────┼─────────────┼─────────────┼─────────────┼────────────────────┘    │
│           │             │             │             │                          │
│           └─────────────┴─────────────┴─────────────┴──────────┐               │
│                                                            │               │
│  ┌─────────────────────────────────────────────────────────▼─────────────┐  │
│  │                        Communication Layer                     │  │
│  │  ┌────────────────┐              ┌────────────────┐                  │  │
│  │  │  SDK Protocol  │◄────────────►│   WebSocket    │                  │  │
│  │  └────────────────┘              └────────────────┘                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Server Layer                                 │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │                     Agent Core                                │  │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │    │
│  │  │  │Build Agent  │  │ Plan Agent  │  │General Agent│           │  │    │
│  │  │  └─────────────┘  └─────────────┘  └─────────────┘           │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                   │    │
│  │  ┌─────────────────────────────────────────────────────────────┐  │    │
│  │  │                    Agentic Loop                             │  │    │
│  │  │   gather context ──► take action ──► verify results         │  │    │
│  │  └─────────────────────────────────────────────────────────────┘  │    │
│  │                                                                   │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │                     Extension System                         │  │    │
│  │  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌─────────┐       │  │    │
│  │  │  │ Skills  │  │   MCP   │  │Subagents │  │  Hooks  │       │  │    │
│  │  │  └─────────┘  └─────────┘  └──────────┘  └─────────┘       │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Core Systems                                │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │    │
│  │  │   Tool   │  │    LSP   │  │Provider  │  │ Permission│          │    │
│  │  │  System  │  │Integration│ │  Layer   │  │  System   │          │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │    │
│  │  │Checkpoint│  │  Session │  │ Context  │  │  Memory  │           │    │
│  │  │  System  │  │  Manager │  │  Manager │  │  System  │           │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 项目结构设计

## 完整 Monorepo 结构

```
codesword/
├── packages/
│   │
│   # ==================== 核心系统 ====================
│   ├── core/                           # 核心业务逻辑包
│   │   ├── src/
│   │   │   ├── agent/                  # Agent 系统
│   │   │   │   ├── agent.ts            # Agent 基类
│   │   │   │   ├── build-agent.ts      # Build Agent
│   │   │   │   ├── plan-agent.ts       # Plan Agent
│   │   │   │   ├── general-agent.ts    # General Agent
│   │   │   │   ├── loop.ts             # Agentic Loop
│   │   │   │   └── types.ts
│   │   │   │
│   │   │   ├── tool/                   # 工具系统
│   │   │   │   ├── tool.ts             # 工具接口
│   │   │   │   ├── registry.ts         # 工具注册表
│   │   │   │   ├── orchestrator.ts     # 工具编排器
│   │   │   │   ├── tools/              # 内置工具
│   │   │   │   │   ├── file/           # 文件操作
│   │   │   │   │   │   ├── read.ts
│   │   │   │   │   │   ├── write.ts
│   │   │   │   │   │   ├── edit.ts
│   │   │   │   │   │   └── glob.ts
│   │   │   │   │   ├── search/         # 搜索工具
│   │   │   │   │   │   ├── grep.ts
│   │   │   │   │   │   └── find.ts
│   │   │   │   │   ├── execution/      # 执行工具
│   │   │   │   │   │   └── bash.ts
│   │   │   │   │   ├── web/            # Web 工具
│   │   │   │   │   │   ├── search.ts
│   │   │   │   │   │   └── fetch.ts
│   │   │   │   │   └── code-intelligence/  # 代码智能
│   │   │   │   │       └── lsp.ts
│   │   │   │   └── types.ts
│   │   │   │
│   │   │   ├── provider/               # AI Provider 集成
│   │   │   │   ├── provider.ts
│   │   │   │   ├── registry.ts
│   │   │   │   ├── providers/
│   │   │   │   │   ├── anthropic.ts
│   │   │   │   │   ├── openai.ts
│   │   │   │   │   └── google.ts
│   │   │   │   └── models.ts           # 模型目录
│   │   │   │
│   │   │   ├── permission/             # 权限系统
│   │   │   │   ├── permission.ts
│   │   │   │   ├── modes.ts            # 三种权限模式
│   │   │   │   ├── checker.ts
│   │   │   │   └── rules.ts
│   │   │   │
│   │   │   ├── session/                # 会话管理
│   │   │   │   ├── session.ts
│   │   │   │   ├── manager.ts
│   │   │   │   ├── storage.ts
│   │   │   │   ├── resume.ts           # Resume 功能
│   │   │   │   └── fork.ts             # Fork 功能
│   │   │   │
│   │   │   ├── context/                # 上下文管理
│   │   │   │   ├── context.ts
│   │   │   │   ├── manager.ts
│   │   │   │   ├── compact.ts          # 压缩策略
│   │   │   │   └── priority.ts         # 优先级管理
│   │   │   │
│   │   │   ├── config/                 # 配置管理
│   │   │   │   ├── config.ts
│   │   │   │   ├── loader.ts
│   │   │   │   └── schema.ts
│   │   │   │
│   │   │   ├── storage/                # 数据存储
│   │   │   │   ├── database.ts
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrations/
│   │   │   │
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   # ==================== 安全与恢复系统 ====================
│   ├── checkpoint/                     # Checkpoint 系统
│   │   ├── src/
│   │   │   ├── checkpoint.ts           # 快照管理
│   │   │   ├── storage.ts              # 内容寻址存储
│   │   │   ├── rollback.ts             # 回滚功能
│   │   │   └── manager.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   # ==================== 扩展系统 ====================
│   ├── skill/                          # Skills 系统
│   │   ├── src/
│   │   │   ├── skill.ts                # Skill 接口
│   │   │   ├── loader.ts               # 按需加载
│   │   │   ├── registry.ts
│   │   │   ├── parser.ts               # SKILL.md 解析
│   │   │   └── executor.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── mcp/                            # MCP 集成
│   │   ├── src/
│   │   │   ├── client.ts               # MCP 客户端
│   │   │   ├── server.ts               # MCP 服务器管理
│   │   │   ├── tool-adapter.ts         # 工具适配器
│   │   │   └── registry.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── subagent/                       # Subagent 系统
│   │   ├── src/
│   │   │   ├── subagent.ts             # Subagent 接口
│   │   │   ├── manager.ts              # 子代理管理
│   │   │   ├── factory.ts              # 子代理工厂
│   │   │   └── isolation.ts            # 上下文隔离
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── hook/                           # Hooks 系统
│   │   ├── src/
│   │   │   ├── hook.ts                 # Hook 接口
│   │   │   ├── registry.ts
│   │   │   ├── dispatcher.ts           # 事件分发
│   │   │   └── hooks/
│   │   │       ├── pre-tool.ts
│   │   │       ├── post-tool.ts
│   │   │       ├── pre-edit.ts
│   │   │       └── post-edit.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── command/                        # 斜杠命令系统
│   │   ├── src/
│   │   │   ├── command.ts              # 命令接口
│   │   │   ├── registry.ts
│   │   │   ├── parser.ts               # 命令解析
│   │   │   ├── autocomplete.ts         # 自动补全
│   │   │   └── commands/
│   │   │       ├── model.ts
│   │   │       ├── context.ts
│   │   │       ├── compact.ts
│   │   │       ├── mcp.ts
│   │   │       ├── agents.ts
│   │   │       ├── init.ts
│   │   │       ├── doctor.ts
│   │   │       └── help.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── memory/                         # 项目记忆系统
│   │   ├── src/
│   │   │   ├── memory.ts               # 记忆管理
│   │   │   ├── auto-memory.ts          # 自动记忆
│   │   │   ├── project-memory.ts       # CLAUDE.md
│   │   │   ├── storage.ts
│   │   │   └── retrieval.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   # ==================== 代码智能系统 ====================
│   ├── lsp/                            # LSP 集成
│   │   ├── src/
│   │   │   ├── client.ts               # LSP 客户端
│   │   │   ├── server.ts               # LSP 服务器管理
│   │   │   ├── pool.ts                 # 连接池
│   │   │   ├── cache.ts                # 结果缓存
│   │   │   └── languages/
│   │   │       ├── typescript.ts
│   │   │       ├── python.ts
│   │   │       ├── rust.ts
│   │   │       └── go.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   # ==================== 服务层 ====================
│   ├── server/                         # Code Server
│   │   ├── src/
│   │   │   ├── server.ts               # 服务器入口
│   │   │   ├── routes/                 # API 路由
│   │   │   │   ├── agent.ts
│   │   │   │   ├── session.ts
│   │   │   │   ├── project.ts
│   │   │   │   └── health.ts
│   │   │   ├── websocket/              # WebSocket 处理
│   │   │   │   ├── handler.ts
│   │   │   │   ├── connection.ts
│   │   │   │   └── message.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── cors.ts
│   │   │   │   └── error.ts
│   │   │   └── cli.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   # ==================== 客户端 ====================
│   ├── cli/                            # CLI 客户端
│   │   ├── src/
│   │   │   ├── cli.ts                  # CLI 入口
│   │   │   ├── commands/               # CLI 命令
│   │   │   │   ├── run.ts
│   │   │   │   ├── serve.ts
│   │   │   │   ├── chat.ts
│   │   │   │   ├── resume.ts
│   │   │   │   └── fork.ts
│   │   │   ├── tui/                    # 终端 UI
│   │   │   │   ├── interface.ts
│   │   │   │   ├── chat-view.ts
│   │   │   │   ├── status-bar.ts
│   │   │   │   └── input-handler.ts
│   │   │   ├── keymap/                 # 快捷键
│   │   │   │   └── keys.ts
│   │   │   └── output/                 # 输出格式化
│   │   │       ├── markdown.ts
│   │   │       └── syntax.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── webapp/                         # Web 应用
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── Chat/
│   │   │   │   │   ├── ChatView.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageInput.tsx
│   │   │   │   │   └── ToolCallView.tsx
│   │   │   │   ├── Sidebar/
│   │   │   │   │   ├── SessionList.tsx
│   │   │   │   │   └── FileTree.tsx
│   │   │   │   ├── Status/
│   │   │   │   │   ├── StatusBar.tsx
│   │   │   │   │   └── ContextMeter.tsx
│   │   │   │   └── Settings/
│   │   │   │       └── SettingsPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts
│   │   │   │   ├── useSession.ts
│   │   │   │   └── usePermission.ts
│   │   │   ├── stores/
│   │   │   │   ├── chat.ts
│   │   │   │   ├── settings.ts
│   │   │   │   └── ui.ts
│   │   │   └── lib/
│   │   │       └── client.ts
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ide/                            # IDE 扩展
│   │   ├── vscode/                     # VSCode 扩展
│   │   │   ├── src/
│   │   │   │   ├── extension.ts
│   │   │   │   ├── chat-view.ts
│   │   │   │   └── sidebar.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   ├── jetbrains/                  # JetBrains 插件
│   │   │   └── src/
│   │   └── package.json
│   │
│   # ==================== 通信协议 ====================
│   ├── sdk/                            # 通信协议 SDK
│   │   ├── src/
│   │   │   ├── client.ts               # 客户端 SDK
│   │   │   ├── protocol.ts             # 通信协议
│   │   │   ├── types.ts                # 共享类型
│   │   │   └── events.ts               # 事件定义
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   # ==================== 共享代码 ====================
│   ├── shared/                         # 共享工具和类型
│   │   ├── src/
│   │   │   ├── types/                  # 共享类型
│   │   │   │   ├── agent.ts
│   │   │   │   ├── tool.ts
│   │   │   │   ├── session.ts
│   │   │   │   └── message.ts
│   │   │   ├── utils/                  # 共享工具
│   │   │   │   ├── logger.ts
│   │   │   │   ├── crypto.ts
│   │   │   │   └── format.ts
│   │   │   ├── constants/              # 常量
│   │   │   │   └── index.ts
│   │   │   └── errors/                 # 错误类型
│   │   │       └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   # ==================== 工具包 ====================
│   ├── logger/                         # 日志系统
│   │   ├── src/
│   │   │   ├── logger.ts
│   │   │   ├── transport.ts
│   │   │   └── formatter.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── crypto/                         # 加密工具
│       ├── src/
│       │   ├── hash.ts
│       │   └── encryption.ts
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                        # 根 package.json
├── tsconfig.base.json                  # 基础 TypeScript 配置
├── eslint.config.js                    # ESLint 配置
├── prettier.config.js                  # Prettier 配置
├── .gitignore
├── .codesword/                         # CodeSword 项目配置
│   ├── CLAUDE.md                       # 项目记忆
│   ├── MEMORY.md                       # 自动记忆
│   ├── settings.json                   # 权限配置
│   ├── skills/                         # 项目 Skills
│   │   └── **/SKILL.md
│   └── hooks/                          # 项目 Hooks
│       └── **/*.ts
└── README.md
```

---

# 包依赖关系图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Package Dependencies                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐                                                          │
│   │   shared    │ ◄─────────────────────────────────────────────────────┐   │
│   └─────────────┘                                                          │
│         │                                                                    │
│         ├──► ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│         │    │    core     │   │ checkpoint  │   │    skill    │           │
│         │    └─────────────┘   └─────────────┘   └─────────────┘           │
│         │           │                  │                  │                 │
│         │           ├──► ┌─────────────┐   ┌─────────────┐   ┌───────────┐  │
│         │           │    │     mcp     │   │  subagent   │   │   hook    │  │
│         │           │    └─────────────┘   └─────────────┘   └───────────┘  │
│         │           │          │                  │               │         │
│         │           └───────────┼──────────────────┼───────────────┘         │
│         │                       │                  │                         │
│         │           ┌───────────▼──────────────────▼───────────────┐       │
│         │           │                    server                      │       │
│         │           └───────────────────────────────────────────────┘       │
│         │                              │                                 │       │
│         ├──► ┌─────────────┐   ┌───────▼────────┐   ┌──────────────┐      │
│         │    │     sdk     │   │      cli       │   │    webapp    │      │
│         │    └─────────────┘   └────────────────┘   └──────────────┘      │
│         │                                                                      │
│         └──► ┌─────────────┐   ┌─────────────┐                             │
│              │    lsp      │   │    ide      │                             │
│              └─────────────┘   └─────────────┘                             │
│                                                                              │
│   ┌─────────────┐   ┌─────────────┐                                         │
│   │   logger    │   │   crypto    │                                         │
│   └─────────────┘   └─────────────┘                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 各包详细设计

## 1. packages/core - 核心业务逻辑

### package.json

```json
{
  "name": "@codesword/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./agent": "./dist/agent/index.js",
    "./tool": "./dist/tool/index.js",
    "./provider": "./dist/provider/index.js",
    "./permission": "./dist/permission/index.js",
    "./session": "./dist/session/index.js",
    "./context": "./dist/context/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@codesword/shared": "workspace:*",
    "@codesword/checkpoint": "workspace:*",
    "@codesword/skill": "workspace:*",
    "@codesword/mcp": "workspace:*",
    "@codesword/subagent": "workspace:*",
    "@codesword/hook": "workspace:*",
    "@codesword/memory": "workspace:*",
    "@codesword/lsp": "workspace:*",
    "@ai-sdk/anthropic": "^0.0.40",
    "@ai-sdk/openai": "^0.0.44",
    "@ai-sdk/google": "^0.0.40",
    "ai": "^3.0.0",
    "drizzle-orm": "^0.29.0",
    "better-sqlite3": "^9.2.0",
    "zod": "^3.22.4",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.11",
    "eventemitter3": "^5.0.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8",
    "tsup": "^8.0.0",
    "typescript": "^5.3.3"
  }
}
```

### Agentic Loop 实现

```typescript
// packages/core/src/agent/loop.ts
import { z } from 'zod';
import type { Tool } from '../tool/tool.js';
import type { Context } from '../context/context.js';

export interface Task {
  id: string;
  description: string;
  isComplete: boolean;
  result?: unknown;
}

export interface Context {
  messages: Message[];
  files: FileContent[];
  projectInfo: ProjectInfo;
  tokenUsage: TokenUsage;
}

export interface ActionResult {
  toolCalls: ToolCall[];
  results: ToolResult[];
}

export interface Verification {
  success: boolean;
  errors?: string[];
  feedback?: string;
}

/**
 * Agentic Loop - 融合 Claude Code 的三阶段循环
 */
export class AgenticLoop {
  constructor(
    private tools: ToolRegistry,
    private provider: AIProvider,
    private contextManager: ContextManager
  ) {}

  /**
   * Phase 1: Gather Context
   * - Read files
   * - Search codebase
   * - Understand patterns
   */
  async gatherContext(task: Task): Promise<Context> {
    const context = await this.contextManager.create();

    // Analyze task to determine what context is needed
    const analysis = await this.analyzeTask(task);

    // Gather relevant files
    if (analysis.needsFiles) {
      const files = await this.gatherFiles(analysis.filePatterns);
      context.files = files;
    }

    // Search for relevant code patterns
    if (analysis.needsSearch) {
      const searchResults = await this.searchCodebase(analysis.searchQueries);
      context.searchResults = searchResults;
    }

    return context;
  }

  /**
   * Phase 2: Take Action
   * - Edit files
   * - Run commands
   * - Execute tools
   */
  async takeAction(context: Context, task: Task): Promise<ActionResult> {
    // Let AI decide what actions to take
    const response = await this.provider.chat({
      messages: context.messages,
      tools: this.tools.list(),
      maxTokens: 4096
    });

    // Execute tool calls
    const toolCalls = response.toolCalls || [];
    const results = await Promise.all(
      toolCalls.map(call => this.tools.execute(call.name, call.parameters))
    );

    return { toolCalls, results };
  }

  /**
   * Phase 3: Verify Results
   * - Run tests
   * - Check errors
   * - Validate changes
   */
  async verifyResults(action: ActionResult, task: Task): Promise<Verification> {
    const errors: string[] = [];

    // Check for tool execution errors
    for (const result of action.results) {
      if (result.error) {
        errors.push(result.error);
      }
    }

    // If actions included edits, verify the changes
    const hasEdits = action.toolCalls.some(c => c.name.startsWith('edit_'));
    if (hasEdits) {
      const verification = await this.runTests();
      if (!verification.passed) {
        errors.push(...verification.failures);
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Main loop - execute task with agentic loop
   */
  async run(task: Task): Promise<Task> {
    let context = await this.gatherContext(task);
    const maxIterations = 10;
    let iteration = 0;

    while (!task.isComplete && iteration < maxIterations) {
      iteration++;

      // Phase 2: Take Action
      const action = await this.takeAction(context, task);

      // Phase 3: Verify Results
      const verification = await this.verifyResults(action, task);

      if (verification.success) {
        task.isComplete = true;
        task.result = action.results;
      } else {
        // Update context with feedback and retry
        context = context.withFeedback(verification.feedback || 'Action failed, please retry');
      }
    }

    return task;
  }
}
```

---

## 2. packages/checkpoint - Checkpoint 系统

### 核心设计

```typescript
// packages/checkpoint/src/checkpoint.ts
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export interface Checkpoint {
  id: string;
  filePath: string;
  timestamp: Date;
  contentHash: string;
  previousId?: string;
}

/**
 * Checkpoint Manager - 借鉴 Claude Code 的快照系统
 */
export class CheckpointManager {
  private checkpoints = new Map<string, Checkpoint>();
  private chain = new Map<string, Checkpoint>(); // filePath -> latest checkpoint

  constructor(private storageDir: string) {}

  /**
   * Create checkpoint before editing
   */
  async checkpoint(filePath: string): Promise<string> {
    const content = await readFile(filePath, 'utf-8');
    const contentHash = createHash('sha256').update(content).digest('hex');

    // Check if content already has a checkpoint (content-addressed)
    const existing = Array.from(this.checkpoints.values())
      .find(cp => cp.contentHash === contentHash);
    if (existing) {
      return existing.id;
    }

    const checkpoint: Checkpoint = {
      id: createHash('sha256').update(filePath + Date.now()).digest('hex'),
      filePath,
      timestamp: new Date(),
      contentHash,
      previousId: this.chain.get(filePath)?.id
    };

    // Store checkpoint
    await this.store(checkpoint, content);

    this.checkpoints.set(checkpoint.id, checkpoint);
    this.chain.set(filePath, checkpoint);

    return checkpoint.id;
  }

  /**
   * Rewind to previous state
   */
  async rewind(filePath: string, steps: number = 1): Promise<void> {
    let current = this.chain.get(filePath);
    if (!current) {
      throw new Error(`No checkpoint found for ${filePath}`);
    }

    // Walk back N steps
    for (let i = 0; i < steps; i++) {
      if (!current.previousId) break;
      current = this.checkpoints.get(current.previousId)!;
    }

    if (!current) {
      throw new Error(`Cannot rewind ${steps} steps`);
    }

    // Restore content
    const content = await this.load(current);
    await writeFile(filePath, content, 'utf-8');

    // Update chain pointer
    this.chain.set(filePath, current);
  }

  /**
   * List all checkpoints for a file
   */
  list(filePath: string): Checkpoint[] {
    const checkpointIds: string[] = [];
    let current = this.chain.get(filePath);
    while (current) {
      checkpointIds.push(current.id);
      current = current.previousId ? this.checkpoints.get(current.previousId)! : undefined;
    }
    return checkpointIds.map(id => this.checkpoints.get(id)!);
  }

  /**
   * Clear old checkpoints
   */
  async clear(olderThan?: Date): Promise<void> {
    const cutoff = olderThan || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

    for (const [id, checkpoint] of this.checkpoints) {
      if (checkpoint.timestamp < cutoff) {
        await this.delete(checkpoint);
        this.checkpoints.delete(id);
      }
    }
  }

  private async store(checkpoint: Checkpoint, content: string): Promise<void> {
    const dir = join(this.storageDir, checkpoint.id.slice(0, 2));
    await mkdir(dir, { recursive: true });

    const metaPath = join(dir, `${checkpoint.id.slice(2)}.meta.json`);
    const contentPath = join(dir, `${checkpoint.id.slice(2)}.content`);

    await writeFile(metaPath, JSON.stringify(checkpoint), 'utf-8');
    await writeFile(contentPath, content, 'utf-8');
  }

  private async load(checkpoint: Checkpoint): Promise<string> {
    const dir = join(this.storageDir, checkpoint.id.slice(0, 2));
    const contentPath = join(dir, `${checkpoint.id.slice(2)}.content`);
    return readFile(contentPath, 'utf-8');
  }

  private async delete(checkpoint: Checkpoint): Promise<void> {
    const dir = join(this.storageDir, checkpoint.id.slice(0, 2));
    const metaPath = join(dir, `${checkpoint.id.slice(2)}.meta.json`);
    const contentPath = join(dir, `${checkpoint.id.slice(2)}.content`);

    // Delete files (implement actual delete)
  }
}
```

---

## 3. packages/skill - Skills 系统

### 核心设计

```typescript
// packages/skill/src/skill.ts
import { z } from 'zod';
import type { Tool } from '@codesword/core/tool';

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  disableModelInvocation?: boolean; // Don't include in context until used
}

export interface Skill {
  metadata: SkillMetadata;
  tools?: Tool[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

/**
 * Skill Loader - 按需加载 Skills
 */
export class SkillLoader {
  private skills = new Map<string, Skill>();
  private loaded = new Set<string>();

  constructor(private skillPaths: string[]) {}

  /**
   * Discover all skills in the skill paths
   */
  async discover(): Promise<SkillMetadata[]> {
    const metadatas: SkillMetadata[] = [];

    for (const skillPath of this.skillPaths) {
      // Scan for SKILL.md files
      const skillFiles = await this.findSkillFiles(skillPath);

      for (const file of skillFiles) {
        const metadata = await this.parseSkillMetadata(file);
        metadatas.push(metadata);
        this.skills.set(metadata.name, { metadata });
      }
    }

    return metadatas;
  }

  /**
   * Load a skill on-demand
   */
  async load(name: string): Promise<Skill> {
    if (this.loaded.has(name)) {
      return this.skills.get(name)!;
    }

    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill not found: ${name}`);
    }

    // Execute setup if defined
    if (skill.setup) {
      await skill.setup();
    }

    this.loaded.add(name);
    return skill;
  }

  /**
   * Unload a skill
   */
  async unload(name: string): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) return;

    if (skill.teardown) {
      await skill.teardown();
    }

    this.loaded.delete(name);
  }

  private async findSkillFiles(dir: string): Promise<string[]> {
    // Implementation for finding SKILL.md files
    return [];
  }

  private async parseSkillMetadata(file: string): Promise<SkillMetadata> {
    // Parse SKILL.md frontmatter
    const content = await readFile(file, 'utf-8');
    const frontmatter = this.extractFrontmatter(content);
    return JSON.parse(frontmatter);
  }

  private extractFrontmatter(content: string): string {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : '{}';
  }
}
```

---

## 4. packages/mcp - MCP 集成

### 核心设计

```typescript
// packages/mcp/src/tool-adapter.ts
import type { Tool } from '@codesword/core/tool';
import type { MCPClient } from './client.js';

/**
 * Adapt MCP tools to CodeSword tools
 */
export class MCPToolAdapter {
  constructor(private mcpClient: MCPClient) {}

  /**
   * Convert MCP tools to CodeSword tools
   */
  adaptTools(): Tool[] {
    const mcpTools = this.mcpClient.listTools();

    return mcpTools.map(mcpTool => ({
      metadata: {
        name: mcpTool.name,
        description: mcpTool.description,
        category: this.inferCategory(mcpTool),
        readOnly: mcpTool.name.startsWith('get_') || mcpTool.name.startsWith('list_'),
        hasSideEffects: !mcpTool.name.startsWith('get_') && !mcpTool.name.startsWith('list_'),
        contextCost: mcpTool.inputSchema ? JSON.stringify(mcpTool.inputSchema).length / 4 : 0
      },
      inputSchema: this.convertSchema(mcpTool.inputSchema),
      async execute(input: unknown) {
        return this.mcpClient.callTool(mcpTool.name, input);
      }
    }));
  }

  private inferCategory(tool: any): string {
    // Infer tool category from name and description
    if (tool.name.includes('file') || tool.name.includes('read') || tool.name.includes('write')) {
      return 'file_operations';
    }
    if (tool.name.includes('search') || tool.name.includes('find')) {
      return 'search';
    }
    if (tool.name.includes('http') || tool.name.includes('fetch') || tool.name.includes('web')) {
      return 'web';
    }
    return 'execution';
  }

  private convertSchema(mcpSchema: any): z.ZodType {
    // Convert JSON Schema to Zod
    // Implementation omitted for brevity
    return z.any();
  }
}
```

---

## 5. packages/subagent - Subagent 系统

### 核心设计

```typescript
// packages/subagent/src/subagent.ts
import type { Agent } from '@codesword/core/agent';
import type { Session } from '@codesword/core/session';

export interface SubagentConfig {
  name: string;
  description: string;
  model?: string;
  systemPrompt?: string;
  tools?: string[]; // Tool names to include
  maxTokens?: number;
}

/**
 * Subagent - Isolated agent context for delegated work
 */
export class Subagent implements Agent {
  private session: Session;

  constructor(
    private config: SubagentConfig,
    private agentFactory: AgentFactory
  ) {
    // Create isolated session
    this.session = this.createIsolatedSession();
  }

  /**
   * Execute task in isolated context
   */
  async execute(task: string): Promise<string> {
    // Create agent with isolated context
    const agent = this.agentFactory.create({
      model: this.config.model,
      systemPrompt: this.config.systemPrompt,
      tools: this.config.tools
    });

    // Execute in isolated session
    const result = await agent.run(task, this.session);

    // Cleanup session
    await this.session.close();

    return result;
  }

  private createIsolatedSession(): Session {
    // Create session with fresh context window
    return new Session({
      isolated: true,
      parentSession: null
    });
  }
}

/**
 * Subagent Manager
 */
export class SubagentManager {
  private subagents = new Map<string, Subagent>();

  register(config: SubagentConfig): void {
    const subagent = new Subagent(config, this.agentFactory);
    this.subagents.set(config.name, subagent);
  }

  async execute(name: string, task: string): Promise<string> {
    const subagent = this.subagents.get(name);
    if (!subagent) {
      throw new Error(`Subagent not found: ${name}`);
    }
    return subagent.execute(task);
  }

  list(): SubagentConfig[] {
    return Array.from(this.subagents.values()).map(s => s.config);
  }
}
```

---

## 6. packages/hook - Hooks 系统

### 核心设计

```typescript
// packages/hook/src/hook.ts
export type HookType =
  | 'pre-tool'      // Before tool execution
  | 'post-tool'     // After tool execution
  | 'pre-edit'      // Before file edit
  | 'post-edit'     // After file edit
  | 'pre-commit'    // Before git commit
  | 'post-commit'   // After git commit
  | 'on-start'      // On session start
  | 'on-end';       // On session end

export interface Hook<T = any> {
  type: HookType;
  name: string;
  handler: (context: T) => Promise<void>;
  priority?: number; // Higher = earlier execution
}

/**
 * Hook Dispatcher
 */
export class HookDispatcher {
  private hooks = new Map<HookType, Hook[]>();

  register<T>(hook: Hook<T>): void {
    const hooks = this.hooks.get(hook.type) || [];
    hooks.push(hook);
    hooks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.hooks.set(hook.type, hooks);
  }

  async dispatch<T>(type: HookType, context: T): Promise<void> {
    const hooks = this.hooks.get(type) || [];

    for (const hook of hooks) {
      try {
        await hook.handler(context);
      } catch (error) {
        console.error(`Hook ${hook.name} failed:`, error);
      }
    }
  }
}
```

---

## 7. packages/memory - 项目记忆系统

### 核心设计

```typescript
// packages/memory/src/project-memory.ts
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export interface ProjectMemory {
  claude?: string;   // CLAUDE.md content
  auto?: string;     // MEMORY.md content
}

/**
 * Project Memory Manager
 */
export class ProjectMemoryManager {
  private memoryPath: string;
  private claudePath: string;
  private memory: ProjectMemory = {};

  constructor(projectRoot: string) {
    const codeswordDir = join(projectRoot, '.codesword');
    this.memoryPath = join(codeswordDir, 'MEMORY.md');
    this.claudePath = join(codeswordDir, 'CLAUDE.md');
  }

  /**
   * Load project memory
   */
  async load(): Promise<ProjectMemory> {
    try {
      this.memory.claude = await readFile(this.claudePath, 'utf-8');
    } catch {
      // File doesn't exist
    }

    try {
      const fullMemory = await readFile(this.memoryPath, 'utf-8');
      // Only load first 200 lines
      const lines = fullMemory.split('\n');
      this.memory.auto = lines.slice(0, 200).join('\n');
    } catch {
      // File doesn't exist
    }

    return this.memory;
  }

  /**
   * Append to auto memory
   */
  async appendAutoMemory(content: string): Promise<void> {
    const existing = this.memory.auto || '';
    const lines = existing.split('\n');
    const newLines = content.split('\n');

    // Keep only last 200 lines
    const combined = [...lines, ...newLines].slice(-200);
    this.memory.auto = combined.join('\n');

    await writeFile(this.memoryPath, this.memory.auto, 'utf-8');
  }

  /**
   * Get memory for system prompt
   */
  getSystemMemory(): string {
    const parts: string[] = [];

    if (this.memory.claude) {
      parts.push('## Project Instructions (CLAUDE.md)\n');
      parts.push(this.memory.claude);
      parts.push('\n');
    }

    if (this.memory.auto) {
      parts.push('## Auto Memory\n');
      parts.push(this.memory.auto);
    }

    return parts.join('\n');
  }
}
```

---

## 8. packages/command - 斜杠命令系统

### 核心设计

```typescript
// packages/command/src/command.ts
import { z } from 'zod';

export interface CommandContext {
  session: Session;
  agent: Agent;
  project: ProjectInfo;
  args: Record<string, unknown>;
}

export interface SlashCommand {
  name: string;
  description: string;
  schema?: z.ZodType; // Argument schema
  handler: (context: CommandContext) => Promise<string | void>;
  autocomplete?: (partial: string) => string[];
  permission?: PermissionMode; // Required permission mode
}

/**
 * Command Registry
 */
export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
  }

  async execute(name: string, args: Record<string, unknown>, context: CommandContext): Promise<string> {
    const command = this.commands.get(name);
    if (!command) {
      throw new Error(`Unknown command: ${name}`);
    }

    // Validate args if schema provided
    if (command.schema) {
      context.args = command.schema.parse(args);
    } else {
      context.args = args;
    }

    const result = await command.handler(context);
    return result || `Command ${name} executed`;
  }

  list(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  autocomplete(partial: string): string[] {
    const [name] = partial.split(' ');
    const command = this.commands.get(name);
    return command?.autocomplete?.(partial) || [];
  }
}
```

---

## 9. packages/lsp - LSP 集成

### 核心设计

```typescript
// packages/lsp/src/pool.ts
import { spawn } from 'child_process';
import { createClient } from 'vscode-languageclient/client';

export interface LSPServerConfig {
  language: string;
  command: string;
  args?: string[];
  cwd?: string;
}

/**
 * LSP Connection Pool
 */
export class LSPConnectionPool {
  private connections = new Map<string, any>();

  async get(config: LSPServerConfig) {
    const key = `${config.language}:${config.cwd || '.'}`;

    if (this.connections.has(key)) {
      return this.connections.get(key);
    }

    // Spawn LSP server
    const serverProcess = spawn(config.command, config.args || [], {
      cwd: config.cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create language client
    const client = createClient({
      stdio: serverProcess.stdin
    });

    await client.onReady();

    this.connections.set(key, client);
    return client;
  }

  async close(language: string, cwd?: string): Promise<void> {
    const key = `${language}:${cwd || '.'}`;
    const client = this.connections.get(key);
    if (client) {
      await client.stop();
      this.connections.delete(key);
    }
  }

  async closeAll(): Promise<void> {
    for (const client of this.connections.values()) {
      await client.stop();
    }
    this.connections.clear();
  }
}
```

---

## 10. packages/context - 上下文管理

### 核心设计

```typescript
// packages/context/src/compact.ts
export enum CompactStrategy {
  CLEAR_OLD_OUTPUTS = 'clear_old_outputs',
  SUMMARIZE_CONVERSATION = 'summarize',
  DISCARD_EARLY_INSTRUCTIONS = 'discard_early'
}

export interface ContextItem {
  type: 'message' | 'file' | 'tool_result' | 'instruction';
  content: string;
  tokens: number;
  priority: number; // Higher = more important
  timestamp: Date;
}

/**
 * Context Manager
 */
export class ContextManager {
  private items: ContextItem[] = [];
  private maxTokens: number;

  constructor(maxTokens: number = 200000) {
    this.maxTokens = maxTokens;
  }

  add(item: ContextItem): void {
    this.items.push(item);
  }

  getTokenUsage(): { used: number; remaining: number } {
    const used = this.items.reduce((sum, item) => sum + item.tokens, 0);
    return { used, remaining: this.maxTokens - used };
  }

  async compact(strategy: CompactStrategy, focus?: string): Promise<void> {
    switch (strategy) {
      case CompactStrategy.CLEAR_OLD_OUTPUTS:
        this.clearOldOutputs();
        break;
      case CompactStrategy.SUMMARIZE_CONVERSATION:
        await this.summarizeConversation(focus);
        break;
      case CompactStrategy.DISCARD_EARLY_INSTRUCTIONS:
        this.discardEarlyInstructions();
        break;
    }
  }

  private clearOldOutputs(): void {
    const now = Date.now();
    const threshold = now - 30 * 60 * 1000; // 30 minutes ago

    this.items = this.items.filter(item => {
      if (item.type === 'tool_result' && item.timestamp.getTime() < threshold) {
        return false;
      }
      return true;
    });
  }

  private async summarizeConversation(focus?: string): Promise<void> {
    // Summarize conversation with AI
    // Implementation omitted
  }

  private discardEarlyInstructions(): void {
    // Keep only high-priority items
    this.items = this.items.filter(item => item.priority >= 5);
  }

  prioritize(items: ContextItem[]): ContextItem[] {
    return items.sort((a, b) => b.priority - a.priority);
  }
}
```

---

# 技术选型总结

| 层次 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js 20+ LTS | 稳定版本 |
| 包管理 | npm workspaces | 内置 monorepo |
| 语言 | TypeScript 5.8+ | 类型安全 |
| 构建 | tsup + esbuild | 快速构建 |
| 任务编排 | npm-run-all | 跨包任务 |
| 后端 | Fastify | Web 服务器 |
| 数据库 | Better-SQLite3 + Drizzle ORM | 嵌入式数据库 |
| 前端 | React 18 + Vite | UI 框架 |
| AI SDK | Vercel AI SDK | 统一 AI 接口 |
| LSP | vscode-languageserver | LSP 协议 |

---

# 总结

CodeSword 完整融合了 **OpenCode** 和 **Claude Code** 的核心设计：

## 包数量：16 个

### 核心系统 (1)
- `@codesword/core` - Agent、Tool、Provider、Permission、Session、Context

### 安全与恢复 (1)
- `@codesword/checkpoint` - 文件快照和回滚

### 扩展系统 (5)
- `@codesword/skill` - Skills 工作流
- `@codesword/mcp` - MCP 外部服务
- `@codesword/subagent` - 子代理
- `@codesword/hook` - Hooks 事件系统
- `@codesword/command` - 斜杠命令

### 记忆系统 (1)
- `@codesword/memory` - CLAUDE.md 和 MEMORY.md

### 代码智能 (1)
- `@codesword/lsp` - LSP 集成

### 服务层 (1)
- `@codesword/server` - Code Server

### 客户端 (4)
- `@codesword/cli` - CLI 客户端
- `@codesword/webapp` - Web 应用
- `@codesword/ide` - IDE 扩展 (vscode, jetbrains)

### 通信 (1)
- `@codesword/sdk` - 通信协议

### 共享 (2)
- `@codesword/shared` - 共享类型和工具
- `@codesword/logger` - 日志系统
- `@codesword/crypto` - 加密工具

---

*文档生成时间: 2026-03-23*
