<script setup lang="ts">
import { useConnection } from '../composables/useConnection'

const { status, error, serverUrl } = useConnection()

const statusMap: Record<string, { text: string; color: string }> = {
  connected: { text: 'Connected', color: '#67c23a' },
  connecting: { text: 'Connecting...', color: '#e6a23c' },
  disconnected: { text: 'Disconnected', color: '#909399' }
}
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-dot" :style="{ background: statusMap[status]?.color ?? '#909399' }" />
      <span class="status-text">{{ statusMap[status]?.text ?? 'Unknown' }}</span>
      <span v-if="error" class="status-error">{{ error }}</span>
    </div>
    <div class="status-right">
      <span class="status-server">Server: {{ serverUrl }}</span>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 20px;
  background: #fff;
  border-top: 1px solid #e4e7ed;
  font-size: 12px;
  color: #909399;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-error {
  color: #f56c6c;
}
</style>
