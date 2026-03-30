// packages/server/src/session-manager.ts
/**
 * Session Manager - 多会话管理
 *
 * 管理多个 Client 的会话状态：
 * - 每个 session 对应一个 Conversation
 * - 每个 session 可能有等待中的权限确认回调
 * - 支持超时清理
 */

import type { Conversation } from '@tramber/agent';
import { generateId, debug, debugError, LogLevel } from '@tramber/shared';

const NAMESPACE = 'tramber:server:session';

export interface Session {
  id: string;
  conversation?: Conversation;
  createdAt: Date;
  lastActivity: Date;
  /** 等待中的权限确认回调：requestId → resolve */
  pendingPermissions: Map<string, (confirmed: boolean) => void>;
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly sessionTimeoutMs = 3600_000) {}

  /**
   * 获取已有会话，或创建新会话
   */
  getOrCreate(sessionId?: string): Session {
    const id = sessionId ?? `session-${generateId()}`;

    let session = this.sessions.get(id);
    if (session) {
      session.lastActivity = new Date();
      return session;
    }

    session = {
      id,
      createdAt: new Date(),
      lastActivity: new Date(),
      pendingPermissions: new Map()
    };
    this.sessions.set(id, session);
    debug(NAMESPACE, LogLevel.BASIC, 'Session created', { sessionId: id, totalSessions: this.sessions.size });
    return session;
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 注册权限确认等待回调
   */
  registerPermissionCallback(
    sessionId: string,
    requestId: string,
    resolve: (confirmed: boolean) => void
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      debugError(NAMESPACE, `Session not found: ${sessionId}`);
      resolve(false);
      return;
    }
    session.pendingPermissions.set(requestId, resolve);
  }

  /**
   * 解除权限确认等待
   */
  resolvePermission(sessionId: string, requestId: string, confirmed: boolean): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const callback = session.pendingPermissions.get(requestId);
    if (!callback) return false;

    session.pendingPermissions.delete(requestId);
    callback(confirmed);
    return true;
  }

  /**
   * 拒绝会话中所有等待中的权限请求
   */
  rejectAllPendingPermissions(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const [, callback] of session.pendingPermissions) {
      callback(false);
    }
    session.pendingPermissions.clear();
  }

  delete(sessionId: string): void {
    this.rejectAllPendingPermissions(sessionId);
    this.sessions.delete(sessionId);
    debug(NAMESPACE, LogLevel.BASIC, 'Session deleted', { sessionId, totalSessions: this.sessions.size });
  }

  startCleanup(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.sessionTimeoutMs) {
        this.rejectAllPendingPermissions(id);
        this.sessions.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      debug(NAMESPACE, LogLevel.BASIC, `Cleaned ${cleaned} expired sessions`, { remaining: this.sessions.size });
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}
