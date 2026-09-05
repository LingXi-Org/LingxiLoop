import type { PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { CH_IM_READ_RECEIPTS, publish } from '../redis.js'
import { ReadReceiptsApplication } from './read-receipts-application.js'
import type { ReadReceiptAdvance } from './read-receipts-contracts.js'

const application = new ReadReceiptsApplication({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  publish: (event) => publish(CH_IM_READ_RECEIPTS, event),
})

export type { ReadReceiptAdvance }

export function recordReadReceiptAdvance(
  input: { companyId: string; channelId: string; readerId: string; readThroughSeq: number },
  existingClient?: PoolClient,
): Promise<ReadReceiptAdvance | null> {
  return application.record(input, existingClient)
}

export function listReadReceiptAdvances(input: {
  companyId: string
  channelId: string
  fromSeq: number
  toSeq: number
}): Promise<ReadReceiptAdvance[]> {
  return application.list(input)
}

export function isReadReceiptChannelMember(input: {
  companyId: string
  channelId: string
  userId: string
}): Promise<boolean> {
  return application.member(input)
}

export function publishReadReceiptAdvance(advance: ReadReceiptAdvance): Promise<void> {
  return application.publish(advance)
}

export function advanceAgentReadReceipt(input: {
  companyId: string
  channelId: string
  agentId: string
  readThroughSeq: number
}): Promise<ReadReceiptAdvance | null> {
  return application.advanceAgent(input)
}
