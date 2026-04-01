<script setup lang="ts">
import MessageList from './MessageList.vue'
import MessageInput from './MessageInput.vue'
import { useChat } from '../composables/useChat'

const { messages, isExecuting, sendMessage } = useChat()

async function handleSend(content: string) {
  await sendMessage(content)
}
</script>

<template>
  <div class="chat-view">
    <MessageList :messages="messages" />
    <MessageInput :disabled="isExecuting" @send="handleSend" />
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
