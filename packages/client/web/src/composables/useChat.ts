// src/composables/useChat.ts
/**
 * 聊天状态管理
 */

import { ref } from 'vue'
import { useConnection } from './useConnection'
import type { ProgressUpdate, PermissionRequest, ExecuteResult } from '../lib/tramber-client'

export interface ToolCallDisplay {
  id: string
  name: string
  parameters: Record<string, unknown>
  result?: { success: boolean; data?: unknown; error?: string }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls: ToolCallDisplay[]
  status: 'sending' | 'streaming' | 'done' | 'error'
  timestamp: number
  error?: string
}

export interface PermissionInfo {
  request: PermissionRequest
  resolve: (confirmed: boolean) => void
}

const messages = ref<ChatMessage[]>([])
const isExecuting = ref(false)
const pendingPermission = ref<PermissionInfo | null>(null)

export function useChat() {
  const { getClient } = useConnection()

  async function sendMessage(content: string): Promise<void> {
    if (!content.trim()) return

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      toolCalls: [],
      status: 'done',
      timestamp: Date.now()
    }
    messages.value.push(userMsg)

    // 准备 assistant 消息
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      toolCalls: [],
      status: 'streaming',
      timestamp: Date.now()
    }
    messages.value.push(assistantMsg)

    isExecuting.value = true

    try {
      const client = getClient()

      // 设置 progress 回调
      client.onProgress = (update: ProgressUpdate) => {
        handleProgress(assistantMsg.id, update)
      }

      // 设置权限回调
      client.onPermissionRequired = async (request: PermissionRequest): Promise<boolean> => {
        return new Promise((resolve) => {
          pendingPermission.value = { request, resolve }
        })
      }

      const result: ExecuteResult = await client.execute(content.trim())
      handleResult(assistantMsg.id, result)
    } catch (err) {
      updateMessage(assistantMsg.id, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
    } finally {
      isExecuting.value = false
    }
  }

  function handleProgress(msgId: string, update: ProgressUpdate): void {
    const msg = messages.value.find(m => m.id === msgId)
    if (!msg) return

    switch (update.type) {
      case 'text_delta':
        msg.content += update.content ?? ''
        break

      case 'tool_call':
        if (update.toolCall) {
          msg.toolCalls.push({
            id: `tc-${Date.now()}`,
            name: update.toolCall.name,
            parameters: update.toolCall.parameters
          })
        }
        break

      case 'tool_result':
        if (update.toolResult && msg.toolCalls.length > 0) {
          // 填充最后一个 toolCall 的结果
          const lastCall = msg.toolCalls[msg.toolCalls.length - 1]
          lastCall.result = update.toolResult
        }
        break

      case 'thinking':
        msg.content += update.content ?? ''
        break
    }
  }

  function handleResult(msgId: string, result: ExecuteResult): void {
    const msg = messages.value.find(m => m.id === msgId)
    if (!msg) return

    if (result.success) {
      msg.status = 'done'
      if (result.result && !msg.content) {
        msg.content = String(result.result)
      }
    } else {
      msg.status = 'error'
      msg.error = result.error ?? 'Unknown error'
    }
  }

  function updateMessage(msgId: string, updates: Partial<ChatMessage>): void {
    const msg = messages.value.find(m => m.id === msgId)
    if (msg) Object.assign(msg, updates)
  }

  function resolvePermission(confirmed: boolean): void {
    if (pendingPermission.value) {
      pendingPermission.value.resolve(confirmed)
      pendingPermission.value = null
    }
  }

  function clearMessages(): void {
    messages.value = []
  }

  return {
    messages,
    isExecuting,
    pendingPermission,
    sendMessage,
    resolvePermission,
    clearMessages
  }
}
