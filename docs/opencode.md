# OpenCode 代码架构分析

## 项目概述

**OpenCode** 是一个开源的 AI 驱动开发工具和编码助手。它是一个基于终端的 IDE 助手，提供 AI 驱动的代码补全、重构和开发辅助功能。项目采用 **Bun workspaces** 构建的 monorepo 架构，使用 **Turbo** 进行构建编排。

### 核心特性
- **类型**: AI 驱动的编码代理和开发工具
- **架构**: Monorepo 模块化架构
- **主要方向**: 终端用户界面 (TUI) + 桌面和 Web 客户端
- **许可证**: MIT (完全开源)
- **规模**: 核心包约 270 个 TypeScript 文件，约 35,500 行代码，219 个测试文件

## 技术栈

### 核心技术
| 技术 | 版本 | 用途 |
|------|------|------|
| Bun | 1.3+ | JavaScript 运行时 |
| TypeScript | 5.8.2 | 主要开发语言 |
| Turbo | - | Monorepo 构建编排 |
| Bun Workspaces | - | 包管理 |

### 前端/用户界面
| 技术 | 版本 | 用途 |
|------|------|------|
| SolidJS | 1.9.10 | 响应式 UI 框架 |
| OpenTUI | 0.1.90 | 终端 UI 组件库 |
| TailwindCSS | 4.1.11 | 样式系统 |
| Tauri | 2.x | 桌面应用框架 |
| Vite | 7.1.4 | 前端构建工具 |
| Astro | 5.7.13 | 文档网站生成 |

### 后端/基础设施
| 技术 | 版本 | 用途 |
|------|------|------|
| Hono | 4.10.7 | 轻量级 Web 框架 |
| Drizzle ORM | - | 数据库 ORM |
| SQLite | - | 嵌入式数据库 |
| SST | - | Serverless 部署 |
| OpenAuthJS | - | 身份认证 |
| Stripe | - | 支付集成 |

### AI/LLM 集成
| 技术 | 版本 | 用途 |
|------|------|------|
| Vercel AI SDK | 5.0.124 | AI 模型集成 |
| 多提供商支持 | - | Anthropic, OpenAI, Google, Groq, Mistral 等 |
| models.dev | - | 综合模型目录 |

### 开发工具
| 工具 | 用途 |
|------|------|
| LSP | 语言服务器协议集成 |
| tree-sitter | 代码解析 |
| @pierre/diffs | 代码差异处理 |
| Playwright | E2E 测试 |

## 包结构

Monorepo 包含 20+ 个包，按类别组织：

### 核心包

```
opencode/
├── packages/
│   ├── opencode/          # 主 CLI 应用
│   ├── app/               # Web 应用客户端
│   ├── desktop/           # 桌面应用 (Tauri)
│   ├── ui/                # 共享 UI 组件
│   ├── sdk/js/            # JavaScript/TypeScript SDK
│   ├── util/              # 共享工具函数
│   └── plugin/            # 插件系统
```

### 核心包详解

#### 1. `packages/opencode` - 主 CLI 应用
- **入口点**: [`packages/opencode/src/index.ts`](../packages/opencode/src/index.ts)
- **二进制文件**: `opencode` CLI 工具
- **内容**: 核心代理逻辑、工具系统、TUI
- **规模**: 270 个 TypeScript 文件，约 35,500 行代码

#### 2. `packages/app` - Web 应用客户端
- **技术**: SolidJS
- **构建**: Vite
- **测试**: Playwright E2E

#### 3. `packages/desktop` - 桌面应用
- **技术**: Tauri 2.x (Rust)
- **平台**: macOS, Windows, Linux

#### 4. `packages/ui` - 共享 UI 组件
- **技术**: SolidJS + TailwindCSS
- **用途**: 跨 app/desktop 共享组件

### 管理包

```
opencode/
├── packages/console/
│   ├── app/           # Web 管理控制台
│   ├── core/          # 核心业务逻辑
│   ├── function/      # Serverless 函数
│   ├── mail/          # 邮件服务
│   └── resource/      # 资源管理
├── packages/web/      # 文档网站 (Astro)
├── packages/function/  # 云函数
├── packages/enterprise/  # 企业功能
├── packages/script/   # 共享构建脚本
└── packages/slack/    # Slack 集成
```

### 基础设施包

```
opencode/
├── packages/containers/  # Docker 容器
└── packages/sdk/         # 通信协议 SDK
```

## 架构模式

### 1. Monorepo 架构

```
┌─────────────────────────────────────────────────────┐
│                   Turbo Build System                 │
├─────────────────────────────────────────────────────┤
│                   Bun Workspaces                     │
├─────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│  │opencode│ │ app  │ │desktop│ │ ui   │ │ sdk  │ ... │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │
└─────────────────────────────────────────────────────┘
```

- **工作区管理**: Bun workspaces + catalog 依赖管理
- **构建编排**: Turbo 并行构建和缓存
- **共享依赖**: 集中式依赖管理

### 2. 客户端/服务器架构

```
┌────────────────────────────────────────────────────────┐
│                     OpenCode Server                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│  │   Agent    │  │   Tool     │  │   LSP      │      │
│  │   System   │  │   System   │  │ Integration│      │
│  └────────────┘  └────────────┘  └────────────┘      │
├────────────────────────────────────────────────────────┤
│              WebSocket + REST API                      │
├───────────┬──────────────┬──────────────┬─────────────┤
│           │              │              │             │
┌──────────┴───┐  ┌────────┴─────┐  ┌────┴──────────┐ │
│ CLI / TUI    │  │  Web App     │  │  Desktop App  │ │
└──────────────┘  └──────────────┘  └───────────────┘ │
```

- **无头服务器**: `opencode serve` 独立运行后端
- **多客户端**: CLI TUI、Web、桌面连接同一后端
- **WebSocket**: 实时双向通信
- **REST API**: 客户端操作端点

### 3. Agent 系统

#### Agent 类型
| 类型 | 用途 |
|------|------|
| Build Agent | 完全访问权限的开发工作 |
| Plan Agent | 只读的分析和探索 |
| General Agent | 复杂多步骤子任务 |

#### Agent 组件
```
┌──────────────────────────────────────────────────┐
│                   Agent Core                      │
├──────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │  Tool   │ │Permission│ │  Prompt │ │Provider│ │
│  │ System  │ │  System  │ │Engineer.│ │Abstraction││
│  └─────────┘ └─────────┘ └─────────┘ └────────┘ │
└──────────────────────────────────────────────────┘
```

### 4. 工具系统

位置: [`packages/opencode/src/tool/`](../packages/opencode/src/tool/)

#### 核心工具分类

| 类别 | 工具 |
|------|------|
| **文件操作** | Read, Write, Edit, Glob, Grep, Ls |
| **代码操作** | ApplyPatch, MultiEdit, CodeSearch |
| **执行** | Bash (shell 命令执行) |
| **Web** | WebFetch, WebSearch |
| **规划** | Plan, Task, Todo (任务管理) |
| **LSP 集成** | 语言服务器协议支持 |
| **Skills** | 自定义技能执行 |

#### 工具特性
- Zod Schema 验证
- 权限感知
- 大输出截断保护
- 异步设计

### 5. Provider 系统

位置: [`packages/opencode/src/provider/`](../packages/opencode/src/provider/)

```
┌─────────────────────────────────────────────────────┐
│                   Provider Layer                     │
├─────────────────────────────────────────────────────┤
│  Anthropic │ OpenAI │ Google │ Groq │ Mistral │ ... │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                  Provider Transformation             │
├─────────────────────────────────────────────────────┤
│              Unified Interface / Models.dev          │
└─────────────────────────────────────────────────────┘
```

**特性**:
- 多提供商支持
- 模型目录 (动态从 models.dev 获取)
- 统一接口
- OAuth 和 API Key 认证

### 6. 存储架构

```
┌─────────────────────────────────────────────────────┐
│                    SQLite + Drizzle                  │
├─────────────────────────────────────────────────────┤
│  Projects │ Sessions │ Messages │ Permissions       │
│  Accounts │ Billing  │ Subscriptions │ MCP/Skills  │
└─────────────────────────────────────────────────────┘
```

**特性**:
- SQLite + Drizzle ORM
- 时间戳 SQL 迁移
- JSON 到 SQLite 迁移
- 按发布频道分离数据库

### 7. LSP 集成

位置: [`packages/opencode/src/lsp/`](../packages/opencode/src/lsp/)

**能力**:
- 多语言支持 (TypeScript, Python, Rust, Go 等)
- 实时代码分析 (补全、诊断、符号)
- LSP 服务器进程管理
- 标准 LSP 协议实现

### 8. 权限系统

位置: [`packages/opencode/src/permission/`](../packages/opencode/src/permission/)

```
┌─────────────────────────────────────────────────────┐
│                   Permission Rules                   │
├─────────────────────────────────────────────────────┤
│  Pattern Matching ──► Allow │ Deny │ Ask            │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              Per-Agent / Tool-Specific               │
└─────────────────────────────────────────────────────┘
```

**特性**:
- 基于规则的权限控制
- 三种操作: Allow, Deny, Ask (用户确认)
- 按代理分离的权限规则
- 工具和资源细粒度控制

### 9. 配置系统

位置: [`packages/opencode/src/config/`](../packages/opencode/src/config/)

**配置来源**:
- 项目级 `.opencode/` 目录
- 用户级配置
- 环境变量
- TUI 特定设置

**配置类型**:
- Agent 配置
- Provider 设置
- 工具权限
- 项目设置
- UI 自定义

### 10. 会话管理

位置: [`packages/opencode/src/session/`](../packages/opencode/src/session/)

**特性**:
- 消息历史持久化
- 结构化消息 (文本、工具调用、文件)
- 动态系统提示生成
- 上下文窗口管理

### 11. Skill 系统

位置: [`packages/opencode/src/skill/`](../packages/opencode/src/skill/)

**发现机制**:
- 本地 Skills: `.opencode/skills/**/SKILL.md`
- 外部 Skills: `.claude/skills/**/SKILL.md`
- Schema 验证

### 12. MCP 集成

位置: [`packages/opencode/src/mcp/`](../packages/opencode/src/mcp/)

**特性**:
- MCP 服务器管理
- 将 MCP 工具暴露为代理工具
- 不同 MCP 服务器类型的适配器

## 主要目录结构

```
opencode/src/
├── account/          # 账户管理和认证
├── acp/             # Agent Client Protocol (ACP) 实现
├── agent/           # Agent 逻辑和提示工程
├── auth/            # 认证处理器
├── bus/             # 事件总线 (组件间通信)
├── cli/             # CLI 命令和界面
├── command/         # 自定义命令系统
├── config/          # 配置管理
├── control-plane/   # 工作区和服务器管理
├── effect/          # Effect 依赖注入
├── env/             # 环境变量处理
├── file/            # 文件操作和实用程序
├── filesystem/      # 文件系统抽象
├── flag/            # 功能标志和 CLI 标志
├── format/          # 代码格式化集成
├── global/          # 全局状态和常量
├── ide/             # IDE 集成实用程序
├── installation/    # 安装和版本管理
├── lsp/             # Language Server Protocol 集成
├── mcp/             # Model Context Protocol 集成
├── patch/           # 补丁应用实用程序
├── permission/      # 权限系统
├── plugin/          # 插件系统
├── project/         # 项目和工作区管理
├── provider/        # AI provider 集成
├── pty/             # 伪终端 (shell 命令)
├── question/        # 交互式问题提示
├── server/          # HTTP/WebSocket 服务器
├── session/         # 会话和消息管理
├── share/           # 共享和协作
├── shell/           # Shell 命令执行
├── skill/           # Skill 系统
├── snapshot/        # 快照管理
├── storage/         # 数据库和存储
├── tool/            # 工具系统
└── util/            # 实用工具函数
```

## 入口点和主要模块

### CLI 入口点
**文件**: [`packages/opencode/src/index.ts`](../packages/opencode/src/index.ts)

主要命令:
- `opencode run` - 启动 TUI 会话
- `opencode serve` - 启动服务器
- `opencode web` - 启动 Web 应用
- `opencode account` - 账户管理
- `opencode providers` - Provider 管理
- `opencode agent` - Agent 管理
- `opencode models` - 模型列表

### 服务器入口点
**文件**: [`packages/opencode/src/server/server.ts`](../packages/opencode/src/server/server.ts)

- Hono HTTP 服务器
- WebSocket 实时通信
- REST API 端点
- OpenAPI 规范生成

### Web 应用入口点
**文件**: [`packages/app/src/index.ts`](../packages/app/src/index.ts)

- SolidJS 应用
- Vite 开发服务器
- 生产构建优化

### 桌面应用入口点
**文件**: [`packages/desktop/src-tauri/src/main.rs`](../packages/desktop/src-tauri/src/main.rs)

- Rust 桌面应用
- Tauri 框架集成
- 原生 OS 功能

## 开发工作流

### 构建系统
```bash
# 安装依赖
bun install

# 开发模式
bun dev

# 类型检查
bun turbo typecheck

# 构建
bun run build

# 测试
bun test
```

### 关键脚本
| 脚本 | 用途 |
|------|------|
| `bun dev` | 开发模式启动 opencode |
| `bun dev:desktop` | 启动桌面应用 |
| `bun dev:web` | 启动 Web 应用 |
| `bun dev:console` | 启动管理控制台 |
| `bun typecheck` | 类型检查所有包 |

## 架构亮点

### 1. 模块化设计
- 关注点清晰分离
- 可复用包
- 组件间最小耦合

### 2. 可扩展性
- 插件系统 (自定义工具)
- Skill 系统 (自定义代理行为)
- MCP 集成 (外部工具)
- Provider 抽象 (AI 模型)

### 3. 多平台支持
```
┌─────────────────────────────────────────────────────┐
│                    OpenCode Core                     │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ CLI/TUI  │ │ Desktop  │ │      Web App       │  │
│  └──────────┘ └──────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 4. 性能优化
- 并行工具执行
- 大输出截断
- 高效上下文管理
- 懒加载和代码分割

### 5. 开发者体验
- TypeScript 类型安全
- 开发模式热重载
- 全面的错误处理
- 详细的日志和调试

### 6. 测试策略
- Bun test 框架单元测试
- Playwright E2E 测试
- 219 个测试文件
- 最小化 Mock

## 主要依赖

### 生产依赖
```json
{
  "solid-js": "响应式 UI 框架",
  "hono": "Web 服务器框架",
  "drizzle-orm": "数据库 ORM",
  "ai": "Vercel AI SDK",
  "zod": "Schema 验证",
  "effect": "函数式编程框架",
  "@opentui/*": "终端 UI 组件"
}
```

### 开发依赖
```json
{
  "typescript": "类型检查",
  "vite": "构建工具",
  "tailwindcss": "样式",
  "playwright": "E2E 测试",
  "turbo": "构建编排"
}
```

## 总结

OpenCode 是一个精密的、生产就绪的 AI 编码助手，具有架构良好的 monorepo 结构。它展示了优秀的软件工程实践，包括：

- **模块化设计**: 清晰的关注点分离
- **全面测试**: 单元和 E2E 测试覆盖
- **多平台支持**: CLI、Web、桌面
- **可扩展性**: 插件、Skills、MCP 集成
- **权限控制**: 细粒度操作控制

代码库主要是 TypeScript，桌面应用使用一些 Rust。它利用现代 Web 技术提供响应式终端 UI。

架构围绕客户端/服务器模型设计，核心代理逻辑运行在服务器上，可以通过多个客户端 (CLI TUI、Web、桌面) 访问。工具系统模块化且可扩展，支持从文件操作到代码分析和网络搜索的广泛操作。

---

*生成时间: 2026-03-23*
