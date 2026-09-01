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

  async connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return
    if (!getMeId()) return
    const generation = this.generation
    let ticket: string
    try {
      const response = await lingxiApiFetch(`${getServerOrigin()}/api/auth/ws-ticket`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
      })
      if (!response.ok) { this.scheduleReconnect(); return }
      ticket = ((await response.json()) as { ticket: string }).ticket
    } catch {
      this.scheduleReconnect()
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
      try {
        const data = JSON.parse(event.data) as WsEvent
        this.listeners.forEach((listener) => { listener(data) })
      } catch (error) {
        console.error('[realtime] rejected malformed server frame', error)
      }
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
  }

  reconnect() {
    this.generation += 1
    this.intentionalClose = true
    this.socket?.close()
    this.socket = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.intentionalClose = false
    this.reconnectDelay = 500
    void this.connect()
  }
}

export const ws = new RealtimeClient()
