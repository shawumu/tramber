<script setup lang="ts">
import { onMounted } from 'vue'
import ChatView from './components/ChatView.vue'
import StatusBar from './components/StatusBar.vue'
import PermissionDialog from './components/PermissionDialog.vue'
import { useConnection } from './composables/useConnection'

const { connect } = useConnection()

onMounted(async () => {
  try {
    await connect()
  } catch {
    // StatusBar will show disconnected state
  }
})
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1 class="app-title">Tramber</h1>
      <span class="app-subtitle">AI Assisted Programming</span>
    </header>
    <main class="app-main">
      <ChatView />
    </main>
    <StatusBar />
    <PermissionDialog />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.app-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.app-subtitle {
  font-size: 13px;
  color: #909399;
}

.app-main {
  flex: 1;
  overflow: hidden;
}
</style>
