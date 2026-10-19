import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions, type MemoryScope } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { nativeEvolutionBenchmark } from '../modules/memory/evolution.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model precedes this test in docs/evidence/issue-205/README.md:
// removing read-time registration must preserve cold-tenant proposals through
// real IM grants, independent approval and the successful synthesis receipt.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker> | undefined
const evidence: Record<string, unknown>[] = []
before(async () => {
  await ensureSchemaOnce()
  await resetAllTables()
  recording = await installRecordingWukong()
})
after(async () => {
  await worker?.stop()
  await teardownAll()
  await recording?.close()
  await mkdir('artifacts/memory-evolution-registration', { recursive: true })
  await writeFile('artifacts/memory-evolution-registration/candidate.json', JSON.stringify({
    runtime: releaseVersions.runtime, node: process.version, complete: evidence.length === 2,
    environment: 'isolated PostgreSQL; product control and IM grants; deterministic model; recording IM; no live provider',
    evidence,
  }, null, 2) + '\n')
})

test('cold product memory synthesis freezes only nonempty candidates and leaves evaluation pending', { timeout: 60000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const conversationId = 'memory-evolution-registration', members = ['test-owner', agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Fixture',$4::jsonb)",
    [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const app = await lingxiOSControl(), memory = app.memory
  assert.ok(memory)
  const policy = await syncConversationPolicy(app, companyId, conversationId)
  const benchmarks = () => pool.query('SELECT id,definition FROM lingxios.agent_evolution_benchmarks WHERE tenant_id=$1', [companyId])
  let mode: 'empty' | 'candidate' = 'empty', sourceRunId = '', scope: MemoryScope | undefined
  let proposals = 0, reviews = 0
  const usage = { available: true as const, inputTokens: 100, outputTokens: 30 }
  const candidateBody = 'Inspect the existing receipt before retrying a failed operation.'
  const candidates = () => mode === 'candidate' ? [{ kind: 'strategy', scopeType: scope!.scopeType, body: candidateBody }] : []
  const changes = () => mode === 'candidate' ? [{ sourceRunIds: [sourceRunId], change: { action: 'create', content: {
    path: 'notes/receipt-check.md', title: 'Receipt check', description: 'Synthetic checked procedure',
    body: 'The fixture checked the existing receipt before retrying.', layer: 'reference',
  } } }] : []
  worker = createWorker({ controlPlane: app, worker: { id: 'memory-evolution-registration', concurrency: 1 }, model: {
    modelId: 'memory-evolution-registration-fixture', contextWindowTokens: 200000,
    async run() {
      const text = 'The fixture checked the existing receipt before retrying.'
      return { output: [{ role: 'assistant', content: text }], text, model: 'memory-evolution-registration-fixture', usage }
    },
    async structured(input) {
      if (input.purpose !== 'memory-synthesis') return { value: { missing: [] }, model: 'memory-evolution-registration-fixture', usage }
      const batch = input.input as { scope: MemoryScope; evolutionEnabled: boolean; evidence: { sourceRunId: string }[];
        changes?: unknown; candidates?: unknown }
      assert.deepEqual(batch.scope, scope, 'synthesis must retain the live product-authorized IM scope')
      assert.equal(batch.evolutionEnabled, true)
      assert.deepEqual(batch.evidence.map(item => item.sourceRunId), [sourceRunId], 'only this committed IM source is synthesized')
      if (input.instructions.includes('Independently audit')) {
        reviews++
        assert.deepEqual(batch.changes, changes())
        assert.deepEqual(batch.candidates, candidates())
        return { value: { approved: true, confidence: 1 }, model: 'memory-evolution-registration-fixture', usage }
      }
      assert.match(input.instructions, /Consolidate durable cognitive memory/)
      proposals++
      return { value: { changes: changes(), conflicts: [], candidates: candidates() }, model: 'memory-evolution-registration-fixture', usage }
    },
    async compact() { throw new Error('fixture must not compact') },
  } })

  // The empty pass leaves the same tenant cold for the nonempty pass. Never
  // explicitly freeze a benchmark or seed runtime evidence/candidates here.
  for (const currentMode of ['empty', 'candidate'] as const) {
    mode = currentMode
    const beforeProposals = proposals, beforeReviews = reviews
    assert.equal((await benchmarks()).rowCount, 0)
    const accepted = await app.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: `registration-${mode}`, version: 1, author: { id: 'test-owner', kind: 'human' },
      text: 'The fixture checked the existing receipt before retrying the operation.', mentions: [agentId],
    // Match receive.ts: this source reports an observation, rather than asking
    // for a business mutation whose successful receipt would be mandatory.
    }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation' })
    const source = accepted.runs[0]
    assert.ok(source)
    sourceRunId = source.runId
    await bindProductRun(pool, source, conversationId)
    const identity = { tenantId: companyId, principalId: 'test-owner', agentId, sessionId: source.sessionId, workId: source.runId }
    scope = (await memory.scopes(identity)).find(item => item.scopeType === 'learner')
    assert.ok(scope)
    assert.ok(scope.scopeId.startsWith('im-memory:'))
    assert.deepEqual((await memory.list(identity, scope)).items, [])
    assert.equal((await benchmarks()).rowCount, 0, 'ordinary scope/list reads must leave the tenant cold')
    assert.equal(await worker.runNext(), true)
    assert.deepEqual((await pool.query('SELECT status FROM lingxios.agent_work_items WHERE id=$1', [sourceRunId])).rows,
      [{ status: 'succeeded' }])

    const captureDeadline = Date.now() + 15000
    while (!(await pool.query('SELECT 1 FROM lingxios.agent_memory_evidence WHERE tenant_id=$1 AND source_run_id=$2',
      [companyId, sourceRunId])).rowCount) {
      assert.ok(Date.now() < captureDeadline, 'committed IM evidence must reach the background capture queue')
      await delay(25)
    }
    const { jobIds } = await memory.reflect(identity, scope)
    assert.equal(jobIds.length, 1)
    assert.equal((await benchmarks()).rowCount, 0, 'capture and scheduling must leave the tenant cold')
    assert.equal(await worker.runNext(), true)
    assert.equal(proposals - beforeProposals, 1)
    assert.equal(reviews - beforeReviews, 1, 'a separate approving model call must precede apply')
    assert.deepEqual((await pool.query('SELECT kind,status FROM lingxios.agent_work_items WHERE id=$1', [jobIds[0]])).rows,
      [{ kind: 'memory_synthesis', status: 'succeeded' }])
    const receipts = await pool.query(`SELECT (l.result->>'ok')::boolean AS ok,l.result->>'executionState' AS execution_state,
      l.result->'value'->>'outcome' AS outcome,(l.result->'value'->>'changeCount')::int AS change_count
      FROM lingxios.agent_action_intents i JOIN lingxios.agent_action_ledger l USING(idempotency_key)
      WHERE i.intent->>'workId'=$1 AND i.intent->'action'->>'action'='memory_synthesis.apply'`, [jobIds[0]])
    assert.deepEqual(receipts.rows, [{ ok: true, execution_state: 'succeeded', outcome: 'committed', change_count: mode === 'candidate' ? 1 : 0 }])
    const registered = await benchmarks()
    const evaluated = await pool.query(`SELECT m.scope_type,m.scope_id,m.kind,m.origin,m.status,e.benchmark_id,e.verdict,
      w.kind AS work_kind,w.status AS work_status
      FROM lingxios.agent_memories m JOIN lingxios.agent_evolution_evaluations e ON e.tenant_id=m.tenant_id AND e.memory_id=m.id
      JOIN lingxios.agent_work_items w ON w.tenant_id=m.tenant_id AND w.meta->>'memoryId'=m.id
      WHERE m.tenant_id=$1 AND m.origin='evolved'`, [companyId])
    if (mode === 'empty') {
      assert.equal(registered.rowCount, 0, 'approved empty candidates must not register the trusted benchmark')
      assert.equal(evaluated.rowCount, 0)
    } else {
      assert.deepEqual(registered.rows, [{ id: nativeEvolutionBenchmark.id, definition: nativeEvolutionBenchmark }])
      assert.deepEqual(evaluated.rows, [{ scope_type: scope.scopeType, scope_id: scope.scopeId, kind: 'strategy', origin: 'evolved',
        status: 'candidate', benchmark_id: nativeEvolutionBenchmark.id, verdict: 'pending', work_kind: 'memory_evaluation', work_status: 'queued' }])
      const documents = await memory.list(identity, scope)
      assert.equal(documents.items.length, 1)
      assert.equal(documents.items[0].origin, 'synthesized')
    }
    evidence.push({ mode, proposals: proposals - beforeProposals, independentReviews: reviews - beforeReviews,
      successfulApplyReceipts: receipts.rowCount, benchmarks: registered.rowCount, inactiveCandidatesWithPendingEvaluation: evaluated.rowCount })
  }
})
