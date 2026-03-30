// packages/server/src/types.ts
/**
 * Server 类型定义
 */

/** Server 配置 */
export interface ServerOptions {
  /** 监听端口，默认 3100 */
  port?: number;
  /** 监听地址，默认 0.0.0.0 */
  host?: string;
  /** Engine 选项（透传给 TramberEngine constructor） */
  engine?: Record<string, unknown>;
  /** 权限确认超时（毫秒），默认 30000 */
  permissionTimeout?: number;
  /** 会话超时（毫秒），默认 3600000 (1小时) */
  sessionTimeout?: number;
}

/** WS 消息信封 */
export interface WsMessage<T = unknown> {
  type: string;
  id: string;
  sessionId: string;
  payload: T;
}

// --- Client → Server payloads ---

export interface ExecutePayload {
  description: string;
  sceneId?: string;
  maxIterations?: number;
  stream?: boolean;
}

export interface PermissionResponsePayload {
  requestId: string;
  confirmed: boolean;
}

// --- Server → Client payloads ---

export interface PermissionRequestPayload {
  requestId: string;
  toolCall: { id: string; name: string; parameters: Record<string, unknown> };
  operation: string;
  reason?: string;
}

export interface ResultPayload {
  success: boolean;
  result?: unknown;
  error?: string;
  terminatedReason?: string;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}
