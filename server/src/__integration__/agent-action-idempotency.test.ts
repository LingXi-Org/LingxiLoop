/**
 * Integration tests for issue #7 — communication action idempotency.
 *
 * These exercise the REAL DB paths that the adapter-level unit tests
 * (server/src/__tests__/agents-lingxigraph-adapter.test.ts) can't reach:
 * the messages.idempotency_key unique index, the tReact() claim+mutate+
 * commit transaction, and — for message.send — the full production call
 * path through executeCommunicationActions() + InProcRuntimeClient +
 * pgActionLedger.
 */

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pgActionLedger } from '../agents/action-ledger.js'
import { runCli } from '../agents/cli.js'
import {
  type CommunicationAction,
  computeInputScopeKey,
  executeCommunicationActions,
} from '../agents/lingxigraph-adapter.js'
import { inprocClient } from '../agents/runtime/inproc-client.js'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

before(async () => {
  await ensureSchemaOnce()
})

beforeEach(async () => {
  await resetAllTables()
})

after(async () => {
  await teardownAll()
})

async function seedGroup(): Promise<{ companyId: string; agentA: string; agentB: string; convoId: string }> {
  const { companyId, agentId: agentA } = await seedCompanyWithAgent()
  const agentB = `a-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
       VALUES ($1, $2, 'agent', $3, 'tester', $4, '#abcdef', 'avail')`,
    [agentB, companyId, `Agent ${agentB}`, 'B'],
  )
  const convoId = `c-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id)
       VALUES ($1, 'group', $2, $3::jsonb, 'group', $4)`,
    [convoId, 'Idempotency test', JSON.stringify([agentA, agentB]), companyId],
  )
  return { companyId, agentA, agentB, convoId }
}

async function seedMessage(convoId: string, authorId: string, companyId: string): Promise<string> {
  const messageId = `m-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO conversation_counters (conversation_id, next_sequence)
       VALUES ($1, 2) ON CONFLICT (conversation_id) DO UPDATE SET next_sequence = conversation_counters.next_sequence + 1`,
    [convoId],
  )
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
       VALUES ($1, $2, $3, 'text', 'seed', 1, $4)`,
    [messageId, convoId, authorId, companyId],
  )
  return messageId
}

/* ─── message.send: sink-level idempotency (messages.idempotency_key) ── */

test('[integration] message.send: same idempotency key retried after a "crash" produces exactly one message row', async () => {
  const { agentA, convoId } = await seedGroup()
  const key = `test-key-${randomUUID()}`

  const first = await runCli(['--as', agentA, 'reply', convoId, 'hello once'], { idempotencyKey: key })
  assert.equal(first.ok, true, `first send should succeed: ${first.text}`)

  // Simulate the crash-then-retry scenario from the issue: action[0]
  // succeeded and committed, then the process died before the unread
  // cursor advanced. The next wake replays the SAME batch — same key.
  const retry = await runCli(['--as', agentA, 'reply', convoId, 'hello once'], { idempotencyKey: key })
  assert.equal(retry.ok, true, `retry should succeed (replay), not error: ${retry.text}`)
  assert.match(retry.text, /replayed/)

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND idempotency_key = $2`,
    [convoId, key],
  )
  assert.equal(rows[0].count, '1', 'DB must contain exactly one message for this idempotency key')
})

test('[integration] message.send: concurrent duplicate executions with the same key produce exactly one message row', async () => {
  const { agentA, convoId } = await seedGroup()
  const key = `test-key-${randomUUID()}`

  const [a, b] = await Promise.all([
    runCli(['--as', agentA, 'reply', convoId, 'race body'], { idempotencyKey: key }),
    runCli(['--as', agentA, 'reply', convoId, 'race body'], { idempotencyKey: key }),
  ])
  assert.equal(a.ok, true, `first concurrent call should succeed: ${a.text}`)
  assert.equal(b.ok, true, `second concurrent call should succeed (not error): ${b.text}`)

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND idempotency_key = $2`,
    [convoId, key],
  )
  assert.equal(rows[0].count, '1', 'a genuine concurrent race must still land exactly one row')
})

test('[integration] message.send: a new idempotency key (new input scope) sends the same body again as a distinct message', async () => {
  const { agentA, convoId } = await seedGroup()

  const first = await runCli(['--as', agentA, 'reply', convoId, 'same body'], { idempotencyKey: `k-${randomUUID()}` })
  assert.equal(first.ok, true)
  const second = await runCli(['--as', agentA, 'reply', convoId, 'same body'], { idempotencyKey: `k-${randomUUID()}` })
  assert.equal(second.ok, true)

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND body = 'same body'`,
    [convoId],
  )
  assert.equal(rows[0].count, '2', 'a new scope/key must not be deduped against unrelated prior content')
})

/* ─── reaction.toggle: sink-owned atomic claim+mutate+commit ──────────── */

test('[integration] reaction.toggle: same key executed twice only toggles once', async () => {
  const { agentA, companyId, convoId } = await seedGroup()
  const messageId = await seedMessage(convoId, agentA, companyId)
  const key = `test-key-${randomUUID()}`

  const first = await runCli(['--as', agentA, 'react', messageId, '👍'], { idempotencyKey: key })
  assert.equal(first.ok, true, `first toggle should succeed: ${first.text}`)

  // Retry with the SAME key must replay 'added', NOT flip it back to 'removed'.
  const retry = await runCli(['--as', agentA, 'react', messageId, '👍'], { idempotencyKey: key })
  assert.equal(retry.ok, true, `retry should succeed (replay): ${retry.text}`)

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = '👍'`,
    [messageId, agentA],
  )
  assert.equal(rows[0].count, '1', 'the reaction must still be present exactly once — not toggled back off')
})

test('[integration] reaction.toggle: concurrent duplicate executions with the same key toggle exactly once', async () => {
  const { agentA, companyId, convoId } = await seedGroup()
  const messageId = await seedMessage(convoId, agentA, companyId)
  const key = `test-key-${randomUUID()}`

  const [a, b] = await Promise.all([
    runCli(['--as', agentA, 'react', messageId, '🎉'], { idempotencyKey: key }),
    runCli(['--as', agentA, 'react', messageId, '🎉'], { idempotencyKey: key }),
  ])
  assert.equal(a.ok, true, `first concurrent toggle should succeed: ${a.text}`)
  assert.equal(b.ok, true, `second concurrent toggle should succeed (not error): ${b.text}`)

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = '🎉'`,
    [messageId, agentA],
  )
  assert.equal(rows[0].count, '1', 'a genuine concurrent race must still result in exactly one toggle')
})

test('[integration] reaction.toggle: a transaction rollback (FK violation) does not poison the key — retry succeeds cleanly', async () => {
  const { agentA, companyId, convoId } = await seedGroup()
  const key = `test-key-${randomUUID()}`

  // First attempt targets a message that doesn't exist — mutateReaction's
  // INSERT INTO message_reactions violates the FK and the whole claim+
  // mutate transaction rolls back, including the ledger claim row.
  const bogusMessageId = `m-${randomUUID().slice(0, 8)}`
  const failed = await runCli(['--as', agentA, 'react', bogusMessageId, '👀'], { idempotencyKey: key })
  assert.equal(failed.ok, false, 'reacting to a nonexistent message must fail')

  const { rows: ledgerAfterFailure } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM agent_action_executions WHERE idempotency_key = $1`,
    [key],
  )
  assert.equal(ledgerAfterFailure[0].count, '0', 'a rolled-back attempt must leave no ledger row behind')

  // Retry the SAME key against a real message — must succeed as a clean
  // first attempt, not be blocked by anything left over from the failure.
  const messageId = await seedMessage(convoId, agentA, companyId)
  const retry = await runCli(['--as', agentA, 'react', messageId, '👀'], { idempotencyKey: key })
  assert.equal(retry.ok, true, `retry after rollback should succeed cleanly: ${retry.text}`)

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = '👀'`,
    [messageId, agentA],
  )
  assert.equal(rows[0].count, '1')
})

/* ─── full production path: executeCommunicationActions + real DB ─────── */

test('[integration] executeCommunicationActions: action[0] succeeds, action[1] fails, retry on the same input scope does not duplicate action[0]', async () => {
  const { agentA, convoId } = await seedGroup()
  const inputScopeKey = computeInputScopeKey(['seed-m-1', 'seed-m-2'])
  const actions: CommunicationAction[] = [
    { type: 'message.send', conversationId: convoId, body: 'first action succeeds' },
    // A quote target that doesn't exist makes cmdReply fail deterministically.
    { type: 'message.send', conversationId: convoId, body: 'second action fails', quoteMessageId: 'does-not-exist' },
  ]

  const first = await executeCommunicationActions({
    agentId: agentA,
    inputScopeKey,
    actions,
    executeCli: (argv, internal) => inprocClient.executeCli(agentA, argv, internal),
    ledger: pgActionLedger,
    timeoutMs: 5_000,
  })
  assert.equal(first.completed, false)
  assert.equal(first.failedActionIndex, 1)

  const { rows: afterFirst } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND body = 'first action succeeds'`,
    [convoId],
  )
  assert.equal(afterFirst[0].count, '1')

  // Retry the SAME batch against the SAME input scope (as a real duplicate
  // wake would) — action[0] must be deduped at the sink, not re-sent.
  const retry = await executeCommunicationActions({
    agentId: agentA,
    inputScopeKey,
    actions,
    executeCli: (argv, internal) => inprocClient.executeCli(agentA, argv, internal),
    ledger: pgActionLedger,
    timeoutMs: 5_000,
  })
  assert.equal(retry.completed, false)
  assert.equal(retry.failedActionIndex, 1, 'action[1] keeps failing the same deterministic way')

  const { rows: afterRetry } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND body = 'first action succeeds'`,
    [convoId],
  )
  assert.equal(afterRetry[0].count, '1', 'duplicate wake must not re-send action[0]')
})

test('[integration] executeCommunicationActions: a new input scope may legitimately repeat prior action content', async () => {
  const { agentA, convoId } = await seedGroup()
  const action: CommunicationAction = { type: 'message.send', conversationId: convoId, body: 'repeatable content' }

  const runOnce = (inputScopeKey: string) => executeCommunicationActions({
    agentId: agentA,
    inputScopeKey,
    actions: [action],
    executeCli: (argv, internal) => inprocClient.executeCli(agentA, argv, internal),
    ledger: pgActionLedger,
    timeoutMs: 5_000,
  })

  await runOnce(computeInputScopeKey(['seed-m-1']))
  await runOnce(computeInputScopeKey(['seed-m-1', 'seed-m-2']))

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM messages WHERE conversation_id = $1 AND body = 'repeatable content'`,
    [convoId],
  )
  assert.equal(rows[0].count, '2', 'a genuinely new inbox scope is a fresh action, not a duplicate')
})
