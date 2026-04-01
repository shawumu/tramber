// src/composables/useConnection.ts
/**
 * 全局 WebSocket 连接管理
 */

import { shallowRef, toRefs, reactive } from 'vue'
import { TramberClient } from '../lib/tramber-client'

function getDefaultWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

const state = reactive({
  status: 'disconnected' as 'disconnected' | 'connecting' | 'connected',
  serverUrl: getDefaultWsUrl(),
  error: null as string | null
})

const client = shallowRef<TramberClient | null>(null)

export function useConnection() {
  async function connect(url?: string): Promise<void> {
    if (state.status === 'connected') return

    const targetUrl = url ?? state.serverUrl
    state.status = 'connecting'
    state.error = null

    const c = new TramberClient()
    client.value = c

    c.onConnectionChange = (connected) => {
      state.status = connected ? 'connected' : 'disconnected'
      if (!connected) {
        client.value = null
      }
    }

    try {
      await c.connect(targetUrl)
    } catch (err) {
      state.status = 'disconnected'
      state.error = err instanceof Error ? err.message : String(err)
      client.value = null
    }
  }

  function disconnect(): void {
    client.value?.disconnect()
    client.value = null
    state.status = 'disconnected'
  }

  function getClient(): TramberClient {
    if (!client.value || state.status !== 'connected') {
      throw new Error('Not connected to server')
    }
    return client.value
  }

  return { ...toRefs(state), client, connect, disconnect, getClient }
}
