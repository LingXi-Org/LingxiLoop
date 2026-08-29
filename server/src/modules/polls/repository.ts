import type { Queryable } from '../../db/queryable.js'
import type { PollPayload } from '../../db/schema.js'
import type { PollRow } from './contracts.js'

export async function channelBinding(db: Queryable, companyId: string, channelId: string) {
  const { rows } = await db.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [channelId, companyId],
  )
  const profile = rows[0]?.profile
  if (!profile) return null
  return {
    channelType: Number(profile.channelType ?? 2),
    members: Array.isArray(profile.members) ? profile.members.map(String) : [],
  }
}

export async function insertPoll(db: Queryable, row: PollRow): Promise<boolean> {
  const { rows } = await db.query(
    `INSERT INTO im_polls
       (poll_client_msg_no,channel_id,channel_type,company_id,author_id,request_fingerprint,poll,revision)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,1)
     ON CONFLICT (poll_client_msg_no) DO NOTHING RETURNING poll_client_msg_no`,
    [row.poll_client_msg_no, row.channel_id, row.channel_type, row.company_id,
      row.author_id, row.request_fingerprint, JSON.stringify(row.poll)],
  )
  return Boolean(rows[0])
}

export async function findPoll(db: Queryable, companyId: string, messageId: string): Promise<PollRow | null> {
  const { rows } = await db.query<PollRow>(
    `SELECT poll_client_msg_no,channel_id,channel_type,company_id,author_id,request_fingerprint,poll,revision,published_revision
       FROM im_polls WHERE poll_client_msg_no=$1 AND company_id=$2`,
    [messageId, companyId],
  )
  return rows[0] ?? null
}

export async function lockPoll(db: Queryable, companyId: string, messageId: string): Promise<PollRow | null> {
  const { rows } = await db.query<PollRow>(
    `SELECT poll_client_msg_no,channel_id,channel_type,company_id,author_id,request_fingerprint,poll,revision,published_revision
       FROM im_polls WHERE poll_client_msg_no=$1 AND company_id=$2 FOR UPDATE`,
    [messageId, companyId],
  )
  return rows[0] ?? null
}

export async function recordPublishedSequence(
  db: Queryable, companyId: string, messageId: string, revision: number, sequence: number,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE im_polls
        SET wukong_message_seq=$4,
            published_revision=GREATEST(published_revision,$3),
            updated_at=NOW()
      WHERE poll_client_msg_no=$1 AND company_id=$2`,
    [messageId, companyId, revision, sequence],
  )
  return (result.rowCount ?? 0) > 0
}

export async function replaceVotes(db: Queryable, args: {
  companyId: string
  messageId: string
  voterParticipantId: string
  voterKind: 'human' | 'agent'
  optionIds: string[]
}): Promise<void> {
  await db.query(
    `DELETE FROM im_poll_votes
      WHERE poll_client_msg_no=$1 AND voter_participant_id=$2 AND company_id=$3`,
    [args.messageId, args.voterParticipantId, args.companyId],
  )
  for (const optionId of args.optionIds) {
    await db.query(
      `INSERT INTO im_poll_votes
         (poll_client_msg_no,voter_participant_id,voter_kind,option_id,company_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [args.messageId, args.voterParticipantId, args.voterKind, optionId, args.companyId],
    )
  }
}

export async function bumpPollRevision(
  db: Queryable, companyId: string, messageId: string, poll?: PollPayload,
): Promise<PollRow | null> {
  const { rows } = poll
    ? await db.query<PollRow>(
      `UPDATE im_polls SET poll=$3::jsonb,revision=revision+1,updated_at=NOW()
        WHERE poll_client_msg_no=$1 AND company_id=$2
        RETURNING poll_client_msg_no,channel_id,channel_type,company_id,author_id,request_fingerprint,poll,revision,published_revision`,
      [messageId, companyId, JSON.stringify(poll)],
    )
    : await db.query<PollRow>(
      `UPDATE im_polls SET revision=revision+1,updated_at=NOW()
        WHERE poll_client_msg_no=$1 AND company_id=$2
        RETURNING poll_client_msg_no,channel_id,channel_type,company_id,author_id,request_fingerprint,poll,revision,published_revision`,
      [messageId, companyId],
    )
  return rows[0] ?? null
}

export async function pollTallies(db: Queryable, companyId: string, messageId: string) {
  const { rows } = await db.query<{ option_id: string; cnt: number; voter_ids: string[] }>(
    `SELECT option_id,COUNT(*)::int AS cnt,
            array_agg(voter_participant_id ORDER BY voter_participant_id) AS voter_ids
       FROM im_poll_votes
      WHERE poll_client_msg_no=$1 AND company_id=$2
      GROUP BY option_id`,
    [messageId, companyId],
  )
  return rows.map((row) => ({ optionId: row.option_id, count: row.cnt, voterIds: row.voter_ids }))
}

export async function expiredPolls(db: Queryable, limit: number) {
  const { rows } = await db.query<{ poll_client_msg_no: string; company_id: string }>(
    `SELECT poll_client_msg_no,company_id FROM im_polls
      WHERE (poll->>'closedAt') IS NULL
        AND (poll->>'expiresAt') IS NOT NULL
        AND (poll->>'expiresAt')::timestamptz<=NOW()
      ORDER BY updated_at,poll_client_msg_no
      LIMIT $1`,
    [limit],
  )
  return rows
}

export async function pendingPollPublications(db: Queryable, limit: number): Promise<PollRow[]> {
  const { rows } = await db.query<PollRow>(
    `SELECT poll_client_msg_no,channel_id,channel_type,company_id,author_id,request_fingerprint,poll,revision,published_revision
       FROM im_polls
      WHERE revision>published_revision
      ORDER BY updated_at,poll_client_msg_no
      LIMIT $1`,
    [limit],
  )
  return rows
}
