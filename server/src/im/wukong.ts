import { createHmac, timingSafeEqual } from 'node:crypto'
import { nativeMessageSchema, NATIVE_MESSAGE_CONTENT_TYPE, type NativeMessage } from './message-types.js'
import type { ImBootstrap, ImChannelProfile, ImMessage } from './types.js'

export interface WukongConfig {
  apiUrl: string
  wsUrl: string
  apiToken: string
  webhookSecret: string
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function isEmptyChannelResult(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // The pinned WuKongIM v3 HTTP API sends application/store errors
  // through writeJSONError, which uses HTTP 400 even for a missing message
  // channel or conversation membership. Older builds used 404/500. All three
  // mean the same thing here: there is no history/unread state yet. Only
  // suppress responses whose detail explicitly identifies an empty target so
  // malformed requests and unrelated storage failures still surface.
  return /returned 404(?:\D|$)/.test(error.message)
    || (/returned (?:400|500)(?:\D|$)/.test(error.message) && isEmptyChannelDetail(error.message))
}

function isEmptyChannelDetail(detail: string): boolean {
  return /not[\s_-]*found|no[\s_-]*messages?|channel[^\r\n]{0,40}(?:missing|does not exist)|不存在|未找到|没有消息|无消息/i.test(detail)
}

function isMissingChannelMembership(error: unknown): boolean {
  return error instanceof Error
    && /WuKongIM \/channel\/messagesync returned 400:/i.test(error.message)
    && /valid channel membership required/i.test(error.message)
}

export class WukongClient {
  constructor(readonly config: WukongConfig, private readonly signal?: AbortSignal) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.apiUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      signal: AbortSignal.any([AbortSignal.timeout(15_000), ...[this.signal, init.signal].filter((signal): signal is AbortSignal => !!signal)]),
      headers: {
        'content-type': 'application/json',
        token: this.config.apiToken,
        ...init.headers,
      },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`WuKongIM ${path} returned ${response.status}: ${detail.slice(0, 500)}`)
    }
    const text = await response.text()
    return (text ? JSON.parse(text) : {}) as T
  }

  async revokeUser(uid: string): Promise<void> {
    await this.request('/user/device_quit', { method: 'POST', body: JSON.stringify({ uid, device_flag: -1 }) })
  }

  async bootstrap(uid: string, token: string): Promise<ImBootstrap> {
    await this.request('/user/token', { method: 'POST', body: JSON.stringify({ uid, token }) })
    return { uid, token, wsUrl: this.config.wsUrl, apiVersion: 3, sdkVersion: '1.3.5' }
  }

  async upsertChannel(profile: ImChannelProfile): Promise<void> {
    await this.request('/channel', {
      method: 'POST',
      // WuKongIM v3's HTTP API uses integer switches, not JSON
      // booleans. Reset makes reconciliation converge membership exactly and
      // remains safe to replay after a partial cutover.
      body: JSON.stringify({
        channel_id: profile.channelId,
        channel_type: profile.channelType,
        large: 0,
        reset: 1,
        subscribers: profile.channelType === 1 ? [] : profile.members,
      }),
    })
  }

  async sendMessage(channelId: string, channelType: number, fromUid: string, payload: NativeMessage, clientNonce = payload.id): Promise<{ messageId: string; messageSeq: number }> {
    const value = await this.request<Record<string, unknown>>('/message/send', {
      method: 'POST',
      body: JSON.stringify({
        from_uid: fromUid,
        channel_id: channelId,
        channel_type: channelType,
        client_msg_no: clientNonce,
        payload: Buffer.from(JSON.stringify({ type: NATIVE_MESSAGE_CONTENT_TYPE, ...nativeMessageSchema.parse(payload) }), 'utf8').toString('base64'),
      }),
    })
    return {
      messageId: String(value.message_id ?? value.messageId ?? ''),
      messageSeq: Number(value.message_seq ?? value.messageSeq ?? 0),
    }
  }

  async listConversations(uid: string): Promise<Array<{
    channelId: string; channelType: number; unread: number; activeAt: number
    lastMessage: ImMessage | null
  }>> {
    const collected = new Map<string, { channelId: string; channelType: number; unread: number; activeAt: number; lastMessage: ImMessage | null }>()
    let cursor = ''
    for (let page = 0; page < 20; page++) {
      const value = await this.request<Record<string, unknown>>('/conversation/list', {
        method: 'POST', body: JSON.stringify({ uid, cursor, limit: 200, completed_coverage: 0 }),
      })
      const rows = Array.isArray(value.conversations) ? value.conversations : []
      for (const raw of rows) {
        const item = jsonRecord(raw)
        const channelId = String(item.channel_id ?? '')
        const channelType = Number(item.channel_type ?? 2)
        const last = jsonRecord(item.last_message)
        let lastMessage: ImMessage | null = null
        if (Object.keys(last).length > 0) {
          const encoded = typeof last.payload === 'string' ? last.payload : ''
          const payload = storedNativePayload(encoded)
          // Durable IM can retain retired message types; they have no native preview.
          if (payload) {
            lastMessage = {
              messageId: String(last.message_idstr ?? last.message_id ?? ''),
              messageSeq: Number(last.message_seq ?? 0), clientMsgNo: String(last.client_msg_no ?? ''),
              channelId, channelType, fromUid: String(last.from_uid ?? ''),
              timestamp: Math.floor(Number(last.server_timestamp_ms ?? 0) / 1000), payload,
            }
          }
        }
        collected.set(`${channelId}:${channelType}`, {
          channelId, channelType, unread: Number(item.unread ?? 0), activeAt: Number(item.active_at ?? 0), lastMessage,
        })
      }
      if (value.done === true) break
      const next = String(value.next_cursor ?? '')
      if (!next || next === cursor) break
      cursor = next
    }
    return [...collected.values()]
  }

  async clearUnread(uid: string, channelId: string, channelType: number): Promise<void> {
    try {
      await this.request('/conversations/clearUnread', {
        method: 'POST', body: JSON.stringify({ uid, channel_id: channelId, channel_type: channelType }),
      })
    } catch (error) {
      // WuKongIM has no conversation to clear until a channel receives a message.
      if (!isEmptyChannelResult(error)) throw error
    }
  }

  async setUnread(uid: string, channelId: string, channelType: number, unread: number): Promise<void> {
    const next = Math.max(0, Math.trunc(unread))
    try {
      await this.request('/conversations/setUnread', {
        method: 'POST',
        body: JSON.stringify({ uid, channel_id: channelId, channel_type: channelType, unread: next }),
      })
    } catch (error) {
      if (!isEmptyChannelResult(error)) throw error
    }
  }

  async syncMessages(
    channelId: string,
    channelType: number,
    limit = 80,
    loginUid = '',
    beforeMessageSeq = 0,
    repairProfile?: ImChannelProfile,
    signal?: AbortSignal,
  ): Promise<ImMessage[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('message sync limit must be a positive safe integer')
    if (!Number.isSafeInteger(beforeMessageSeq) || beforeMessageSeq < 0) {
      throw new Error('message sync cursor must be a non-negative safe integer')
    }
    if (beforeMessageSeq === 1) return []
    const syncSignal = AbortSignal.any([AbortSignal.timeout(15_000), ...[this.signal, signal].filter((value): value is AbortSignal => !!value)])
    let cursor = beforeMessageSeq
    const collected: ImMessage[] = []
    const requestMessages = () => this.request<unknown>('/channel/messagesync', {
      signal: syncSignal,
      method: 'POST', body: JSON.stringify({
        login_uid: loginUid,
        channel_id: channelId,
        channel_type: channelType,
        start_message_seq: cursor ? cursor - 1 : 0,
        end_message_seq: 0,
        limit,
        pull_mode: 0,
      }),
    })
    let repaired = false
    while (collected.length < limit) {
      syncSignal.throwIfAborted()
      let value: unknown
      try {
        value = await requestMessages()
      } catch (error) {
        if (!repaired && repairProfile && isMissingChannelMembership(error)) {
          repaired = true
          await this.upsertChannel(repairProfile)
          value = await requestMessages()
        } else {
          // An empty channel has no sync state yet; expose it as an empty history.
          if (isEmptyChannelResult(error)) break
          throw error
        }
      }
      const root = jsonRecord(value)
      const list = Array.isArray(value) ? value : Array.isArray(root.messages) ? root.messages : []
      const messages = list.flatMap((raw): ImMessage[] => {
        const item = jsonRecord(raw)
        const encoded = typeof item.payload === 'string' ? item.payload : ''
        const payload = storedNativePayload(encoded)
        if (!payload) return []
        return [{
          messageId: String(item.message_idstr ?? item.message_id ?? item.messageId ?? ''),
          messageSeq: Number(item.message_seq ?? item.messageSeq ?? 0),
          clientMsgNo: String(item.client_msg_no ?? item.clientMsgNo ?? ''),
          channelId: String(item.channel_id ?? item.channelId ?? channelId),
          channelType: Number(item.channel_type ?? item.channelType ?? channelType),
          fromUid: String(item.from_uid ?? item.fromUid ?? ''),
          timestamp: Number(item.timestamp ?? 0),
          payload,
        }]
      })
      collected.unshift(...messages)
      if (collected.length >= limit || list.length < limit) break
      const next = Math.min(...list.map(raw => Number(jsonRecord(raw).message_seq ?? jsonRecord(raw).messageSeq ?? 0)))
      if (!Number.isSafeInteger(next) || next < 1 || cursor && next >= cursor) throw new Error('message history cursor did not advance')
      if (next === 1) break
      cursor = next
    }
    return collected.slice(-limit)
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined, token?: string): boolean {
    if (!this.config.webhookSecret) return false
    if (token && token.length === this.config.webhookSecret.length
      && timingSafeEqual(Buffer.from(token), Buffer.from(this.config.webhookSecret))) return true
    if (!signature) return false
    const expected = createHmac('sha256', this.config.webhookSecret).update(rawBody).digest('hex')
    const provided = signature.replace(/^sha256=/, '').toLowerCase()
    return provided.length === expected.length
      && timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  }
}

let singleton: WukongClient | null = null

function requiredConfig(name: 'WUKONG_API_URL' | 'WUKONG_WS_URL' | 'WUKONG_API_TOKEN' | 'WUKONG_WEBHOOK_SECRET'): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function wukongClient(signal?: AbortSignal): WukongClient {
  if (!singleton) {
    singleton = new WukongClient({
      apiUrl: requiredConfig('WUKONG_API_URL'),
      wsUrl: requiredConfig('WUKONG_WS_URL'),
      apiToken: requiredConfig('WUKONG_API_TOKEN'),
      webhookSecret: requiredConfig('WUKONG_WEBHOOK_SECRET'),
    })
  }
  return signal ? new WukongClient(singleton.config, signal) : singleton
}

export function _setWukongClientForTests(client: WukongClient | null): void { singleton = client }

export function decodeNativePayload(encoded: string): NativeMessage {
  const payload = storedNativePayload(encoded)
  if (!payload) throw new Error('Unsupported message protocol')
  return payload
}

function storedNativePayload(encoded: string): NativeMessage | null {
  const { type, ...payload } = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  return type === NATIVE_MESSAGE_CONTENT_TYPE ? nativeMessageSchema.parse(payload) : null
}
