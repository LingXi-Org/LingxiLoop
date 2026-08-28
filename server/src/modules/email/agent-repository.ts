import type { Queryable } from '../../db/queryable.js'

export interface AgentEmailParticipantContactRow {
  id: string
  name: string
  email: string | null
  companySlug: string
  role: string | null
}

export interface AgentEmailHumanContactRow {
  id: string
  displayName: string
  email: string
}

export interface AgentEmailExternalContactRow {
  address: string
  displayName: string | null
}

export interface AgentEmailThreadRow {
  conversationId: string
  title: string
  updatedAt: string
  unreadCount: number
  lastSubject: string | null
  lastFrom: string | null
  lastAt: string | null
  lastBody: string | null
}

export interface AgentEmailThreadMessageRow {
  id: string
  createdAt: string
  body: string
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
  subject: string
  smtpMessageId: string | null
  inReplyTo: string | null
  direction: 'in' | 'out'
  transportStatus: string
}

export async function listAgentEmailParticipantContacts(
  db: Queryable,
  companyId: string,
  viewerId: string,
): Promise<AgentEmailParticipantContactRow[]> {
  const { rows } = await db.query<{
    id: string
    name: string
    email: string | null
    company_slug: string
    role: string | null
  }>(
    `SELECT participant.id, participant.name, participant.email,
            company.slug AS company_slug, participant.role
       FROM participants participant
       JOIN companies company ON company.id = participant.company_id
      WHERE participant.company_id = $1
        AND participant.kind = 'agent'
        AND participant.departed_at IS NULL
        AND participant.id <> $2
      ORDER BY participant.name ASC`,
    [companyId, viewerId],
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    companySlug: row.company_slug,
    role: row.role,
  }))
}

export async function listAgentEmailHumanContacts(
  db: Queryable,
  companyId: string,
): Promise<AgentEmailHumanContactRow[]> {
  const { rows } = await db.query<{ id: string; display_name: string; email: string }>(
    `SELECT app_user.id, app_user.display_name, app_user.email
       FROM users app_user
       JOIN company_members member ON member.user_id = app_user.id
      WHERE member.company_id = $1 AND app_user.email IS NOT NULL
      ORDER BY app_user.display_name ASC`,
    [companyId],
  )
  return rows.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email }))
}

export async function listAgentEmailExternalContacts(
  db: Queryable,
  companyId: string,
  limit: number,
): Promise<AgentEmailExternalContactRow[]> {
  const { rows } = await db.query<{ address: string; display_name: string | null }>(
    `SELECT address, display_name
       FROM email_contacts
      WHERE company_id = $1
      ORDER BY last_seen_at DESC
      LIMIT $2`,
    [companyId, limit],
  )
  return rows.map((row) => ({ address: row.address, displayName: row.display_name }))
}

export async function listAgentEmailThreads(
  db: Queryable,
  input: { companyId: string; agentId: string; unreadOnly: boolean; limit: number },
): Promise<AgentEmailThreadRow[]> {
  const { rows } = await db.query<{
    conversation_id: string
    title: string
    updated_at: string
    unread_count: number
    last_subject: string | null
    last_from: string | null
    last_at: string | null
    last_body: string | null
  }>(
    `WITH my_threads AS (
       SELECT conversation.id, conversation.title, conversation.updated_at
         FROM conversations conversation
        WHERE conversation.kind = 'email'
          AND conversation.company_id = $1
          AND conversation.members @> to_jsonb(ARRAY[$2::text])
     ),
     last_message AS (
       SELECT DISTINCT ON (email.conversation_id)
              email.conversation_id, email.subject, email.from_addr,
              message.body, message.created_at AS at
         FROM email_messages email
         JOIN messages message ON message.id = email.message_id
        WHERE email.company_id = $1
        ORDER BY email.conversation_id, email.created_at DESC
     ),
     unread AS (
       SELECT message.conversation_id, COUNT(*)::int AS count
         FROM messages message
         LEFT JOIN conversation_reads reading
           ON reading.conversation_id = message.conversation_id AND reading.user_id = $2
        WHERE message.kind = 'email'
          AND message.company_id = $1
          AND message.author_id <> $2
          AND (reading.last_read_at IS NULL OR message.created_at > reading.last_read_at)
        GROUP BY message.conversation_id
     )
     SELECT thread.id AS conversation_id, thread.title, thread.updated_at::text,
            COALESCE(unread.count, 0) AS unread_count,
            last_message.subject AS last_subject,
            last_message.from_addr AS last_from,
            last_message.at::text AS last_at,
            last_message.body AS last_body
       FROM my_threads thread
       LEFT JOIN last_message ON last_message.conversation_id = thread.id
       LEFT JOIN unread ON unread.conversation_id = thread.id
      WHERE NOT $3 OR COALESCE(unread.count, 0) > 0
      ORDER BY thread.updated_at DESC
      LIMIT $4`,
    [input.companyId, input.agentId, input.unreadOnly, input.limit],
  )
  return rows.map((row) => ({
    conversationId: row.conversation_id,
    title: row.title,
    updatedAt: row.updated_at,
    unreadCount: row.unread_count,
    lastSubject: row.last_subject,
    lastFrom: row.last_from,
    lastAt: row.last_at,
    lastBody: row.last_body,
  }))
}

export async function findAgentEmailThread(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<{ title: string; members: string[] } | null> {
  const { rows } = await db.query<{ title: string; members: string[] }>(
    `SELECT title, members
       FROM conversations
      WHERE id = $1 AND company_id = $2 AND kind = 'email'
      LIMIT 1`,
    [conversationId, companyId],
  )
  return rows[0] ?? null
}

export async function listAgentEmailThreadMessages(
  db: Queryable,
  companyId: string,
  conversationId: string,
  limit: number,
): Promise<AgentEmailThreadMessageRow[]> {
  const { rows } = await db.query<{
    id: string
    created_at: string
    body: string
    from_addr: string
    to_addrs: string[]
    cc_addrs: string[]
    subject: string
    smtp_message_id: string | null
    in_reply_to: string | null
    direction: 'in' | 'out'
    transport_status: string
  }>(
    `SELECT message.id, message.created_at::text, message.body,
            email.from_addr, email.to_addrs, email.cc_addrs, email.subject,
            email.smtp_message_id, email.in_reply_to, email.direction, email.transport_status
       FROM messages message
       JOIN email_messages email
         ON email.message_id = message.id
        AND email.company_id = message.company_id
      WHERE message.conversation_id = $1 AND message.company_id = $2
      ORDER BY message.sequence DESC
      LIMIT $3`,
    [conversationId, companyId, limit],
  )
  return rows.reverse().map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    body: row.body,
    fromAddress: row.from_addr,
    toAddresses: row.to_addrs,
    ccAddresses: row.cc_addrs,
    subject: row.subject,
    smtpMessageId: row.smtp_message_id,
    inReplyTo: row.in_reply_to,
    direction: row.direction,
    transportStatus: row.transport_status,
  }))
}
