/**
 * Poll product projection.
 *
 * WuKongIM owns every poll message and update. Postgres stores only the
 * mutable voting projection required to validate choices and calculate
 * tallies; the projection is keyed by the original WuKong client_msg_no.
 */
import { randomUUID } from 'node:crypto'
import { pool } from './db/pool.js'
import type { PollPayload, PollOption } from './db/schema.js'
import type { PollUpdatedEvent } from './redis.js'
import { wukongClient } from './im/wukong.js'

const MAX_OPTIONS = 10
const MIN_OPTIONS = 2
const MAX_QUESTION_LEN = 280
const MAX_OPTION_LEN = 120

export class PollError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface CreatePollInput {
  conversationId: string
  companyId: string
  authorId: string
  question: string
  mode: 'single' | 'multi'
  options: string[]
  expiresInMinutes?: number | null
}

export interface CreatedPoll {
  /** Stable WuKong client_msg_no used by voting APIs and the renderer. */
  messageId: string
  sequence: number
  poll: PollPayload
}

type PollRow = {
  poll_client_msg_no: string
  channel_id: string
  channel_type: number
  company_id: string
  author_id: string
  poll: PollPayload
  revision: string
}

function validatePoll(input: CreatePollInput): PollPayload {
  const question = input.question.trim()
  if (!question) throw new PollError('question is required')
  if (question.length > MAX_QUESTION_LEN) throw new PollError(`question too long (max ${MAX_QUESTION_LEN} chars)`)
  if (input.mode !== 'single' && input.mode !== 'multi') throw new PollError('mode must be "single" or "multi"')
  const options: PollOption[] = []
  const seen = new Set<string>()
  for (const raw of input.options) {
    const text = String(raw ?? '').trim()
    if (!text) continue
    if (text.length > MAX_OPTION_LEN) throw new PollError(`option too long (max ${MAX_OPTION_LEN} chars)`)
    const key = text.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ id: `opt-${randomUUID().slice(0, 8)}`, text })
    if (options.length >= MAX_OPTIONS) break
  }
  if (options.length < MIN_OPTIONS) throw new PollError(`need at least ${MIN_OPTIONS} distinct options`)
  const expiresAt = input.expiresInMinutes != null && input.expiresInMinutes > 0
    ? new Date(Date.now() + Math.floor(input.expiresInMinutes) * 60_000).toISOString()
    : null
  return { question, mode: input.mode, options, expiresAt, closedAt: null, closedReason: null }
}

async function channelBinding(companyId: string, channelId: string): Promise<{ channelType: number; members: string[] }> {
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [channelId, companyId],
  )
  const profile = rows[0]?.profile
  if (!profile) throw new PollError('channel not found', 404)
  return {
    channelType: Number(profile.channelType ?? 2),
    members: Array.isArray(profile.members) ? profile.members.map(String) : [],
  }
}

async function tallies(pollClientMsgNo: string): Promise<PollUpdatedEvent['tallies']> {
  const { rows } = await pool.query<{ option_id: string; cnt: number; voter_ids: string[] }>(
    `SELECT option_id, COUNT(*)::int AS cnt,
            array_agg(voter_participant_id ORDER BY voter_participant_id) AS voter_ids
       FROM im_poll_votes
      WHERE poll_client_msg_no=$1
      GROUP BY option_id`,
    [pollClientMsgNo],
  )
  return rows.map((row) => ({ optionId: row.option_id, count: row.cnt, voterIds: row.voter_ids }))
}

async function publishSnapshot(row: PollRow, actorId: string | null, initial = false): Promise<{ messageSeq: number }> {
  const pollTallies = await tallies(row.poll_client_msg_no)
  const revision = Number(row.revision)
  const clientMsgNo = initial ? row.poll_client_msg_no : `${row.poll_client_msg_no}:revision:${revision}`
  const sent = await wukongClient().sendMessage(row.channel_id, row.channel_type, actorId ?? row.author_id, {
    version: 1,
    kind: 'poll',
    clientMsgNo,
    body: `📊 ${row.poll.question}`,
    refs: { pollClientMsgNo: row.poll_client_msg_no },
    data: {
      poll: row.poll as unknown as Record<string, unknown>,
      pollTallies,
      revision,
      suppressAgentWake: !initial,
    },
  })
  return { messageSeq: sent.messageSeq }
}

export async function createPoll(input: CreatePollInput): Promise<CreatedPoll> {
  const poll = validatePoll(input)
  const binding = await channelBinding(input.companyId, input.conversationId)
  if (!binding.members.includes(input.authorId)) throw new PollError('not a member of this channel', 403)
  const messageId = `poll-${randomUUID()}`
  const row: PollRow = {
    poll_client_msg_no: messageId,
    channel_id: input.conversationId,
    channel_type: binding.channelType,
    company_id: input.companyId,
    author_id: input.authorId,
    poll,
    revision: '1',
  }
  await pool.query(
    `INSERT INTO im_polls
       (poll_client_msg_no, channel_id, channel_type, company_id, author_id, poll, revision)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,1)`,
    [messageId, input.conversationId, binding.channelType, input.companyId, input.authorId, JSON.stringify(poll)],
  )
  try {
    const sent = await publishSnapshot(row, input.authorId, true)
    await pool.query(
      `UPDATE im_polls SET wukong_message_seq=$2, updated_at=NOW() WHERE poll_client_msg_no=$1`,
      [messageId, sent.messageSeq],
    )
    return { messageId, sequence: sent.messageSeq, poll }
  } catch (error) {
    await pool.query(`DELETE FROM im_polls WHERE poll_client_msg_no=$1`, [messageId]).catch(() => undefined)
    throw error
  }
}

export interface CastVoteInput {
  messageId: string
  companyId: string
  voterParticipantId: string
  voterKind: 'human' | 'agent'
  optionIds: string[]
}

export async function castVote(input: CastVoteInput): Promise<PollUpdatedEvent> {
  const requested = [...new Set(input.optionIds.filter(Boolean))]
  const client = await pool.connect()
  let updated: PollRow
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<PollRow>(
      `SELECT * FROM im_polls WHERE poll_client_msg_no=$1 AND company_id=$2 FOR UPDATE`,
      [input.messageId, input.companyId],
    )
    const row = rows[0]
    if (!row) throw new PollError('poll not found', 404)
    if (row.poll.closedAt) throw new PollError('poll is closed', 409)
    const binding = await client.query<{ profile: Record<string, unknown> }>(
      `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
      [row.channel_id, input.companyId],
    )
    const members = Array.isArray(binding.rows[0]?.profile.members) ? binding.rows[0].profile.members.map(String) : []
    if (!members.includes(input.voterParticipantId)) throw new PollError('not a member of this channel', 403)
    if (row.poll.mode === 'single' && requested.length > 1) throw new PollError('single-choice poll accepts at most one option')
    const valid = new Set(row.poll.options.map((option) => option.id))
    for (const optionId of requested) if (!valid.has(optionId)) throw new PollError(`unknown option: ${optionId}`)
    await client.query(
      `DELETE FROM im_poll_votes WHERE poll_client_msg_no=$1 AND voter_participant_id=$2`,
      [input.messageId, input.voterParticipantId],
    )
    for (const optionId of requested) {
      await client.query(
        `INSERT INTO im_poll_votes
           (poll_client_msg_no, voter_participant_id, voter_kind, option_id, company_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [input.messageId, input.voterParticipantId, input.voterKind, optionId, input.companyId],
      )
    }
    const next = await client.query<PollRow>(
      `UPDATE im_polls SET revision=revision+1, updated_at=NOW()
        WHERE poll_client_msg_no=$1 RETURNING *`,
      [input.messageId],
    )
    updated = next.rows[0]
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  const event = await buildPollUpdatedEvent(updated.poll_client_msg_no, input.voterParticipantId)
  await publishSnapshot(updated, input.voterParticipantId)
  return event
}

export interface CloseInput {
  messageId: string
  companyId: string
  actorId: string | null
  reason: 'manual' | 'expired'
}

export async function closePoll(input: CloseInput): Promise<PollUpdatedEvent | null> {
  const client = await pool.connect()
  let updated: PollRow | null = null
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<PollRow>(
      `SELECT * FROM im_polls WHERE poll_client_msg_no=$1 AND company_id=$2 FOR UPDATE`,
      [input.messageId, input.companyId],
    )
    const row = rows[0]
    if (!row) throw new PollError('poll not found', 404)
    if (row.poll.closedAt) {
      await client.query('COMMIT')
      return null
    }
    if (input.reason === 'manual' && input.actorId !== row.author_id) throw new PollError('only the poll author can close this poll', 403)
    const poll: PollPayload = { ...row.poll, closedAt: new Date().toISOString(), closedReason: input.reason }
    const next = await client.query<PollRow>(
      `UPDATE im_polls SET poll=$2::jsonb, revision=revision+1, updated_at=NOW()
        WHERE poll_client_msg_no=$1 RETURNING *`,
      [input.messageId, JSON.stringify(poll)],
    )
    updated = next.rows[0]
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  if (!updated) return null
  const event = await buildPollUpdatedEvent(updated.poll_client_msg_no, input.actorId)
  await publishSnapshot(updated, input.actorId)
  return event
}

async function buildPollUpdatedEvent(messageId: string, actorId: string | null): Promise<PollUpdatedEvent> {
  const { rows } = await pool.query<PollRow>(`SELECT * FROM im_polls WHERE poll_client_msg_no=$1`, [messageId])
  const row = rows[0]
  if (!row) throw new PollError('poll vanished mid-update', 500)
  return {
    type: 'poll.updated',
    conversationId: row.channel_id,
    companyId: row.company_id,
    messageId,
    poll: row.poll,
    tallies: await tallies(messageId),
    actorId,
  }
}

let sweepTimer: NodeJS.Timeout | null = null

export function startPollExpirationSweeper(intervalMs: number): { stop(): void } | null {
  if (sweepTimer) return { stop: stopPollExpirationSweeper }
  if (intervalMs <= 0) return null
  const tick = async () => {
    try { await sweepExpiredPolls() }
    catch (error) { console.error('[polls] expiration sweep failed', error) }
  }
  sweepTimer = setInterval(() => { void tick() }, intervalMs)
  sweepTimer.unref()
  return { stop: stopPollExpirationSweeper }
}

export function stopPollExpirationSweeper(): void {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = null
}

export async function sweepExpiredPolls(): Promise<number> {
  const { rows } = await pool.query<{ poll_client_msg_no: string; company_id: string }>(
    `SELECT poll_client_msg_no, company_id FROM im_polls
      WHERE (poll->>'closedAt') IS NULL
        AND (poll->>'expiresAt') IS NOT NULL
        AND (poll->>'expiresAt')::timestamptz <= NOW()
      LIMIT 200`,
  )
  let closed = 0
  for (const row of rows) {
    try {
      if (await closePoll({ messageId: row.poll_client_msg_no, companyId: row.company_id, actorId: null, reason: 'expired' })) closed++
    } catch (error) {
      console.warn(`[polls] failed to expire ${row.poll_client_msg_no}`, error)
    }
  }
  return closed
}
