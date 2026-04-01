<script setup lang="ts">
import { ref } from 'vue'
import { ElInput, ElButton } from 'element-plus'
import { Promotion } from '@element-plus/icons-vue'

defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
}>()

const input = ref('')

function handleSend(): void {
  const content = input.value.trim()
  if (!content) return
  emit('send', content)
  input.value = ''
}

function handleKeydown(e: Event): void {
  const ke = e as KeyboardEvent
  if (ke.key === 'Enter' && !ke.shiftKey) {
    ke.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="message-input">
    <ElInput
      v-model="input"
      type="textarea"
      :rows="2"
      :placeholder="disabled ? '执行中...' : '输入任务描述，按 Enter 发送'"
      :disabled="disabled"
      resize="none"
      @keydown="handleKeydown"
    />
    <ElButton
      type="primary"
      :icon="Promotion"
      :disabled="disabled || !input.trim()"
      @click="handleSend"
    >
      发送
    </ElButton>
  </div>
</template>

<style scoped>
.message-input {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #fff;
  border-top: 1px solid #e4e7ed;
}

.message-input :deep(.el-textarea) {
  flex: 1;
}

.message-input :deep(.el-textarea__inner) {
  font-size: 14px;
}

.message-input .el-button {
  align-self: flex-end;
}
</style>
