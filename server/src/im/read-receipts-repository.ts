import type { Queryable } from '../db/queryable.js'
import type { ReadReceiptAdvance } from './read-receipts-contracts.js'

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

export async function appendReadReceiptAdvance(
  db: Queryable,
  input: { companyId: string; channelId: string; readerId: string; readThroughSeq: number },
): Promise<ReadReceiptAdvance | null> {
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`im-read:${input.companyId}:${input.channelId}:${input.readerId}`],
  )
  const current = await db.query<{ read_through_seq: string }>(
    `SELECT COALESCE(MAX(read_through_seq), 0)::text AS read_through_seq
       FROM im_read_receipt_advances
      WHERE company_id=$1 AND channel_id=$2 AND reader_id=$3`,
    [input.companyId, input.channelId, input.readerId],
  )
  const previousReadSeq = asSafeSequence(current.rows[0]?.read_through_seq ?? 0)
  if (input.readThroughSeq <= previousReadSeq) return null
  const inserted = await db.query<ReadReceiptRow>(
    `INSERT INTO im_read_receipt_advances(
       company_id,channel_id,reader_id,previous_read_seq,read_through_seq
     ) VALUES($1,$2,$3,$4,$5)
     RETURNING company_id AS "companyId", channel_id AS "channelId", reader_id AS "readerId",
               previous_read_seq::text AS "previousReadSeq", read_through_seq::text AS "readThroughSeq",
               read_at AS "readAt"`,
    [input.companyId, input.channelId, input.readerId, previousReadSeq, input.readThroughSeq],
  )
  return mapAdvance(inserted.rows[0])
}

export async function findReadReceiptAdvances(
  db: Queryable,
  input: { companyId: string; channelId: string; fromSeq: number; toSeq: number },
): Promise<ReadReceiptAdvance[]> {
  const { rows } = await db.query<ReadReceiptRow>(
    `SELECT receipt.company_id AS "companyId", receipt.channel_id AS "channelId",
            receipt.reader_id AS "readerId", receipt.previous_read_seq::text AS "previousReadSeq",
            receipt.read_through_seq::text AS "readThroughSeq", receipt.read_at AS "readAt"
       FROM im_read_receipt_advances receipt
       JOIN conversations conversation
         ON conversation.id=receipt.channel_id AND conversation.company_id=receipt.company_id
      WHERE receipt.company_id=$1 AND receipt.channel_id=$2
        AND receipt.previous_read_seq < $4 AND receipt.read_through_seq >= $3
        AND conversation.members @> to_jsonb(ARRAY[receipt.reader_id])
      ORDER BY receipt.read_at ASC, receipt.reader_id ASC`,
    [input.companyId, input.channelId, input.fromSeq, input.toSeq],
  )
  return rows.map(mapAdvance)
}

export async function conversationRecipientIds(
  db: Queryable,
  input: { companyId: string; channelId: string },
): Promise<string[]> {
  const { rows } = await db.query<{ members: string[] }>(
    `SELECT ARRAY(SELECT jsonb_array_elements_text(members)) AS members
       FROM conversations WHERE id=$1 AND company_id=$2`,
    [input.channelId, input.companyId],
  )
  return rows[0]?.members ?? []
}

export async function isConversationMember(
  db: Queryable,
  input: { companyId: string; channelId: string; userId: string },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM conversations
      WHERE id=$1 AND company_id=$2 AND members @> to_jsonb(ARRAY[$3::text])`,
    [input.channelId, input.companyId, input.userId],
  )
  return Boolean(rows[0])
}
