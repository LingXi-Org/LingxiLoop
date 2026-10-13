import type { Queryable } from '../../db/queryable.js'
import type { ReactionChangedEvent } from './contracts.js'
import {
  addWukongReaction,
  aggregateReactions,
  lockWukongReaction,
  reactionExists,
  reactionsForWukongMessages,
  removeReaction,
} from './repository.js'

export interface MessagesInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
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

  wukongReactions(companyId: string, conversationId: string, messageIds: string[]) {
    return reactionsForWukongMessages(this.infrastructure.db, companyId, conversationId, messageIds)
  }

}
