// src/lib/tramber-client.ts
/**
 * Tramber Web Client - WebSocket 客户端
 *
 * 通过 WebSocket 连接 Tramber Server，参考 CLI 的 RemoteClient
 */

export interface ProgressUpdate {
  type: 'step' | 'thinking' | 'tool_call' | 'tool_result' | 'complete' | 'error' | 'text_delta'
  iteration?: number
  content?: string
  toolCall?: { name: string; parameters: Record<string, unknown> }
  toolResult?: { success: boolean; data?: unknown; error?: string }
  error?: string
}

export interface PermissionRequest {
  requestId: string
  toolCall: { id: string; name: string; parameters: Record<string, unknown> }
  operation: string
  reason?: string
}

export interface ExecuteResult {
  success: boolean
  result?: unknown
  error?: string
  terminatedReason?: string
}

export interface ExecuteOptions {
  sceneId?: string
  maxIterations?: number
  stream?: boolean
}

interface WsMessage<T = unknown> {
  type: string
  id: string
  sessionId: string
  payload: T
}

export class TramberClient {
  private ws: WebSocket | null = null
  private sessionId = `web-${crypto.randomUUID().slice(0, 8)}`
  private msgId = 0
  private pendingExecutions = new Map<string, {
    resolve: (result: ExecuteResult) => void
    reject: (error: Error) => void
  }>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  // 回调
  onProgress?: (update: ProgressUpdate) => void
  onPermissionRequired?: (request: PermissionRequest) => Promise<boolean>
  onConnectionChange?: (connected: boolean) => void

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.startHeartbeat()
        this.onConnectionChange?.(true)
        resolve()
      }

      this.ws.onclose = () => {
        this.stopHeartbeat()
        this.rejectAllPending('Connection closed')
        this.onConnectionChange?.(false)
      }

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage
          this.handleMessage(msg)
        } catch {
          console.error('Failed to parse WS message', event.data)
        }
      }
    })
  }

  disconnect(): void {
    this.stopHeartbeat()
    this.ws?.close()
    this.ws = null
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  async execute(description: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.connected) {
      throw new Error('Not connected to server')
    }

    const id = `exec-${++this.msgId}`
    const msg: WsMessage = {
      type: 'execute',
      id,
      sessionId: this.sessionId,
      payload: {
        description,
        sceneId: options?.sceneId ?? 'coding',
        maxIterations: options?.maxIterations ?? 30,
        stream: options?.stream ?? true
      }
    }

    return new Promise((resolve, reject) => {
      this.pendingExecutions.set(id, { resolve, reject })
      this.send(msg)
    })
  }

  sendPermissionResponse(requestId: string, confirmed: boolean): void {
    this.send({
      type: 'permission_response',
      id: `perm-resp-${++this.msgId}`,
      sessionId: this.sessionId,
      payload: { requestId, confirmed }
    })
  }

  cancel(): void {
    this.send({
      type: 'cancel',
      id: `cancel-${++this.msgId}`,
      sessionId: this.sessionId,
      payload: {}
    })
  }

  private handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'progress':
        this.onProgress?.(msg.payload as ProgressUpdate)
        break

      case 'permission_request':
        this.handlePermissionRequest(msg.payload as PermissionRequest)
        break

      case 'result': {
        // result 的 id 对应 execute 的 id（通过 messageId 映射）
        // Server 返回 result 时 id 字段可能用 requestId 或原始 messageId
        // 尝试匹配
        const pending = this.findPendingBySession()
        if (pending) {
          pending.resolve(msg.payload as ExecuteResult)
          this.pendingExecutions.delete(pending.id)
        }
        break
      }

      case 'error': {
        const pending = this.findPendingBySession()
        if (pending) {
          pending.reject(new Error((msg.payload as { message: string }).message))
          this.pendingExecutions.delete(pending.id)
        }
        break
      }

      case 'pong':
        break
    }
  }

  private async handlePermissionRequest(request: PermissionRequest): Promise<void> {
    if (this.onPermissionRequired) {
      const confirmed = await this.onPermissionRequired(request)
      this.sendPermissionResponse(request.requestId, confirmed)
    } else {
      // 默认拒绝
      this.sendPermissionResponse(request.requestId, false)
    }
  }

  private findPendingBySession(): { id: string; resolve: (r: ExecuteResult) => void; reject: (e: Error) => void } | null {
    // 取最后一个 pending（同一 session 通常只有一个活跃 execute）
    const entries = Array.from(this.pendingExecutions.entries())
    if (entries.length === 0) return null
    const [id, handlers] = entries[entries.length - 1]
    return { id, ...handlers }
  }

  private send(message: WsMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'ping',
        id: `ping-${++this.msgId}`,
        sessionId: this.sessionId,
        payload: {}
      })
    }, 30_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [_id, { reject }] of this.pendingExecutions) {
      reject(new Error(reason))
    }
    this.pendingExecutions.clear()
  }
}
