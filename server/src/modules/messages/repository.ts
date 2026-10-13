import type { QueryResultRow } from 'pg'
import type { Queryable } from '../../db/queryable.js'
import type { ReactionPayload } from './contracts.js'

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
