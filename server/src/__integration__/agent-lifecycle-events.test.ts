/**
 * Pins the agent turn loop's lifecycle-event invariants — the
 * observability signals the lingxiloop UI relies on so users don't see a
 * stuck "Iris is typing…" indicator or a permanent "thinking" status
 * pill after the agent has actually wrapped up.
 *
 * Three invariants every successful turn must hold:
 *   1. `typing.started` is emitted iff `typing.finished` is too —
 *      otherwise the typing dots stay forever. Pre-fix this got broken
 *      twice when error paths bailed before reaching the finally block.
 *   2. `status.changed` cycles end with `status='avail'` — if a turn
 *      ends in `thinking`/`working` the user-visible pill never resets.
 *   3. `agent_runs.finished_at` is set on every completed run — the
 *      "running" pill in the admin UI reads from this column.
 *
 * Run via:
 *   INTEGRATION_DATABASE_URL=postgres://$USER@localhost:5432/lingxiloop_test \
 *     npm run test:integration
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { ResponseStreamEvent } from 'openai/resources/responses/responses'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { __setPodToolOverrideForTesting } from '../agents/runtime/pod-tools.js'
import { runAgentTurn } from '../agents/turn.js'

before(async () => {
  await ensureSchemaOnce()
})

beforeEach(async () => {
  await resetAllTables()
  __setLlmClientOverrideForTesting(null)
  __setPodToolOverrideForTesting(null)
})

after(async () => {
  __setLlmClientOverrideForTesting(null)
  __setPodToolOverrideForTesting(null)
  await teardownAll()
})

async function seedDirectWithMessage(opts: { body: string }): Promise<{
  companyId: string; agentId: string; humanId: string; conversationId: string
}> {
  const companyId = `c-${randomUUID().slice(0, 8)}`
  const agentId = `agent-${randomUUID().slice(0, 8)}`
  const humanId = `u-${randomUUID().slice(0, 8)}`
  const conversationId = `direct-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
    [companyId, `Test ${companyId}`, companyId, humanId],
  )
  await pool.query(
    `INSERT INTO users (id, email, display_name, tier) VALUES ($1, $2, $3, 'free')`,
    [humanId, `${humanId}@test.local`, humanId],
  )
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [companyId, humanId],
  )
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
       VALUES ($1, $2, 'agent', $3, 'tester', $4, '#abcdef', 'avail')`,
    [agentId, companyId, `Agent ${agentId}`, 'A'],
  )
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
       VALUES ($1, $2, 'human', $3, 'owner', $4, '#abcdef', 'avail')`,
    [humanId, companyId, humanId, 'H'],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id)
       VALUES ($1, 'direct', $2, $3::jsonb, 'human', $4)`,
    [conversationId, humanId, JSON.stringify([agentId, humanId]), companyId],
  )
  const messageId = `m-${randomUUID()}`
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
       VALUES ($1, $2, $3, 'text', $4, 1, $5)`,
    [messageId, conversationId, humanId, opts.body, companyId],
  )
  return { companyId, agentId, humanId, conversationId }
}

function stubNoTools(): void {
  __setLlmClientOverrideForTesting(async () => {
    return {
      responses: {
        create: async () => {
          const argsJson = JSON.stringify({ status: 'done', reason: 'test complete', next_step: '' })
          const events: ResponseStreamEvent[] = [
            { type: 'response.created', response: { id: 'resp_1', status: 'in_progress' } } as unknown as ResponseStreamEvent,
            { type: 'response.output_item.added', item: { id: 'fc_status', type: 'function_call', call_id: 'call_status', name: 'set_turn_status', arguments: '' } } as unknown as ResponseStreamEvent,
            { type: 'response.function_call_arguments.done', item_id: 'fc_status', arguments: argsJson } as unknown as ResponseStreamEvent,
            { type: 'response.completed', response: { status: 'completed', output: [{ id: 'fc_status', type: 'function_call', call_id: 'call_status', name: 'set_turn_status', arguments: argsJson }], usage: { input_tokens: 10, output_tokens: 2 } } } as unknown as ResponseStreamEvent,
          ]
          return (async function *() { for (const ev of events) yield ev })()
        },
      },
    } as unknown as Awaited<ReturnType<typeof import('../llm.js').getLlmClient>>
  })
  __setPodToolOverrideForTesting(async () => ({
    ok: true,
    output: { status: 'done', reason: 'test complete', nextStep: '', assistantTextAction: 'none', replyConversationId: null },
    durationMs: 1,
    display: { name: 'set_turn_status', arg: 'done', status: 'done', detail: 'test complete' },
  }))
}

async function lifecycleEvents(agentId: string): Promise<Array<{ kind: string; data: Record<string, unknown> }>> {
  const { rows } = await pool.query<{ kind: string; data: Record<string, unknown> }>(
    `SELECT kind, data FROM agent_events
       WHERE agent_id = $1 AND kind IN ('typing.started', 'typing.finished', 'status.changed', 'turn.completed', 'turn.skipped', 'turn.failed')
       ORDER BY created_at`,
    [agentId],
  )
  return rows
}

// ───────────────────────────────────────────────────────────────────────────

test('[integration] happy path: typing.started has a matching typing.finished + status ends at "avail"', async () => {
  const { agentId } = await seedDirectWithMessage({ body: 'hi' })
  stubNoTools()

  await runAgentTurn(agentId)

  const ev = await lifecycleEvents(agentId)
  const typingStarts = ev.filter((e) => e.kind === 'typing.started').length
  const typingFinishes = ev.filter((e) => e.kind === 'typing.finished').length
  assert.equal(typingStarts, 1, 'exactly one typing.started')
  assert.equal(typingFinishes, 1, 'typing.finished must match — otherwise the UI dots hang forever')

  // status.changed sequence: thinking → ... → avail (last one is avail).
  const statusChanges = ev
    .filter((e) => e.kind === 'status.changed')
    .map((e) => String((e.data as { status: string })?.status))
  assert.ok(statusChanges.length >= 1, 'at least one status.changed recorded')
  assert.equal(statusChanges[0], 'thinking', 'first status set is "thinking"')
  assert.equal(statusChanges[statusChanges.length - 1], 'avail',
    'last status set MUST be "avail" — otherwise the user-visible pill stays stuck')
})

test('[integration] agent_runs.finished_at is set after a successful turn', async () => {
  const { agentId } = await seedDirectWithMessage({ body: 'hi again' })
  stubNoTools()

  await runAgentTurn(agentId)

  const { rows } = await pool.query<{ status: string; started_at: Date; finished_at: Date | null }>(
    `SELECT status, started_at, finished_at FROM agent_runs WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'completed')
  assert.ok(rows[0].finished_at !== null, 'finished_at must be set (admin UI reads from this column)')
  assert.ok(
    new Date(rows[0].finished_at as Date).getTime() >= new Date(rows[0].started_at).getTime(),
    'finished_at >= started_at',
  )
})

test('[integration] failure path: typing.finished STILL fires when the LLM throws mid-stream', async () => {
  // Pre-fix bug: an exception bubbling out of `for await (event of stream)`
  // could skip the typing.finished emit, leaving the UI dots stuck.
  // The turn loop's `finally` block has to clear typing regardless of
  // outcome — this test pins that. runAgentTurn deliberately re-throws
  // non-429 errors after recording `turn.failed`; the finally block
  // runs BEFORE the throw propagates (JS spec), so the lifecycle
  // events land first and the rejection surfaces last.
  const { agentId } = await seedDirectWithMessage({ body: 'will crash' })
  __setLlmClientOverrideForTesting(async () => {
    return {
      responses: {
        create: async () => {
          throw new Error('upstream stream blew up — random ECONNRESET')
        },
      },
    } as unknown as Awaited<ReturnType<typeof import('../llm.js').getLlmClient>>
  })

  await assert.rejects(runAgentTurn(agentId), /upstream|blew up|ECONNRESET/i)

  const ev = await lifecycleEvents(agentId)
  const typingStarts = ev.filter((e) => e.kind === 'typing.started').length
  const typingFinishes = ev.filter((e) => e.kind === 'typing.finished').length
  assert.equal(typingStarts, 1)
  assert.equal(typingFinishes, 1, 'typing.finished must still fire even though the LLM call threw')

  // Run row status reflects the failure but is still terminal.
  const { rows: runs } = await pool.query<{ status: string; finished_at: Date | null; error: string | null }>(
    `SELECT status, finished_at, error FROM agent_runs WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'failed')
  assert.ok(runs[0].finished_at !== null, 'finished_at MUST be set even on failure paths')
  assert.match(String(runs[0].error ?? ''), /upstream|blew up|ECONNRESET/i)

  // Final status pill returns to avail so the user can still talk to
  // the agent — leaving it stuck on "thinking" after a failed turn
  // would be misleading.
  const statusChanges = ev
    .filter((e) => e.kind === 'status.changed')
    .map((e) => String((e.data as { status: string })?.status))
  assert.equal(statusChanges[statusChanges.length - 1], 'avail',
    'status must end at "avail" even when the turn failed')
})

test('[integration] quota exhausted: turn ends `skipped` but lifecycle invariants still hold', async () => {
  // Mirror of the 429 test in agent-error-paths.test.ts, but focused
  // on the lifecycle hygiene (typing/status pairing) rather than the
  // system notice.
  const { agentId } = await seedDirectWithMessage({ body: 'ping' })
  __setLlmClientOverrideForTesting(async () => {
    return {
      responses: {
        create: async () => {
          const err = new Error('Rate limit exceeded for requests') as Error & { status?: number }
          err.status = 429
          throw err
        },
      },
    } as unknown as Awaited<ReturnType<typeof import('../llm.js').getLlmClient>>
  })

  await runAgentTurn(agentId)

  const ev = await lifecycleEvents(agentId)
  const typingStarts = ev.filter((e) => e.kind === 'typing.started').length
  const typingFinishes = ev.filter((e) => e.kind === 'typing.finished').length
  assert.equal(typingStarts, 1)
  assert.equal(typingFinishes, 1, 'typing.finished fires on skipped runs too')

  const { rows: runs } = await pool.query<{ status: string; finished_at: Date | null }>(
    `SELECT status, finished_at FROM agent_runs WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(runs[0].status, 'skipped')
  assert.ok(runs[0].finished_at !== null)
})

test('[integration] empty inbox: no turn started, no lifecycle events emitted', async () => {
  // Defensive: when loadInbox returns nothing, runAgentTurn bails
  // before emitting any lifecycle event. Otherwise a phantom typing
  // indicator would flash for an agent that has no work.
  const companyId = `c-${randomUUID().slice(0, 8)}`
  const agentId = `agent-${randomUUID().slice(0, 8)}`
  const humanId = `u-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
    [companyId, `Test ${companyId}`, companyId, humanId],
  )
  await pool.query(
    `INSERT INTO users (id, email, display_name, tier) VALUES ($1, $2, $3, 'free')`,
    [humanId, `${humanId}@test.local`, humanId],
  )
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
       VALUES ($1, $2, 'agent', $3, 'tester', 'A', '#abcdef', 'avail')`,
    [agentId, companyId, `Agent ${agentId}`],
  )
  // No conversation, no messages — inbox is empty.

  stubNoTools()
  await runAgentTurn(agentId)

  const ev = await lifecycleEvents(agentId)
  assert.equal(ev.length, 0, 'no lifecycle events for an empty-inbox turn')
  const { rowCount } = await pool.query(`SELECT 1 FROM agent_runs WHERE agent_id = $1`, [agentId])
  assert.equal(rowCount, 0, 'no agent_runs row either')
})
