// packages/server/src/ws-handler.ts
/**
 * WebSocket Handler - 处理 Client 连接和消息
 *
 * 职责：
 * - 管理 WebSocket 连接生命周期
 * - 路由消息到对应处理器
 * - 推送 progress / permission_request / result
 */

import { WebSocket, type WebSocketServer } from 'ws';
import { TramberEngine, type ProgressUpdate } from '@tramber/sdk';
import type { Conversation } from '@tramber/agent';
import { generateId, debug, debugError, LogLevel } from '@tramber/shared';
import { SessionManager } from './session-manager.js';
import type {
  WsMessage,
  ExecutePayload,
  PermissionResponsePayload,
  PermissionRequestPayload,
  ResultPayload
} from './types.js';

const NAMESPACE = 'tramber:server:ws';

export class WsHandler {
  private sessionManager: SessionManager;
  private engine: TramberEngine;
  private permissionTimeoutMs: number;
  /** 追踪每个连接上的活跃执行 AbortController，用于断开时取消 */
  private activeExecutions = new WeakMap<WebSocket, AbortController>();

  constructor(engine: TramberEngine, sessionManager: SessionManager, permissionTimeoutMs = 30_000) {
    this.engine = engine;
    this.sessionManager = sessionManager;
    this.permissionTimeoutMs = permissionTimeoutMs;
  }

  /**
   * 注册到 WebSocketServer
   */
  register(wss: WebSocketServer): void {
    wss.on('connection', (ws, req) => {
      const connId = `conn-${generateId()}`;
      const clientIp = req.socket.remoteAddress;
      debug(NAMESPACE, LogLevel.BASIC, 'WS connected', { connId, clientIp });

      ws.on('message', async (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;
          await this.route(ws, msg);
        } catch (err) {
          debugError(NAMESPACE, `Message parse error: ${err}`);
          this.send(ws, makeMsg('error', 'parse-err', '', { message: `Bad message: ${err instanceof Error ? err.message : String(err)}` }));
        }
      });

      ws.on('close', () => {
        debug(NAMESPACE, LogLevel.BASIC, 'WS disconnected', { connId });
        // 取消该连接上的活跃任务
        const abort = this.activeExecutions.get(ws);
        if (abort) {
          abort.abort();
          this.activeExecutions.delete(ws);
        }
      });

      ws.on('error', (err) => {
        debugError(NAMESPACE, `WS error: ${err.message}`, { connId });
      });
    });
  }

  // ---- 路由 ----

  private async route(ws: WebSocket, msg: WsMessage): Promise<void> {
    const { type, id, sessionId } = msg;
    debug(NAMESPACE, LogLevel.VERBOSE, `← ${type}`, { id, sessionId });

    switch (type) {
      case 'execute':
        return this.handleExecute(ws, id, sessionId, msg.payload as ExecutePayload);
      case 'permission_response':
        return this.handlePermissionResponse(sessionId, msg.payload as PermissionResponsePayload);
      case 'cancel':
        return this.handleCancel(sessionId);
      case 'ping':
        return this.send(ws, makeMsg('pong', id, sessionId, {}));
      default:
        return this.send(ws, makeMsg('error', id, sessionId, { message: `Unknown type: ${type}` }));
    }
  }

  // ---- execute ----

  private async handleExecute(ws: WebSocket, messageId: string, sessionId: string, payload: ExecutePayload): Promise<void> {
    const { description, sceneId, maxIterations, stream } = payload;
    debug(NAMESPACE, LogLevel.BASIC, 'Execute', { sessionId, description: description.slice(0, 80) });

    const session = this.sessionManager.getOrCreate(sessionId);

    // 注册 AbortController，连接断开时可取消
    const abortController = new AbortController();
    this.activeExecutions.set(ws, abortController);

    try {
      const result = await this.engine.execute(description, {
        sceneId: sceneId ?? 'coding',
        maxIterations: maxIterations ?? 30,
        stream: stream ?? true,
        onProgress: (update: ProgressUpdate) => {
          this.send(ws, makeMsg('progress', messageId, session.id, update));
        },
        onPermissionRequired: async (toolCall, operation, reason) => {
          return this.requestPermission(ws, session.id, toolCall, operation, reason);
        }
      }, session.conversation as Conversation | undefined);

      // 检查是否已被取消
      if (abortController.signal.aborted) {
        debug(NAMESPACE, LogLevel.BASIC, 'Execute cancelled (client disconnected)', { sessionId: session.id });
        return;
      }

      // 更新 session conversation
      if (result.conversation) {
        session.conversation = result.conversation;
      }

      const resultPayload: ResultPayload = {
        success: result.success ?? false,
        result: result.result,
        error: result.error,
        terminatedReason: result.terminatedReason
      };
      this.send(ws, makeMsg('result', messageId, session.id, resultPayload));

      debug(NAMESPACE, LogLevel.BASIC, 'Execute done', {
        sessionId: session.id,
        success: result.success,
        reason: result.terminatedReason
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        debug(NAMESPACE, LogLevel.BASIC, 'Execute cancelled (client disconnected)', { sessionId: session.id });
        return;
      }
      debugError(NAMESPACE, `Execute error: ${err}`, { sessionId: session.id });
      this.send(ws, makeMsg('result', messageId, session.id, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        terminatedReason: 'error'
      } satisfies ResultPayload));
    } finally {
      this.activeExecutions.delete(ws);
    }
  }

  // ---- 权限确认（双向通信核心） ----

  private requestPermission(
    ws: WebSocket,
    sessionId: string,
    toolCall: { id: string; name: string; parameters: Record<string, unknown> },
    operation: string,
    reason?: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const requestId = `perm-${generateId()}`;

      // 注册回调，等 Client 回复
      this.sessionManager.registerPermissionCallback(sessionId, requestId, resolve);

      // 发送权限请求
      const payload: PermissionRequestPayload = { requestId, toolCall, operation, reason };
      this.send(ws, makeMsg('permission_request', requestId, sessionId, payload));

      debug(NAMESPACE, LogLevel.VERBOSE, 'Permission requested', { sessionId, requestId, operation });

      // 超时自动拒绝
      setTimeout(() => {
        this.sessionManager.resolvePermission(sessionId, requestId, false);
      }, this.permissionTimeoutMs);
    });
  }

  private handlePermissionResponse(sessionId: string, payload: PermissionResponsePayload): void {
    const { requestId, confirmed } = payload;
    debug(NAMESPACE, LogLevel.VERBOSE, 'Permission response', { sessionId, requestId, confirmed });
    this.sessionManager.resolvePermission(sessionId, requestId, confirmed);
  }

  // ---- cancel ----

  private handleCancel(sessionId: string): void {
    debug(NAMESPACE, LogLevel.BASIC, 'Cancel', { sessionId });
    this.sessionManager.rejectAllPendingPermissions(sessionId);
  }

  // ---- 发送 ----

  private send(ws: WebSocket, message: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

// ---- helpers ----

function makeMsg<T>(type: string, id: string, sessionId: string, payload: T): WsMessage<T> {
  return { type, id, sessionId, payload };
}
