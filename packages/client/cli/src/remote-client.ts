// packages/client/cli/src/remote-client.ts
/**
 * RemoteClient - 通过 WebSocket 连接远程 Tramber Server
 *
 * 实现与 TramberEngine 相同的 EngineLike 接口，
 * CLI App 组件无感知切换本地/远程。
 */

import WebSocket from 'ws';
import type { ExecuteOptions, TramberResponse, ProgressUpdate } from '@tramber/sdk';
import type { Conversation } from '@tramber/agent';
import type { SkillManifest } from '@tramber/skill';
import type { EngineLike } from './engine-interface.js';
import { generateId } from '@tramber/shared';

interface PendingExecute {
  resolve: (result: TramberResponse & { conversation?: Conversation }) => void;
  onProgress?: (update: ProgressUpdate) => void;
  onPermissionRequired?: ExecuteOptions['onPermissionRequired'];
}

export class RemoteClient implements EngineLike {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private serverUrl: string;
  private pendingExecutes = new Map<string, PendingExecute>();
  private connected = false;
  private connectPromise: Promise<void> | null = null;

  // REST 查询缓存
  private cachedSkills: SkillManifest[] = [];

  constructor(serverUrl: string) {
    this.sessionId = `cli-${generateId()}`;
    this.serverUrl = serverUrl;
  }

  /**
   * 连接 Server
   */
  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/ws';
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleMessage(msg);
        } catch (err) {
          console.error('RemoteClient: message parse error', err);
        }
      });

      this.ws.on('close', () => {
        this.connected = false;
        // 拒绝所有等待中的请求
        for (const [id, pending] of this.pendingExecutes) {
          pending.resolve({
            success: false,
            error: 'Connection closed'
          });
        }
        this.pendingExecutes.clear();
      });

      this.ws.on('error', (err) => {
        if (!this.connected) {
          reject(new Error(`Failed to connect to ${wsUrl}: ${err.message}`));
        }
      });
    });

    return this.connectPromise;
  }

  /**
   * 执行任务
   */
  async execute(
    description: string,
    options: ExecuteOptions = {},
    conversation?: Conversation
  ): Promise<TramberResponse & { conversation?: Conversation }> {
    await this.connect();

    const messageId = `exec-${generateId()}`;

    return new Promise((resolve) => {
      this.pendingExecutes.set(messageId, {
        resolve,
        onProgress: options.onProgress,
        onPermissionRequired: options.onPermissionRequired
      });

      this.send({
        type: 'execute',
        id: messageId,
        sessionId: this.sessionId,
        payload: {
          description,
          sceneId: options.sceneId,
          maxIterations: options.maxIterations,
          stream: options.stream ?? true
        }
      });
    });
  }

  listUserSkills(): SkillManifest[] {
    return this.cachedSkills;
  }

  async enableSkill(_slug: string): Promise<void> {
    // TODO: 通过 REST API 实现
  }

  async disableSkill(_slug: string): Promise<void> {
    // TODO: 通过 REST API 实现
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  // ---- 内部 ----

  private handleMessage(msg: any): void {
    const { type, id, sessionId, payload } = msg;

    switch (type) {
      case 'progress': {
        const pending = this.pendingExecutes.get(id);
        if (pending?.onProgress) {
          pending.onProgress(payload as ProgressUpdate);
        }
        break;
      }

      case 'permission_request': {
        const pending = this.findPendingBySession(sessionId);
        if (pending?.onPermissionRequired && payload) {
          const { requestId, toolCall, operation, reason } = payload;
          pending.onPermissionRequired(toolCall, operation, reason).then((confirmed) => {
            this.send({
              type: 'permission_response',
              id: requestId,
              sessionId: this.sessionId,
              payload: { requestId, confirmed }
            });
          });
        }
        break;
      }

      case 'result': {
        const pending = this.pendingExecutes.get(id);
        if (pending) {
          this.pendingExecutes.delete(id);
          pending.resolve({
            success: payload.success ?? false,
            result: payload.result,
            error: payload.error,
            terminatedReason: payload.terminatedReason
          });
        }
        break;
      }

      case 'error': {
        const pending = this.pendingExecutes.get(id);
        if (pending) {
          this.pendingExecutes.delete(id);
          pending.resolve({
            success: false,
            error: payload?.message ?? 'Unknown error'
          });
        }
        break;
      }

      case 'pong':
        // 心跳回复，忽略
        break;
    }
  }

  private findPendingBySession(sessionId: string): PendingExecute | undefined {
    // 通过 sessionId 查找当前活跃的 execute（权限确认消息可能用不同 id）
    for (const [, pending] of this.pendingExecutes) {
      return pending; // 当前设计下一个 session 只有一个活跃 execute
    }
    return undefined;
  }

  private send(msg: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
