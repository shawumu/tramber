<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import MessageItem from './MessageItem.vue'
import type { ChatMessage } from '../composables/useChat'

const props = defineProps<{
  messages: ChatMessage[]
}>()

const listRef = ref<HTMLElement | null>(null)

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  }
)
</script>

<template>
  <div ref="listRef" class="message-list">
    <div v-if="messages.length === 0" class="empty-state">
      <p class="empty-title">Tramber Web</p>
      <p class="empty-desc">输入任务描述，开始与 AI 对话</p>
    </div>
    <MessageItem
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
    />
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
}

.empty-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 14px;
}
</style>
