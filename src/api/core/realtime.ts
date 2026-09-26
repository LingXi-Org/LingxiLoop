import { useAuth } from '@/stores/auth'
import type { WsEvent } from '@/api/contracts'
import { getServerOrigin } from '@/api/core/http'
import { lingxiApiFetch } from '@/api/transport'
import { getMeId } from '@/stores/auth'

type Listener = (event: WsEvent) => void

const wsOrigin = () => {
  const origin = getServerOrigin()
  if (origin) return origin.replace(/^http/, 'ws')
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
}

class RealtimeClient {
  private socket: WebSocket | null = null
  private listeners = new Set<Listener>()
  private reconnectDelay = 500
  private intentionalClose = false
  private generation = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connecting: Promise<void> | null = null

  connect(): Promise<void> {
    if (this.intentionalClose || !getMeId()) return Promise.resolve()
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return Promise.resolve()
    if (this.connecting) return this.connecting
    const pending = this.openConnection(this.generation).finally(() => {
      if (this.connecting === pending) this.connecting = null
    })
    this.connecting = pending
    return pending
  }

  private async openConnection(generation: number): Promise<void> {
    let ticket: string
    try {
      const response = await lingxiApiFetch(`${getServerOrigin()}/api/auth/ws-ticket`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      })
      if (!response.ok) {
        if (generation === this.generation) this.scheduleReconnect()
        return
      }
      ticket = ((await response.json()) as { ticket: string }).ticket
    } catch {
      if (generation === this.generation) this.scheduleReconnect()
      return
    }
    if (generation !== this.generation || this.intentionalClose) return
    const socket = new WebSocket(`${wsOrigin()}/ws?t=${encodeURIComponent(ticket)}`)
    this.socket = socket
    socket.onopen = () => {
      if (this.socket !== socket) { socket.close(); return }
      this.reconnectDelay = 500
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket || generation !== this.generation) return
      try {
        const data = JSON.parse(event.data) as WsEvent
        this.listeners.forEach((listener) => { listener(data) })
      } catch (error) {
        console.error('[realtime] rejected malformed server frame', error)
      }
    }
    socket.onclose = (event) => {
      if (this.socket !== socket || generation !== this.generation) return
      if (event.code === 4403) { useAuth.getState().clear(); return }
      this.socket = null
      if (!this.intentionalClose) this.scheduleReconnect()
    }
    socket.onerror = () => { /* onclose owns reconnection */ }
  }

  private scheduleReconnect() {
    if (this.intentionalClose || this.reconnectTimer) return
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  send(payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    try { this.socket.send(JSON.stringify(payload)); return true } catch { return false }
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  close() {
    this.intentionalClose = true
    this.generation += 1
    this.connecting = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
  }

  reconnect() {
    this.close()
    this.intentionalClose = false
    this.reconnectDelay = 500
    void this.connect()
  }
}

export const ws = new RealtimeClient()
