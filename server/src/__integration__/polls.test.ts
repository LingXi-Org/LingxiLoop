/**
 * Integration tests for the poll feature.
 *
 * WuKongIM owns poll messages while im_polls/im_poll_votes hold the mutable
 * voting projection. Both humans (via /api/polls) and agents reach the
 * same code path — these tests exercise the HTTP surface and the
 * vote-change / multi-choice / expiration semantics.
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import {
  buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll,
} from './_helpers.js'
import { pool } from '../db/pool.js'
import { castVote, closePoll, sweepExpiredPolls } from '../polls.js'
import { _setWukongClientForTests, WukongClient } from '../im/wukong.js'

const ME = 'u-me'
const PEER = 'u-peer'
const AGENT = 'a-aurora'
const COMPANY = 'c-polls'
const CONVO = 'co-polls'
let server: Server
let baseUrl = ''
let messageSeq = 0

before(async () => {
  _setWukongClientForTests(new class extends WukongClient {
    override async sendMessage(): Promise<{ messageId: string; messageSeq: number }> {
      messageSeq += 1
      return { messageId: `wk-${messageSeq}`, messageSeq }
    }
  }({ apiUrl: 'http://unused', wsUrl: 'ws://unused', apiToken: 'test', webhookSecret: 'test' }))
  await ensureSchemaOnce()
  const app = await buildApiTestApp(ME)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
  await seedWorld()
})

after(async () => {
  _setWukongClientForTests(null)
  await teardownAll(server)
})

async function seedWorld(): Promise<void> {
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, 'Polls Co', 'polls-co', $2)`,
    [COMPANY, ME],
  )
  await pool.query(
    `INSERT INTO im_channel_bindings (channel_id, company_id, profile)
     VALUES ($1,$2,$3::jsonb)`,
    [CONVO, COMPANY, JSON.stringify({ channelId: CONVO, channelType: 2, title: 'Polls Group', members: [ME, PEER, AGENT] })],
  )
  await seedUserMembership(ME, COMPANY)
  await seedUserMembership(PEER, COMPANY, { displayName: 'Peer', email: 'peer@test.local' })
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status, system_prompt)
     VALUES ($1, $2, 'agent', 'Aurora', 'agent', 'A', '#abcdef', 'avail', 'a test agent prompt')`,
    [AGENT, COMPANY],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id)
     VALUES ($1, 'group', 'Polls Group', $2::jsonb, 'group', $3)`,
    [CONVO, JSON.stringify([ME, PEER, AGENT]), COMPANY],
  )
}

async function createPollViaHttp(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/polls`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': COMPANY },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function voteViaHttp(messageId: string, optionIds: string[]): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/polls/${encodeURIComponent(messageId)}/vote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': COMPANY },
    body: JSON.stringify({ optionIds }),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function closeViaHttp(messageId: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/polls/${encodeURIComponent(messageId)}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': COMPANY },
    body: '{}',
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

test('[integration] POST /polls creates a poll message with structured payload', async () => {
  const { status, body } = await createPollViaHttp({
    conversationId: CONVO,
    question: 'Lunch?',
    mode: 'single',
    options: ['Ramen', 'Hotpot', 'Noodles'],
  })
  assert.equal(status, 201)
  assert.ok(body.messageId)
  assert.equal(body.poll.mode, 'single')
  assert.equal(body.poll.options.length, 3)
  assert.equal(body.poll.closedAt, null)

  // Postgres contains a projection only; the message is committed by WuKong.
  const { rows } = await pool.query<{ poll: { question: string } }>(
    `SELECT poll FROM im_polls WHERE poll_client_msg_no = $1`, [body.messageId],
  )
  assert.equal(rows[0].poll.question, 'Lunch?')
  const legacy = await pool.query(`SELECT 1 FROM messages WHERE id=$1`, [body.messageId])
  assert.equal(legacy.rowCount, 0)
})

test('[integration] POST /polls rejects fewer than 2 distinct options', async () => {
  const { status, body } = await createPollViaHttp({
    conversationId: CONVO,
    question: 'Lunch?',
    mode: 'single',
    options: ['Ramen', 'ramen', '', '   '],   // dedupes case-insensitive + drops blanks
  })
  assert.equal(status, 400)
  assert.match(String(body.error), /at least 2/)
})

test('[integration] vote tally aggregates across voters & changing a vote is idempotent', async () => {
  const created = (await createPollViaHttp({
    conversationId: CONVO, question: 'Lunch?', mode: 'single',
    options: ['Ramen', 'Hotpot'],
  })).body
  const ramen = created.poll.options[0].id
  const hotpot = created.poll.options[1].id

  // ME votes Ramen via HTTP. Agent votes Hotpot via the shared core
  // (this is the same path the CLI takes).
  const first = await voteViaHttp(created.messageId, [ramen])
  assert.equal(first.status, 200)
  await castVote({
    messageId: created.messageId, companyId: COMPANY,
    voterParticipantId: AGENT, voterKind: 'agent', optionIds: [hotpot],
  })

  // Change ME's vote from Ramen → Hotpot. The DELETE/INSERT inside the
  // transaction means Ramen now has 0, Hotpot has 2.
  const changed = await voteViaHttp(created.messageId, [hotpot])
  assert.equal(changed.status, 200)
  const tallies: Array<{ optionId: string; count: number; voterIds: string[] }> = changed.body.tallies
  const hotpotTally = tallies.find((t) => t.optionId === hotpot)
  assert.equal(hotpotTally?.count, 2)
  assert.deepEqual(hotpotTally?.voterIds.sort(), [AGENT, ME].sort())
  assert.equal(tallies.find((t) => t.optionId === ramen), undefined)
})

test('[integration] single-choice rejects more than one option', async () => {
  const created = (await createPollViaHttp({
    conversationId: CONVO, question: 'Lunch?', mode: 'single',
    options: ['A', 'B', 'C'],
  })).body
  const ids = created.poll.options.map((o: { id: string }) => o.id).slice(0, 2)
  const res = await voteViaHttp(created.messageId, ids)
  assert.equal(res.status, 400)
  assert.match(String(res.body.error), /at most one/)
})

test('[integration] multi-choice persists every chosen option', async () => {
  const created = (await createPollViaHttp({
    conversationId: CONVO, question: 'Snacks?', mode: 'multi',
    options: ['Chips', 'Olives', 'Cheese'],
  })).body
  const ids: string[] = created.poll.options.map((o: { id: string }) => o.id)
  const res = await voteViaHttp(created.messageId, [ids[0], ids[2]])
  assert.equal(res.status, 200)
  const tallies: Array<{ optionId: string; count: number }> = res.body.tallies
  assert.equal(tallies.find((t) => t.optionId === ids[0])?.count, 1)
  assert.equal(tallies.find((t) => t.optionId === ids[2])?.count, 1)
  assert.equal(tallies.find((t) => t.optionId === ids[1]), undefined)
})

test('[integration] retracting via empty optionIds drops all of voter\'s rows', async () => {
  const created = (await createPollViaHttp({
    conversationId: CONVO, question: 'Snacks?', mode: 'multi',
    options: ['Chips', 'Olives'],
  })).body
  const ids: string[] = created.poll.options.map((o: { id: string }) => o.id)
  await voteViaHttp(created.messageId, ids)   // vote both
  const retract = await voteViaHttp(created.messageId, [])
  assert.equal(retract.status, 200)
  const { rows } = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM im_poll_votes WHERE poll_client_msg_no = $1 AND voter_participant_id = $2`,
    [created.messageId, ME],
  )
  assert.equal(rows[0].n, 0)
})

test('[integration] closing a poll blocks further votes; only author can close', async () => {
  const created = (await createPollViaHttp({
    conversationId: CONVO, question: 'Lunch?', mode: 'single',
    options: ['A', 'B'],
  })).body

  // Peer cannot close — they aren't the author.
  await assert.rejects(
    () => closePoll({ messageId: created.messageId, companyId: COMPANY, actorId: PEER, reason: 'manual' }),
    /only the poll author/,
  )

  // Author (= ME) closes successfully.
  const ev = await closePoll({ messageId: created.messageId, companyId: COMPANY, actorId: ME, reason: 'manual' })
  assert.ok(ev)
  assert.equal(ev!.poll.closedReason, 'manual')

  // Further votes are rejected.
  const vote = await voteViaHttp(created.messageId, [created.poll.options[0].id])
  assert.equal(vote.status, 409)
})

test('[integration] archived course conversations reject poll create, vote, and close writes', async () => {
  await pool.query(
    `INSERT INTO projects (id,company_id,name,description,color,created_by,is_general,status)
     VALUES ('poll-course-project',$1,'Poll course','','#123456',$2,FALSE,'active')`,
    [COMPANY, ME],
  )
  await pool.query(`UPDATE conversations SET project_id='poll-course-project' WHERE id=$1`, [CONVO])
  const created = await createPollViaHttp({
    conversationId: CONVO, question: 'Before archive?', mode: 'single', options: ['Yes', 'No'],
  })
  assert.equal(created.status, 201)
  await pool.query(`UPDATE projects SET status='archived',archived_at=NOW() WHERE id='poll-course-project'`)

  const createBlocked = await createPollViaHttp({
    conversationId: CONVO, question: 'After archive?', mode: 'single', options: ['Yes', 'No'],
  })
  assert.equal(createBlocked.status, 409)
  const voteBlocked = await voteViaHttp(created.body.messageId, [created.body.poll.options[0].id])
  assert.equal(voteBlocked.status, 409)
  const closeBlocked = await closeViaHttp(created.body.messageId)
  assert.equal(closeBlocked.status, 409)
})

test('[integration] sweepExpiredPolls auto-closes polls past expiresAt', async () => {
  const created = (await createPollViaHttp({
    conversationId: CONVO, question: 'Now?', mode: 'single',
    options: ['Yes', 'No'],
  })).body

  // Backdate the expiration to a second ago so the sweeper picks it up.
  await pool.query(
    `UPDATE im_polls
        SET poll = jsonb_set(poll, '{expiresAt}', to_jsonb((NOW() - INTERVAL '1 second')::text), true)
      WHERE poll_client_msg_no = $1`,
    [created.messageId],
  )
  const closed = await sweepExpiredPolls()
  assert.ok(closed >= 1)
  const { rows } = await pool.query<{ poll: { closedAt: string | null; closedReason: string | null } }>(
    `SELECT poll FROM im_polls WHERE poll_client_msg_no = $1`, [created.messageId],
  )
  assert.ok(rows[0].poll.closedAt)
  assert.equal(rows[0].poll.closedReason, 'expired')
})
