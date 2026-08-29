import type { LingxiMessageV1 } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import { channelProfileForMember } from './messages-repository.js'

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
}
