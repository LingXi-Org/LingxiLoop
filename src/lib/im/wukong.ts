import { getServerOrigin } from '@/api/core/http'
import WKSDK, { MessageContent, type WKEvent, type Message as WKMessage } from 'wukongimjssdk'
import { lingxiApiFetch } from '@/api/transport'
import { getActiveCompanyId, getAuthToken } from '@/stores/auth'

export const LINGXI_MESSAGE_CONTENT_TYPE = 1000

export type LingxiMessageV1 = {
  version: 1
  kind: 'text' | 'attachment' | 'system' | 'tool_activity' | 'approval' | 'handoff' | 'questionnaire' | 'poll' | 'artifact' | 'canvas' | 'learning_mission'
  clientMsgNo: string
  body?: string
  replyToClientMsgNo?: string
  refs?: Record<string, string | string[]>
  data?: Record<string, unknown>
}

export interface ImEnvelope {
  messageId: string
  messageSeq: number
  clientMsgNo: string
  channelId: string
  channelType: number
  fromUid: string
  timestamp: number
  payload: LingxiMessageV1
}

export interface ImStreamEvent {
  id: string
  type: 'stream.open' | 'stream.delta' | 'stream.close' | 'stream.error' | 'stream.cancel'
  timestamp: number
  channelId: string
  channelType: number
  fromUid: string
  clientMsgNo: string
  kind?: string
  text?: string
  delta?: string
  phase?: 'thinking'
  queued?: boolean
  streamSeq?: number
}

type Bootstrap = { uid: string; token: string; wsUrl: string; apiVersion: 3; sdkVersion: '1.3.5' }

class LingxiContent extends MessageContent {
  constructor(payload?: LingxiMessageV1) {
    super()
    this.contentType = LINGXI_MESSAGE_CONTENT_TYPE
    this.contentObj = payload ?? { version: 1, kind: 'text', clientMsgNo: '', body: '' }
  }
  override decodeJSON(value: unknown): void { this.contentObj = value }
  override encodeJSON(): unknown { return this.contentObj }
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  const companyId = getActiveCompanyId()
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(companyId ? { 'x-company-id': companyId } : {}),
  }
}

function fromSdk(message: WKMessage): ImEnvelope {
  const raw = message.content instanceof LingxiContent
    ? message.content.contentObj
    : (message.content as { contentObj?: unknown })?.contentObj
  const payload = raw && typeof raw === 'object' ? raw as LingxiMessageV1 : {
    version: 1 as const, kind: 'text' as const, clientMsgNo: message.clientMsgNo, body: String(raw ?? ''),
  }
  return {
    messageId: message.messageID,
    messageSeq: message.messageSeq,
    clientMsgNo: message.clientMsgNo || payload.clientMsgNo,
    channelId: message.channel.channelID,
    channelType: message.channel.channelType,
    fromUid: message.fromUID,
    timestamp: message.timestamp,
    payload,
  }
}

export class LingxiImClient {
  private readonly sdk = WKSDK.shared()
  private started = false
  private listeners = new Set<(message: ImEnvelope) => void>()
  private eventListeners = new Set<(event: ImStreamEvent) => void>()
  private workspaceChannels = new Set<string>()

  constructor() {
    this.sdk.register(LINGXI_MESSAGE_CONTENT_TYPE, () => new LingxiContent())
    this.sdk.chatManager.addMessageListener((message) => {
      const converted = fromSdk(message)
      if (!this.workspaceChannels.has(converted.channelId)) return
      for (const listener of this.listeners) listener(converted)
    })
    this.sdk.eventManager.addEventListener((event: WKEvent) => {
      if (!['stream.open', 'stream.delta', 'stream.close', 'stream.error', 'stream.cancel'].includes(event.type)) return
      const data = event.dataJson && typeof event.dataJson === 'object' ? event.dataJson as Record<string, unknown> : {}
      const converted: ImStreamEvent = {
        id: event.id,
        type: event.type as ImStreamEvent['type'],
        timestamp: event.timestamp,
        channelId: String(data.channelId ?? ''),
        channelType: Number(data.channelType ?? 2),
        fromUid: String(data.fromUid ?? ''),
        clientMsgNo: String(data.clientMsgNo ?? ''),
        kind: typeof data.kind === 'string' ? data.kind : undefined,
        text: typeof data.text === 'string' ? data.text : undefined,
        delta: typeof data.delta === 'string' ? data.delta : undefined,
        phase: data.phase === 'thinking' ? 'thinking' : undefined,
        queued: data.queued === true,
        streamSeq: typeof data.streamSeq === 'number' && Number.isSafeInteger(data.streamSeq) ? data.streamSeq : undefined,
      }
      if (!converted.channelId || !converted.fromUid || !converted.clientMsgNo) return
      if (!this.workspaceChannels.has(converted.channelId)) return
      for (const listener of this.eventListeners) listener(converted)
    })
  }

  async connect(): Promise<void> {
    if (this.started && this.sdk.connectManager.connected()) return
    const response = await lingxiApiFetch(`${getServerOrigin()}/api/im/bootstrap`, { headers: authHeaders() })
    if (!response.ok) throw new Error(`IM bootstrap failed: ${response.status}`)
    const bootstrap = await response.json() as Bootstrap
    this.sdk.config.uid = bootstrap.uid
    this.sdk.config.token = bootstrap.token
    this.sdk.config.addr = bootstrap.wsUrl
    this.sdk.connect()
    this.started = true
  }

  disconnect(): void { this.sdk.disconnect(); this.started = false }

  setWorkspaceChannels(channelIds: Iterable<string>): void {
    this.workspaceChannels = new Set(channelIds)
  }

  subscribe(listener: (message: ImEnvelope) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeEvent(listener: (event: ImStreamEvent) => void): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  async history(channelId: string, limit = 80): Promise<ImEnvelope[]> {
    const response = await lingxiApiFetch(`${getServerOrigin()}/api/im/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`, { headers: authHeaders() })
    if (!response.ok) throw new Error(`IM history failed: ${response.status}`)
    return response.json() as Promise<ImEnvelope[]>
  }

  async send(channelId: string, payload: LingxiMessageV1, channelType = 2): Promise<ImEnvelope> {
    const response = await lingxiApiFetch(`${getServerOrigin()}/api/im/channels/${encodeURIComponent(channelId)}/messages/accept`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ clientNonce: payload.clientMsgNo, payload, channelType }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`IM send acceptance failed: ${response.status} ${detail.slice(0, 300)}`)
    }
    const value = await response.json() as { echo: ImEnvelope }
    return value.echo
  }

  async sendStatus(clientNonce: string): Promise<{ status: string; echo?: ImEnvelope; error?: string }> {
    const response = await lingxiApiFetch(`${getServerOrigin()}/api/im/sends/${encodeURIComponent(clientNonce)}`, { headers: authHeaders() })
    if (response.status === 404) return { status: 'missing' }
    if (!response.ok) throw new Error(`IM send recovery failed: ${response.status}`)
    return await response.json() as { status: string; echo?: ImEnvelope; error?: string }
  }
}

export const lingxiIm = new LingxiImClient()
