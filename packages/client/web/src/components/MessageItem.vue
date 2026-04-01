<script setup lang="ts">
import type { ChatMessage, ToolCallDisplay } from '../composables/useChat'

defineProps<{
  message: ChatMessage
}>()

function formatToolParams(params: Record<string, unknown>): string {
  try {
    return JSON.stringify(params, null, 2)
  } catch {
    return String(params)
  }
}

function formatToolResult(result: ToolCallDisplay['result']): string {
  if (!result) return ''
  if (result.error) return `❌ ${result.error}`
  if (result.data) {
    const data = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
    return data.length > 500 ? data.slice(0, 500) + '...' : data
  }
  return result.success ? '✅ Done' : '❌ Failed'
}
</script>

<template>
  <div class="message-item" :class="[`message-${message.role}`, `status-${message.status}`]">
    <div class="message-role">
      <span v-if="message.role === 'user'" class="role-badge user">You</span>
      <span v-else class="role-badge assistant">AI</span>
    </div>

    <div class="message-body">
      <!-- 文本内容 -->
      <div v-if="message.content" class="message-content">
        <pre class="content-text">{{ message.content }}</pre>
      </div>

      <!-- 工具调用 -->
      <div v-if="message.toolCalls.length > 0" class="tool-calls">
        <div v-for="tc in message.toolCalls" :key="tc.id" class="tool-call">
          <div class="tool-header">
            <span class="tool-icon">🔧</span>
            <span class="tool-name">{{ tc.name }}</span>
          </div>
          <details class="tool-details">
            <summary>参数</summary>
            <pre class="tool-params">{{ formatToolParams(tc.parameters) }}</pre>
          </details>
          <div v-if="tc.result" class="tool-result" :class="{ 'tool-error': !tc.result.success }">
            {{ formatToolResult(tc.result) }}
          </div>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="message.status === 'streaming' && !message.content && message.toolCalls.length === 0" class="thinking">
        <span class="dot-animation">思考中...</span>
      </div>

      <!-- 错误 -->
      <div v-if="message.error" class="message-error">
        {{ message.error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
}

.message-item + .message-item {
  border-top: 1px solid #f0f2f5;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.role-badge.user {
  background: #409eff;
  color: #fff;
}

.role-badge.assistant {
  background: #f0f9eb;
  color: #67c23a;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.content-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.tool-calls {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-call {
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.tool-icon {
  font-size: 14px;
}

.tool-name {
  color: #606266;
  font-family: 'SF Mono', Consolas, monospace;
}

.tool-details {
  margin-top: 6px;
}

.tool-details summary {
  cursor: pointer;
  color: #909399;
  font-size: 12px;
}

.tool-params {
  margin-top: 4px;
  padding: 8px;
  background: #fff;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
}

.tool-result {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: #f0f9eb;
  color: #67c23a;
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-result.tool-error {
  background: #fef0f0;
  color: #f56c6c;
}

.thinking {
  color: #909399;
  font-size: 14px;
}

.dot-animation {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.message-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fef0f0;
  color: #f56c6c;
  border-radius: 4px;
  font-size: 13px;
}
</style>
