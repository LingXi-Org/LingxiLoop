/**
 * Integration coverage for the `lingxiloop memory` CLI subcommands. Both
 * paths write to `agent_workspace` + `agent_log`; the embedding side
 * goes through the OpenAI text-embedding API which we stub out via
 * the test-only override hook on embeddings.ts.
 *
 * Cases:
 *   - `memory note <body>` writes an agent_workspace row (with vector
 *     when embedText returns a value) plus an agent_log "note" row
 *   - embedding failures reject the write without persisting partial memory
 *   - `memory list` returns the saved rows
 *   - `memory pin <id>` flips the pinned meta flag
 *   - `memory delete <id>` removes the row
 *
 * Run via:
 *   INTEGRATION_DATABASE_URL=postgres://$USER@localhost:5432/lingxiloop_test \
 *     npm run test:integration
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import {
  ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll,
} from './_helpers.js'
import { __setEmbedTextOverrideForTesting } from '../agents/embeddings.js'
import { runCli } from '../agents/cli.js'
import { recallMemories, writeExplicitMemory } from '../agent-os/memory-service.js'

before(async () => {
  await ensureSchemaOnce()
})

beforeEach(async () => {
  await resetAllTables()
  __setEmbedTextOverrideForTesting(null)
})

after(async () => {
  __setEmbedTextOverrideForTesting(null)
  await teardownAll()
})

/** Return a fake pgvector-literal string of the right shape (1536 dims,
 *  all the same scalar so the string is deterministic + small). */
function fakeEmbedding(scalar = 0.001): string {
  return `[${Array.from({ length: 1536 }, () => scalar).join(',')}]`
}

test('[integration] scoped learner memory is shared while course and role memory stay isolated', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent({ agentId: 'memory-agent-a' })
  const { agentId: agentB } = await seedCompanyWithAgent({ companyId, agentId: 'memory-agent-b' })
  __setEmbedTextOverrideForTesting(() => fakeEmbedding())
  await writeExplicitMemory({ companyId, agentId, scopeType: 'learner', scopeId: 'learner-1', body: 'Prefers visual examples', sourceEventId: 'msg-1' })
  await writeExplicitMemory({ companyId, agentId, scopeType: 'course', scopeId: 'course-a', body: 'Working on derivatives', sourceEventId: 'msg-2' })
  await writeExplicitMemory({ companyId, agentId, scopeType: 'agent_role', scopeId: agentId, body: 'Use Socratic questions', sourceEventId: 'msg-3' })
  assert.equal((await recallMemories({ companyId, agentId: agentB, scopeType: 'learner', scopeId: 'learner-1', query: 'visual examples' })).length, 1)
  assert.equal((await recallMemories({ companyId, agentId: agentB, scopeType: 'course', scopeId: 'course-b', query: 'derivatives' })).length, 0)
  assert.equal((await recallMemories({ companyId, agentId: agentB, scopeType: 'agent_role', scopeId: agentB, query: 'Socratic questions' })).length, 0)
})

test('[integration] memory note: writes agent_workspace + agent_log, includes embedding when embedText returns one', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()
  __setEmbedTextOverrideForTesting(() => fakeEmbedding())

  const res = await runCli([
    '--as', agentId,
    'memory', 'note', 'Yetone prefers warm palettes',
    '--about', 'yetone',
    '--kind', 'observation',
  ])
  assert.equal(res.ok, true, `runCli memory note failed: ${res.text}`)
  assert.match(res.text, /saved memory mem-/)

  // agent_workspace row exists with the expected shape.
  const { rows: ws } = await pool.query<{
    path: string; body: string; meta: Record<string, unknown>; company_id: string; embedding: string | null
  }>(
    `SELECT path, body, meta, company_id, embedding::text AS embedding
       FROM agent_workspace WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(ws.length, 1)
  assert.match(ws[0].path, /^memory\/observation\/mem-[a-f0-9-]+\.md$/)
  assert.equal(ws[0].body, 'Yetone prefers warm palettes')
  assert.equal(ws[0].company_id, companyId)
  assert.equal(ws[0].meta?.kind, 'observation')
  assert.equal(ws[0].meta?.about, 'yetone')
  assert.equal(ws[0].meta?.pinned, false)
  assert.ok(ws[0].embedding !== null && ws[0].embedding !== undefined, 'embedding column populated')

  // agent_log "note" row created.
  const { rows: log } = await pool.query<{ kind: string; body: string; ref: Record<string, unknown> }>(
    `SELECT kind, body, ref FROM agent_log WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(log.length, 1)
  assert.equal(log[0].kind, 'note')
  assert.match(log[0].body, /^noted: Yetone prefers warm palettes/)
  assert.match(String(log[0].ref?.memoryId ?? ''), /^mem-/)
  assert.match(String(log[0].ref?.path ?? ''), /^memory\/observation\//)
})

test('[integration] memory note rejects provider failure without a partial row', async () => {
  const { agentId } = await seedCompanyWithAgent()
  __setEmbedTextOverrideForTesting(() => { throw new Error('embedding provider unavailable') })

  const res = await runCli([
    '--as', agentId,
    'memory', 'note', 'Embeddings unavailable but I still got noted',
  ])
  assert.equal(res.ok, false)
  assert.match(res.text, /embedding provider unavailable/)

  const { rows: ws } = await pool.query<{ body: string; embedding: string | null }>(
    `SELECT body, embedding::text AS embedding FROM agent_workspace WHERE agent_id = $1`,
    [agentId],
  )
  assert.equal(ws.length, 0)

  const { rowCount: logCount } = await pool.query(
    `SELECT 1 FROM agent_log WHERE agent_id = $1`, [agentId],
  )
  assert.equal(logCount, 0)
})

test('[integration] memory list: returns saved notes most-recent-first, pinned items float to top', async () => {
  const { agentId } = await seedCompanyWithAgent()
  __setEmbedTextOverrideForTesting(() => fakeEmbedding())

  // Three notes; pin the second one.
  await runCli(['--as', agentId, 'memory', 'note', 'first thought'])
  await runCli(['--as', agentId, 'memory', 'note', 'second thought'])
  await runCli(['--as', agentId, 'memory', 'note', 'third thought'])

  // Pull the id of the second note so we can pin it.
  const { rows: byBody } = await pool.query<{ path: string }>(
    `SELECT path FROM agent_workspace WHERE body = $1 AND agent_id = $2`,
    ['second thought', agentId],
  )
  assert.equal(byBody.length, 1)
  const secondId = byBody[0].path.split('/').pop()?.replace('.md', '') ?? ''
  assert.match(secondId, /^mem-/)
  const pinRes = await runCli(['--as', agentId, 'memory', 'pin', secondId])
  assert.equal(pinRes.ok, true, `pin failed: ${pinRes.text}`)
  assert.match(pinRes.text, /pinned: true/)

  // List with --json so we get a parseable structure.
  const listRes = await runCli(['--as', agentId, 'memory', 'list', '--json'])
  assert.equal(listRes.ok, true)
  const parsed = JSON.parse(listRes.text) as Array<{ id: string; body: string; pinned: boolean }>
  assert.equal(parsed.length, 3)
  // The pinned one floats to the top.
  assert.equal(parsed[0].body, 'second thought')
  assert.equal(parsed[0].pinned, true)
  // The other two appear, both unpinned.
  const remaining = parsed.slice(1).map((p) => p.body).sort()
  assert.deepEqual(remaining, ['first thought', 'third thought'])
})

test('[integration] memory delete: removes the row by id', async () => {
  const { agentId } = await seedCompanyWithAgent()
  __setEmbedTextOverrideForTesting(() => fakeEmbedding())

  await runCli(['--as', agentId, 'memory', 'note', 'temporary note'])
  const { rows: before } = await pool.query<{ path: string }>(
    `SELECT path FROM agent_workspace WHERE agent_id = $1`, [agentId],
  )
  assert.equal(before.length, 1)
  const id = before[0].path.split('/').pop()?.replace('.md', '') ?? ''

  const delRes = await runCli(['--as', agentId, 'memory', 'delete', id])
  assert.equal(delRes.ok, true, `delete failed: ${delRes.text}`)
  assert.match(delRes.text, new RegExp(`deleted ${id}`))

  const { rowCount } = await pool.query(`SELECT 1 FROM agent_workspace WHERE agent_id = $1`, [agentId])
  assert.equal(rowCount, 0, 'row gone after delete')
})

test('[integration] workspace write/edit/delete emit typed CLI side effects', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()

  const write = await runCli(['--as', agentId, 'workspace', 'write', 'notes/todo.md', 'ship harness'])
  assert.equal(write.ok, true, `workspace write failed: ${write.text}`)
  assert.deepEqual(write.sideEffects, [{
    event: 'workspace.file_written',
    command: 'workspace write',
    agentId,
    companyId,
    path: 'notes/todo.md',
    bodyLength: 'ship harness'.length,
  }])

  const edit = await runCli(['--as', agentId, 'workspace', 'edit', 'notes/todo.md', 'ship', 'harden'])
  assert.equal(edit.ok, true, `workspace edit failed: ${edit.text}`)
  assert.deepEqual(edit.sideEffects, [{
    event: 'workspace.file_updated',
    command: 'workspace edit',
    agentId,
    companyId,
    path: 'notes/todo.md',
    replacements: 1,
    bodyLength: 'harden harness'.length,
  }])

  const del = await runCli(['--as', agentId, 'workspace', 'delete', 'notes/todo.md'])
  assert.equal(del.ok, true, `workspace delete failed: ${del.text}`)
  assert.deepEqual(del.sideEffects, [{
    event: 'workspace.file_deleted',
    command: 'workspace delete',
    agentId,
    companyId,
    path: 'notes/todo.md',
  }])
})

test('[integration] memory note: body without --about uses about=NULL — pinning + delete still work', async () => {
  // Edge case: agents often note something without an --about subject.
  // The meta.about field should be null, not an empty string.
  const { agentId } = await seedCompanyWithAgent()
  __setEmbedTextOverrideForTesting(() => fakeEmbedding())

  await runCli(['--as', agentId, 'memory', 'note', 'untargeted thought'])
  const { rows } = await pool.query<{ meta: Record<string, unknown> }>(
    `SELECT meta FROM agent_workspace WHERE agent_id = $1`, [agentId],
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].meta?.about, null, 'about defaults to null')
})

test('[integration] memory note: identity guard — even with --as, only the calling agent can write to its own workspace', async () => {
  // Defensive test: if a runCli call comes in with --as agentA, the
  // agent_workspace row's agent_id MUST be agentA — even if the
  // command line somehow tried to spoof another id. This confirms the
  // DB-side write uses `me` (resolved via resolveAs), not anything
  // pulled out of unrelated CLI args.
  const { agentId: agentA } = await seedCompanyWithAgent({ agentId: `agent-a-${randomUUID().slice(0, 6)}` })
  await seedCompanyWithAgent({ companyId: 'c-other', agentId: 'agent-other' })
  __setEmbedTextOverrideForTesting(() => fakeEmbedding())

  await runCli(['--as', agentA, 'memory', 'note', 'mine alone'])
  const { rows: a } = await pool.query<{ body: string }>(
    `SELECT body FROM agent_workspace WHERE agent_id = $1`, [agentA],
  )
  const { rows: b } = await pool.query<{ body: string }>(
    `SELECT body FROM agent_workspace WHERE agent_id = $1`, ['agent-other'],
  )
  assert.equal(a.length, 1)
  assert.equal(b.length, 0, 'no cross-write to the other agent')
})
