import type { Queryable } from '../../db/queryable.js'

export interface EmailReplyParent {
  smtpMessageId: string | null
  references: string[]
  subject: string
  from: string
  to: string[]
  cc: string[]
}

export async function findConversationByMessageIds(
  db: Queryable,
  companyId: string,
  messageIds: string[],
): Promise<string | null> {
  if (messageIds.length === 0) return null
  const { rows } = await db.query<{ conversation_id: string }>(
    `SELECT conversation_id
       FROM email_messages
      WHERE company_id = $1 AND LOWER(smtp_message_id) = ANY($2::text[])
      ORDER BY created_at DESC
      LIMIT 1`,
    [companyId, messageIds],
  )
  return rows[0]?.conversation_id ?? null
}

export async function mergeConversationMembers(
  db: Queryable,
  companyId: string,
  conversationId: string,
  memberIds: string[],
): Promise<void> {
  await db.query(
    `UPDATE conversations
        SET members = (
          SELECT to_jsonb(ARRAY(
            SELECT DISTINCT member_id
              FROM (
                SELECT jsonb_array_elements_text(members) AS member_id
                UNION
                SELECT unnest($3::text[]) AS member_id
              ) member_set
          ))
        )
      WHERE id = $1 AND company_id = $2`,
    [conversationId, companyId, memberIds],
  )
}

export async function createEmailConversation(
  db: Queryable,
  input: {
    id: string
    companyId: string
    projectId?: string | null
    title: string
    memberIds: string[]
  },
): Promise<{ created: boolean }> {
  const { rows } = await db.query<{ created: boolean }>(
    `INSERT INTO conversations (id, kind, title, members, company_id, project_id, topic)
     SELECT $1, 'email', $2, $3::jsonb, $4,
            COALESCE(
              (SELECT project.id FROM projects project WHERE project.id = $5 AND project.company_id = $4),
              (SELECT project.id FROM projects project WHERE project.company_id = $4 AND project.is_default = TRUE LIMIT 1)
            ),
            $2
      WHERE $5::text IS NULL
         OR EXISTS (SELECT 1 FROM projects project WHERE project.id = $5 AND project.company_id = $4)
     ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
       WHERE conversations.company_id = EXCLUDED.company_id
     RETURNING (xmax = 0) AS created`,
    [input.id, input.title, JSON.stringify(input.memberIds), input.companyId, input.projectId ?? null],
  )
  const row = rows[0]
  if (!row) {
    throw new Error(`email conversation project does not belong to ${input.companyId}`)
  }
  return row
}

export async function recordEmailContact(
  db: Queryable,
  input: { companyId: string; address: string; displayName: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO email_contacts (company_id, address, display_name, message_count, last_seen_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (company_id, address) DO UPDATE
       SET message_count = email_contacts.message_count + 1,
           last_seen_at = NOW(),
           display_name = COALESCE(EXCLUDED.display_name, email_contacts.display_name)`,
    [input.companyId, input.address, input.displayName],
  )
}

export async function findLatestReplyParent(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<EmailReplyParent | null> {
  const { rows } = await db.query<{
    smtp_message_id: string | null
    references_chain: string[]
    subject: string
    from_addr: string
    to_addrs: string[]
    cc_addrs: string[]
  }>(
    `SELECT email.smtp_message_id,
            email.references_chain,
            email.subject,
            email.from_addr,
            email.to_addrs,
            email.cc_addrs
       FROM email_messages email
       JOIN conversations conversation
         ON conversation.id = email.conversation_id
        AND conversation.company_id = email.company_id
      WHERE email.conversation_id = $1 AND email.company_id = $2
      ORDER BY email.created_at DESC
      LIMIT 1`,
    [conversationId, companyId],
  )
  const row = rows[0]
  return row ? {
    smtpMessageId: row.smtp_message_id,
    references: row.references_chain,
    subject: row.subject,
    from: row.from_addr,
    to: row.to_addrs,
    cc: row.cc_addrs,
  } : null
}

export async function updateReplyDelivery(
  db: Queryable,
  input: {
    companyId: string
    messageId: string
    status: 'sent' | 'failed'
    error: string | null
    smtpMessageId: string
    nextRetryAt: Date | null
  },
): Promise<void> {
  await db.query(
    `UPDATE email_messages
        SET transport_status = $3,
            transport_error = $4,
            smtp_message_id = $5,
            next_retry_at = $6
      WHERE message_id = $1 AND company_id = $2 AND direction = 'out'`,
    [input.messageId, input.companyId, input.status, input.error, input.smtpMessageId, input.nextRetryAt],
  )
}
