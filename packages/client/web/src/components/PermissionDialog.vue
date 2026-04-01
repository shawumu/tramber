<script setup lang="ts">
import { computed } from 'vue'
import { ElDialog, ElButton, ElDescriptions, ElDescriptionsItem, ElTag } from 'element-plus'
import { useChat } from '../composables/useChat'

const { pendingPermission, resolvePermission } = useChat()

const visible = computed(() => pendingPermission.value !== null)
const request = computed(() => pendingPermission.value?.request)

function formatParams(params: Record<string, unknown>): string {
  try {
    return JSON.stringify(params, null, 2)
  } catch {
    return String(params)
  }
}

function handleConfirm(): void {
  resolvePermission(true)
}

function handleReject(): void {
  resolvePermission(false)
}
</script>

<template>
  <ElDialog
    v-model="visible"
    title="权限确认"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <template v-if="request">
      <p class="perm-desc">Agent 请求执行以下操作：</p>
      <ElDescriptions :column="1" border>
        <ElDescriptionsItem label="操作类型">
          <ElTag>{{ request.operation }}</ElTag>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="工具">
          {{ request.toolCall.name }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="参数">
          <pre class="perm-params">{{ formatParams(request.toolCall.parameters) }}</pre>
        </ElDescriptionsItem>
        <ElDescriptionsItem v-if="request.reason" label="原因">
          {{ request.reason }}
        </ElDescriptionsItem>
      </ElDescriptions>
    </template>

    <template #footer>
      <ElButton @click="handleReject">拒绝</ElButton>
      <ElButton type="primary" @click="handleConfirm">确认</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.perm-desc {
  margin-bottom: 12px;
  font-size: 14px;
  color: #606266;
}

.perm-params {
  margin: 0;
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
