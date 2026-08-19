/**
 * Polls — shared core for the poll feature.
 *
 * Polls are stored as `kind='poll'` rows in messages, with the structured
 * payload in messages.poll (PollPayload). Each cast vote is a row in
 * poll_votes; the PRIMARY KEY (message_id, voter_participant_id, option_id)
 * prevents a voter from double-stuffing the same option, and a transaction
 * around DELETE+INSERT lets a voter cleanly change their pick.
 *
 * This module is consumed by:
 *   - the HTTP /api/polls routes (humans via the UI)
 *   - the agent CLI (`lingxiloop poll create / vote / close`)
 *   - the expiration sweeper (auto-close on expiresAt)
 *
 * All three paths go through here so the WS broadcast, validation, and
 * tally shape stay consistent across actors.
 */
import { randomUUID } from 'node:crypto'
import { pool } from './db/pool.js'
import { CH_MESSAGE_NEW, CH_POLLS, publish, type PollUpdatedEvent } from './redis.js'
import type { PollPayload, PollOption } from './db/schema.js'

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
  /** Minutes until expiration. null / 0 / undefined ⇒ no expiration. */
  expiresInMinutes?: number | null
}

export interface CreatedPoll {
  messageId: string
  sequence: number
  poll: PollPayload
}

export async function createPoll(input: CreatePollInput): Promise<CreatedPoll> {
  const question = input.question.trim()
  if (!question) throw new PollError('question is required')
  if (question.length > MAX_QUESTION_LEN) {
    throw new PollError(`question too long (max ${MAX_QUESTION_LEN} chars)`)
  }
  if (input.mode !== 'single' && input.mode !== 'multi') {
    throw new PollError('mode must be "single" or "multi"')
  }

  const cleaned: PollOption[] = []
  const seen = new Set<string>()
  for (const raw of input.options) {
    const text = String(raw ?? '').trim()
    if (!text) continue
    if (text.length > MAX_OPTION_LEN) {
      throw new PollError(`option too long (max ${MAX_OPTION_LEN} chars)`)
    }
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push({ id: `opt-${randomUUID().slice(0, 8)}`, text })
    if (cleaned.length >= MAX_OPTIONS) break
  }
  if (cleaned.length < MIN_OPTIONS) {
    throw new PollError(`need at least ${MIN_OPTIONS} distinct options`)
  }

  let expiresAt: string | null = null
  if (input.expiresInMinutes != null && input.expiresInMinutes > 0) {
    const ms = Math.floor(input.expiresInMinutes) * 60_000
    expiresAt = new Date(Date.now() + ms).toISOString()
  }

  const payload: PollPayload = {
    question,
    mode: input.mode,
    options: cleaned,
    expiresAt,
    closedAt: null,
    closedReason: null,
  }

  // Validate conversation membership at the boundary — the HTTP layer
  // already does this, but agent paths reach in here directly so we
  // double-check rather than trust the caller.
  const { rows: convoRows } = await pool.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id = $1 AND company_id = $2`,
    [input.conversationId, input.companyId],
  )
  const convo = convoRows[0]
  if (!convo) throw new PollError('conversation not found', 404)
  if (!convo.members.includes(input.authorId)) {
    throw new PollError('not a member of this conversation', 403)
  }

  const seqResult = await pool.query<{ seq: number }>(
    `INSERT INTO conversation_counters (conversation_id, next_sequence)
     VALUES ($1, 2)
     ON CONFLICT (conversation_id) DO UPDATE SET next_sequence = conversation_counters.next_sequence + 1
     RETURNING next_sequence - 1 AS seq`,
    [input.conversationId],
  )
  const sequence = seqResult.rows[0]?.seq ?? 1
  const messageId = `m-${randomUUID()}`
  // Body shadows the question so any code that lists messages without
  // unpacking the poll payload (notifications, search index, plain-text
  // logs) still surfaces something meaningful.
  const body = `📊 ${question}`

  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, poll, company_id)
     VALUES ($1,$2,$3,'poll',$4,$5,$6::jsonb,$7)`,
    [messageId, input.conversationId, input.authorId, body, sequence, JSON.stringify(payload), input.companyId],
  )
  await pool.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [input.conversationId])

  // Drop the poll into the message bus exactly like a text message — the
  // mailbox scheduler wakes member agents, each gets to decide for itself
  // whether to vote / react / stay silent.
  //
  // We MUST carry the structured payload on the broadcast. Without it the
  // renderer receives a kind='poll' row whose `poll` field is undefined,
  // the PollBubble bails out, and the new poll renders as a blank slot
  // until the user switches conversations and re-fetches via GET. Empty
  // pollTallies pre-seeds the array so the bubble doesn't NaN-divide on
  // total = 0 either.
  await publish(CH_MESSAGE_NEW, {
    type: 'message.new',
    conversationId: input.conversationId,
    companyId: input.companyId,
    message: {
      id: messageId,
      conversationId: input.conversationId,
      authorId: input.authorId,
      kind: 'poll',
      body,
      sequence,
      at: new Date().toISOString(),
      poll: payload,
      pollTallies: [],
    },
  })

  return { messageId, sequence, poll: payload }
}

export interface CastVoteInput {
  messageId: string
  companyId: string
  voterParticipantId: string
  voterKind: 'human' | 'agent'
  optionIds: string[]
}

/** Replace the voter's existing votes on this poll with the given set.
 *  Empty optionIds ⇒ retracts the vote.
 *  For single-mode polls, optionIds.length > 1 is rejected. */
export async function castVote(input: CastVoteInput): Promise<PollUpdatedEvent> {
  const requested = Array.from(new Set(input.optionIds.filter(Boolean)))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      poll: PollPayload | null
      conversation_id: string
      company_id: string
    }>(
      `SELECT poll, conversation_id, company_id
         FROM messages
        WHERE id = $1 AND company_id = $2 AND kind = 'poll'
        FOR UPDATE`,
      [input.messageId, input.companyId],
    )
    const row = rows[0]
    if (!row || !row.poll) throw new PollError('poll not found', 404)
    const poll = row.poll
    if (poll.closedAt) throw new PollError('poll is closed', 409)

    // Membership gate: only conversation members can vote.
    const { rows: convoRows } = await client.query<{ members: string[] }>(
      `SELECT members FROM conversations WHERE id = $1`,
      [row.conversation_id],
    )
    const members = convoRows[0]?.members ?? []
    if (!members.includes(input.voterParticipantId)) {
      throw new PollError('not a member of this conversation', 403)
    }

    if (poll.mode === 'single' && requested.length > 1) {
      throw new PollError('single-choice poll accepts at most one option')
    }
    const validIds = new Set(poll.options.map((o) => o.id))
    for (const optId of requested) {
      if (!validIds.has(optId)) throw new PollError(`unknown option: ${optId}`)
    }

    await client.query(
      `DELETE FROM poll_votes WHERE message_id = $1 AND voter_participant_id = $2`,
      [input.messageId, input.voterParticipantId],
    )
    for (const optId of requested) {
      await client.query(
        `INSERT INTO poll_votes (message_id, voter_participant_id, voter_kind, option_id, company_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [input.messageId, input.voterParticipantId, input.voterKind, optId, input.companyId],
      )
    }
    await client.query('COMMIT')

    const event = await buildPollUpdatedEvent(input.messageId, input.voterParticipantId)
    await publish(CH_POLLS, event)
    return event
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { /* swallow */ })
    throw e
  } finally {
    client.release()
  }
}

export interface CloseInput {
  messageId: string
  companyId: string
  actorId: string | null
  reason: 'manual' | 'expired'
}

/** Manual close = actorId must be the original poll author.
 *  Expired close = the cron sweeper passes actorId=null. */
export async function closePoll(input: CloseInput): Promise<PollUpdatedEvent | null> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      poll: PollPayload | null
      author_id: string
    }>(
      `SELECT poll, author_id FROM messages
        WHERE id = $1 AND company_id = $2 AND kind = 'poll'
        FOR UPDATE`,
      [input.messageId, input.companyId],
    )
    const row = rows[0]
    if (!row || !row.poll) throw new PollError('poll not found', 404)
    if (row.poll.closedAt) {
      // Idempotent close. Skip the broadcast — listeners already saw the
      // earlier close event.
      await client.query('COMMIT')
      return null
    }
    if (input.reason === 'manual' && input.actorId !== row.author_id) {
      throw new PollError('only the poll author can close this poll', 403)
    }
    const closedPoll: PollPayload = {
      ...row.poll,
      closedAt: new Date().toISOString(),
      closedReason: input.reason,
    }
    await client.query(
      `UPDATE messages SET poll = $2::jsonb WHERE id = $1`,
      [input.messageId, JSON.stringify(closedPoll)],
    )
    await client.query('COMMIT')

    const event = await buildPollUpdatedEvent(input.messageId, input.actorId)
    await publish(CH_POLLS, event)
    return event
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { /* swallow */ })
    throw e
  } finally {
    client.release()
  }
}

/** Build the fan-out payload — full poll snapshot + per-option tally with
 *  voter ids. Renderers patch in place from this event without refetching. */
async function buildPollUpdatedEvent(messageId: string, actorId: string | null): Promise<PollUpdatedEvent> {
  const { rows } = await pool.query<{
    conversation_id: string
    company_id: string
    poll: PollPayload | null
  }>(
    `SELECT conversation_id, company_id, poll FROM messages WHERE id = $1`,
    [messageId],
  )
  const row = rows[0]
  if (!row || !row.poll) throw new PollError('poll vanished mid-update', 500)

  const { rows: tallyRows } = await pool.query<{
    option_id: string
    cnt: number
    voter_ids: string[]
  }>(
    `SELECT option_id, COUNT(*)::int AS cnt,
            array_agg(voter_participant_id ORDER BY voter_participant_id) AS voter_ids
       FROM poll_votes
      WHERE message_id = $1
      GROUP BY option_id`,
    [messageId],
  )
  const tallies = tallyRows.map((r) => ({
    optionId: r.option_id,
    count: r.cnt,
    voterIds: r.voter_ids,
  }))

  return {
    type: 'poll.updated',
    conversationId: row.conversation_id,
    companyId: row.company_id,
    messageId,
    poll: row.poll,
    tallies,
    actorId,
  }
}

let sweepTimer: NodeJS.Timeout | null = null

/** Start the periodic sweep loop. Idempotent — re-calling is a no-op.
 *  Interval comes from env.POLL_SWEEP_INTERVAL_MS; 0 disables. */
export function startPollExpirationSweeper(intervalMs: number): { stop(): void } | null {
  if (sweepTimer) return { stop: stopPollExpirationSweeper }
  if (intervalMs <= 0) {
    console.log('[polls] expiration sweeper disabled (POLL_SWEEP_INTERVAL_MS=0)')
    return null
  }
  console.log(`[polls] expiration sweeper running every ${intervalMs}ms`)
  const tick = async () => {
    try {
      const closed = await sweepExpiredPolls()
      if (closed > 0) console.log(`[polls] sweeper closed ${closed} expired poll${closed === 1 ? '' : 's'}`)
    } catch (e) {
      console.error('[polls] sweeper tick failed:', e instanceof Error ? e.message : String(e))
    }
  }
  sweepTimer = setInterval(() => { void tick() }, intervalMs)
  sweepTimer.unref()
  return { stop: stopPollExpirationSweeper }
}

export function stopPollExpirationSweeper(): void {
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null }
}

/** Cron sweeper — close any open poll whose expiresAt has elapsed.
 *  Runs once per call; the caller schedules cadence. Returns the number of
 *  polls closed so observability has something to log. */
export async function sweepExpiredPolls(): Promise<number> {
  const { rows } = await pool.query<{ id: string; company_id: string }>(
    `SELECT id, company_id FROM messages
      WHERE kind = 'poll'
        AND poll IS NOT NULL
        AND (poll->>'closedAt') IS NULL
        AND (poll->>'expiresAt') IS NOT NULL
        AND (poll->>'expiresAt')::timestamptz <= NOW()
      LIMIT 200`,
  )
  let closed = 0
  for (const row of rows) {
    try {
      const event = await closePoll({
        messageId: row.id,
        companyId: row.company_id,
        actorId: null,
        reason: 'expired',
      })
      if (event) closed += 1
    } catch (e) {
      console.warn(`[polls] sweep close failed for ${row.id}`, e instanceof Error ? e.message : String(e))
    }
  }
  return closed
}
