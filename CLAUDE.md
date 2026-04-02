# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 构建与开发命令

```bash
pnpm install                    # 安装依赖（仅支持 pnpm，preinstall 脚本强制检查）
pnpm build                      # 构建所有包
pnpm test                       # 运行所有测试（vitest）
pnpm test:integration           # 仅运行集成测试
pnpm test:e2e                   # 仅运行端到端测试
pnpm run cli                    # 直接运行 CLI
pnpm typecheck                  # 所有包的 TypeScript 类型检查
pnpm clean                      # 清理构建产物
```

运行单个测试文件：`pnpm vitest run tests/integration/tool-system.test.ts`

## 项目概述

Tramber 是一个**知识沉淀型多场景 AI 智能体** — 如琥珀保存古生物般，将 AI 交互中的知识、经验、规范沉淀下来，形成可复用的智能资产。核心创新是 **Skill → Routine** 沉淀机制：首次执行任务时 AI 慢速理解，反复成功后自动固化为 Routine，后续直接执行。

核心概念：Scene（固化工作流模板）、Workflow（可组合步骤）、Skill（AI 理解的技能）、Routine（Skill 固化后的工具，直接执行）、Tool（原子内置工具）、Experience（多维度经验记录）。

## 架构

### 包结构（pnpm monorepo）

```
packages/
├── shared/        # @tramber/shared — 类型定义（Agent, Task, Tool, Scene, Skill, Routine, Experience, Permission）、全局 Logger
├── tool/          # @tramber/tool — ToolRegistry + 内置工具（file, search, exec, pwd）
├── provider/      # @tramber/provider — AIProvider 接口 + Anthropic 实现、ProviderRegistry/Factory
├── agent/         # @tramber/agent — AgentLoop（核心执行引擎）、ConversationManager、ToolExecutor、PermissionGuard、ContextBuffer
├── permission/    # @tramber/permission — PermissionChecker、从 .tramber/settings.json 加载配置
├── scene/         # @tramber/scene — Scene/Skill/Routine 管理、Coding Scene 配置
├── routine/       # @tramber/routine — RoutineManager、沉淀逻辑
├── experience/    # @tramber/experience — 全维度经验记录、检索、反馈
├── skill/         # @tramber/skill — Skill 类型（自包含能力包）
├── sdk/           # @tramber/sdk — TramberEngine 公共 API，封装 AgentLoop
├── server/        # @tramber/server — Fastify HTTP + WebSocket 服务，多 Client 接入
└── client/cli/    # @tramber/cli — CLI 入口（cli.ts）、Ink TUI、RemoteClient、output-manager
├── client/web/    # @tramber/web — Vue 3 Web 客户端、Element Plus、WebSocket 通信
```

### 依赖关系

```
shared ← tool, provider（基础层）
shared + tool + provider ← agent（核心循环）
agent ← sdk（公共 API）
sdk ← server, client/cli（用户面向）
permission ← agent, sdk（横切关注点）
scene, routine, experience ← sdk, agent
```

### Agent Loop 核心逻辑

Agent Loop（`packages/agent/src/loop.ts`）遵循简单的迭代模式：
1. 带 context + tools 调用 LLM
2. 有工具调用 → 执行工具，将结果添加到 context，继续迭代
3. 无工具调用 → 文本通过 `onStep` 回调发送，返回空 `finalAnswer`

**关键设计**：AI 文本只通过 `onStep`（实时进度）发送，**不**通过 `finalAnswer`。这避免了重复输出。`finalAnswer` 仅保留给结构化数据结果。

### CLI 三层架构

```
REPL 层（repl.ts, command-handler.ts）— 业务逻辑、命令处理、任务编排
  ↓ onIdle 回调
交互层（interaction-manager.ts）— 状态机：IDLE ⟷ EXECUTING ⟷ WAITING_INPUT
  ↓ 接口调用
IO 层（io-manager.ts, output-manager.ts）— readline 管理、统一输出、stdout/stderr 分离
```

状态转换：
- `IDLE → EXECUTING`：用户输入时 `startTask()`
- `EXECUTING → WAITING_INPUT`：权限确认时 `requestInput()`
- `WAITING_INPUT → EXECUTING`：用户输入后恢复
- `EXECUTING → IDLE`：任务完成（finally 块重置状态 + 显示 prompt）

### 权限系统

工具在定义中声明权限级别（`permission.operation`）。PermissionChecker 从 `.tramber/settings.json` 加载规则。操作类型：`file_read`、`file_write`、`file_delete`、`file_rename`、`command_execute`。每项可设为 `true`（允许）、`"confirm"`（需用户确认）或 `false`（拒绝）。

### 调试 / 日志系统

全局 Logger 在 `packages/shared/src/logger.ts`，支持命名空间过滤：
- 环境变量：`TRAMBER_DEBUG=true`、`TRAMBER_DEBUG_LEVEL=basic|verbose|trace`、`TRAMBER_DEBUG_NAMESPACES=tramber:agent,tramber:tool`
- 所有调试输出到 **stderr**；用户可见输出到 **stdout**
- 命名空间格式：`tramber:<module>[:submodule]`（如 `tramber:agent:loop`、`tramber:tool:file`）

## 开发路线图

项目采用分阶段开发计划，文档位于 `docs/project/`：

| 阶段 | 重点 | 状态 |
|------|------|------|
| Stage 1 | MVP — 所有核心系统（Tool, Provider, Agent Loop, Scene, Skill, Routine, Experience, CLI） | ✅ 完成 |
| Stage 2 | IO 架构重构 — CLI 三层架构、输出管理、状态机、exec 工具修复 | ✅ 完成 |
| Stage 3 | 多轮对话、流式输出、edit_file 工具、Engine/Client 分离 | ✅ 完成 |
| Stage 4 | Ink CLI 重写 — React TUI、StatusBar、DebugPanel、Static 输出区域 | ✅ 完成 |
| Stage 5 | Skill 系统 — 扫描 `.tramber/skills/`、解析 SKILL.md、注入系统提示词、CLI 管理 | ✅ 完成 |
| Stage 6 | Server 独立化 — Fastify HTTP + WebSocket 服务、多 Client 接入、RemoteClient、权限双向通信 | ✅ 完成 |
| Stage 7 | Web Client — Vue 3 + Vite + Element Plus 浏览器界面、WS 连接、流式输出、权限确认 | ✅ 完成 |

设计文档：`docs/project/tramber-unified-plan.md`（完整架构）、`docs/project/stage{N}/stage{N}.md`（各阶段详情）。

## 关键文件

- `packages/agent/src/loop.ts` — 核心 Agent Loop（执行引擎）
- `packages/agent/src/conversation.ts` — 会话管理（消息、token 追踪、上下文窗口）
- `packages/sdk/src/engine.ts` — TramberEngine（公共 API，封装 AgentLoop）
- `packages/sdk/src/types.ts` — SDK 类型定义（TramberRequest, TramberResponse）
- `packages/tool/src/registry.ts` — ToolRegistry（注册和执行）
- `packages/provider/src/anthropic/client.ts` — Anthropic Claude API 集成
- `packages/client/cli/src/cli.ts` — CLI 入口
- `packages/server/src/server.ts` — Fastify HTTP + WebSocket Server 入口
- `packages/server/src/ws-handler.ts` — WebSocket 消息处理、任务执行、权限确认
- `packages/server/src/session-manager.ts` — 多会话管理（Conversation 隔离、超时清理）
- `packages/client/cli/src/remote-client.ts` — CLI 远程模式客户端（通过 WS 连接 Server）
- `packages/client/web/src/lib/tramber-client.ts` — Web 端 WebSocket 客户端
- `packages/client/web/src/composables/useConnection.ts` — Web 连接管理
- `packages/client/web/src/composables/useChat.ts` — Web 聊天状态管理
- `packages/shared/src/types/` — 所有共享类型定义
- `packages/shared/src/logger.ts` — 全局调试 Logger
- `.tramber/settings.json` — 用户配置（工具权限、沙箱设置）

## 代码规范

- TypeScript strict 模式，ESM 模块（`"type": "module"`）
- 构建工具：所有包使用 `tsup`
- 测试框架：`vitest`
- AI 文本输出：始终通过 `onStep` 回调，不通过返回值
- 权限操作在 Tool 定义中声明，不从工具名推断
- 日志命名空间模式：`tramber:<module>`（定义在 `packages/shared/src/logger.ts`）
- 输出流分离：用户输出在 stdout，调试日志在 stderr
