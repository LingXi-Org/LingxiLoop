import WKSDK, { MessageContent, type Message as WKMessage } from 'wukongimjssdk'
import { getServerOrigin } from '@/api/core/http'
import { lingxiApiFetch } from '@/api/transport'
import { getActiveCompanyId, getAuthToken, getMeId } from '@/stores/auth'

export const LINGXI_MESSAGE_CONTENT_TYPE = 1000

export type LingxiMessageV1 = {
  version: 1
  kind: 'text' | 'attachment' | 'system' | 'tool_activity' | 'approval' | 'handoff' | 'questionnaire' | 'poll' | 'artifact' | 'canvas' | 'learning_mission' | 'email'
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
  private boundUid: string | null = null
  private boundCompanyId: string | null = null
  private boundAuthToken: string | null = null
  private connectingKey: string | null = null
  private connectPromise: Promise<void> | null = null
  private listeners = new Set<(message: ImEnvelope) => void>()
  private workspaceChannels = new Set<string>()

  constructor() {
    this.sdk.register(LINGXI_MESSAGE_CONTENT_TYPE, () => new LingxiContent())
    this.sdk.chatManager.addMessageListener((message) => {
      const converted = fromSdk(message)
      if (!this.workspaceChannels.has(converted.channelId)) return
      for (const listener of this.listeners) listener(converted)
    })
  }

  async connect(): Promise<void> {
    const uid = getMeId()
    const companyId = getActiveCompanyId()
    const authToken = getAuthToken()
    if (!uid || !companyId || !authToken) throw new Error('IM connection requires an authenticated workspace')
    const key = `${uid}:${companyId}:${authToken}`
    if (this.started
      && this.boundUid === uid
      && this.boundCompanyId === companyId
      && this.boundAuthToken === authToken) return
    if (this.connectPromise) {
      if (this.connectingKey === key) return this.connectPromise
      try { await this.connectPromise } catch { /* A newer identity retries below. */ }
      return this.connect()
    }

    this.connectingKey = key
    this.connectPromise = (async () => {
      if (this.started) this.sdk.disconnect()
      const response = await lingxiApiFetch(`${getServerOrigin()}/api/im/bootstrap`, { headers: authHeaders() })
      if (!response.ok) throw new Error(`IM bootstrap failed: ${response.status}`)
      const bootstrap = await response.json() as Bootstrap
      if (getMeId() !== uid || getActiveCompanyId() !== companyId || getAuthToken() !== authToken) {
        throw new Error('IM identity changed during bootstrap')
      }
      this.sdk.config.uid = bootstrap.uid
      this.sdk.config.token = bootstrap.token
      this.sdk.config.addr = bootstrap.wsUrl
      this.sdk.connect()
      this.started = true
      this.boundUid = uid
      this.boundCompanyId = companyId
      this.boundAuthToken = authToken
    })().finally(() => {
      this.connectPromise = null
      this.connectingKey = null
    })
    return this.connectPromise
  }

  disconnect(): void {
    this.sdk.disconnect()
    this.started = false
    this.boundUid = null
    this.boundCompanyId = null
    this.boundAuthToken = null
    this.workspaceChannels.clear()
  }

  setWorkspaceChannels(channelIds: Iterable<string>): void {
    this.workspaceChannels = new Set(channelIds)
  }

  subscribe(listener: (message: ImEnvelope) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async history(channelId: string, limit = 80, beforeMessageSeq = 0): Promise<ImEnvelope[]> {
    const query = new URLSearchParams({ limit: String(limit) })
    if (beforeMessageSeq > 0) query.set('beforeSeq', String(beforeMessageSeq))
    const response = await lingxiApiFetch(`${getServerOrigin()}/api/im/channels/${encodeURIComponent(channelId)}/messages?${query}`, { headers: authHeaders() })
    if (!response.ok) throw new Error(`IM history failed: ${response.status}`)
    return response.json() as Promise<ImEnvelope[]>
  }

  async send(channelId: string, payload: LingxiMessageV1): Promise<ImEnvelope> {
    const response = await lingxiApiFetch(`${getServerOrigin()}/api/im/channels/${encodeURIComponent(channelId)}/messages/accept`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ clientNonce: payload.clientMsgNo, payload }),
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
