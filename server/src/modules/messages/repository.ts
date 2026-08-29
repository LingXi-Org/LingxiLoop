import type { QueryResultRow } from 'pg'
import type { Queryable } from '../../db/queryable.js'
import type { StoredAttachment } from '../../storage.js'
import type { ReactionPayload } from './contracts.js'

export interface EmailProjectionAttachment {
  storageKey: string | null
  url?: string | null
  truncated?: boolean
  [key: string]: unknown
}

export interface MessageProjectionRow extends QueryResultRow {
  id: string
  conversationId: string
  authorId: string
  kind: string
  body: string
  sequence: number
  attachment: StoredAttachment | null
  email?: { attachments?: EmailProjectionAttachment[] } | null
  [key: string]: unknown
}

const MESSAGE_PROJECTION = `
  email.message_id AS id, email.conversation_id AS "conversationId",
  email.author_id AS "authorId", 'email'::text AS kind, email.body, email.sequence,
  '[]'::jsonb AS "mentionedIds", FALSE AS "mentionAll",
  NULL::jsonb AS tool, NULL::jsonb AS attachment, NULL::jsonb AS poll,
  NULL::jsonb AS handoff, NULL::jsonb AS approval,
  '[]'::jsonb AS "pollTallies",
  NULL::text AS "quotedMessageId", email.created_at AS "createdAt",
  jsonb_build_object(
    'subject', email.subject, 'from', email.from_addr, 'to', email.to_addrs,
    'cc', email.cc_addrs, 'direction', email.direction,
    'transportStatus', email.transport_status,
    'transportError', email.transport_error,
    'smtpMessageId', email.smtp_message_id, 'inReplyTo', email.in_reply_to,
    'hasHtml', email.html IS NOT NULL, 'autoSubmitted', email.auto_submitted,
    'attachments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', attachment.id, 'filename', attachment.filename,
        'mimeType', attachment.mime_type, 'sizeBytes', attachment.size_bytes,
        'storageKey', attachment.storage_key, 'truncated', attachment.truncated
      ) ORDER BY attachment.created_at)
        FROM email_attachments attachment
       WHERE attachment.message_id = email.message_id AND attachment.company_id = $2
    ), '[]'::jsonb)
  ) AS "email",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'emoji', reaction.emoji, 'count', reaction.count, 'users', reaction.users
    ))
      FROM (
        SELECT emoji, COUNT(*)::int AS count,
               array_agg(user_id ORDER BY user_id) AS users
          FROM message_reactions
         WHERE message_id = email.message_id AND company_id = $2
         GROUP BY emoji
         ORDER BY count DESC, emoji ASC
      ) reaction
  ), '[]'::jsonb) AS reactions,
  NULL::jsonb AS quoted,
  0::int AS "replyCount"
`

export async function listEmailMessages(
  db: Queryable,
  input: { companyId: string; conversationId: string; before?: number; limit: number },
): Promise<MessageProjectionRow[]> {
  const params: unknown[] = [input.conversationId, input.companyId]
  let cursor = ''
  if (input.before !== undefined) {
    params.push(input.before)
    cursor = ` AND email.sequence < $${params.length}`
  }
  params.push(input.limit)
  const { rows } = await db.query<MessageProjectionRow>(
    `SELECT ${MESSAGE_PROJECTION}
       FROM email_messages email
       JOIN conversations email_conversation
         ON email_conversation.id=email.conversation_id AND email_conversation.company_id=email.company_id
        AND email_conversation.kind='email'
      WHERE email.conversation_id = $1 AND email.company_id = $2${cursor}
      ORDER BY email.sequence DESC
      LIMIT $${params.length}`,
    params,
  )
  return rows
}

export async function reactionExists(
  db: Queryable,
  companyId: string,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM message_reactions
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3 AND company_id = $4
      LIMIT 1`,
    [messageId, userId, emoji, companyId],
  )
  return Boolean(rowCount)
}

export async function removeReaction(
  db: Queryable,
  companyId: string,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await db.query(
    `DELETE FROM message_reactions
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3 AND company_id = $4`,
    [messageId, userId, emoji, companyId],
  )
}

export async function addWukongReaction(
  db: Queryable,
  input: { companyId: string; conversationId: string; messageId: string; messageSeq: number; userId: string; emoji: string },
): Promise<void> {
  await db.query(
    `INSERT INTO message_reactions (message_id, user_id, emoji, company_id, conversation_id, message_seq)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT DO NOTHING`,
    [input.messageId, input.userId, input.emoji, input.companyId, input.conversationId, input.messageSeq],
  )
}

export async function lockWukongReaction(
  db: Queryable,
  companyId: string,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
    `wukong-reaction:${companyId}:${messageId}:${userId}:${emoji}`,
  ])
}

export async function aggregateReactions(
  db: Queryable,
  companyId: string,
  messageId: string,
): Promise<ReactionPayload[]> {
  const { rows } = await db.query<ReactionPayload & QueryResultRow>(
    `SELECT emoji, COUNT(*)::int AS count,
            array_agg(user_id ORDER BY user_id) AS users
       FROM message_reactions
      WHERE message_id = $1 AND company_id = $2
      GROUP BY emoji
      ORDER BY count DESC, emoji ASC`,
    [messageId, companyId],
  )
  return rows
}

export async function reactionsForWukongMessages(
  db: Queryable,
  companyId: string,
  conversationId: string,
  messageIds: string[],
): Promise<Record<string, ReactionPayload[]>> {
  if (messageIds.length === 0) return {}
  const { rows } = await db.query<{ message_id: string; reactions: ReactionPayload[] } & QueryResultRow>(
    `SELECT message_id, jsonb_agg(jsonb_build_object(
              'emoji', emoji, 'count', count, 'users', users
            ) ORDER BY count DESC, emoji ASC) AS reactions
       FROM (
         SELECT message_id, emoji, COUNT(*)::int AS count, array_agg(user_id ORDER BY user_id) AS users
           FROM message_reactions
          WHERE company_id=$1 AND conversation_id=$2 AND message_id=ANY($3::text[])
          GROUP BY message_id, emoji
       ) grouped
      GROUP BY message_id`,
    [companyId, conversationId, messageIds],
  )
  return Object.fromEntries(rows.map((row) => [row.message_id, row.reactions]))
}
