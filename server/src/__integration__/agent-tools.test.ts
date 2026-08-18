/**
 * Integration coverage for the parts of the agent Harness that
 * `agent-turn.test.ts` doesn't already exercise:
 *
 *   - image generation through `cumora reply --generate-image` (b64_json
 *     happy path; upstream image-API error path)
 *   - representative CLI tools driven directly via `runCli`: react,
 *     reply with --quote, kanban ls
 *   - parallel function_call items in a single hop — both run, both
 *     outputs end up in history with matching call_ids
 *   - auto-compaction: a hop that pushes `totalTokensThisTurn` past
 *     `COMPACT_THRESHOLD_TOKENS` triggers in-place history compaction
 *     (output truncation + oldest-pair dropping) and the turn keeps
 *     going rather than short-circuiting
 *
 * Run via:
 *   INTEGRATION_DATABASE_URL=postgres://$USER@localhost:5432/cumora_test \
 *     npm run test:integration
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { ResponseStreamEvent } from 'openai/resources/responses/responses'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { __setPodToolOverrideForTesting } from '../agents/runtime/pod-tools.js'
import type { ToolResult } from '../agents/tools-shared.js'
import { runAgentTurn } from '../agents/turn.js'
import { runCli } from '../agents/cli.js'
import { tBash } from '../agents/tools-shared.js'

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

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────

/** Stand up one tenant + one agent + one human + one direct conversation.
 *  Smaller copy of `agent-turn.test.ts`'s seedConvo — kept local so the
 *  two files can evolve independently. */
async function seedDirect(): Promise<{
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
  return { companyId, agentId, humanId, conversationId }
}

async function postHuman(opts: { conversationId: string; companyId: string; humanId: string; body: string; sequence?: number }): Promise<string> {
  const messageId = `m-${randomUUID()}`
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
       VALUES ($1, $2, $3, 'text', $4, $5, $6)`,
    [messageId, opts.conversationId, opts.humanId, opts.body, opts.sequence ?? 1, opts.companyId],
  )
  return messageId
}

/** Build a stub LLM client that exposes BOTH `responses.create` (for
 *  `runAgentTurn` stream tests) AND `images.generate` (for image-gen
 *  tests through cmdReply). The two sides are independent — pass `null`
 *  for whichever isn't needed. */
function installLlmStub(opts: {
  responses?: ResponseStreamEvent[][]
  imagesGenerate?: () => unknown | Promise<unknown>
}): { responseCallCount: () => number; imageCallCount: () => number } {
  let responseCalls = 0
  let imageCalls = 0
  const streams = opts.responses ?? []
  __setLlmClientOverrideForTesting(async () => {
    return {
      responses: {
        create: async (_req: unknown) => {
          const idx = responseCalls++
          if (idx >= streams.length) {
            throw new Error(`stub LLM exhausted at call ${idx + 1}, only ${streams.length} streams scripted`)
          }
          const events = streams[idx]
          return (async function *() {
            for (const ev of events) yield ev
          })()
        },
      },
      images: {
        generate: async (_req: unknown) => {
          imageCalls++
          if (!opts.imagesGenerate) throw new Error('imagesGenerate not stubbed')
          return opts.imagesGenerate()
        },
      },
    } as unknown as Awaited<ReturnType<typeof import('../llm.js').getLlmClient>>
  })
  return {
    responseCallCount: () => responseCalls,
    imageCallCount: () => imageCalls,
  }
}

/** Generic tool-dispatcher stub for runAgentTurn-driven tests. */
function installToolStub(handlers: Record<string, (parsed: Record<string, unknown>) => ToolResult | Promise<ToolResult>>): {
  calls: Array<{ name: string; argsJson: string; parsed: Record<string, unknown> }>
} {
  const calls: Array<{ name: string; argsJson: string; parsed: Record<string, unknown> }> = []
  __setPodToolOverrideForTesting(async (args) => {
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(args.argsJson || '{}') } catch { /* keep empty */ }
    calls.push({ name: args.name, argsJson: args.argsJson, parsed })
    const handler = handlers[args.name]
    if (!handler) {
      return {
        ok: false, output: null, error: 'unknown tool', durationMs: 0,
        display: { name: args.name, arg: '', status: 'unknown tool', detail: `not stubbed: ${args.name}` },
      }
    }
    return handler(parsed)
  })
  return { calls }
}

/** A 1x1 white PNG, b64-encoded. Used by the image-gen stub so tests can
 *  decode the b64_json field into a real-looking buffer that
 *  `storage.put` accepts and writes to disk. */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function _streamWithToolCall(opts: { fcId: string; callId: string; argsJson: string }): ResponseStreamEvent[] {
  return [
    { type: 'response.created', response: { id: `resp_${randomUUID().slice(0, 8)}`, status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: opts.fcId, type: 'function_call', call_id: opts.callId, name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: opts.fcId, arguments: opts.argsJson } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [{ id: opts.fcId, type: 'function_call', call_id: opts.callId, name: 'bash', arguments: opts.argsJson }], usage: { input_tokens: 100, output_tokens: 20 } } } as unknown as ResponseStreamEvent,
  ]
}

function _streamNoTools(usage = { input_tokens: 10, output_tokens: 2 }): ResponseStreamEvent[] {
  return [
    { type: 'response.created', response: { id: `resp_${randomUUID().slice(0, 8)}`, status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [], usage } } as unknown as ResponseStreamEvent,
  ]
}

/** Emit a `set_turn_status` tool call with status='done' so the turn
 *  loop terminates cleanly. Tests that pre-date the set_turn_status
 *  protocol used to script a no-tools final hop. The loop now nudges on
 *  that shape and requires the model to declare turn status explicitly.
 *  This helper produces the canonical terminator stream so tests can
 *  script `[...meaningfulHops, streamSetTurnStatusDone()]` without
 *  duplicating the protocol ceremony. */
function streamSetTurnStatusDone(opts: { reason?: string; callId?: string } = {}): ResponseStreamEvent[] {
  const callId = opts.callId ?? `call_done_${randomUUID().slice(0, 6)}`
  const fcId = `fc_done_${randomUUID().slice(0, 6)}`
  const argsJson = JSON.stringify({
    status: 'done',
    reason: opts.reason ?? 'test scaffolding finished',
    next_step: '',
  })
  return [
    { type: 'response.created', response: { id: `resp_${randomUUID().slice(0, 8)}`, status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: fcId, type: 'function_call', call_id: callId, name: 'set_turn_status', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: fcId, arguments: argsJson } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [{ id: fcId, type: 'function_call', call_id: callId, name: 'set_turn_status', arguments: argsJson }], usage: { input_tokens: 50, output_tokens: 10 } } } as unknown as ResponseStreamEvent,
  ]
}

/** Canonical set_turn_status tool handler — produces the
 *  TurnStatusOutput shape the production code expects (see
 *  turnStatusOutput parser in turn.ts:877). Reusable across tests
 *  that need to terminate the hop loop via the protocol. */
function setTurnStatusHandler(parsed: Record<string, unknown>): ToolResult {
  const status = String(parsed.status ?? 'done')
  const reason = String(parsed.reason ?? '')
  const nextStep = String(parsed.next_step ?? '')
  const assistantTextAction = String(parsed.assistant_text ?? 'none')
  const replyConversationId = parsed.reply_conversation_id ?? null
  return {
    ok: true, durationMs: 1,
    output: { status, reason, nextStep, assistantTextAction, replyConversationId },
    display: { name: 'set_turn_status', arg: status, status, detail: reason },
  }
}

// ────────────────────────────────────────────────────────────────────────────
// A. Image generation through cmdReply
// ────────────────────────────────────────────────────────────────────────────

test('[integration] reply --generate-image (b64_json) persists an img attachment', async () => {
  const { companyId, agentId, conversationId } = await seedDirect()
  installLlmStub({
    imagesGenerate: () => ({ data: [{ b64_json: TINY_PNG_B64 }] }),
  })

  const res = await runCli([
    '--as', agentId,
    'reply', conversationId, 'here you go',
    '--generate-image', 'a tiny test pixel',
  ])

  assert.equal(res.ok, true, `runCli failed: ${res.text ?? ''}`)
  const { rows } = await pool.query<{ id: string; body: string; attachment: unknown; company_id: string }>(
    `SELECT id, body, attachment, company_id FROM messages
       WHERE conversation_id = $1 AND author_id = $2`,
    [conversationId, agentId],
  )
  assert.equal(rows.length, 1, 'exactly one agent message posted')
  assert.equal(rows[0].body, 'here you go')
  const att = rows[0].attachment as Record<string, unknown> | null
  assert.ok(att, 'attachment payload should not be null')
  assert.equal(att?.kind, 'img')
  assert.equal(att?.mime, 'image/png')
  assert.ok(typeof att?.size === 'number' && (att.size as number) > 0, 'size should be > 0')
  assert.match(String(att?.name ?? ''), /\.png$/, 'name should end in .png')
  // company_id propagates through the reply path.
  assert.equal(rows[0].company_id, companyId)
})

test('[integration] reply --generate-image surfaces upstream errors as a CliResult failure', async () => {
  const { agentId, conversationId } = await seedDirect()
  installLlmStub({
    imagesGenerate: () => { throw new Error('image API rate-limited') },
  })

  const res = await runCli([
    '--as', agentId,
    'reply', conversationId, 'here you go',
    '--generate-image', 'a tiny test pixel',
  ])

  assert.equal(res.ok, false, 'CliResult should report failure')
  assert.match(String(res.text ?? ''), /rate-limited|image/i)
  // No message should have been posted — the reply path bails before INSERT.
  const { rowCount } = await pool.query(
    `SELECT 1 FROM messages WHERE conversation_id = $1 AND author_id = $2`,
    [conversationId, agentId],
  )
  assert.equal(rowCount, 0)
})

// ────────────────────────────────────────────────────────────────────────────
// B. Representative CLI tools via runCli
// ────────────────────────────────────────────────────────────────────────────

test('[integration] react inserts a row in message_reactions for this agent', async () => {
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  const targetMessageId = await postHuman({
    conversationId, companyId, humanId, body: 'react to me',
  })

  const res = await runCli([
    '--as', agentId,
    'react', targetMessageId, '👀',
  ])
  assert.equal(res.ok, true, `runCli react failed: ${res.text ?? ''}`)

  const { rows } = await pool.query<{ message_id: string; user_id: string; emoji: string }>(
    `SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id = $1`,
    [targetMessageId],
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].user_id, agentId)
  assert.equal(rows[0].emoji, '👀')

  const reads = await pool.query(
    `SELECT 1 FROM conversation_reads WHERE user_id = $1 AND conversation_id = $2`,
    [agentId, conversationId],
  )
  assert.equal(reads.rowCount, 0, 'react must not clear unfinished work from the agent inbox')
})

test('[integration] bash cumora PATH shim uses ambient identity instead of a spoofed --as', async () => {
  const { companyId, agentId } = await seedDirect()
  const spoofId = `spoof-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
       VALUES ($1, $2, 'agent', $3, 'spoof', 'S', '#fedcba', 'avail')`,
    [spoofId, companyId, `Spoof ${spoofId}`],
  )

  const res = await tBash({ command: `cumora --as ${spoofId} whoami --json` }, agentId, null)
  assert.equal(res.ok, true, `tBash cumora failed: ${res.error ?? ''}`)
  const output = res.output as { stdout: string }
  const start = output.stdout.indexOf('{')
  const end = output.stdout.lastIndexOf('}')
  assert.notEqual(start, -1, output.stdout)
  assert.notEqual(end, -1, output.stdout)
  const parsed = JSON.parse(output.stdout.slice(start, end + 1)) as { id: string }
  assert.equal(parsed.id, agentId)

  // This intentionally covers the supported `cumora ...` path, not an
  // unsandboxed local shell executing arbitrary repo binaries. Production
  // impersonation defense lives in /runtime/cli, where the server strips
  // caller --as flags and injects the JWT subject.
})

test('[integration] reply --quote sets quoted_message_id on the new message', async () => {
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  const quotedId = await postHuman({
    conversationId, companyId, humanId, body: 'original question?',
  })
  installLlmStub({}) // no image stub needed, no responses stub needed

  const res = await runCli([
    '--as', agentId,
    'reply', conversationId, 'answering your question',
    '--quote', quotedId,
  ])
  assert.equal(res.ok, true, `runCli reply --quote failed: ${res.text ?? ''}`)

  const { rows } = await pool.query<{ body: string; quoted_message_id: string | null }>(
    `SELECT body, quoted_message_id FROM messages
       WHERE conversation_id = $1 AND author_id = $2`,
    [conversationId, agentId],
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].body, 'answering your question')
  assert.equal(rows[0].quoted_message_id, quotedId)
})

// ────────────────────────────────────────────────────────────────────────────
// C. Parallel tool calls in one hop
// ────────────────────────────────────────────────────────────────────────────

test('[integration] parallel tool calls in one hop both run and produce matched function_call_output pairs', async () => {
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'do both' })

  // Hop 1: model fires TWO function_call items in a single response.
  const parallelHop: ResponseStreamEvent[] = [
    { type: 'response.created', response: { id: 'resp_parallel', status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_2', type: 'function_call', call_id: 'call_2', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: JSON.stringify({ command: 'cumora kanban ls' }) } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_2', arguments: JSON.stringify({ command: 'cumora workspace ls' }) } as unknown as ResponseStreamEvent,
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: JSON.stringify({ command: 'cumora kanban ls' }) },
          { id: 'fc_2', type: 'function_call', call_id: 'call_2', name: 'bash', arguments: JSON.stringify({ command: 'cumora workspace ls' }) },
        ],
        usage: { input_tokens: 200, output_tokens: 30 },
      },
    } as unknown as ResponseStreamEvent,
  ]
  // Hop 2: model declares the turn done via set_turn_status. We assert at
  // the events level rather than via cumora reply because all we care
  // about here is that both bash call_ids appeared in tool.started +
  // tool.finished events.
  installLlmStub({
    responses: [parallelHop, streamSetTurnStatusDone()],
  })

  const bashStartTimes: number[] = []
  const tools = installToolStub({
    bash: async (parsed) => {
      bashStartTimes.push(Date.now())
      await delay(150)
      const cmd = String(parsed.command ?? '')
      return {
        ok: true,
        output: { stdout: `ran: ${cmd}`, stderr: '', exitCode: 0 },
        durationMs: 1,
        display: { name: 'bash', arg: cmd, status: 'ok', detail: '' },
      }
    },
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)

  // Both bash calls ran (plus one set_turn_status terminator).
  const bashCalls = tools.calls.filter((c) => c.name === 'bash')
  assert.equal(bashCalls.length, 2, 'both parallel bash calls were dispatched')
  const cmds = bashCalls.map((c) => String(c.parsed.command ?? '')).sort()
  assert.deepEqual(cmds, ['cumora kanban ls', 'cumora workspace ls'])
  assert.equal(bashStartTimes.length, 2)
  assert.ok(
    Math.max(...bashStartTimes) - Math.min(...bashStartTimes) < 100,
    'parallel bash calls should start together instead of waiting for one another',
  )

  // Both bash call_ids surface in the tool events with distinct
  // identifiers. tool.started carries `data.name` directly so filter
  // on that; tool.finished doesn't carry the name field, so we
  // identify it by display.name which IS the tool name.
  const { rows: ev } = await pool.query<{ kind: string; data: Record<string, unknown> }>(
    `SELECT kind, data FROM agent_events
       WHERE agent_id = $1 AND kind IN ('tool.started', 'tool.finished')
         AND COALESCE(data->>'name', data->'display'->>'name') = 'bash'
       ORDER BY created_at`,
    [agentId],
  )
  assert.equal(ev.length, 4, '2 started + 2 finished = 4 bash tool events')
  const startedCallIds = ev.filter((e) => e.kind === 'tool.started').map((e) => (e.data as { callId: string }).callId).sort()
  const finishedCallIds = ev.filter((e) => e.kind === 'tool.finished').map((e) => (e.data as { callId: string }).callId).sort()
  assert.deepEqual(startedCallIds, ['call_1', 'call_2'])
  assert.deepEqual(finishedCallIds, ['call_1', 'call_2'])
})

// ────────────────────────────────────────────────────────────────────────────
// D. Auto-compaction budget guard
// ────────────────────────────────────────────────────────────────────────────

test('[integration] auto-compaction: a hop past the 150K (75% context) threshold triggers in-place compaction and the turn KEEPS going', async () => {
  // COMPACT_THRESHOLD_TOKENS in turn.ts is 150_000 (75% of gpt-5's
  // ~200K context window). When the previous hop's reported usage
  // crosses that threshold the loop reshapes `history` BEFORE issuing
  // the next hop's LLM call:
  //   1. function_call_output payloads > COMPACTED_OUTPUT_BYTES get
  //      truncated in place.
  //   2. If still over and there are drop-eligible pairs, the LLM
  //      summarizer is invoked — but THIS test has only one pair, so
  //      KEEP_RECENT_PAIRS=2 means nothing is drop-eligible. Stage 1
  //      alone has to suffice.
  // Either way the model continues from the compacted history rather
  // than the turn dying.
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'do an expensive thing' })

  // Hop 1: fire a bash call AND report usage past the compaction
  // threshold so the NEXT iteration triggers compaction at the top.
  // The bash output is HUGE (well over COMPACTED_OUTPUT_BYTES) so we
  // can assert it was truncated.
  const HUGE_OUTPUT = 'X'.repeat(50_000)
  const fatHop1: ResponseStreamEvent[] = [
    { type: 'response.created', response: { id: 'resp_fat1', status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: JSON.stringify({ command: 'cumora kanban ls' }) } as unknown as ResponseStreamEvent,
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [{ id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: JSON.stringify({ command: 'cumora kanban ls' }) }],
        // Push totalTokensThisTurn past COMPACT_THRESHOLD_TOKENS = 150_000.
        usage: { input_tokens: 160_000, output_tokens: 1_000 },
      },
    } as unknown as ResponseStreamEvent,
  ]
  // Hop 2 (after compaction): the model declares the turn done via
  // set_turn_status. Pre-protocol versions of this test scripted a
  // no-tools final hop, but the new loop nudges then exits on those —
  // declaring done is the protocol-correct way to terminate.
  installLlmStub({ responses: [fatHop1, streamSetTurnStatusDone()] })
  installToolStub({
    bash: () => ({
      ok: true,
      output: { stdout: HUGE_OUTPUT, stderr: '', exitCode: 0 },
      durationMs: 1,
      display: { name: 'bash', arg: 'ls', status: 'ok', detail: '' },
    }),
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)

  // turn.compacted event fires once, NOT budget.stop.
  //
  // NB on byte counts: the turn loop bounds every function_call_output
  // through modelToolOutputPayload before compaction sees it. The
  // HUGE_OUTPUT (50K chars) arrives as a self-described ~8KB payload,
  // so when stage-1 truncation reduces it to COMPACTED_OUTPUT_BYTES=600,
  // the reclaim is around 7KB per output. Detailed stage-1/stage-2
  // behavior is unit-tested in agents-turn-compaction.test.ts — this
  // integration test just pins the OUTER gate fires + run survives.
  const { rows: compactEv } = await pool.query<{ data: Record<string, unknown> }>(
    `SELECT data FROM agent_events WHERE agent_id = $1 AND kind = 'turn.compacted'`,
    [agentId],
  )
  assert.equal(compactEv.length, 1, 'exactly one turn.compacted event')
  const cd = compactEv[0].data
  assert.equal(cd.threshold, 150_000, 'threshold is 75% of context window')
  assert.ok((cd.beforeTokens as number) > 150_000, 'compaction triggered after threshold crossed')
  assert.ok((cd.truncatedOutputCount as number) >= 1, 'oversized function_call_output was truncated')
  assert.ok((cd.truncatedOutputBytes as number) > 6_000, 'truncation reclaimed bytes from the pre-sliced output')
  // With only one tool-call pair (call_1), KEEP_RECENT_PAIRS=2 means
  // nothing was drop-eligible — the LLM summarizer was NOT invoked
  // for this scenario. Stage 1 carried the load.
  assert.equal(cd.usedLlmSummary, false, 'no LLM summarization in this scenario (only 1 pair, none drop-eligible)')
  assert.equal(cd.droppedPairCount, 0)

  const { rows: stopEv0 } = await pool.query(
    `SELECT 1 FROM agent_events WHERE agent_id = $1 AND kind = 'budget.stop'`,
    [agentId],
  )
  assert.equal(stopEv0.length, 0, 'budget.stop must NOT fire — compaction handled the pressure')

  const { rows: stopEv } = await pool.query(
    `SELECT 1 FROM agent_events WHERE agent_id = $1 AND kind = 'budget.stop'`,
    [agentId],
  )
  assert.equal(stopEv.length, 0, 'budget.stop must NOT fire — compaction handled the pressure')

  // Run row should be completed normally (both hops ran).
  const { rows: runs } = await pool.query<{ status: string; tool_call_count: number }>(
    `SELECT status, tool_call_count FROM agent_runs WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(runs.length, 1)
  assert.equal(runs[0].status, 'completed')
  assert.equal(runs[0].tool_call_count, 2, 'hop1 bash + hop2 set_turn_status terminator')
})

test('[integration] auto-compaction: threshold crossing with nothing compactable emits no-op event', async () => {
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'report huge usage but small history' })

  const hop1: ResponseStreamEvent[] = [
    { type: 'response.created', response: { id: 'resp_noop', status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_noop', type: 'function_call', call_id: 'call_noop', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_noop', arguments: JSON.stringify({ command: 'cumora whoami' }) } as unknown as ResponseStreamEvent,
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [{ id: 'fc_noop', type: 'function_call', call_id: 'call_noop', name: 'bash', arguments: JSON.stringify({ command: 'cumora whoami' }) }],
        usage: { input_tokens: 160_000, output_tokens: 10 },
      },
    } as unknown as ResponseStreamEvent,
  ]
  installLlmStub({ responses: [hop1, streamSetTurnStatusDone()] })
  installToolStub({
    bash: () => ({ ok: true, output: { stdout: 'agent-id', stderr: '', exitCode: 0 }, durationMs: 1, display: { name: 'bash', arg: 'whoami', status: 'ok', detail: '' } }),
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)

  const { rows } = await pool.query<{ kind: string; data: Record<string, unknown> }>(
    `SELECT kind, data FROM agent_events WHERE agent_id = $1 AND kind IN ('turn.compacted', 'turn.compaction_no_op')`,
    [agentId],
  )
  assert.equal(rows.filter((r) => r.kind === 'turn.compacted').length, 0)
  assert.equal(rows.filter((r) => r.kind === 'turn.compaction_no_op').length, 1)
  assert.equal(rows[0].data.beforeTokens, 160_010)
})

test('[integration] auto-compaction: LLM-summarized stage 2 — 3+ pairs accumulate, summarizer is invoked, summary text lands in history', async () => {
  // The real test for the "this is REAL compaction, not just drop"
  // behaviour. Run a turn long enough to accumulate 3+ tool-call
  // pairs (so KEEP_RECENT_PAIRS=2 leaves at least one drop-eligible),
  // make the last hop report usage past the 150K threshold, then
  // assert the next hop's input was reshaped with the summarizer's
  // synthetic message in place of the dropped pairs.
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'three-step research' })

  // Function_call.arguments are NOT truncated by turn.ts (only outputs
  // are bounded via modelToolOutputPayload). So to make the local
  // history big enough for stage-2 compaction to actually do work, we
  // pad the command argument with bulk text. 3 pairs × 60KB args
  // ≈ 180KB total, comfortably above the 135K budget threshold.
  // estimateTokens treats CJK as ~1 char/token (vs ~3.5 for ASCII), so
  // using CJK bulk reaches the 135K-token compaction budget with far
  // less raw byte volume — 3 × 60K CJK chars ≈ 180K tokens, clears
  // budget. ASCII bulk would need roughly 157K chars per arg to do the same.
  const BULK = '工'.repeat(60_000)
  function toolHop(i: number, inputTokens = 5_000, outputTokens = 100): ResponseStreamEvent[] {
    const argsJson = JSON.stringify({ command: `step-${i} ${BULK}` })
    return [
      { type: 'response.created', response: { id: `resp_${i}`, status: 'in_progress' } } as unknown as ResponseStreamEvent,
      { type: 'response.output_item.added', item: { id: `fc_${i}`, type: 'function_call', call_id: `call_${i}`, name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
      { type: 'response.function_call_arguments.done', item_id: `fc_${i}`, arguments: argsJson } as unknown as ResponseStreamEvent,
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [{ id: `fc_${i}`, type: 'function_call', call_id: `call_${i}`, name: 'bash', arguments: argsJson }],
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        },
      } as unknown as ResponseStreamEvent,
    ]
  }
  // The summarizer stub response — a streamed completion that produces
  // a known summary string the test can assert against later in history.
  const summarizerResp: ResponseStreamEvent[] = [
    { type: 'response.created', response: { id: 'resp_summarizer', status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_text.delta', item_id: 'msg_sum', content_index: 0, delta: 'AGENT_SUMMARY_TOKEN: ran 1 bash call, output was step-1 work.' } as unknown as ResponseStreamEvent,
    { type: 'response.output_text.done', item_id: 'msg_sum', content_index: 0, text: 'AGENT_SUMMARY_TOKEN: ran 1 bash call, output was step-1 work.' } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 800, output_tokens: 30 } } } as unknown as ResponseStreamEvent,
  ]
  // Call order:
  //   hop 1: toolHop(1) — modest tokens
  //   hop 2: toolHop(2) — modest tokens
  //   hop 3: toolHop(3) — REPORTS usage = 160K → triggers compaction next iter
  //   [summarizer call fires]
  //   hop 4: set_turn_status done — protocol-correct termination
  installLlmStub({ responses: [
    toolHop(1),
    toolHop(2),
    toolHop(3, 160_000, 1_000),
    summarizerResp,
    streamSetTurnStatusDone(),
  ] })
  installToolStub({
    bash: () => ({ ok: true, output: { stdout: 'done', stderr: '', exitCode: 0 }, durationMs: 1, display: { name: 'bash', arg: 'step', status: 'ok', detail: '' } }),
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)

  const { rows: compactEv } = await pool.query<{ data: Record<string, unknown> }>(
    `SELECT data FROM agent_events WHERE agent_id = $1 AND kind = 'turn.compacted'`,
    [agentId],
  )
  assert.equal(compactEv.length, 1, 'exactly one turn.compacted event')
  const cd = compactEv[0].data
  assert.equal(cd.usedLlmSummary, true, 'LLM summarization PATH was used (not just truncation)')
  assert.ok((cd.droppedPairCount as number) >= 1, 'at least one pair was summarized + dropped')

  // No budget.stop — compaction kept the turn alive.
  const { rows: stopEv } = await pool.query(
    `SELECT 1 FROM agent_events WHERE agent_id = $1 AND kind = 'budget.stop'`, [agentId],
  )
  assert.equal(stopEv.length, 0)

  const { rows: runs } = await pool.query<{ status: string; tool_call_count: number }>(
    `SELECT status, tool_call_count FROM agent_runs WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(runs[0].status, 'completed', 'turn completed (not failed) past the compaction')
  assert.equal(runs[0].tool_call_count, 4, '3 bash tool calls + 1 set_turn_status terminator')
})

test('[integration] auto-compaction: summarizer LLM failure → falls back to drop-and-marker, turn still completes', async () => {
  // If the summarizer call rejects (e.g., a 429 / fetch failure on
  // the summarizer model), we MUST fall back to the drop-and-marker
  // path rather than letting the turn crash. End user behaviour: a
  // turn.compacted event STILL fires but with usedLlmSummary=false.
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'crash the summarizer' })

  // Bulky function_call.arguments to make local history actually large
  // enough for stage-2 compaction to do real work — see comment in the
  // "LLM-summarized stage 2" test above.
  // estimateTokens treats CJK as ~1 char/token (vs ~3.5 for ASCII), so
  // using CJK bulk reaches the 135K-token compaction budget with far
  // less raw byte volume — 3 × 60K CJK chars ≈ 180K tokens, clears
  // budget. ASCII bulk would need roughly 157K chars per arg to do the same.
  const BULK = '工'.repeat(60_000)
  function toolHop(i: number, inputTokens = 5_000): ResponseStreamEvent[] {
    const argsJson = JSON.stringify({ command: `step-${i} ${BULK}` })
    return [
      { type: 'response.created', response: { id: `resp_${i}`, status: 'in_progress' } } as unknown as ResponseStreamEvent,
      { type: 'response.output_item.added', item: { id: `fc_${i}`, type: 'function_call', call_id: `call_${i}`, name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
      { type: 'response.function_call_arguments.done', item_id: `fc_${i}`, arguments: argsJson } as unknown as ResponseStreamEvent,
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [{ id: `fc_${i}`, type: 'function_call', call_id: `call_${i}`, name: 'bash', arguments: argsJson }],
          usage: { input_tokens: inputTokens, output_tokens: 100 },
        },
      } as unknown as ResponseStreamEvent,
    ]
  }
  // Custom LLM stub: hops 1+2+3 normal, summarizer call THROWS, hop 4
  // declares set_turn_status done. The set_turn_status terminator is
  // dispatched AS a tool call (not via the LLM stream above), so
  // nthCall still indexes the main-loop responses.
  let nthCall = 0
  __setLlmClientOverrideForTesting(async () => {
    return {
      responses: {
        create: async () => {
          nthCall += 1
          if (nthCall === 4) {
            // The summarizer call (index 4 = 3 main hops + this one).
            throw new Error('summarizer LLM 429 simulated')
          }
          const sequence = [toolHop(1), toolHop(2), toolHop(3, 160_000), streamSetTurnStatusDone()]
          const idx = nthCall <= 3 ? nthCall - 1 : 3
          const events = sequence[idx]
          if (!events) throw new Error(`unexpected LLM call #${nthCall}`)
          return (async function *() { for (const ev of events) yield ev })()
        },
      },
    } as unknown as Awaited<ReturnType<typeof import('../llm.js').getLlmClient>>
  })
  installToolStub({
    bash: () => ({ ok: true, output: { stdout: 'done', stderr: '', exitCode: 0 }, durationMs: 1, display: { name: 'bash', arg: 'step', status: 'ok', detail: '' } }),
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)

  const { rows: compactEv } = await pool.query<{ data: Record<string, unknown> }>(
    `SELECT data FROM agent_events WHERE agent_id = $1 AND kind = 'turn.compacted'`,
    [agentId],
  )
  assert.equal(compactEv.length, 1)
  const cd = compactEv[0].data
  assert.equal(cd.usedLlmSummary, false, 'fell back to drop-and-marker after summarizer threw')
  assert.ok((cd.droppedPairCount as number) >= 1, 'fallback drop still happened')

  // Turn still completed.
  const { rows: runs } = await pool.query<{ status: string }>(
    `SELECT status FROM agent_runs WHERE agent_id = $1`, [agentId],
  )
  assert.equal(runs[0].status, 'completed')
})

test('[integration] auto-compaction: ONLY fires once even when a hop runs WAY over the threshold (single trigger, not retry-spam)', async () => {
  // Defensive: compaction must not fire MULTIPLE times in the same
  // iteration. The check happens at the top of each hop iteration; if
  // we compacted at hop 3, then hop 4 starts with the compacted history
  // and `totalTokensThisTurn` = hop 4's report (not hop 3's). If hop 4
  // also reports >150K, compaction fires AGAIN — which is correct
  // (cumulative pressure). But within ONE iteration we expect ONE
  // event, not N.
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'big' })

  const fatHop: ResponseStreamEvent[] = [
    { type: 'response.created', response: { id: 'resp_fat', status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: JSON.stringify({ command: 'huge' }) } as unknown as ResponseStreamEvent,
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [{ id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: JSON.stringify({ command: 'huge' }) }],
        usage: { input_tokens: 195_000, output_tokens: 500 },     // way over threshold
      },
    } as unknown as ResponseStreamEvent,
  ]
  installLlmStub({ responses: [fatHop, streamSetTurnStatusDone()] })
  installToolStub({
    bash: () => ({ ok: true, output: { stdout: 'X'.repeat(100_000), stderr: '', exitCode: 0 }, durationMs: 1, display: { name: 'bash', arg: 'huge', status: 'ok', detail: '' } }),
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)

  const { rows: compactEv } = await pool.query(
    `SELECT 1 FROM agent_events WHERE agent_id = $1 AND kind = 'turn.compacted'`,
    [agentId],
  )
  // Exactly one — even though usage was way over.
  assert.equal(compactEv.length, 1, 'compaction fires once per hop iteration, not multiple times')
})

test('[integration] auto-compaction: leading user message + last 2 pairs survive across summarization', async () => {
  // The two invariants we care about most for semantic continuity:
  //   - the original user question MUST survive (otherwise the agent
  //     forgets what it was asked)
  //   - the most recent KEEP_RECENT_PAIRS=2 pairs MUST survive (they
  //     carry the immediate working state the model just produced)
  //
  // We can't directly assert on the in-memory `history` array from a
  // T2 test, but we CAN assert via the summarizer-input contract: the
  // summarizer should NEVER receive the latest 2 pairs.
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'preserve me' })

  // Bulky function_call.arguments to make local history actually large
  // enough for stage-2 compaction to drop pairs — see "LLM-summarized
  // stage 2" test for full rationale.
  // estimateTokens treats CJK as ~1 char/token (vs ~3.5 for ASCII), so
  // using CJK bulk reaches the 135K-token compaction budget with far
  // less raw byte volume — 3 × 60K CJK chars ≈ 180K tokens, clears
  // budget. ASCII bulk would need roughly 157K chars per arg to do the same.
  const BULK = '工'.repeat(60_000)
  function toolHop(i: number, inputTokens = 5_000): ResponseStreamEvent[] {
    const argsJson = JSON.stringify({ command: `step-${i} ${BULK}` })
    return [
      { type: 'response.created', response: { id: `resp_${i}`, status: 'in_progress' } } as unknown as ResponseStreamEvent,
      { type: 'response.output_item.added', item: { id: `fc_${i}`, type: 'function_call', call_id: `call_${i}`, name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
      { type: 'response.function_call_arguments.done', item_id: `fc_${i}`, arguments: argsJson } as unknown as ResponseStreamEvent,
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [{ id: `fc_${i}`, type: 'function_call', call_id: `call_${i}`, name: 'bash', arguments: argsJson }],
          usage: { input_tokens: inputTokens, output_tokens: 100 },
        },
      } as unknown as ResponseStreamEvent,
    ]
  }
  // Capture the summarizer's INPUT body when it gets called.
  let summarizerInputText = ''
  let nthCall = 0
  __setLlmClientOverrideForTesting(async () => {
    return {
      responses: {
        create: async (req: unknown) => {
          nthCall += 1
          if (nthCall === 4) {
            // Summarizer call — capture and stub.
            const r = req as { input?: Array<{ content?: Array<{ text?: string }> }> }
            const firstUserContent = r?.input?.[0]?.content?.[0]?.text ?? ''
            summarizerInputText = firstUserContent
            const events: ResponseStreamEvent[] = [
              { type: 'response.created', response: { id: 'resp_sum', status: 'in_progress' } } as unknown as ResponseStreamEvent,
              { type: 'response.output_text.done', item_id: 'msg_sum', content_index: 0, text: 'AGENT_SUMMARY: preserved' } as unknown as ResponseStreamEvent,
              { type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 500, output_tokens: 20 } } } as unknown as ResponseStreamEvent,
            ]
            return (async function *() { for (const ev of events) yield ev })()
          }
          // Call order: 1=toolHop(1), 2=toolHop(2), 3=toolHop(3) usage 160K,
          // 4=summarizer (handled above), 5=set_turn_status terminator.
          const seq = [toolHop(1), toolHop(2), toolHop(3, 160_000)]
          if (nthCall === 5) {
            const events = streamSetTurnStatusDone()
            return (async function *() { for (const ev of events) yield ev })()
          }
          const events = seq[nthCall - 1]
          if (!Array.isArray(events)) throw new Error(`unexpected LLM call #${nthCall}`)
          return (async function *() { for (const ev of events) yield ev })()
        },
      },
    } as unknown as Awaited<ReturnType<typeof import('../llm.js').getLlmClient>>
  })
  installToolStub({
    bash: () => ({ ok: true, output: { stdout: 'done', stderr: '', exitCode: 0 }, durationMs: 1, display: { name: 'bash', arg: 's', status: 'ok', detail: '' } }),
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)

  // The summarizer's input should reference call_1 (the OLDEST pair, drop-eligible)
  // but NEVER call_2 / call_3 (the 2 most recent, always preserved).
  assert.ok(summarizerInputText.includes('call_1'),
    `summarizer input should mention call_1 (the dropped pair); got:\n${summarizerInputText.slice(0, 500)}`)
  assert.ok(!summarizerInputText.includes('call_2'),
    `summarizer input should NOT include call_2 (recent pair, preserved); got:\n${summarizerInputText.slice(0, 500)}`)
  assert.ok(!summarizerInputText.includes('call_3'),
    `summarizer input should NOT include call_3 (most recent pair); got:\n${summarizerInputText.slice(0, 500)}`)
})

// ────────────────────────────────────────────────────────────────────────────
// E. Robustness invariants — easy to silently regress
// ────────────────────────────────────────────────────────────────────────────

test('[integration] fingerprint dedup: same inbox twice in a row → second wake skips the LLM call', async () => {
  // turn.ts keeps a per-process `lastCompletedInbox` Map keyed by agentId.
  // When the next wake fires with the same fingerprint (= comma-joined
  // message ids), the loop should short-circuit BEFORE calling the LLM
  // so we don't burn tokens replaying the exact same inbox. Without this
  // dedup, every wake-bus broadcast (e.g. several humans typing in
  // quick succession) would re-prompt the agent on stale inbox.
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  await postHuman({ conversationId, companyId, humanId, body: 'one and done' })

  // Hop 1: model declares the turn done via set_turn_status. The single
  // LLM call captures both "the model produced something" and "the turn
  // terminated protocol-correctly".
  const llm = installLlmStub({ responses: [streamSetTurnStatusDone()] })
  installToolStub({
    set_turn_status: setTurnStatusHandler,
  })

  await runAgentTurn(agentId)
  assert.equal(llm.responseCallCount(), 1, 'first wake calls the LLM once')

  // Second wake with the exact same inbox state — fingerprint matches.
  // The fingerprint check (turn.ts:1187) short-circuits AFTER createRun
  // fires but BEFORE the LLM is consulted, so the run row count keeps
  // ticking up but the LLM call count stays at 1.
  await runAgentTurn(agentId)
  assert.equal(llm.responseCallCount(), 1, 'second wake must NOT call the LLM again (fingerprint dedup)')

  // Run rows: BOTH wakes open a run row (createRun fires before the
  // fingerprint skip). The dedup's value is "skip the expensive LLM
  // + tool work", not "skip observability". The skipped run is marked
  // status='skipped' with a turn.skipped event.
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM agent_runs WHERE agent_id = $1 ORDER BY started_at`,
    [agentId],
  )
  assert.equal(rows.length, 2, 'each wake opens a run row')
  assert.equal(rows[0].status, 'completed', 'first wake ran to completion')
  assert.equal(rows[1].status, 'skipped', 'second wake skipped via fingerprint match')
})

test('[integration] conversation cursor advances after an explicit reply — inbox does not loop', async () => {
  // The unread cursor (`conversation_reads.last_read_at`) MUST move past
  // the message we just replied to, or the next wake re-loads it as
  // unread and the agent enters an infinite-reply loop. cmdReply auto-
  // acks the convo for the author as a side effect of posting; this
  // test pins that invariant.
  const { companyId, agentId, humanId, conversationId } = await seedDirect()
  const userMessageId = await postHuman({ conversationId, companyId, humanId, body: 'hello there' })
  // Sanity: cursor starts before the message, so the agent sees 1 unread.
  await pool.query(
    `INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
     VALUES ($1, $2, '1970-01-01T00:00:00Z'::timestamptz)
     ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
    [agentId, conversationId],
  )

  // Drive a reply directly via runCli — same code path the bash tool
  // would shell into, but skips the subprocess.
  installLlmStub({})
  const res = await runCli([
    '--as', agentId,
    'reply', conversationId, 'hi back',
  ])
  assert.equal(res.ok, true, `runCli reply failed: ${res.text}`)

  // Confirm the agent's last_read_at moved to AT or AFTER the human's
  // message timestamp. (cmdReply writes NOW(); the message was inserted
  // a few ms before, so >= is the safe assertion.)
  const { rows } = await pool.query<{ last_read_at: Date }>(
    `SELECT last_read_at FROM conversation_reads
       WHERE user_id = $1 AND conversation_id = $2`,
    [agentId, conversationId],
  )
  assert.equal(rows.length, 1, 'conversation_reads row exists for the agent')
  const { rows: msgRow } = await pool.query<{ created_at: Date }>(
    `SELECT created_at FROM messages WHERE id = $1`, [userMessageId],
  )
  const cursor = new Date(rows[0].last_read_at).getTime()
  const userMsgAt = new Date(msgRow[0].created_at).getTime()
  assert.ok(cursor >= userMsgAt, `cursor ${cursor} must be >= user message ts ${userMsgAt}`)
})
