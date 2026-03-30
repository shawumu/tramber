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

# 创建配置文件 (使用智谱AI)
cat > ~/.tramber/settings.json << EOF
{
  "apiKey": "your-zhipu-token",
  "baseURL": "https://open.bigmodel.cn/api/anthropic",
  "model": "glm-4.7",
  "provider": "anthropic",
  "scene": "coding",
  "maxIterations": 10,
  "enableExperience": true,
  "enableRoutine": true
}
EOF

# 或者使用 Anthropic 官方 API
cat > ~/.tramber/settings.json << EOF
{
  "apiKey": "your-anthropic-key",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "scene": "coding",
  "maxIterations": 10,
  "enableExperience": true,
  "enableRoutine": true
}
EOF
```

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

## 4. 在代码中使用

```typescript
import { TramberEngine } from '@tramber/sdk';

// 创建引擎
const engine = new TramberEngine({
  apiKey: process.env.ANTHROPIC_API_KEY,
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

解决方法：设置 `ANTHROPIC_API_KEY` 环境变量或在配置文件中设置 `apiKey`。

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
