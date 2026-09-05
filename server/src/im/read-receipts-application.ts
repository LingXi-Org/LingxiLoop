import type { Queryable } from '../db/queryable.js'
import type { ImReadReceiptEvent } from '../redis.js'
import type { ReadReceiptAdvance } from './read-receipts-contracts.js'
import {
  appendReadReceiptAdvance,
  conversationRecipientIds,
  findReadReceiptAdvances,
  isConversationMember,
} from './read-receipts-repository.js'

export interface ReadReceiptsInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  publish(event: ImReadReceiptEvent): Promise<void>
}

export class ReadReceiptsApplication {
  constructor(private readonly infrastructure: ReadReceiptsInfrastructure) {}

  record(
    input: { companyId: string; channelId: string; readerId: string; readThroughSeq: number },
    existingDb?: Queryable,
  ): Promise<ReadReceiptAdvance | null> {
    if (existingDb) return appendReadReceiptAdvance(existingDb, input)
    return this.infrastructure.transaction((db) => appendReadReceiptAdvance(db, input))
  }

  list(input: { companyId: string; channelId: string; fromSeq: number; toSeq: number }) {
    return findReadReceiptAdvances(this.infrastructure.db, input)
  }

  member(input: { companyId: string; channelId: string; userId: string }) {
    return isConversationMember(this.infrastructure.db, input)
  }

  async publish(advance: ReadReceiptAdvance): Promise<void> {
    const recipientIds = await conversationRecipientIds(this.infrastructure.db, advance)
    if (recipientIds.length === 0) return
    await this.infrastructure.publish({ type: 'im.read-receipt', ...advance, recipientIds })
  }

  async advanceAgent(input: {
    companyId: string
    channelId: string
    agentId: string
    readThroughSeq: number
  }): Promise<ReadReceiptAdvance | null> {
    try {
      const advance = await this.record({
        companyId: input.companyId,
        channelId: input.channelId,
        readerId: input.agentId,
        readThroughSeq: input.readThroughSeq,
      })
      if (advance) await this.publish(advance)
      return advance
    } catch (error) {
      console.warn('[im.read-receipt] agent advance failed', {
        channelId: input.channelId,
        agentId: input.agentId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
}
