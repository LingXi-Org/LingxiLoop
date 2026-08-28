import type { Queryable } from '../../db/queryable.js'

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
  return rows[0] ?? null
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
       JOIN company_members member
         ON member.user_id = app_user.id AND member.company_id = $1
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
