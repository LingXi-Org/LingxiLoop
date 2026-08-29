import { createHash } from 'node:crypto'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import {
  acceptSend,
  channelProfileForMember,
  deferSend,
  ensureSendAcceptance,
  getSendAcceptance,
  lockSendAcceptance,
  sendAcceptanceStatus,
  unlockSendAcceptance,
} from './messages-repository.js'

export interface ImReactionAggregate {
  emoji: string
  count: number
  users: string[]
}

export interface ImMessageEnvelope {
  messageId: string
  messageSeq: number
  fromUid: string
  payload: LingxiMessageV1
}

export interface ImMessagesInfrastructure {
  db: Queryable
  withConnection<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  syncMessages(
    channelId: string,
    channelType: number,
    limit: number,
    userId: string,
    beforeSequence?: number,
  ): Promise<ImMessageEnvelope[]>
  reactions(companyId: string, conversationId: string, messageIds: string[]): Promise<Record<string, unknown[]>>
  toggleReaction(input: {
    companyId: string
    userId: string
    conversationId: string
    messageId: string
    messageSeq: number
    messageAuthorId: string
    emoji: string
  }): Promise<{ reactions: ImReactionAggregate[] }>
  sendMessage(
    channelId: string,
    channelType: number,
    userId: string,
    payload: LingxiMessageV1,
  ): Promise<{ messageId: string; messageSeq: number }>
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export class ImMessagesApplication {
  constructor(private readonly infrastructure: ImMessagesInfrastructure) {}

  private async channelType(input: { companyId: string; channelId: string; userId: string }): Promise<number | null> {
    const profile = await channelProfileForMember(this.infrastructure.db, input)
    return profile ? Number(profile.channelType ?? 2) : null
  }

  async history(input: {
    companyId: string
    userId: string
    channelId: string
    limit: number
    beforeSequence: number
  }): Promise<ImMessageEnvelope[] | null> {
    const channelType = await this.channelType(input)
    if (channelType === null) return null
    const messages = await this.infrastructure.syncMessages(
      input.channelId,
      channelType,
      input.limit,
      input.userId,
      input.beforeSequence,
    )
    if (messages.length === 0) return messages
    const reactions = await this.infrastructure.reactions(
      input.companyId,
      input.channelId,
      messages.map((message) => message.messageId),
    )
    return messages.map((message) => ({
      ...message,
      payload: {
        ...message.payload,
        data: { ...(message.payload.data ?? {}), reactions: reactions[message.messageId] ?? [] },
      },
    }))
  }

  async toggleReaction(input: {
    companyId: string
    userId: string
    channelId: string
    messageId: string
    messageSeq: number
    emoji: string
  }): Promise<{ reactions: ImReactionAggregate[] } | null> {
    const channelType = await this.channelType(input)
    if (channelType === null) return null
    const window = await this.infrastructure.syncMessages(
      input.channelId,
      channelType,
      80,
      input.userId,
      input.messageSeq + 1,
    )
    const target = window.find((message) => (
      message.messageId === input.messageId && message.messageSeq === input.messageSeq
    ))
    if (!target) return null
    return this.infrastructure.toggleReaction({
      companyId: input.companyId,
      userId: input.userId,
      conversationId: input.channelId,
      messageId: input.messageId,
      messageSeq: input.messageSeq,
      messageAuthorId: target.fromUid,
      emoji: input.emoji,
    })
  }

  async acceptUserMessage(input: {
    companyId: string
    userId: string
    channelId: string
    clientNonce: string
    payload: LingxiMessageV1
  }): Promise<
    | { kind: 'channel_not_found' }
    | { kind: 'nonce_conflict' }
    | { kind: 'accepted'; duplicate: boolean; echo: Record<string, unknown> }
  > {
    const channelType = await this.channelType(input)
    if (channelType === null) return { kind: 'channel_not_found' }
    const inputDigest = createHash('sha256')
      .update(canonicalJson({ channelId: input.channelId, channelType, payload: input.payload }))
      .digest('hex')
    return this.infrastructure.withConnection(async (db) => {
      const identity = {
        companyId: input.companyId,
        userId: input.userId,
        clientNonce: input.clientNonce,
      }
      await lockSendAcceptance(db, identity)
      try {
        await ensureSendAcceptance(db, {
          ...identity,
          inputDigest,
          channelId: input.channelId,
          channelType,
          payload: input.payload,
        })
        const acceptance = await getSendAcceptance(db, identity)
        if (!acceptance || acceptance.input_digest !== inputDigest) return { kind: 'nonce_conflict' }
        if (acceptance.status === 'accepted' && acceptance.echo) {
          return { kind: 'accepted', duplicate: true, echo: acceptance.echo }
        }
        try {
          const sent = await this.infrastructure.sendMessage(
            input.channelId,
            channelType,
            input.userId,
            input.payload,
          )
          const echo = {
            messageId: sent.messageId,
            messageSeq: sent.messageSeq,
            clientMsgNo: input.clientNonce,
            channelId: input.channelId,
            channelType,
            fromUid: input.userId,
            timestamp: Math.floor(Date.now() / 1000),
            payload: input.payload,
          }
          await acceptSend(db, { ...identity, echo })
          return { kind: 'accepted', duplicate: false, echo }
        } catch (error) {
          await deferSend(db, {
            ...identity,
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
      } finally {
        await unlockSendAcceptance(db, identity).catch(() => undefined)
      }
    })
  }

  sendStatus(input: { companyId: string; userId: string; clientNonce: string }) {
    return sendAcceptanceStatus(this.infrastructure.db, input)
  }
}
