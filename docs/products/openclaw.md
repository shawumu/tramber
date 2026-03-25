# OpenClaw 架构文档

## 项目概述

**OpenClaw** 是一个自托管的 AI 智能体网关，用于连接消息平台（WhatsApp、Telegram、Discord、iMessage、Slack 等）与 AI 智能体。它作为一个可在个人硬件上运行的 AI 助手，完全由用户控制规则。

- **许可证**: MIT
- **主要语言**: TypeScript (Node.js)
- **运行时**: Node 24 (推荐) 或 Node 22.16+
- **包管理器**: pnpm (monorepo workspace)
- **构建系统**: tsdown (TypeScript 打包器)

---

## 目录结构

### 根目录 (`/`)
```
openclaw/
├── src/                    # 核心源代码
├── extensions/             # 90+ 扩展插件（channels、providers、tools）
├── apps/                   # 原生移动/桌面应用程序
├── ui/                     # Web 控制面板 UI
├── test/                   # 端到端和集成测试
├── test-fixtures/          # 测试 fixtures 和 mocks
├── scripts/                # 构建和工具脚本
├── skills/                 # 内置 agent 技能
├── docs/                   # 文档 (Mint 驱动)
├── vendor/                 # 第三方代码 (a2ui)
├── packages/               # 遗留兼容包
├── patches/                # 依赖补丁
├── git-hooks/              # Git hook 脚本
└── dist/                   # 构建输出（生成）
```

---

## 核心源代码结构 (`src/`)

核心代码组织成 49 个主要目录：

### 网关与控制平面
- **`gateway/`** - 主网关服务器、WebSocket 控制平面、HTTP 端点、认证、事件、hooks、控制 UI、客户端看门狗、配置重载
- **`cli/`** - 命令行界面（100+ 命令，用于 gateway、agent、config、channels 等）
- **`daemon/`** - 守护进程/服务管理（launchd、systemd）
- **`config/`** - 配置 schema、加载、验证、密钥管理

### 渠道与消息传递
- **`channels/`** - 渠道插件注册表、配置、绑定路由、消息操作、组策略、媒体负载、合约
- **`line/`** - LINE 消息平台集成

### 插件系统
- **`plugins/`** - 插件加载器、注册表、CLI 注册、HTTP 路由、清单处理、运行时、生命周期、安全扫描、市场
- **`plugin-sdk/`** - 第三方插件的公共 SDK（类型、运行时、helpers）

### 智能体与会话管理
- **`agents/`** - 智能体子系统（Pi agent 集成、子智能体、RPC 模式）
- **`sessions/`** - 会话管理、隔离、路由

### 安全与防护
- **`security/`** - 安全策略、SSRF 保护、执行审批
- **`pairing/`** - 设备配对、DM 配对、允许列表管理
- **`bootstrap/`** - 引导和入门流程
- **`wizard/`** - 设置向导 CLI

### 核心运行时
- **`acp/`** - Agent Client Protocol (ACP) 绑定
- **`hooks/`** - Hook 系统（before/after 阶段、生命周期事件）
- **`cron/`** - Cron 任务调度和执行
- **`commands/`** - 命令注册和执行
- **`context-engine/`** - 上下文检索、记录重写、维护
- **`memory/`** - 内存插件（搜索、向量 DB）
- **`routing/`** - 请求路由到智能体/渠道
- **`infra/`** - 基础设施（环境变量、错误、路径、进程、密钥）

### 媒体与内容
- **`media/`** - 媒体管道、处理、限制、转录
- **`media-understanding/`** - 图像/音频分析提供商
- **`image-generation/`** - 图像生成提供商
- **`markdown/`** - Markdown 渲染和格式化
- **`link-understanding/`** - 链接抓取和摘要

### 工具与能力
- **`browser/`** - 浏览器自动化（Playwright）
- **`canvas-host/`** - Canvas A2UI 渲染主机
- **`interactive/`** - 交互式 CLI 模式
- **`tui/`** - 终端 UI（TUI 模式）
- **`node-host/`** - Node.js 调用和执行
- **`terminal/`** - 终端/spawn 控制
- **`tts/`** - 文本转语音

### 工具与辅助
- **`utils/`** - 通用工具
- **`types/`** - 共享类型定义
- **`logging/`** - 日志基础设施
- **`i18n/`** - 国际化
- **`process/`** - 进程管理和子进程
- **`test-utils/`** - 测试工具
- **`test-helpers/`** - 测试辅助

### 兼容性
- **`compat/`** - 遗留兼容层
- **`bindings/`** - 语言绑定
- **`auto-reply/`** - 自动回复子系统

---

## 扩展系统 (`extensions/`)

OpenClaw 使用模块化扩展系统，包含 90+ 扩展：

### 渠道扩展（消息平台）
| 平台 | 目录 |
|------|------|
| Telegram | `extensions/telegram/` |
| WhatsApp | `extensions/whatsapp/` |
| Discord | `extensions/discord/` |
| Slack | `extensions/slack/` |
| Signal | `extensions/signal/` |
| iMessage | `extensions/imessage/`, `extensions/bluebubbles/` |
| IRC | `extensions/irc/` |
| Matrix | `extensions/matrix/` |
| Google Chat | `extensions/googlechat/` |
| Microsoft Teams | `extensions/msteams/` |
| 飞书 | `extensions/feishu/` |
| LINE | `extensions/line/` |
| Mattermost | `extensions/mattermost/` |
| Nextcloud Talk | `extensions/nextcloud-talk/` |
| Nostr | `extensions/nostr/` |
| Synology Chat | `extensions/synology-chat/` |
| Tlon/Urbit | `extensions/tlon/` |
| Twitch | `extensions/twitch/` |
| Zalo | `extensions/zalo/`, `extensions/zalouser/` |

### 提供商扩展（AI 模型）
| 提供商 | 目录 |
|--------|------|
| OpenAI | `extensions/openai/` |
| Anthropic | `extensions/anthropic/` |
| Google | `extensions/google/` |
| Groq | `extensions/groq/` |
| Ollama | `extensions/ollama/` |
| vLLM | `extensions/vllm/` |
| SGLang | `extensions/sglang/` |
| Together AI | `extensions/together/` |
| OpenRouter | `extensions/openrouter/` |
| Perplexity | `extensions/perplexity/` |
| xAI (Grok) | `extensions/xai/` |
| Mistral AI | `extensions/mistral/` |
| Firecrawl | `extensions/firecrawl/` |
| *还有 40+ 更多...* | |

### 功能扩展
- **`diffs/`** - 差异查看
- **`llm-task/`** - LLM 任务执行
- **`voice-call/`** - 语音通话
- **`openshell/`** - OpenShell 沙箱
- **`diagnostics-otel/`** - OpenTelemetry 诊断
- **`memory-core/`** - 核心内存插件
- **`memory-lancedb/`** - LanceDB 向量内存

---

## 移动与桌面应用 (`apps/`)

### `apps/macos/`
- 原生 macOS 菜单栏应用
- Swift/SwiftUI
- 网关守护进程管理
- Canvas 主机集成
- 语音唤醒 + 对话模式

### `apps/ios/`
- 原生 iOS 应用
- Swift/SwiftUI
- 移动节点（Canvas、相机、语音）

### `apps/android/`
- 原生 Android 应用
- Kotlin
- 移动节点功能

### `apps/shared/`
- iOS/macOS 间共享代码 (OpenClawKit)

---

## Web UI (`ui/`)

使用 **Vite + TypeScript** 构建：
- **`ui/src/`** - React/Vue 风格组件结构
- **`ui/public/`** - 静态资源
- **`ui/index.html`** - 入口点
- 提供基于浏览器的控制面板用于网关管理

---

## 技能 (`skills/`)

内置智能体技能（60+ 技能）：
- **`coding-agent/`** - 编码助手
- **`github/`** - GitHub 集成
- **`1password/`** - 1Password 集成
- **`apple-notes/`**, **`apple-reminders/`**
- **`discord/`** - Discord 操作
- **`canvas/`** - Canvas 工具
- **`clawhub/`** - ClawHub 市场
- **`browser/`** - 浏览器自动化
- *还有 50+ 更多...*

---

## 构建系统

### Package.json 脚本
| 命令 | 描述 |
|------|------|
| `pnpm build` | 完整构建（TypeScript → dist/） |
| `pnpm build:docker` | Docker 优化构建 |
| `pnpm check` | Lint、类型检查、验证 |
| `pnpm test` | 运行测试 |
| `pnpm dev` | 开发模式（热重载） |
| `pnpm gateway:watch` | 网关监视模式 |

### 构建配置
- **`tsdown.config.ts`** - tsdown 打包器配置
- **`tsconfig.json`** - TypeScript 编译器配置
- **`vitest.*.config.ts`** - 多个测试配置（unit、e2e、live、extensions、channels、gateway）

### 包导出
`package.json` 定义了 100+ 导出路径：
- 核心入口点
- Plugin SDK 子路径
- 单独的运行时模块
- 渠道/提供商 helpers

---

## 关键技术

### 核心框架
- **Node.js** 24/22.16+
- **TypeScript** 5.9
- **pnpm** (workspace monorepo)

### 主要依赖
- **`@mariozechner/pi-agent-core`** - Pi agent 运行时
- **`@modelcontextprotocol/sdk`** - MCP (Model Context Protocol)
- **`hono`** - HTTP 路由器
- **`express`** - HTTP 服务器
- **`ws`** - WebSocket 服务器
- **`commander`** - CLI 框架
- **`zod`** - Schema 验证
- **`pdfjs-dist`** - PDF 解析
- **`sharp`** - 图像处理
- **`playwright-core`** - 浏览器自动化
- **`sqlite-vec`** - 向量搜索

### 开发工具
- **vitest** - 测试运行器
- **oxlint** - 快速 linter
- **oxfmt** - 代码格式化
- **tsdown** - TypeScript 打包器
- **tsx** - TypeScript 执行器

---

## 架构模式

### 插件架构
```
┌─────────────────────────────────────────────────────────┐
│                      OpenClaw Core                       │
├─────────────────────────────────────────────────────────┤
│  Channels  │  Providers  │  Tools  │  Commands  │ Hooks │
├─────────────────────────────────────────────────────────┤
│                    Plugin Runtime                        │
│  • Loader • Registry • Lifecycle • Security Scanning    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Extension Plugins                     │
│  [Telegram] [WhatsApp] [OpenAI] [Anthropic] [Browser]   │
└─────────────────────────────────────────────────────────┘
```

- 扩展通过 `src/plugins/loader.ts` 加载
- 每个扩展都有 `openclaw.plugin.json` 清单
- 插件可注册：channels、providers、tools、commands、hooks、HTTP 路由
- 运行时单例确保每种插件类型只有一个实例

### 渠道绑定
```
Inbound Message → Channel → Binding Router → Session/Agent
                                              │
                                              ▼
                                    Stateful Driver
                                    (Target Readiness)
```

- **配置的绑定** 映射渠道 → 智能体/会话
- **有状态绑定驱动器** 管理目标就绪状态
- **绑定路由** 将入站消息解析到会话

### 网关控制平面
```
┌─────────────────────────────────────────────────────────┐
│                    Gateway Control Plane                 │
├───────────────────┬───────────────────┬─────────────────┤
│   WebSocket API   │    HTTP API       │   Hook System   │
│  • Real-time      │  • CLI Gateway    │  • Lifecycle    │
│  • Events         │  • Web UI         │  • Before/After │
│  • Control        │  • Auth           │  • Approvals    │
└───────────────────┴───────────────────┴─────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   Sessions    │
                    │  • Isolation  │
                    │  • Routing    │
                    └───────────────┘
```

### 安全模型
- 默认启用 DM 配对和允许列表
- 危险命令需要执行审批
- SSRF 保护
- 带审计的密钥管理
- 安全优先的默认设置

### 多智能体路由
```
┌─────────────────────────────────────────────────────────┐
│                      Multi-Agent Routing                 │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Agent 1  │  │ Agent 2  │  │ Agent N  │              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│       │            │            │                      │
│       └────────────┴────────────┘                      │
│                    │                                    │
│              ┌─────▼─────┐                              │
│              │ Workspace │                              │
│              │ Routing   │                              │
│              └───────────┘                              │
└─────────────────────────────────────────────────────────┘
```

- 每个网关支持多个隔离的智能体
- 基于工作区的路由
- 每个对话会话隔离
- 支持子智能体

---

## 入口点

| 文件 | 描述 |
|------|------|
| `openclaw.mjs` | 主 CLI 包装器（Node 版本检查、编译缓存） |
| `src/entry.ts` | 入口点引导 |
| `src/cli/run-main.ts` | CLI 路由器 |
| `src/index.ts` | 库导出 |

---

## 重要架构决策

1. **TypeScript 胜过 JavaScript** - 可黑客性和类型安全
2. **Plugin SDK 隔离** - 核心与扩展之间的清晰边界
3. **内置与外部插件分离** - 核心保持精简，可选功能在插件中
4. **渠道无关设计** - 所有消息平台的统一接口
5. **提供商抽象** - 可互换的 AI 模型提供商
6. **本地优先理念** - 自托管，用户控制数据
7. **默认安全** - 默认启用配对、允许列表、审批
8. **多平台支持** - 支持 macOS、Linux、Windows (WSL2)
9. **配套应用** - 原生移动/桌面应用提供增强体验
10. **MCP 桥接** - 使用 `mcporter` 进行 MCP 集成，而非第一方支持

---

## 文档

- **`docs/`** - Mint 驱动的文档站点
- **`README.md`** - 主项目 README
- **`VISION.md`** - 项目愿景和路线图
- **`CONTRIBUTING.md`** - 贡献指南
- **`SECURITY.md`** - 安全策略和报告
- **`AGENTS.md`** - 贡献者的 AI 智能体指令

---

*文档生成时间: 2026-03-23*
