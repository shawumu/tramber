# Tramber 快速开始指南

## 1. 设置 API Key

### 使用 Anthropic 官方 API

```bash
# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="your-api-key-here"

# Windows (CMD)
set ANTHROPIC_API_KEY=your-api-key-here

# Linux/Mac
export ANTHROPIC_API_KEY="your-api-key-here"
```

### 使用 OpenAI API

```bash
# Windows (PowerShell)
$env:OPENAI_API_KEY="your-openai-api-key"

# Windows (CMD)
set OPENAI_API_KEY=your-openai-api-key

# Linux/Mac
export OPENAI_API_KEY="your-openai-api-key"
```

### 使用 Google Gemini API

```bash
# Windows (PowerShell)
$env:GEMINI_API_KEY="your-gemini-api-key"

# Windows (CMD)
set GEMINI_API_KEY=your-gemini-api-key

# Linux/Mac
export GEMINI_API_KEY="your-gemini-api-key"
```

### 使用智谱AI代理 (推荐)

```bash
# Windows (PowerShell)
$env:ANTHROPIC_AUTH_TOKEN="your-zhipu-token"
$env:ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic"
$env:ANTHROPIC_MODEL="glm-4.7"

# Linux/Mac
export ANTHROPIC_AUTH_TOKEN="your-zhipu-token"
export ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic"
export ANTHROPIC_MODEL="glm-4.7"
```

### 创建配置文件

```bash
# 创建配置目录
mkdir ~/.tramber

# 使用 Anthropic 官方 API
cat > ~/.tramber/settings.json << EOF
{
  "apiKey": "your-anthropic-key",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "scene": "coding",
  "maxTokens": 16384,
  "maxIterations": 10,
  "enableExperience": true,
  "enableRoutine": true
}
EOF

# 或者使用 OpenAI API
cat > ~/.tramber/settings.json << EOF
{
  "apiKey": "your-openai-key",
  "model": "gpt-4o",
  "provider": "openai",
  "scene": "coding",
  "maxTokens": 16384,
  "maxIterations": 10,
  "enableExperience": true,
  "enableRoutine": true
}
EOF

# 或者使用 Google Gemini API
cat > ~/.tramber/settings.json << EOF
{
  "apiKey": "your-gemini-key",
  "model": "gemini-2.0-flash",
  "provider": "gemini",
  "scene": "coding",
  "maxTokens": 16384,
  "maxIterations": 10,
  "enableExperience": true,
  "enableRoutine": true
}
EOF

# 或者使用智谱AI代理
cat > ~/.tramber/settings.json << EOF
{
  "apiKey": "your-zhipu-token",
  "baseURL": "https://open.bigmodel.cn/api/anthropic",
  "model": "glm-4.7",
  "provider": "anthropic",
  "scene": "coding",
  "maxTokens": 16384,
  "maxIterations": 10,
  "enableExperience": true,
  "enableRoutine": true
}
EOF
```

**支持的 Provider 和模型：**

| Provider | 环境变量 | 默认模型 | 可选模型 |
|----------|---------|---------|---------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | `claude-opus-4-6`, `claude-haiku-4-5` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` | `gpt-4.1`, `o4-mini`, `gpt-4o-mini` |
| `gemini` | `GEMINI_API_KEY` | `gemini-2.0-flash` | `gemini-2.5-pro`, `gemini-2.5-flash` |

> **提示**：智谱AI等兼容 Anthropic API 格式的代理服务，设置 `provider: "anthropic"` + `baseURL` 即可使用。

## 2. 构建

```bash
# 在项目根目录，构建所有包
pnpm build
```

## 3. 运行方式

Tramber 支持两种运行模式：**本地模式**（默认）和**远程模式**（Server + Client 分离）。

### 3.1 本地模式

CLI 直接调用本地 TramberEngine，无需额外启动服务。

#### 启动 REPL 模式（交互式）

```bash
# 方式 1：全局命令（推荐，已通过 npm link 安装）
tramber

# 方式 2：使用 pnpm
pnpm cli

# 方式 3：直接运行
node packages/client/cli/dist/cli.js
```

#### 执行单条命令

```bash
# 读取文件
tramber "读取 package.json"

# 修复 bug
tramber "修复 src/index.ts 中的错误"
```

### 3.2 远程模式（Server + Client）

Server 独立运行在远程或本地，Client 通过 WebSocket 连接 Server。适合 Web/Bot/IDE 插件等多 Client 接入场景。

#### 启动 Server

```bash
# 方式 1：通过全局命令（推荐）
tramber serve

# 方式 2：指定端口和地址
tramber serve --port 3100 --host 0.0.0.0

# 方式 3：使用 pnpm
pnpm cli serve

# 方式 4：直接运行 Server 包
node packages/server/dist/server.js
```

Server 启动后提供：
- HTTP REST API：`http://localhost:3100/api/*`
- WebSocket 端点：`ws://localhost:3100/ws`

#### 启动 Client 连接远程 Server

```bash
# REPL 模式连接远程
tramber --remote ws://localhost:3100

# 单条命令连接远程
tramber --remote ws://localhost:3100 "读取 package.json"
```

#### REST API

```bash
# 健康检查
curl http://localhost:3100/api/health

# 列出 Scenes
curl http://localhost:3100/api/scenes

# 列出 Skills
curl http://localhost:3100/api/skills

# 获取配置
curl http://localhost:3100/api/config

# 更新配置
curl -X PUT http://localhost:3100/api/config \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-6"}'

# 搜索经验
curl -X POST http://localhost:3100/api/experiences/search \
  -H "Content-Type: application/json" \
  -d '{"query": "文件读取", "limit": 5}'
```

#### WebSocket 通信

```
Client → Server:
  { type: "execute", id: "...", sessionId: "...", payload: { description: "读取 package.json" }}
  { type: "permission_response", id: "...", sessionId: "...", payload: { requestId: "...", confirmed: true }}
  { type: "ping", id: "...", sessionId: "", payload: {} }

Server → Client:
  { type: "progress", id: "...", sessionId: "...", payload: { type: "text_delta", content: "..." }}
  { type: "permission_request", id: "...", sessionId: "...", payload: { requestId: "...", operation: "file_write" }}
  { type: "result", id: "...", sessionId: "...", payload: { success: true, result: "..." }}
  { type: "pong", id: "...", sessionId: "", payload: {} }
```

### 查看命令

```bash
# 列出场景
tramber scene

# 列出技能
tramber skills

# 列出例程
tramber routines

# 查看配置
tramber config --list

# 设置配置
tramber config --set model=claude-sonnet-4-6
```

### 3.3 Web Client

通过浏览器访问 Server 直接提供的 Web UI。

#### 生产模式（推荐）

```bash
# 1. 构建 Web Client
pnpm --filter @tramber/web build

# 2. 启动 Server
tramber serve
```

#### 开发模式（热重载）

```bash
# 1. 启动 Server（新终端窗口）
tramber serve

# 2. 启动 Web Client watch 模式（项目根目录）
pnpm --filter @tramber/web dev
```

#### 访问界面

浏览器打开 `http://localhost:3100`，即可看到：
- 顶栏：连接状态
- 聊天区：实时流式输出、工具调用展示
- 输入框：发送任务指令
- 状态栏：WebSocket 连接状态

#### Web 界面功能

- **自动连接**：页面打开后自动连接 Server (`ws://localhost:3100/ws`)
- **流式输出**：AI 回复逐字显示
- **工具调用展示**：显示工具名、参数、执行结果
- **权限确认**：弹出对话框确认危险操作
- **自动重连**：连接断开后自动尝试重连

## 4. 在代码中使用

```typescript
import { TramberEngine } from '@tramber/sdk';

// 创建引擎 — 支持 anthropic / openai / gemini
const engine = new TramberEngine({
  provider: 'anthropic',                              // 或 'openai', 'gemini'
  apiKey: process.env.ANTHROPIC_API_KEY,              // 或 OPENAI_API_KEY, GEMINI_API_KEY
  model: 'claude-sonnet-4-6',                         // 或 'gpt-4o', 'gemini-2.0-flash'
  workspacePath: process.cwd()
});

// 初始化
await engine.initialize();

// 执行任务
const result = await engine.execute('读取 package.json');

if (result.success) {
  console.log(result.result);
} else {
  console.error(result.error);
}

// 关闭
await engine.close();
```

## 5. REPL 命令

在 REPL 模式下，可以使用以下命令：

| 命令 | 描述 |
|------|------|
| `/help` | 显示帮助信息 |
| `/scene` | 列出或切换场景 |
| `/skills` | 列出可用的技能 |
| `/routines` | 列出可用的例程 |
| `/config` | 显示或设置配置 |
| `/clear` | 清屏 |
| `/exit` | 退出 REPL |

## 6. 示例会话

```
┌─────────────────────────────────────────────────┐
│  Welcome to Tramber (MVP v0.1.0)                 │
│  Coding Scene - AI Assisted Programming         │
│                                                  │
│  Commands:                                       │
│    /help      - Show available commands          │
│    /skills    - List available skills            │
│    /exit      - Exit REPL                        │
└─────────────────────────────────────────────────┘

You: 读取 package.json

✓ File read successfully. Found dependencies: @tramber/shared, @tramber/tool, ...

You: 这个项目有多少个包？

✓ This project has 9 packages: shared, tool, provider, agent, scene, routine, experience, sdk, and cli.

You: /exit

Goodbye!
```

## 7. 故障排除

### API Key 错误

```
Error: API Key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey option.
```

解决方法：根据所选 provider 设置对应环境变量（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`），或在配置文件中设置 `apiKey`。

### 模块未找到错误

```
Error: Cannot find module '@tramber/sdk'
```

解决方法：运行 `pnpm install` 和 `pnpm build`。

### 权限错误

```
Error: EACCES: permission denied
```

解决方法：确保有读写权限，或使用 `sudo`（Linux/Mac）。

## 8. 下一步

- 查看 [统一设计文档](../project/tramber-unified-plan.md) 了解架构设计
- 查看各阶段设计文档：`docs/project/stage{N}/stage{N}.md`
- 运行测试：`pnpm test`
