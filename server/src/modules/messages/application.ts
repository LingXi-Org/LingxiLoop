import type { Queryable } from '../../db/queryable.js'
import type { Storage } from '../../storage.js'
import type { ReactionChangedEvent } from './contracts.js'
import {
  addReaction,
  addWukongReaction,
  aggregateReactions,
  conversationKind,
  listMessages,
  listReplies,
  lockReactionTarget,
  lockWukongReaction,
  reactionExists,
  removeReaction,
  type MessageProjectionRow,
} from './repository.js'

export type MessageErrorCode = 'message_not_found' | 'storage_attachment_invalid'

export class MessageApplicationError extends Error {
  constructor(readonly code: MessageErrorCode, message: string) { super(message) }
}

export interface MessagesInfrastructure {
  db: Queryable
  storage: Storage
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  replyEmail(input: { conversationId: string; companyId: string; authorId: string; body: string }): Promise<{
    messageId: string
    sequence: number
    transportStatus: string
    error?: string | null
  }>
  bumpReactionClimate(input: {
    companyId: string
    agentId: string
    aboutId: string
    emoji: string
  }): Promise<void>
  publishReaction(event: ReactionChangedEvent): Promise<void>
}

export class MessagesApplication {
  constructor(private readonly infrastructure: MessagesInfrastructure) {}

  kind(companyId: string, conversationId: string): Promise<string | undefined> {
    return conversationKind(this.infrastructure.db, companyId, conversationId)
  }

  async history(input: { companyId: string; conversationId: string; before?: number; limit: number }) {
    const rows = await listMessages(this.infrastructure.db, input)
    rows.reverse()
    await this.freshen(rows)
    return rows
  }

  async replies(companyId: string, conversationId: string, rootId: string) {
    const rows = await listReplies(this.infrastructure.db, companyId, conversationId, rootId)
    await this.freshen(rows)
    return rows
  }

  replyEmail(input: { conversationId: string; companyId: string; authorId: string; body: string }) {
    return this.infrastructure.replyEmail(input)
  }

  async toggleReaction(input: {
    companyId: string
    userId: string
    messageId: string
    emoji: string
  }) {
    const changed = await this.infrastructure.transaction(async (db) => {
      const target = await lockReactionTarget(db, input.companyId, input.messageId)
      if (!target || !target.members.includes(input.userId)) {
        throw new MessageApplicationError('message_not_found', 'message not found')
      }
      const removed = await reactionExists(
        db,
        input.companyId,
        input.messageId,
        input.userId,
        input.emoji,
      )
      if (removed) {
        await removeReaction(db, input.companyId, input.messageId, input.userId, input.emoji)
      } else {
        await addReaction(db, input.companyId, input.messageId, input.userId, input.emoji)
      }
      return {
        removed,
        conversationId: target.conversation_id,
        messageAuthorId: target.author_id,
        reactions: await aggregateReactions(db, input.companyId, input.messageId),
      }
    })

    if (!changed.removed) {
      await this.infrastructure.bumpReactionClimate({
        companyId: input.companyId,
        agentId: changed.messageAuthorId,
        aboutId: input.userId,
        emoji: input.emoji,
      }).catch(() => undefined)
    }
    await this.infrastructure.publishReaction({
      type: 'message.reactions',
      conversationId: changed.conversationId,
      companyId: input.companyId,
      messageId: input.messageId,
      reactions: changed.reactions,
    }).catch(() => undefined)
    return { reactions: changed.reactions }
  }

  async toggleWukongReaction(input: {
    companyId: string; userId: string; conversationId: string; messageId: string; messageSeq: number; messageAuthorId: string; emoji: string
  }) {
    const changed = await this.infrastructure.transaction(async (db) => {
      await lockWukongReaction(db, input.companyId, input.messageId, input.userId, input.emoji)
      const removed = await reactionExists(db, input.companyId, input.messageId, input.userId, input.emoji)
      if (removed) await removeReaction(db, input.companyId, input.messageId, input.userId, input.emoji)
      else await addWukongReaction(db, input)
      return { removed, reactions: await aggregateReactions(db, input.companyId, input.messageId) }
    })
    if (!changed.removed) {
      await this.infrastructure.bumpReactionClimate({
        companyId: input.companyId, agentId: input.messageAuthorId, aboutId: input.userId, emoji: input.emoji,
      }).catch(() => undefined)
    }
    await this.infrastructure.publishReaction({
      type: 'message.reactions', companyId: input.companyId, conversationId: input.conversationId,
      messageId: input.messageId, reactions: changed.reactions,
    }).catch(() => undefined)
    return { reactions: changed.reactions }
  }

  private async freshen(rows: MessageProjectionRow[]): Promise<void> {
    for (const row of rows) {
      if (row.attachment) {
        if (!row.attachment.key) {
          throw new MessageApplicationError('storage_attachment_invalid', 'attachment storage key is required')
        }
        row.attachment.url = await this.infrastructure.storage.publicUrl(row.attachment.key)
      }
      for (const attachment of row.email?.attachments ?? []) {
        if (attachment.truncated) { attachment.url = null; continue }
        if (!attachment.storageKey) {
          throw new MessageApplicationError('storage_attachment_invalid', 'email attachment storage key is required')
        }
        attachment.url = await this.infrastructure.storage.publicUrl(attachment.storageKey)
      }
    }
  }
}
