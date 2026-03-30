# Tramber Stage 6: Server 独立化

> **创建时间**: 2026-03-30
> **前置依赖**: Stage 5 (Skill 系统)
> **预计周期**: 5-6 个工作日

---

## 1. 背景与动机

### 1.1 当前状态

Stage 1-5 完成后，TramberEngine 在概念上已经是无状态的纯计算引擎——接收 Conversation，返回更新后的 Conversation。但**物理上仍然是进程内调用**：

```
当前架构：
┌──────────────────────────────────┐
│  CLI 进程                         │
│  ┌──────────┐  ┌──────────────┐  │
│  │ Ink App  │──│TramberEngine │──│──→ Anthropic API
│  │ (UI)     │  │ (计算引擎)    │  │
│  └──────────┘  └──────────────┘  │
└──────────────────────────────────┘
```

**问题**：
- 只有 CLI 一个 Client，无法接入 Web/Bot/IDE 插件
- Engine 和 CLI 在同一进程，无法独立部署和扩展
- 每新增一个 Client，都要重新实现 Engine 的初始化逻辑

### 1.2 目标架构

```
目标架构：
┌────────────┐  ┌────────────┐  ┌────────────┐
│  CLI       │  │  Web       │  │  Bot       │
│  Client    │  │  Client    │  │  Client    │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │               │               │
      └───────────────┼───────────────┘
                      │ HTTP + WebSocket
              ┌───────▼────────┐
              │  Tramber Server │
              │  ┌────────────┐│
              │  │Engine      ││──→ Anthropic API
              │  │Tool/Perm   ││
              │  │Session Mgr ││
              │  └────────────┘│
              └────────────────┘
```

### 1.3 核心价值

| 价值 | 说明 |
|------|------|
| **多 Client 接入** | Web/Bot/IDE 插件通过同一 Server 访问 Agent 能力 |
| **独立部署** | Server 可部署在远程机器，Client 只需网络连接 |
| **协议标准化** | HTTP REST + WebSocket 双协议，任何语言都能接入 |
| **会话管理** | Server 统一管理 Conversation 持久化和多会话隔离 |

---

## 2. 通信协议设计

### 2.1 协议选择

| 场景 | 协议 | 原因 |
|------|------|------|
| 任务执行 | **WebSocket** | 需要双向通信（流式输出 + 权限确认） |
| 查询类操作 | **HTTP REST** | scenes/skills/routines/config 等简单查询 |
| 健康检查 | **HTTP GET** | `/api/health` |

### 2.2 WebSocket 消息格式

所有 WebSocket 消息使用 JSON，包含 `type` 字段用于路由：

```typescript
// 通用消息信封
interface WsMessage<T = unknown> {
  type: string;
  id: string;           // 消息 ID，用于请求-响应匹配
  sessionId: string;    // 会话 ID
  payload: T;
}
```

#### 2.2.1 Client → Server 消息

| type | 用途 | payload |
|------|------|---------|
| `execute` | 执行任务 | `{ description, sceneId?, maxIterations?, stream? }` |
| `permission_response` | 权限确认回复 | `{ requestId, confirmed: boolean }` |
| `cancel` | 取消当前任务 | `{}` |
| `ping` | 心跳 | `{}` |

#### 2.2.2 Server → Client 消息

| type | 用途 | payload |
|------|------|---------|
| `progress` | 执行进度 | `ProgressUpdate`（复用现有类型） |
| `permission_request` | 请求权限确认 | `{ requestId, toolCall, operation, reason? }` |
| `result` | 任务完成 | `TramberResponse` |
| `error` | 错误 | `{ message, code? }` |
| `pong` | 心跳回复 | `{}` |

### 2.3 权限确认的双向通信流程

这是最关键的设计——Server 执行过程中需要暂停等待 Client 的用户输入：

```
Client                    Server
  │                         │
  │── execute ──────────────>│  开始执行
  │                         │  ...
  │<── permission_request ──│  需要权限确认
  │                         │  （Server 暂停，等待回复）
  │  [用户在 UI 上确认]      │
  │── permission_response ──>│  confirmed: true
  │                         │  （Server 恢复执行）
  │                         │  ...
  │<── result ──────────────│  任务完成
```

**实现机制**：Server 端用 `Promise` 暂停 Agent Loop，收到 Client 回复后 resolve。

### 2.4 HTTP REST API

```
GET  /api/health              # 健康检查
GET  /api/scenes              # 列出 Scenes
GET  /api/skills              # 列出 Skills
GET  /api/routines            # 列出 Routines
GET  /api/config              # 获取配置
PUT  /api/config              # 更新配置
POST /api/experiences/search  # 搜索经验
```

---

## 3. 包结构设计

### 3.1 新建包

```
packages/server/              # @tramber/server
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 导出
│   ├── server.ts             # HTTP + WS 服务入口
│   ├── ws-handler.ts         # WebSocket 连接处理
│   ├── session-manager.ts    # 多会话管理
│   ├── routes/
│   │   ├── health.ts         # GET /api/health
│   │   ├── scenes.ts         # GET /api/scenes
│   │   ├── skills.ts         # GET /api/skills
│   │   ├── routines.ts       # GET /api/routines
│   │   ├── config.ts         # GET/PUT /api/config
│   │   └── experiences.ts    # POST /api/experiences/search
│   └── types.ts              # Server 特有类型
```

### 3.2 修改包

```
packages/client/cli/          # @tramber/cli
│   src/
│   ├── cli.ts                # 添加 --remote 模式，连接远程 Server
│   ├── remote-client.ts      # 新增：通过 WS 连接 Server 的 Client 适配器
│   └── app.tsx               # 小幅修改：支持 remoteClient 替代本地 engine
```

### 3.3 不修改的包

`shared`、`agent`、`tool`、`provider`、`permission`、`scene`、`skill`、`routine`、`experience`、`sdk` — 这些包不做修改。

**原因**：Server 直接复用 `TramberEngine`，不改动任何引擎代码。

---

## 4. 核心模块设计

### 4.1 Server 入口

```typescript
// packages/server/src/server.ts

export class TramberServer {
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private engine: TramberEngine;
  private sessionManager: SessionManager;

  constructor(options: ServerOptions) {
    // 初始化 Engine（复用现有 TramberEngine）
    this.engine = new TramberEngine(options.engine);

    // 初始化会话管理器
    this.sessionManager = new SessionManager();

    // HTTP 服务
    this.httpServer = createHttpServer(routes);

    // WebSocket 服务（挂载在同一个 HTTP Server 上）
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  async start(port: number): Promise<void>;
  async stop(): Promise<void>;
}
```

### 4.2 WebSocket Handler

```typescript
// packages/server/src/ws-handler.ts

class WsHandler {
  private engine: TramberEngine;
  private sessionManager: SessionManager;

  async handleMessage(ws: WebSocket, message: WsMessage): Promise<void> {
    switch (message.type) {
      case 'execute':
        await this.handleExecute(ws, message);
        break;
      case 'permission_response':
        await this.handlePermissionResponse(message);
        break;
      case 'cancel':
        await this.handleCancel(message);
        break;
    }
  }

  private async handleExecute(ws: WebSocket, message: WsMessage): Promise<void> {
    const { description, sceneId, maxIterations, stream } = message.payload;

    // 获取或创建会话
    const session = this.sessionManager.getOrCreate(message.sessionId);

    // 执行任务，通过 WS 推送进度
    const result = await this.engine.execute(description, {
      sceneId,
      maxIterations,
      stream,
      onProgress: (update) => {
        this.send(ws, { type: 'progress', payload: update });
      },
      onPermissionRequired: async (toolCall, operation, reason) => {
        // 暂停执行，向 Client 请求确认
        return this.requestPermission(ws, message.sessionId, toolCall, operation, reason);
      }
    }, session.conversation);

    // 更新会话
    if (result.conversation) {
      session.conversation = result.conversation;
    }

    // 发送结果
    this.send(ws, { type: 'result', payload: result });
  }

  /**
   * 权限确认：向 Client 发送请求，等待回复
   */
  private requestPermission(
    ws: WebSocket,
    sessionId: string,
    toolCall: ToolCallInfo,
    operation: string,
    reason?: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = generateId();

      // 注册等待回调
      this.sessionManager.registerPermissionCallback(sessionId, requestId, resolve);

      // 发送权限请求给 Client
      this.send(ws, {
        type: 'permission_request',
        payload: { requestId, toolCall, operation, reason }
      });
    });
  }
}
```

### 4.3 Session Manager

```typescript
// packages/server/src/session-manager.ts

interface Session {
  id: string;
  conversation?: Conversation;
  createdAt: Date;
  lastActivity: Date;
  /** 等待中的权限确认回调 */
  pendingPermissions: Map<string, (confirmed: boolean) => void>;
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();

  getOrCreate(sessionId?: string): Session;
  registerPermissionCallback(sessionId: string, requestId: string, resolve: (confirmed: boolean) => void): void;
  resolvePermission(sessionId: string, requestId: string, confirmed: boolean): void;
  delete(sessionId: string): void;
  /** 清理超时会话 */
  cleanup(timeoutMs: number): void;
}
```

### 4.4 Remote Client（CLI 侧）

```typescript
// packages/client/cli/src/remote-client.ts

/**
 * 远程 Client — 通过 WebSocket 连接 Server
 * 实现与 TramberEngine 相同的接口，CLI 无感知切换
 */
class RemoteClient {
  private ws: WebSocket;
  private pendingRequests: Map<string, { resolve, reject }>;
  private onProgressCallback?: (update: ProgressUpdate) => void;

  async connect(url: string): Promise<void>;
  async execute(description: string, options: ExecuteOptions): Promise<TramberResponse>;
  async listScenes(): Promise<Scene[]>;
  async listUserSkills(): Promise<SkillManifest[]>;
  async close(): Promise<void>;
}
```

**CLI 切换逻辑**：

```typescript
// cli.ts
const client = options.remote
  ? new RemoteClient(options.remote)   // --remote ws://localhost:3100
  : new TramberEngine(engineOptions);  // 本地模式（向后兼容）
```

---

## 5. 开发任务清单

### Phase 1: Server 基础框架 (1天)

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 1.1 创建 `packages/server/` 包结构 | P0 | 0.5h | - | ✅ |
| 1.2 实现 HTTP 服务 + REST 路由框架 | P0 | 1h | 1.1 | ✅ |
| 1.3 实现 `/api/health` 和 `/api/scenes` | P0 | 1h | 1.2 | ✅ |
| 1.4 配置 tsup 构建 | P0 | 0.5h | 1.1 | ✅ |
| 1.5 添加 `tramber serve` CLI 命令 | P0 | 1h | 1.2 | ✅ |

**验收标准**：
```bash
$ pnpm build && pnpm serve
Tramber Server listening on http://localhost:3100

$ curl http://localhost:3100/api/health
{"status":"ok","version":"0.1.0"}

$ curl http://localhost:3100/api/scenes
[{"id":"coding","name":"Coding Scene",...}]
```

---

### Phase 2: WebSocket 通信 + 任务执行 (1.5天)

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 2.1 实现 WebSocket 连接管理 | P0 | 1h | Phase 1 | ✅ |
| 2.2 实现 `execute` 消息处理 | P0 | 1.5h | 2.1 | ✅ |
| 2.3 实现 `progress` 消息推送（text_delta, tool_call, tool_result） | P0 | 1h | 2.2 | ✅ |
| 2.4 实现 `result` 消息推送 | P0 | 0.5h | 2.2 | ✅ |
| 2.5 实现心跳机制（ping/pong） | P1 | 0.5h | 2.1 | ✅ |
| 2.6 添加错误处理和连接断开清理 | P1 | 1h | 2.1 | ✅ |

**验收标准**：
```javascript
// ws://localhost:3100 发送：
{ "type": "execute", "id": "1", "sessionId": "s1", "payload": { "description": "读取 package.json" }}

// 收到（流式）：
{ "type": "progress", "payload": { "type": "tool_call", "toolCall": { "name": "read_file" }}}
{ "type": "progress", "payload": { "type": "tool_result", "toolResult": { "success": true }}}
{ "type": "progress", "payload": { "type": "text_delta", "content": "这是一个..." }}
{ "type": "result", "payload": { "success": true, "conversation": {...} }}
```

---

### Phase 3: 权限确认双向通信 (1天)

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 3.1 实现 SessionManager | P0 | 1h | Phase 2 | ✅ |
| 3.2 实现 Server 端权限暂停机制 | P0 | 1.5h | 3.1 | ✅ |
| 3.3 实现 `permission_request` 消息推送 | P0 | 0.5h | 3.2 | ✅ |
| 3.4 实现 `permission_response` 消息处理 | P0 | 1h | 3.3 | ✅ |
| 3.5 添加权限请求超时处理 | P1 | 0.5h | 3.4 | ✅ |
| 3.6 测试权限确认完整流程 | P0 | 1h | 3.1-3.5 | ✅ |

**验收标准**：
```
Client                    Server
  │── execute "删除 test.ts" ──>│
  │<── permission_request ──────│  { requestId, operation: "file_delete" }
  │── permission_response ─────>│  { requestId, confirmed: false }
  │<── result ──────────────────│  { success: false, error: "权限被拒绝" }
```

---

### Phase 4: 会话管理 (0.5天)

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 4.1 实现多会话创建/复用/销毁 | P0 | 1h | Phase 3 | ✅ |
| 4.2 实现 Conversation 在会话间传递 | P0 | 1h | 4.1 | ✅ |
| 4.3 实现会话超时清理 | P1 | 0.5h | 4.1 | ✅ |
| 4.4 添加会话管理日志 | P1 | 0.5h | 4.1 | ✅ |

**验收标准**：
```
# 同一个 sessionId 连续请求，Conversation 被复用
session1: execute "读取 a.ts"  → conversation 包含 1 轮
session1: execute "再读取 b.ts" → conversation 包含 2 轮（上下文连续）

# 不同 sessionId 互不干扰
session2: execute "读取 c.ts"  → 全新 conversation
```

---

### Phase 5: CLI 远程模式 (1天)

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 5.1 实现 RemoteClient 类 | P0 | 1.5h | Phase 3 | ✅ |
| 5.2 实现 RemoteClient 权限确认回调 | P0 | 1h | 5.1 | ✅ |
| 5.3 CLI 添加 `--remote` 选项 | P0 | 0.5h | 5.1 | ✅ |
| 5.4 修改 App 组件支持 RemoteClient | P0 | 1h | 5.2 | ✅ |
| 5.5 测试 CLI 远程模式完整流程 | P0 | 1h | 5.1-5.4 | ✅ |

**验收标准**：
```bash
# 终端 1：启动 Server
$ pnpm serve
Tramber Server listening on ws://localhost:3100

# 终端 2：CLI 连接远程 Server
$ pamber run cli -- --remote ws://localhost:3100
You: 读取 package.json
[正常执行，流式输出，权限确认]
You:
```

---

### Phase 6: REST API 完善 (0.5天)

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 6.1 实现 `/api/skills` | P1 | 0.5h | Phase 1 | ✅ |
| 6.2 实现 `/api/routines` | P1 | 0.5h | Phase 1 | ✅ |
| 6.3 实现 `/api/config` GET/PUT | P1 | 0.5h | Phase 1 | ✅ |
| 6.4 实现 `/api/experiences/search` | P2 | 0.5h | Phase 1 | ✅ |

---

### Phase 7: 集成测试与文档 (0.5天)

| 任务 | 优先级 | 预估时间 | 依赖 | 状态 |
|------|--------|---------|------|------|
| 7.1 编写 Server 启动/关闭测试 | P0 | 0.5h | Phase 1-6 | ⬜ |
| 7.2 编写 WS 通信测试（含权限确认） | P0 | 1h | Phase 3 | ⬜ |
| 7.3 编写 CLI 远程模式测试 | P1 | 0.5h | Phase 5 | ⬜ |
| 7.4 更新 CLAUDE.md | P0 | 0.5h | - | ⬜ |

---

## 6. 关键设计决策

### 6.1 Engine 不改，只包一层 Server

**决策**：`packages/server/` 直接 import `TramberEngine`，不修改任何现有包。

**原因**：
- 风险最低——现有 CLI 单机模式完全不受影响
- Server 只是传输层，核心逻辑不变
- 方便回归测试

### 6.2 CLI 保持本地模式兼容

**决策**：`--remote` 是可选参数，不传时行为与现在完全一致。

**原因**：
- 单机场景不需要额外启动 Server
- 向后兼容，不破坏现有用户习惯
- 渐进式迁移

### 6.3 WebSocket 而非 SSE

**决策**：任务执行使用 WebSocket 而非 Server-Sent Events。

**原因**：
- 权限确认需要 **双向通信**（Client → Server），SSE 是单向的
- WebSocket 原生支持长连接，适合多轮对话场景
- HTTP REST 用于简单查询，WebSocket 用于实时交互

### 6.4 Session 由 Client 管理 ID

**决策**：Client 生成 `sessionId`，Server 通过 ID 查找/创建会话。

**原因**：
- Client 知道自己的会话生命周期（新建/继续/结束）
- Server 不需要猜测 Client 意图
- 简单直接，容易调试

---

## 7. 依赖与风险

### 7.1 新增依赖

| 包 | 用途 | 大小 |
|------|------|------|
| `ws` | WebSocket 服务端 | 轻量，无依赖 |
| `node:http` | HTTP 服务（内置） | 无 |

### 7.2 技术风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| WS 连接不稳定导致任务中断 | 中 | 添加重连机制 + 任务超时自动清理 |
| 权限确认超时 | 低 | 默认 30s 超时，自动拒绝并返回错误 |
| 多 Client 并发执行 | 低 | 每个会话独立 Conversation，互不干扰 |
| 序列化 Conversation 的性能 | 低 | Conversation 已经是纯 JSON 对象 |

---

## 8. 时间估算

| Phase | 内容 | 预估时间 |
|-------|------|---------|
| Phase 1 | Server 基础框架 | 1 天 |
| Phase 2 | WebSocket 通信 + 任务执行 | 1.5 天 |
| Phase 3 | 权限确认双向通信 | 1 天 |
| Phase 4 | 会话管理 | 0.5 天 |
| Phase 5 | CLI 远程模式 | 1 天 |
| Phase 6 | REST API 完善 | 0.5 天 |
| Phase 7 | 集成测试与文档 | 0.5 天 |
| **总计** | | **6 天** |

---

## 9. 验收标准

### 9.1 功能验收

| 场景 | 标准 |
|------|------|
| **Server 启动** | `tramber serve` 启动，监听指定端口 |
| **健康检查** | `curl /api/health` 返回 ok |
| **WS 任务执行** | 通过 WS 发送 execute，收到 progress + result |
| **流式输出** | text_delta 实时推送，无丢失 |
| **权限确认** | Server 暂停 → Client 确认 → Server 恢复 |
| **多轮对话** | 同 sessionId 连续 execute，Conversation 累积 |
| **多会话隔离** | 不同 sessionId 互不干扰 |
| **CLI 远程模式** | `--remote ws://host:port` 连接并正常交互 |
| **CLI 本地模式** | 不传 `--remote` 时行为与 Stage 5 完全一致 |

### 9.2 非功能验收

| 指标 | 目标 |
|------|------|
| Server 启动时间 | ≤ 1s |
| WS 消息延迟 | ≤ 50ms |
| 支持并发会话 | ≥ 10 个同时在线 |
| 权限确认超时 | 默认 30s |

---

*文档创建时间: 2026-03-30*
*文档版本: 1.0*
