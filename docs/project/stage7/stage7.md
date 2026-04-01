# Tramber Stage 7: Web Client MVP

> **创建时间**: 2026-04-01
> **前置依赖**: Stage 6 (Server 独立化)
> **预计周期**: 2-3 个工作日

---

## 1. 背景与动机

### 1.1 当前状态

Stage 6 完成了 Server 独立化，Fastify HTTP + WebSocket 服务已就绪：

```
当前架构：
┌────────────┐
│  CLI       │── WS ──→ Tramber Server ──→ Anthropic API
│  Client    │         (HTTP + WS)
└────────────┘

REST API:  /api/health, /api/scenes, /api/skills, /api/routines, /api/config
WebSocket: ws://host:port/ws  (execute, progress, permission_request/result)
```

**问题**：
- 只有 CLI 一个 Client，无法通过浏览器使用
- Agent 的执行过程（工具调用、流式输出）没有可视化展示
- 权限确认只能通过终端交互

### 1.2 目标架构

```
目标架构：
┌────────────┐  ┌────────────┐
│  CLI       │  │  Web       │
│  Client    │  │  Client    │  ← Stage 7
└─────┬──────┘  └─────┬──────┘
      │               │
      └───────┬───────┘
              │ HTTP + WebSocket
      ┌───────▼────────┐
      │  Tramber Server │
      │  (Stage 6)      │──→ Anthropic API
      └────────────────┘
```

### 1.3 核心价值

| 价值 | 说明 |
|------|------|
| **可视化** | 浏览器中展示 Agent 执行过程（流式输出、工具调用） |
| **零安装** | 用户无需安装 Node.js，打开浏览器即可使用 |
| **多 Client 验证** | 验证 Server 的多 Client 接入能力 |
| **权限 UI** | 浏览器弹窗确认权限，比终端更直观 |

---

## 2. 技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| 框架 | Vue 3 (Composition API) | 与统一计划一致 |
| 构建 | Vite 8 | 快速 HMR，最新稳定版 |
| UI 库 | Element Plus | 组件丰富，生态成熟 |
| 状态管理 | ref/reactive | MVP 阶段够用，后续可加 Pinia |
| WebSocket | 浏览器原生 API | 无需额外依赖 |

---

## 3. 包结构

```
packages/client/web/               # @tramber/web
├── index.html                      # SPA 入口
├── package.json
├── tsconfig.json
├── vite.config.ts                  # Vite + Element Plus + proxy
└── src/
    ├── main.ts                     # Vue app 创建、Element Plus 注册
    ├── App.vue                     # 根组件（布局：顶栏 + 聊天区 + 状态栏）
    ├── lib/
    │   └── tramber-client.ts       # WebSocket 客户端（参考 CLI RemoteClient）
    ├── composables/
    │   ├── useConnection.ts         # WS 连接管理（连接/断开/重连/心跳）
    │   └── useChat.ts               # 聊天状态（消息列表、收发、流式追加）
    └── components/
        ├── ChatView.vue             # 主聊天区（MessageList + MessageInput）
        ├── MessageList.vue          # 消息列表（自动滚底）
        ├── MessageItem.vue          # 单条消息（用户/AI/工具调用/错误）
        ├── MessageInput.vue         # 输入框 + 发送按钮
        ├── PermissionDialog.vue     # 权限确认弹窗
        └── StatusBar.vue            # 底部连接状态指示
```

---

## 4. 核心模块设计

### 4.1 TramberClient

参考 CLI 的 `RemoteClient`（`packages/client/cli/src/remote-client.ts`），适配浏览器环境：

```typescript
// src/lib/tramber-client.ts

interface TramberClientOptions {
  url: string;  // ws://host:port/ws
}

class TramberClient {
  private ws: WebSocket | null;
  private sessionId: string;
  private pendingExecutions: Map<string, { resolve, reject }>;

  connect(): Promise<void>;
  disconnect(): void;
  execute(description: string, options?: ExecuteOptions): Promise<ResultPayload>;

  // 回调
  onProgress?: (update: ProgressUpdate) => void;
  onPermissionRequired?: (request: PermissionRequestPayload) => Promise<boolean>;

  // 内部
  private handleMessage(data: WsMessage): void;
  private send(message: WsMessage): void;
}
```

**与 CLI RemoteClient 的区别**：
- 使用浏览器 `WebSocket` 而非 `ws` 库
- 无需 `EngineLike` 接口适配（Web 不直接被 CLI 框架调用）
- 权限确认通过 Vue reactive 状态 + Dialog 组件而非 readline

### 4.2 useConnection

```typescript
// src/composables/useConnection.ts

// 提供全局单例的连接状态
const connectionState = reactive({
  status: 'disconnected' as 'disconnected' | 'connecting' | 'connected',
  serverUrl: 'ws://localhost:3100/ws',
  client: null as TramberClient | null
});

export function useConnection() {
  async function connect(url?: string): Promise<void>;
  function disconnect(): void;
  function getClient(): TramberClient;

  return { ...toRefs(connectionState), connect, disconnect, getClient };
}
```

### 4.3 useChat

```typescript
// src/composables/useChat.ts

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls: ToolCallDisplay[];
  status: 'sending' | 'streaming' | 'done' | 'error';
  timestamp: number;
}

interface ToolCallDisplay {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
  result?: { success: boolean; data?: unknown; error?: string };
}

export function useChat() {
  const messages: Ref<ChatMessage[]>;
  const isExecuting: Ref<boolean>;

  async function sendMessage(content: string): Promise<void>;
  // 内部：监听 progress 追加到 assistant 消息

  return { messages, isExecuting, sendMessage };
}
```

**流式处理逻辑**：
1. 用户发送消息 → 创建 user 消息 + 空 assistant 消息（status: streaming）
2. 收到 `text_delta` → 追加到 assistant.content
3. 收到 `tool_call` → 添加到 assistant.toolCalls
4. 收到 `tool_result` → 匹配 toolCall 并填充 result
5. 收到 `result` → 设置 status 为 done

### 4.4 权限确认流程

```
Server                          Web Client
  │                                │
  │── permission_request ─────────>│  { requestId, toolCall, operation }
  │                                │  PermissionDialog 弹出
  │                                │  [用户点击确认/拒绝]
  │<── permission_response ────────│  { requestId, confirmed }
  │  （Server 恢复执行）            │  Dialog 关闭
```

`PermissionDialog` 显示：
- 操作类型（file_write / command_execute 等）
- 工具名称和参数
- 确认 / 拒绝按钮

### 4.5 组件说明

**App.vue**：
```
┌─────────────────────────────────────┐
│  🟤 Tramber Web          [连接状态] │  ← 顶栏
├─────────────────────────────────────┤
│                                     │
│  [用户消息]                          │
│  [AI 回复，流式显示...]              │  ← ChatView
│    ├ 📁 read_file package.json      │  ← 工具调用展示
│    └ ✅ success                     │
│                                     │
├─────────────────────────────────────┤
│  [输入框________________] [发送]     │  ← MessageInput
├─────────────────────────────────────┤
│  ● Connected | ws://localhost:3100  │  ← StatusBar
└─────────────────────────────────────┘
```

---

## 5. 开发任务清单

### Phase 1: 包初始化 (0.5h)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 1.1 创建 `packages/client/web/` 包结构（package.json, tsconfig.json, vite.config.ts） | P0 | 0.5h | ⬜ |
| 1.2 配置 Element Plus + Vue 3 + 按需导入 | P0 | 0.5h | ⬜ |
| 1.3 配置 Vite proxy 对接 Server | P0 | 0.5h | ⬜ |
| 1.4 添加 tsconfig 路径映射 | P0 | 0.5h | ⬜ |

**验收标准**：
```bash
$ pnpm dev
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
# 浏览器打开看到空白 Vue 页面
```

---

### Phase 2: WebSocket 客户端 (1h)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 2.1 实现 TramberClient 类 | P0 | 1h | ⬜ |
| 2.2 实现 useConnection composable | P0 | 0.5h | ⬜ |
| 2.3 心跳 + 重连 + 断开清理 | P1 | 0.5h | ⬜ |

**验收标准**：
- 浏览器控制台可见 WS 连接建立
- `ping/pong` 心跳正常
- 连接断开后自动重连

---

### Phase 3: 聊天界面 (2h)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 3.1 App.vue 布局（顶栏 + 主区域 + 状态栏） | P0 | 0.5h | ⬜ |
| 3.2 useChat composable | P0 | 0.5h | ⬜ |
| 3.3 ChatView + MessageList + MessageItem | P0 | 1h | ⬜ |
| 3.4 MessageInput（输入框 + 发送 + Enter 快捷键） | P0 | 0.5h | ⬜ |
| 3.5 流式输出渲染（text_delta 追加） | P0 | 0.5h | ⬜ |
| 3.6 工具调用展示（tool_call + tool_result） | P1 | 0.5h | ⬜ |
| 3.7 StatusBar（连接状态） | P1 | 0.5h | ⬜ |

**验收标准**：
```
# 启动 Server + Web Client
$ tramber serve
$ pnpm dev

# 浏览器操作
1. 输入 "读取 package.json"
2. 看到 AI 流式输出文字
3. 看到工具调用（read_file）和结果展示
4. 收到完整回复
```

---

### Phase 4: 权限确认 (1h)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 4.1 PermissionDialog 组件 | P0 | 0.5h | ⬜ |
| 4.2 集成到 useConnection/useChat | P0 | 0.5h | ⬜ |

**验收标准**：
```
1. 输入 "删除 test.ts"
2. 弹出权限确认对话框
3. 显示操作类型、工具名、参数
4. 点确认 → 继续执行
5. 点拒绝 → 返回错误消息
```

---

### Phase 5: 联调与文档 (0.5h)

| 任务 | 优先级 | 预估时间 | 状态 |
|------|--------|---------|------|
| 5.1 端到端联调测试 | P0 | 0.5h | ⬜ |
| 5.2 更新 CLAUDE.md 路线图 | P0 | 0.5h | ⬜ |
| 5.3 更新 getting-started.md | P1 | 0.5h | ⬜ |

---

## 6. 关键设计决策

### 6.1 Element Plus 按需导入

**决策**：使用 `unplugin-vue-components` + `unplugin-auto-import` 实现按需导入。

**原因**：
- 减小打包体积（Element Plus 全量 ~1MB）
- 开发体验不变（直接使用组件，无需手动 import）

### 6.2 不用 Pinia

**决策**：MVP 阶段使用 composable + reactive 管理状态。

**原因**：
- 只有两个状态：连接状态 + 聊天消息
- composable 足够，避免过度设计
- 后续加 Session 管理/设置页时再引入 Pinia

### 6.3 Vite Proxy 而非直连

**决策**：开发时通过 Vite proxy 转发 `/api` 和 `/ws` 到 Server。

**原因**：
- 避免跨域问题
- 生产环境可由 Nginx 反向代理
- 统一入口，前端不需要知道 Server 地址

### 6.4 浏览器原生 WebSocket

**决策**：不引入 socket.io 等库，使用浏览器原生 `WebSocket` API。

**原因**：
- Server 已用 `ws` 库，标准 WebSocket 协议
- 原生 API 足够，无需额外依赖
- 保持与 Server 协议的一致性

---

## 7. 依赖

### 7.1 新增依赖

| 包 | 用途 | 大小 |
|------|------|------|
| `vue` | 前端框架 | ~40KB gzip |
| `element-plus` | UI 组件库 | 按需导入 |
| `@vitejs/plugin-vue` | Vite Vue 插件 | 构建时 |
| `unplugin-vue-components` | Element Plus 按需导入 | 构建时 |
| `unplugin-auto-import` | Element Plus 自动导入 | 构建时 |

### 7.2 复用已有根级依赖

- `vite` (^8.0.0) — 升级到最新稳定版
- `typescript` (^5.3.3) — 已在根 devDependencies

---

## 8. 时间估算

| Phase | 内容 | 预估时间 |
|-------|------|---------|
| Phase 1 | 包初始化 | 0.5 天 |
| Phase 2 | WebSocket 客户端 | 0.5 天 |
| Phase 3 | 聊天界面 | 1 天 |
| Phase 4 | 权限确认 | 0.5 天 |
| Phase 5 | 联调与文档 | 0.5 天 |
| **总计** | | **3 天** |

---

## 9. 验收标准

### 9.1 功能验收

| 场景 | 标准 |
|------|------|
| **Web 启动** | `pnpm dev` 启动，浏览器访问 `http://localhost:5173` |
| **WS 连接** | 页面打开后自动连接 Server，状态栏显示 Connected |
| **发送消息** | 输入任务，AI 流式回复，文字逐步显示 |
| **工具调用** | 展示工具名、参数、执行结果 |
| **权限确认** | 触发权限操作时弹出 Dialog，确认/拒绝后继续 |
| **连接断开** | Server 关闭后状态栏显示 Disconnected，重连后恢复 |

### 9.2 非功能验收

| 指标 | 目标 |
|------|------|
| 首屏加载 | ≤ 2s |
| WS 消息延迟 | ≤ 100ms |
| 流式输出流畅度 | 无明显卡顿 |

---

*文档创建时间: 2026-04-01*
*文档版本: 1.0*
