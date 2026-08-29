import { createHash } from 'node:crypto'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import type { ReadReceiptAdvance } from './read-receipts-contracts.js'
import {
  acceptSend,
  channelProfileForMember,
  deferSend,
  ensureSendAcceptance,
  getSendAcceptance,
  lockAgentReplyChannel,
  lockSendAcceptance,
  memberChannels,
  sendAcceptanceStatus,
  unlockSendAcceptance,
  unlockAgentReplyChannel,
} from './messages-repository.js'

export interface ImReactionAggregate {
  emoji: string
  count: number
  users: string[]
}

export interface ImMessageEnvelope {
  messageId: string
  messageSeq: number
  clientMsgNo: string
  channelId: string
  fromUid: string
  timestamp: number
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
  listConversations(userId: string): Promise<Array<{
    channelId: string
    channelType: number
    unread: number
    activeAt: number
    lastMessage: ImMessageEnvelope | null
  }>>
  clearUnread(userId: string, channelId: string, channelType: number): Promise<void>
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
  setUnread(userId: string, channelId: string, channelType: number, unread: number): Promise<void>
  recordReadReceipt(input: {
    companyId: string
    channelId: string
    readerId: string
    readThroughSeq: number
  }): Promise<ReadReceiptAdvance | null>
  publishReadReceipt(advance: ReadReceiptAdvance): Promise<void>
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

  async inbox(input: {
    companyId: string
    userId: string
    limit: number
  }): Promise<Array<{
    channelId: string
    title: string
    kind: string
    topic: string | null
    unread: number
    message: ImMessageEnvelope
    quotedMessage: ImMessageEnvelope | null
  }>> {
    const conversations = (await this.infrastructure.listConversations(input.userId))
      .filter((conversation) => conversation.unread > 0)
    const metadata = await memberChannels(this.infrastructure.db, {
      companyId: input.companyId,
      userId: input.userId,
      channelIds: conversations.map((conversation) => conversation.channelId),
    })
    const metadataById = new Map(metadata.map((channel) => [channel.channelId, channel]))
    const batches = await Promise.all(conversations.map(async (conversation) => {
      const channel = metadataById.get(conversation.channelId)
      if (!channel || channel.channelType !== conversation.channelType) return []
      const messages = await this.infrastructure.syncMessages(
        conversation.channelId,
        conversation.channelType,
        Math.min(200, Math.max(80, conversation.unread)),
        input.userId,
      )
      const ordered = [...messages].sort((left, right) => left.messageSeq - right.messageSeq)
      return ordered
        .slice(-conversation.unread)
        .filter((message) => message.fromUid !== input.userId)
        .map((message) => {
          const quotedId = message.payload.replyToClientMsgNo
          return {
            channelId: conversation.channelId,
            title: channel.title,
            kind: channel.kind,
            topic: channel.topic,
            unread: conversation.unread,
            message,
            quotedMessage: quotedId
              ? ordered.find((candidate) => candidate.messageId === quotedId || candidate.clientMsgNo === quotedId) ?? null
              : null,
          }
        })
    }))
    return batches.flat()
      .sort((left, right) => left.message.timestamp - right.message.timestamp || left.message.messageSeq - right.message.messageSeq)
      .slice(-Math.min(200, Math.max(1, input.limit)))
  }

  async search(input: {
    companyId: string
    userId: string
    query: string
    channelId?: string
    projectId?: string
    limit: number
  }): Promise<Array<{
    channelId: string
    title: string
    kind: string
    message: ImMessageEnvelope
  }>> {
    const query = input.query.trim().toLocaleLowerCase()
    if (!query) return []
    const conversations = (await this.infrastructure.listConversations(input.userId))
      .filter((conversation) => !input.channelId || conversation.channelId === input.channelId)
      .sort((left, right) => right.activeAt - left.activeAt)
    const metadata = await memberChannels(this.infrastructure.db, {
      companyId: input.companyId,
      userId: input.userId,
      channelIds: input.channelId ? [input.channelId] : conversations.map((conversation) => conversation.channelId),
      projectId: input.projectId,
    })
    const metadataById = new Map(metadata.map((channel) => [channel.channelId, channel]))
    const matches: Array<{ channelId: string; title: string; kind: string; message: ImMessageEnvelope }> = []
    for (const conversation of conversations) {
      const channel = metadataById.get(conversation.channelId)
      if (!channel || channel.channelType !== conversation.channelType) continue
      let beforeSequence = 0
      const seenCursors = new Set<number>()
      const seenMessages = new Set<string>()
      while (true) {
        const page = await this.infrastructure.syncMessages(
          conversation.channelId,
          conversation.channelType,
          200,
          input.userId,
          beforeSequence,
        )
        for (const message of page) {
          if (seenMessages.has(message.messageId)) continue
          seenMessages.add(message.messageId)
          if ((message.payload.body ?? '').toLocaleLowerCase().includes(query)) {
            matches.push({ channelId: conversation.channelId, title: channel.title, kind: channel.kind, message })
          }
        }
        if (page.length < 200) break
        const next = Math.min(...page.map((message) => message.messageSeq).filter((sequence) => sequence > 0))
        if (!Number.isSafeInteger(next) || next <= 0 || seenCursors.has(next)) break
        seenCursors.add(next)
        beforeSequence = next
      }
    }
    return matches
      .sort((left, right) => right.message.timestamp - left.message.timestamp || right.message.messageSeq - left.message.messageSeq)
      .slice(0, Math.min(50, Math.max(1, input.limit)))
  }

  async clearChannelUnread(input: { companyId: string; userId: string; channelId: string }): Promise<boolean> {
    const channelType = await this.channelType(input)
    if (channelType === null) return false
    await this.infrastructure.clearUnread(input.userId, input.channelId, channelType)
    return true
  }

  async clearAllUnread(input: { companyId: string; userId: string }): Promise<string[]> {
    const conversations = (await this.infrastructure.listConversations(input.userId))
      .filter((conversation) => conversation.unread > 0)
    const metadata = await memberChannels(this.infrastructure.db, {
      companyId: input.companyId,
      userId: input.userId,
      channelIds: conversations.map((conversation) => conversation.channelId),
    })
    const allowed = new Map(metadata.map((channel) => [channel.channelId, channel.channelType]))
    const targets = conversations.filter((conversation) => allowed.get(conversation.channelId) === conversation.channelType)
    await Promise.all(targets.map((conversation) => this.infrastructure.clearUnread(
      input.userId,
      conversation.channelId,
      conversation.channelType,
    )))
    return targets.map((conversation) => conversation.channelId)
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

  private async acceptMessage(
    db: Queryable,
    channelType: number,
    input: {
      companyId: string
      userId: string
      channelId: string
      clientNonce: string
      payload: LingxiMessageV1
    },
  ): Promise<
    | { kind: 'nonce_conflict' }
    | { kind: 'accepted'; duplicate: boolean; echo: Record<string, unknown> }
  > {
    const inputDigest = createHash('sha256')
      .update(canonicalJson({ channelId: input.channelId, channelType, payload: input.payload }))
      .digest('hex')
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
    return this.infrastructure.withConnection((db) => this.acceptMessage(db, channelType, input))
  }

  async acceptAgentMessage(input: {
    companyId: string
    userId: string
    channelId: string
    clientNonce: string
    payload: LingxiMessageV1
    rejectVerbatimPeerBody?: string
  }): Promise<
    | { kind: 'channel_not_found' }
    | { kind: 'nonce_conflict' }
    | { kind: 'verbatim_peer'; peer: ImMessageEnvelope }
    | { kind: 'accepted'; duplicate: boolean; echo: Record<string, unknown> }
  > {
    const channelType = await this.channelType(input)
    if (channelType === null) return { kind: 'channel_not_found' }
    return this.infrastructure.withConnection(async (db) => {
      const lockIdentity = { companyId: input.companyId, channelId: input.channelId }
      await lockAgentReplyChannel(db, lockIdentity)
      try {
        const prior = await getSendAcceptance(db, input)
        if (prior?.status === 'accepted') {
          return this.acceptMessage(db, channelType, input)
        }
        const draft = input.rejectVerbatimPeerBody?.trim()
        if (draft) {
          const recent = await this.infrastructure.syncMessages(
            input.channelId,
            channelType,
            80,
            input.userId,
          )
          const peer = recent
            .filter((message) => message.fromUid !== input.userId && message.payload.kind === 'text')
            .sort((left, right) => right.messageSeq - left.messageSeq)[0]
          if (peer?.payload.body?.trim() === draft) return { kind: 'verbatim_peer', peer }
        }
        return this.acceptMessage(db, channelType, input)
      } finally {
        await unlockAgentReplyChannel(db, lockIdentity).catch(() => undefined)
      }
    })
  }

  sendStatus(input: { companyId: string; userId: string; clientNonce: string }) {
    return sendAcceptanceStatus(this.infrastructure.db, input)
  }

  async markRead(input: {
    companyId: string
    userId: string
    channelId: string
    readThroughSeq: number
  }): Promise<
    | { kind: 'channel_not_found' }
    | { kind: 'cursor_ahead'; latestSeq: number }
    | { kind: 'recorded'; latestSeq: number; receipt: ReadReceiptAdvance | null }
  > {
    const channelType = await this.channelType(input)
    if (channelType === null) return { kind: 'channel_not_found' }
    const latestRows = await this.infrastructure.syncMessages(
      input.channelId,
      channelType,
      200,
      input.userId,
    )
    const latestSeq = latestRows.reduce((max, message) => Math.max(max, message.messageSeq), 0)
    if (input.readThroughSeq > latestSeq) return { kind: 'cursor_ahead', latestSeq }
    await this.infrastructure.setUnread(
      input.userId,
      input.channelId,
      channelType,
      latestSeq - input.readThroughSeq,
    )
    const receipt = await this.infrastructure.recordReadReceipt({
      companyId: input.companyId,
      channelId: input.channelId,
      readerId: input.userId,
      readThroughSeq: input.readThroughSeq,
    })
    if (receipt) await this.infrastructure.publishReadReceipt(receipt)
    return { kind: 'recorded', latestSeq, receipt }
  }
}
