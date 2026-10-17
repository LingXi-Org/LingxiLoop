import type { Queryable } from '../db/queryable.js'
import { messageAcceptanceDigest } from './messages-digest.js'
import { nativeMessageSchema } from './message-types.js'

export const SEND_NOT_DISPATCHED = 'send-not-dispatched-v1'
export const SEND_DISPATCH_STARTED = 'send-dispatch-started-v1'
export const SEND_RECONCILIATION_REQUIRED = 'delivery-reconciliation-required'

export function validSendReceipt(value: unknown): value is Record<string, unknown> & { messageId: string; messageSeq: number } {
  if (!value || typeof value !== 'object') return false
  const receipt = value as Record<string, unknown>
  return typeof receipt.messageId === 'string' && receipt.messageId.trim() === receipt.messageId
    && receipt.messageId.length > 0 && receipt.messageId !== '0'
    && typeof receipt.messageSeq === 'number' && Number.isSafeInteger(receipt.messageSeq) && receipt.messageSeq > 0
}

/** The persisted canonical payload, rather than the pre-mention input, binds a receipt. */
export function validSendEcho(value: unknown, expected: {
  userId: string; clientNonce: string; channelId: string; channelType: number; payload: unknown
}): value is Record<string, unknown> & { messageId: string; messageSeq: number } {
  if (!validSendReceipt(value)) return false
  const echo = value as Record<string, unknown>
  if (echo.clientMsgNo !== expected.clientNonce || echo.channelId !== expected.channelId
    || echo.channelType !== expected.channelType || echo.fromUid !== expected.userId
    || typeof echo.timestamp !== 'number' || !Number.isFinite(echo.timestamp) || echo.timestamp < 0) return false
  const payload = nativeMessageSchema.safeParse(echo.payload), recorded = nativeMessageSchema.safeParse(expected.payload)
  return payload.success && recorded.success && messageAcceptanceDigest({ ...expected, payload: payload.data })
    === messageAcceptanceDigest({ ...expected, payload: recorded.data })
}

export interface ImSendAcceptanceRow {
  payload: unknown
  input_digest: string
  status: string
  echo: Record<string, unknown> | null
  error: string | null
  channel_id: string
  channel_type: number
  updated_at: Date
}

export interface ImMemberChannelRow {
  channelId: string
  title: string
  kind: string
  topic: string | null
  channelType: number
}

export async function memberChannels(
  db: Queryable,
  input: { companyId: string; userId: string; channelIds: string[]; projectId?: string },
): Promise<ImMemberChannelRow[]> {
  if (input.channelIds.length === 0) return []
  const { rows } = await db.query<ImMemberChannelRow>(
    `SELECT conversation.id AS "channelId",conversation.title,conversation.kind,conversation.topic,
            COALESCE((binding.profile->>'channelType')::int,2) AS "channelType"
       FROM conversations conversation
       JOIN im_channel_bindings binding
         ON binding.channel_id=conversation.id AND binding.company_id=conversation.company_id
      WHERE conversation.company_id=$1
        AND conversation.id=ANY($2::text[])
        AND conversation.members @> to_jsonb(ARRAY[$3::text])
        AND ($4::text IS NULL OR conversation.project_id=$4)`,
    [input.companyId, input.channelIds, input.userId, input.projectId ?? null],
  )
  return rows
}

export async function channelProfileForMember(
  db: Queryable,
  input: { companyId: string; channelId: string; userId: string },
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<{ profile: Record<string, unknown> }>(
    `SELECT binding.profile
       FROM im_channel_bindings binding
       JOIN conversations conversation
         ON conversation.id=binding.channel_id AND conversation.company_id=binding.company_id
      WHERE binding.channel_id=$1 AND binding.company_id=$2
        AND conversation.members @> to_jsonb(ARRAY[$3::text])`,
    [input.channelId, input.companyId, input.userId],
  )
  return rows[0]?.profile ?? null
}

export async function channelProfileForCompany(
  db: Queryable,
  input: { companyId: string; channelId: string },
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<{ profile: Record<string, unknown> }>(
    `SELECT binding.profile
       FROM im_channel_bindings binding
       JOIN conversations conversation
         ON conversation.id=binding.channel_id AND conversation.company_id=binding.company_id
      WHERE binding.channel_id=$1 AND binding.company_id=$2`,
    [input.channelId, input.companyId],
  )
  return rows[0]?.profile ?? null
}

export async function lockSendAcceptance(
  db: Queryable,
  input: { companyId: string; userId: string; clientNonce: string },
): Promise<void> {
  await db.query(`SELECT pg_advisory_lock(hashtextextended($1,0))`, [
    `im-send:${input.companyId}:${input.userId}:${input.clientNonce}`,
  ])
}

export async function unlockSendAcceptance(
  db: Queryable,
  input: { companyId: string; userId: string; clientNonce: string },
): Promise<void> {
  await db.query(`SELECT pg_advisory_unlock(hashtextextended($1,0))`, [
    `im-send:${input.companyId}:${input.userId}:${input.clientNonce}`,
  ])
}

export async function lockAgentReplyChannel(
  db: Queryable,
  input: { companyId: string; channelId: string },
): Promise<void> {
  await db.query(`SELECT pg_advisory_lock(hashtextextended($1,0))`, [
    `im-agent-reply:${input.companyId}:${input.channelId}`,
  ])
}

export async function unlockAgentReplyChannel(
  db: Queryable,
  input: { companyId: string; channelId: string },
): Promise<void> {
  await db.query(`SELECT pg_advisory_unlock(hashtextextended($1,0))`, [
    `im-agent-reply:${input.companyId}:${input.channelId}`,
  ])
}

export async function ensureSendAcceptance(
  db: Queryable,
  input: {
    companyId: string
    userId: string
    clientNonce: string
    inputDigest: string
    channelId: string
    channelType: number
    payload: unknown
  },
): Promise<void> {
  await db.query(
    `INSERT INTO im_send_acceptances(company_id,user_id,client_nonce,input_digest,channel_id,channel_type,payload,error)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'send-not-dispatched-v1') ON CONFLICT(company_id,user_id,client_nonce) DO NOTHING`,
    [
      input.companyId,
      input.userId,
      input.clientNonce,
      input.inputDigest,
      input.channelId,
      input.channelType,
      JSON.stringify(input.payload),
    ],
  )
}

export async function getSendAcceptance(
  db: Queryable,
  input: { companyId: string; userId: string; clientNonce: string },
): Promise<ImSendAcceptanceRow | null> {
  const { rows } = await db.query<ImSendAcceptanceRow>(
    `SELECT input_digest,status,echo,payload,error,channel_id,channel_type,updated_at
       FROM im_send_acceptances
      WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
    [input.companyId, input.userId, input.clientNonce],
  )
  return rows[0] ?? null
}

export async function acceptSend(
  db: Queryable,
  input: { companyId: string; userId: string; clientNonce: string; echo: unknown },
): Promise<void> {
  const acceptance = await getSendAcceptance(db, input)
  if (!acceptance || !validSendEcho(input.echo, { ...input, channelId: acceptance.channel_id,
    channelType: acceptance.channel_type, payload: acceptance.payload })) throw new Error('invalid WuKong send acceptance echo')
  await db.query(
    `UPDATE im_send_acceptances SET status='accepted',echo=$4::jsonb,error=NULL,updated_at=NOW()
      WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
    [input.companyId, input.userId, input.clientNonce, JSON.stringify(input.echo)],
  )
}

export async function deferSend(
  db: Queryable,
  input: { companyId: string; userId: string; clientNonce: string; error: string },
): Promise<void> {
  await db.query(
    `UPDATE im_send_acceptances SET status='pending',error=$4,updated_at=NOW()
      WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
    [input.companyId, input.userId, input.clientNonce, input.error],
  )
}

export async function sendAcceptanceStatus(
  db: Queryable,
  input: { companyId: string; userId: string; clientNonce: string },
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT acceptance.status,acceptance.echo,acceptance.error,acceptance.payload,
            acceptance.channel_type AS "channelType",acceptance.channel_id AS "channelId",acceptance.updated_at AS "updatedAt"
       FROM im_send_acceptances acceptance
       JOIN conversations conversation ON conversation.id=acceptance.channel_id
      WHERE acceptance.company_id=$1 AND acceptance.user_id=$2 AND acceptance.client_nonce=$3
        AND conversation.company_id=acceptance.company_id
        AND conversation.members @> to_jsonb(ARRAY[$2::text])`,
    [input.companyId, input.userId, input.clientNonce],
  )
  const row = rows[0]
  if (!row) return null
  const { payload, channelType, ...status } = row
  if (status.status !== 'accepted' || !validSendEcho(status.echo, { ...input, channelId: String(status.channelId),
    channelType: Number(channelType), payload })) {
    return { ...status, status: 'pending', echo: null,
      error: status.error === SEND_NOT_DISPATCHED ? null : SEND_RECONCILIATION_REQUIRED }
  }
  return status
}
