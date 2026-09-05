import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { tenantEmailIdempotencyKey } from './idempotency.js'

export async function findCompletedOutboundByKey(
  db: Queryable,
  companyId: string,
  idempotencyKey: string,
): Promise<{
  messageId: string
  conversationId: string
  transportStatus: 'sent' | 'failed'
  error: string | null
  subject: string
  to: string[]
  cc: string[]
} | null> {
  const scopedKey = tenantEmailIdempotencyKey(companyId, idempotencyKey)
  const messageId = `m-agent-${createHash('sha256').update(scopedKey).digest('hex').slice(0, 32)}`
  const { rows } = await db.query<{
    message_id: string
    conversation_id: string
    transport_status: 'sent' | 'failed'
    transport_error: string | null
    subject: string
    to_addrs: string[]
    cc_addrs: string[]
  }>(
    `SELECT message_id, conversation_id, transport_status, transport_error,
            subject, to_addrs, cc_addrs
       FROM email_messages
      WHERE message_id = $1
        AND company_id = $2
        AND direction = 'out'
        AND transport_status IN ('sent', 'failed')`,
    [messageId, companyId],
  )
  const row = rows[0]
  return row ? {
    messageId: row.message_id, conversationId: row.conversation_id,
    transportStatus: row.transport_status, error: row.transport_error,
    subject: row.subject, to: row.to_addrs, cc: row.cc_addrs,
  } : null
}

export interface EmailParticipantRow {
  id: string
  name: string
  kind: 'agent' | 'human'
  participant_email: string | null
  user_email: string | null
}

export interface EmailHtmlRow {
  html: string | null
  members: string[] | null
}

export interface EmailReplyTargetRow {
  conversation_id: string
  smtp_message_id: string | null
  references_chain: string[]
  subject: string
  from_addr: string
  to_addrs: string[]
  cc_addrs: string[]
  members: string[] | null
}

export async function findEmailParticipant(
  db: Queryable,
  companyId: string,
  participantId: string,
): Promise<EmailParticipantRow | null> {
  const { rows } = await db.query<EmailParticipantRow>(
    `SELECT participant.id, participant.name, participant.kind,
            participant.email AS participant_email, app_user.email AS user_email
       FROM participants participant
       LEFT JOIN users app_user
         ON app_user.id = participant.id AND participant.kind = 'human'
      WHERE participant.id = $1
        AND participant.company_id = $2
        AND participant.departed_at IS NULL
      LIMIT 1`,
    [participantId, companyId],
  )
  if (rows[0]) return rows[0]
  const directUser = await db.query<{
    id: string
    name: string
    kind: 'human'
    participant_email: null
    user_email: string
  }>(
    `SELECT app_user.id, app_user.display_name AS name, 'human'::text AS kind,
            NULL::text AS participant_email, app_user.email AS user_email
       FROM users app_user
       JOIN company_memberships member ON member.user_id = app_user.id
      WHERE app_user.id = $1 AND member.company_id = $2 AND member.status='ACTIVE'
      LIMIT 1`,
    [participantId, companyId],
  )
  return directUser.rows[0] ?? null
}

export async function findTenantMemberIdsByAddresses(
  db: Queryable,
  companyId: string,
  addresses: string[],
): Promise<string[]> {
  if (addresses.length === 0) return []
  const { rows } = await db.query<{ id: string }>(
    `SELECT participant.id
       FROM participants participant
      WHERE participant.company_id = $1
        AND participant.departed_at IS NULL
        AND LOWER(participant.email) = ANY($2::text[])
     UNION
     SELECT app_user.id
       FROM users app_user
       JOIN company_memberships member
         ON member.user_id = app_user.id AND member.company_id = $1
        AND member.status='ACTIVE'
      WHERE LOWER(app_user.email) = ANY($2::text[])`,
    [companyId, addresses],
  )
  return rows.map((row) => row.id)
}

export async function findEmailHtml(
  db: Queryable,
  companyId: string,
  messageId: string,
): Promise<EmailHtmlRow | null> {
  const { rows } = await db.query<EmailHtmlRow>(
    `SELECT email.html, conversation.members
       FROM email_messages email
       LEFT JOIN conversations conversation
         ON conversation.id = email.conversation_id
        AND conversation.company_id = email.company_id
      WHERE email.message_id = $1 AND email.company_id = $2
      LIMIT 1`,
    [messageId, companyId],
  )
  return rows[0] ?? null
}

export async function findEmailReplyTarget(
  db: Queryable,
  companyId: string,
  messageId: string,
): Promise<EmailReplyTargetRow | null> {
  const { rows } = await db.query<EmailReplyTargetRow>(
    `SELECT email.conversation_id, email.smtp_message_id, email.references_chain,
            email.subject, email.from_addr, email.to_addrs, email.cc_addrs,
            conversation.members
       FROM email_messages email
       LEFT JOIN conversations conversation
         ON conversation.id = email.conversation_id
        AND conversation.company_id = email.company_id
      WHERE email.message_id = $1 AND email.company_id = $2
      LIMIT 1`,
    [messageId, companyId],
  )
  return rows[0] ?? null
}

export async function findUserEmail(db: Queryable, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ email: string | null }>(
    `SELECT email FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  )
  return rows[0]?.email ?? null
}

export async function markEmailConversationRead(
  db: Queryable,
  companyId: string,
  userId: string,
  conversationId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
     SELECT $2, conversation.id, NOW()
       FROM conversations conversation
      WHERE conversation.id = $3 AND conversation.company_id = $1
     ON CONFLICT (user_id, conversation_id)
     DO UPDATE SET last_read_at = NOW()`,
    [companyId, userId, conversationId],
  )
}
