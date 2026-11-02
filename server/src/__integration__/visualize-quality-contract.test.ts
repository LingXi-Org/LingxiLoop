import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { ActionContext, RunVerificationContext } from '@lyyzka/lingxios'
import { withVisualizeAuthoringFixture } from './_visualize-authoring-fixture.js'
import { pool } from '../db/pool.js'
import { saveVisualizeDocument } from '../im/visualize.js'
import { verifyVisualizeCandidate, visualizeTools } from '../agent-runtime/visualize-tools.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure inventory in docs/evidence/issue-217-quality/FAILURE-MODEL.md precedes
// the guard changes. Real product authorization/database, no provider claims.
let companyId: string, agentId: string
const channelId = 'quality-contract-room', userId = 'test-owner', runId = 'quality-contract-run'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const seeded = await seedCompanyWithAgent()
  companyId = seeded.companyId; agentId = seeded.agentId
  await seedUserMembership(userId, companyId)
  const members = [userId, agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, seeded.projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES($1,$2,$3,$3,$4,$5,2)`, [runId, companyId, channelId, agentId, userId])
})
after(async () => { await teardownAll() })
function context(body: string, id = runId): RunVerificationContext {
  return { skillActivations: [],unavailableSkillActivationIds: [],candidate: { body, requestVersion: 1, artifacts: [] }, requestVersion: 1,
    database: pool, signal: AbortSignal.timeout(10_000), deadlineAt: new Date(Date.now() + 10_000).toISOString(),
    work: { id, tenantId: companyId, agentId, principalId: userId, kind: 'turn', lane: 'interactive',
      sessionId: channelId, fence: 1, homeEpoch: 1, triggerRef: 'quality-request', meta: { conversationId: channelId } },
  }
}
test('full HTML gets actionable native input failure and never writes a document', async () => {
  const tool = visualizeTools.find(tool => tool.action === 'visualize.save')!
  const input = tool.parse({ name: 'full-document', html: '<!doctype html><html><body><p>Chart</p></body></html>' })
  // Only the public product authorize/execute callbacks are under test. No
  // runtime or provider is simulated; unused ActionContext capabilities omitted.
  const ctx = withVisualizeAuthoringFixture({ ...context(''), action: { action: tool.action } } as unknown as ActionContext)
  await tool.authorize(ctx, input)
  const result = await tool.execute(ctx, input)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'invalid_arguments')
  assert.equal(result.executionState, 'no_effect')
  assert.match(result.error ?? '', /fragment/i)
  assert.match(result.error ?? '', /html.*head.*body/i)
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM im_visualize_documents')).rows[0].count, 0)
  const corrected = tool.parse({ name: 'full-document', html: '<style>p{color:inherit}</style><p>Complete fragment</p>' })
  await tool.authorize(ctx, corrected)
  const saved = await tool.execute(ctx, corrected)
  assert.equal(saved.ok, true)
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM im_visualize_documents')).rows[0].count, 1)
})
test('literal save proves the exact readback before return and rejects stale version, hash and request', async () => {
  const tool = visualizeTools.find(tool => tool.action === 'visualize.save')!
  const ctx = withVisualizeAuthoringFixture({ ...context(''), action: { action: tool.action } } as unknown as ActionContext)
  const input = tool.parse({ name: 'exact-readback', html: '<div>Gather collects items. Check reviews those items.</div>' })
  await tool.authorize(ctx, input)
  const saved = await tool.execute(ctx, input)
  assert.equal(saved.ok, true)
  const value = saved.value as { path: string; version: number; sourceHash: string; readback?: unknown }
  assert.deepEqual(value.readback, { status: 'matched', requestVersion: 1, version: value.version,
    sourceHash: value.sourceHash, completeLiteralInput: true, semanticValidation: false, browserValidation: false })
  assert.equal((await tool.verify!(ctx, input, value)).status, 'passed')
  assert.equal((await tool.verify!(ctx, input, { ...value, version: value.version + 1 })).status, 'failed')
  assert.equal((await tool.verify!(ctx, input, { ...value, sourceHash: '0'.repeat(64) })).status, 'failed')
  assert.equal((await tool.verify!({ ...ctx, requestVersion: 2 }, input, value)).status, 'failed')
  await assert.rejects(tool.verify!(ctx, input, { ...value, path: '/another-conversation/not-authorized.html' }))
  await pool.query('UPDATE im_visualize_documents SET version=version+1 WHERE company_id=$1 AND path=$2', [companyId, value.path])
  assert.equal((await tool.verify!(ctx, input, value)).status, 'failed', 'same bytes in a newer version are not this save receipt')
})
test('code-only own-save references request repair; exports, fallbacks and examples remain valid', async () => {
  const doc = await saveVisualizeDocument({ companyId, channelId, userId, agentId, runId, name: 'numerical-check', html: '<div>Complete chart fixture</div>' })
  const reference = `::visualize${JSON.stringify({ path: doc.path })}`
  for (const body of ['```json\n' + reference + '\n```', '`' + reference + '`']) {
    const records = await verifyVisualizeCandidate(context(body))
    assert.equal(records[0]?.status, 'failed', 'a code-only delivery of this saved chart must request repair')
    assert.match(String(records[0]?.evidence.hint), /code/i)
  }
  const checked = (await verifyVisualizeCandidate(context(reference)))[0]
  assert.equal(checked?.status, 'passed')
  assert.deepEqual(checked.evidence, { references: 1, storageReadback: true, semanticValidation: false, browserValidation: false })
  for (const body of [
    'I could not complete the chart; here is the calculation in text.',
    '[Download the standalone chart](artifact:visualize/numerical-check.html)',
    'Reference syntax example:\n```json\n' + reference + '\n```',
    '```json\n' + `::visualize${JSON.stringify({ path: '/another-run/example.html' })}` + '\n```',
  ]) assert.deepEqual(await verifyVisualizeCandidate(context(body)), [])
  assert.deepEqual(await verifyVisualizeCandidate(context('```json\n' + reference + '\n```', 'different-run')), [])
  assert.deepEqual(await verifyVisualizeCandidate(context('A short answer.', 'different-run')), [])
  await pool.query('UPDATE conversations SET members=members-$3 WHERE company_id=$1 AND id=$2', [companyId, channelId, userId])
  // The existing verifier reports unavailable documents as failed records;
  // it need not throw. Revocation must never yield a passing candidate.
  assert.equal((await verifyVisualizeCandidate(context(reference)))[0]?.status, 'failed')
  assert.equal((await verifyVisualizeCandidate(context('```json\n' + reference + '\n```')))[0]?.status, 'failed')
})
