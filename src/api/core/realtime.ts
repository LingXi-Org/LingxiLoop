import type { WsEvent } from '@/api/client'
import { getServerOrigin } from '@/api/core/http'
import { lingxiApiFetch } from '@/api/transport'
import { getAuthToken } from '@/stores/auth'

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

  async connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return
    const token = getAuthToken()
    if (!token) return
    let ticket: string
    try {
      const response = await lingxiApiFetch(`${getServerOrigin()}/api/auth/ws-ticket`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      })
      if (!response.ok) { this.scheduleReconnect(); return }
      ticket = ((await response.json()) as { ticket: string }).ticket
    } catch {
      this.scheduleReconnect()
      return
    }
    const socket = new WebSocket(`${wsOrigin()}/ws?t=${encodeURIComponent(ticket)}`)
    this.socket = socket
    socket.onopen = () => { this.reconnectDelay = 500 }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsEvent
        this.listeners.forEach((listener) => { listener(data) })
      } catch { /* Ignore malformed server frames. */ }
    }
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null
      if (!this.intentionalClose) this.scheduleReconnect()
    }
    socket.onerror = () => { /* onclose owns reconnection */ }
  }

  private scheduleReconnect() {
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000)
    setTimeout(() => { void this.connect() }, delay)
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
    this.socket?.close()
  }

  reconnect() {
    this.intentionalClose = true
    this.socket?.close()
    this.socket = null
    this.intentionalClose = false
    this.reconnectDelay = 500
    void this.connect()
  }
}

export const ws = new RealtimeClient()
