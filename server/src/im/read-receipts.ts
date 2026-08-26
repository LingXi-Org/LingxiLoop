import type { PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import { CH_IM_READ_RECEIPTS, publish, type ImReadReceiptEvent } from '../redis.js'

export interface ReadReceiptAdvance {
  companyId: string
  channelId: string
  readerId: string
  previousReadSeq: number
  readThroughSeq: number
  readAt: string
}

function asSafeSequence(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid read receipt sequence: ${String(value)}`)
  return parsed
}

interface ReadReceiptRow {
  companyId: string
  channelId: string
  readerId: string
  previousReadSeq: string | number
  readThroughSeq: string | number
  readAt: string | Date
}

function mapAdvance(row: ReadReceiptRow): ReadReceiptAdvance {
  return {
    companyId: row.companyId,
    channelId: row.channelId,
    readerId: row.readerId,
    previousReadSeq: asSafeSequence(row.previousReadSeq),
    readThroughSeq: asSafeSequence(row.readThroughSeq),
    readAt: row.readAt instanceof Date ? row.readAt.toISOString() : new Date(row.readAt).toISOString(),
  }
}

/**
 * Atomically append a monotonic read interval. A transaction-scoped advisory
 * lock serializes every device belonging to the same reader/channel; repeated
 * and out-of-order submissions become harmless no-ops.
 */
export async function recordReadReceiptAdvance(input: {
  companyId: string
  channelId: string
  readerId: string
  readThroughSeq: number
}, existingClient?: PoolClient): Promise<ReadReceiptAdvance | null> {
  const ownClient = existingClient ? null : await pool.connect()
  const client = existingClient ?? ownClient!
  try {
    if (!existingClient) await client.query('BEGIN')
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`im-read:${input.companyId}:${input.channelId}:${input.readerId}`],
    )
    const current = await client.query<{ read_through_seq: string }>(
      `SELECT COALESCE(MAX(read_through_seq), 0)::text AS read_through_seq
         FROM im_read_receipt_advances
        WHERE company_id=$1 AND channel_id=$2 AND reader_id=$3`,
      [input.companyId, input.channelId, input.readerId],
    )
    const previousReadSeq = asSafeSequence(current.rows[0]?.read_through_seq ?? 0)
    if (input.readThroughSeq <= previousReadSeq) {
      if (!existingClient) await client.query('COMMIT')
      return null
    }
    const inserted = await client.query<ReadReceiptRow>(
      `INSERT INTO im_read_receipt_advances(
         company_id,channel_id,reader_id,previous_read_seq,read_through_seq
       ) VALUES($1,$2,$3,$4,$5)
       RETURNING company_id AS "companyId", channel_id AS "channelId", reader_id AS "readerId",
                 previous_read_seq::text AS "previousReadSeq", read_through_seq::text AS "readThroughSeq",
                 read_at AS "readAt"`,
      [input.companyId, input.channelId, input.readerId, previousReadSeq, input.readThroughSeq],
    )
    if (!existingClient) await client.query('COMMIT')
    return mapAdvance(inserted.rows[0])
  } catch (error) {
    if (!existingClient) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    ownClient?.release()
  }
}

export async function listReadReceiptAdvances(input: {
  companyId: string
  channelId: string
  fromSeq: number
  toSeq: number
}): Promise<ReadReceiptAdvance[]> {
  const { rows } = await pool.query<ReadReceiptRow>(
    `SELECT r.company_id AS "companyId", r.channel_id AS "channelId", r.reader_id AS "readerId",
            r.previous_read_seq::text AS "previousReadSeq", r.read_through_seq::text AS "readThroughSeq",
            r.read_at AS "readAt"
       FROM im_read_receipt_advances r
       JOIN conversations c ON c.id=r.channel_id AND c.company_id=r.company_id
      WHERE r.company_id=$1 AND r.channel_id=$2
        AND r.previous_read_seq < $4 AND r.read_through_seq >= $3
        AND c.members @> to_jsonb(ARRAY[r.reader_id])
      ORDER BY r.read_at ASC, r.reader_id ASC`,
    [input.companyId, input.channelId, input.fromSeq, input.toSeq],
  )
  return rows.map(mapAdvance)
}

export async function publishReadReceiptAdvance(advance: ReadReceiptAdvance): Promise<void> {
  const { rows } = await pool.query<{ members: string[] }>(
    `SELECT ARRAY(SELECT jsonb_array_elements_text(members)) AS members
       FROM conversations WHERE id=$1 AND company_id=$2`,
    [advance.channelId, advance.companyId],
  )
  const recipientIds = rows[0]?.members ?? []
  if (!recipientIds.length) return
  const event: ImReadReceiptEvent = {
    type: 'im.read-receipt',
    ...advance,
    recipientIds,
  }
  await publish(CH_IM_READ_RECEIPTS, event)
}

export async function advanceAgentReadReceipt(input: {
  companyId: string
  channelId: string
  agentId: string
  readThroughSeq: number
}): Promise<ReadReceiptAdvance | null> {
  try {
    const advance = await recordReadReceiptAdvance({
      companyId: input.companyId,
      channelId: input.channelId,
      readerId: input.agentId,
      readThroughSeq: input.readThroughSeq,
    })
    if (advance) await publishReadReceiptAdvance(advance)
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
