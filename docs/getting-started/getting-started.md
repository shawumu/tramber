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

## 2. 构建 CLI

```bash
# 在项目根目录
cd d:/workspace/ownspace/tramber

# 构建 SDK 和 CLI
cd packages/sdk && pnpm build && cd ../client/cli && pnpm build
```

## 3. 运行 CLI

### 启动 REPL 模式（交互式）

```bash
# 方式 1：使用 pnpm
pnpm cli

# 方式 2：直接运行
node packages/client/cli/dist/cli.js

# 方式 3：全局安装后
npm link -g @tramber/cli
tramber
```

### 执行单条命令

```bash
# 读取文件
pnpm cli "读取 package.json"

# 修复 bug
pnpm cli "修复 src/index.ts 中的错误"

# 运行测试
pnpm cli "运行测试"
```

### 查看命令

```bash
# 列出场景
pnpm cli scene

# 列出技能
pnpm cli skills

# 列出例程
pnpm cli routines

# 查看配置
pnpm cli config --list

# 设置配置
pnpm cli config --set model=claude-sonnet-4-6
```

## 4. 在代码中使用

```typescript
import { TramberClient } from '@tramber/sdk';

// 创建客户端
const client = new TramberClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  workspacePath: process.cwd()
});

// 初始化
await client.initialize();

// 执行任务
const result = await client.execute('读取 package.json');

if (result.success) {
  console.log(result.result);
} else {
  console.error(result.error);
}

// 列出可用的技能
const skills = await client.listSkills();
console.log('Available skills:', skills);

// 关闭客户端
await client.close();
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

- 阅读 [MVP 任务清单](./mvp-task-list.md) 了解实现细节
- 查看 [统一设计文档](./tramber-unified-plan.md) 了解架构设计
- 运行测试：`pnpm test`
