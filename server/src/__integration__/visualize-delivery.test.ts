import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { skillIndex, type ActionContext, type RunVerificationContext } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { saveVisualizeDocument, readAuthorizedVisualizeDocument } from '../im/visualize.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { visualizeTools, verifyVisualizeCandidate } from '../agent-runtime/visualize-tools.js'
import { verifyVisualizeDelivery, VISUALIZE_UNAVAILABLE_TEXT } from '../agent-runtime/visualize-delivery.js'
import { createProductContext } from '../agent-runtime/context.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Owning database boundary tests; failure model was recorded before implementation
// in docs/evidence/issue-247-skill-delivery/FAILURE-MODEL.md.
let companyId: string, agentId: string
const channelId = 'delivery-room', userId = 'test-owner', runId = 'delivery-run'
const html = '<div>Actual saved delivery</div>'
const checks: string[] = []
const actor = () => ({ companyId, channelId, userId })
function context(body: string, requestVersion = 1): RunVerificationContext {
  const { name, version, hash } = skillIndex(visualizeSkill)
  return { work: { id: runId, tenantId: companyId, agentId, principalId: userId, sessionId: channelId,
    kind: 'turn', lane: 'interactive', meta: { conversationId: channelId }, createdAt: new Date().toISOString() },
    candidate: { body, requestVersion,artifacts: [] }, requestVersion, database: pool, signal: AbortSignal.timeout(5000),
    deadlineAt: new Date(Date.now()+5000).toISOString(), unavailableSkillActivationIds: [],
    skillActivations: [{ id: 'activation', tenantId: companyId, runId, requestVersion,
      skill: { name, version, hash }, checker: 'product:visualize-delivery' }] } as RunVerificationContext
}
const reference = (path: string) => `::visualize${JSON.stringify({ path })}`
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  ;({ companyId, agentId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId)
  await seedUserMembership('delivery-peer', companyId)
  const members = [userId, agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,kind,title,members) VALUES($1,$2,'group','Delivery',$3::jsonb)`, [channelId,companyId,JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [channelId,companyId,JSON.stringify({ channelType: 2,members })])
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES($1,$2,$3,$3,$4,$5,2)`, [runId,companyId,channelId,agentId,userId])
})
after(async () => {
  await mkdir('artifacts/visualize/skill-delivery', { recursive: true })
  await writeFile('artifacts/visualize/skill-delivery/checker.json', JSON.stringify({ checks,
    command: 'npm run test:integration -- --file visualize-delivery.test.ts',
    scope: 'authorized saved-reference readback; no browser or model-readback claim' }, null, 2))
  await teardownAll()
})

test('no activation leaves ordinary code, reads and export answers inert', async () => {
  const c = context('Here is ordinary code: `const value = 1`'); c.skillActivations = []
  assert.deepEqual(await verifyVisualizeDelivery(c), [])
  checks.push('unactivated-inert')
})
test('all authoring actions reject a missing public activation hook before saving', async () => {
  const c = { ...context(''), requestVersion: 1 } as unknown as ActionContext
  const inputs: Record<string, object> = {
    save: { name: 'hook-save', html },
    chart: { name: 'hook-chart', chart: { kind: 'trend', title: 'Values', unit: 'items', periods: ['A','B'],series: [{ label: 'Count',values: [1,2] }] } },
    diagram: { name: 'hook-diagram', diagram: { kind: 'sequence',title: 'Steps',nodes: [{ id: 'a',label: 'A' },{ id: 'b',label: 'B' }] } },
  }
  for (const [method, input] of Object.entries(inputs)) {
    const tool = visualizeTools.find(tool => tool.action === `visualize.${method}`)!
    await assert.rejects(tool.execute(c,tool.parse(input)), /skill delivery activation is unavailable/)
  }
  assert.equal((await pool.query(`SELECT count(*)::int n FROM im_visualize_documents`)).rows[0].n, 0)
  checks.push('host-hook-required')
})
test('actual current-request reference uses transaction readback; old request and corrupted storage cannot deliver', async () => {
  const doc = await saveVisualizeDocument({ ...actor(),runId,agentId,name: 'current',html,requestVersion: 1 })
  await withTransaction(pool, async database => {
    const c = { ...context(reference(doc.path)),database }
    assert.equal((await verifyVisualizeDelivery(c))[0].outcome, 'delivered')
    assert.equal((await verifyVisualizeDelivery({ ...c,requestVersion: 2,candidate: { ...c.candidate,requestVersion: 2 },
      skillActivations: c.skillActivations.map(a => ({ ...a,requestVersion: 2 })) }))[0].outcome, 'pending')
  })
  const before = (await pool.query(`SELECT version FROM im_visualize_documents WHERE path=$1`, [doc.path])).rows[0].version
  await saveVisualizeDocument({ ...actor(),runId,agentId,name: 'current',html,requestVersion: 2 })
  assert.deepEqual((await pool.query(`SELECT request_version,version FROM im_visualize_documents WHERE path=$1`, [doc.path])).rows,
    [{ request_version: 2,version: before+1 }])
  const c = context(reference(doc.path), 2)
  assert.equal((await verifyVisualizeDelivery(c))[0].outcome, 'delivered')
  for (const body of ['', 'No visualization was produced.', 'Unsupported.', 'Failed.', `\`${reference(doc.path)}\``, `::visualize{"path":`]) {
    assert.equal((await verifyVisualizeDelivery({ ...c,candidate: { ...c.candidate,body } }))[0].outcome, 'pending')
  }
  await pool.query(`UPDATE im_visualize_documents SET source_hash=repeat('0',64) WHERE path=$1`, [doc.path])
  assert.equal((await verifyVisualizeDelivery(c))[0].outcome, 'pending')
  await saveVisualizeDocument({ ...actor(),runId,agentId,name: 'current',html,requestVersion: 2 })
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES('different-run',$1,$2,$2,$3,$4,2)`, [companyId,channelId,agentId,userId])
  for (const field of ['run_id','agent_id','created_by'] as const) {
    // Restore inside a rolled-back transaction, preserving real FK constraints.
    await withTransaction(pool, async database => {
      const altered = field === 'run_id' ? 'different-run' : field === 'agent_id' ? userId : 'delivery-peer'
      await database.query(`UPDATE im_visualize_documents SET ${field}=$2 WHERE path=$1`, [doc.path,altered])
      assert.equal((await verifyVisualizeDelivery({ ...c,database }))[0].outcome, 'pending')
      await database.query(`UPDATE im_visualize_documents SET ${field}=$2 WHERE path=$1`, [doc.path,field === 'run_id' ? runId : field === 'agent_id' ? agentId : userId])
    })
  }
  const missing = doc.path.replace('current.html','missing.html')
  assert.equal((await verifyVisualizeDelivery({ ...c,candidate: { ...c.candidate,body: `${reference(doc.path)}\n${reference(missing)}` } }))[0].outcome, 'pending')
  assert.deepEqual(await readAuthorizedVisualizeDocument({ ...actor(),path: doc.path }), { path: doc.path,html })
  checks.push('current-request-integrity-and-all-refs')
})
test('unavailable native contract accepts only the explicit non-delivery explanation', async () => {
  const c = { ...context('I delivered it.'),unavailableSkillActivationIds: ['activation'] }
  assert.equal((await verifyVisualizeDelivery(c))[0].outcome, 'pending')
  const result = await verifyVisualizeDelivery({ ...c,candidate: { ...c.candidate,body: VISUALIZE_UNAVAILABLE_TEXT } })
  assert.equal(result[0].outcome, 'unsupported')
  assert.notEqual(result[0].outcome, 'delivered')
  checks.push('honest-unavailable')
})
test('capability resolver and both final visualize checks never reacquire the product pool', async () => {
  const doc = await saveVisualizeDocument({ ...actor(),runId,agentId,name: 'borrowed',html,requestVersion: 1 })
  await withTransaction(pool, async database => {
    const c = { ...context(reference(doc.path)),database }
    const original = pool.query
    pool.query = (() => { throw new Error('global pool reacquired inside native transaction') }) as typeof pool.query
    try {
      const grants = await createProductContext(visualizeTools).capabilityResolver.resolve(c.work,{ database })
      assert.ok(grants.find(g => g.name === 'skills')?.methods?.includes('activate'))
      assert.equal((await verifyVisualizeCandidate(c))[0].status, 'passed')
      assert.equal((await verifyVisualizeDelivery(c))[0].outcome, 'delivered')
    } finally { pool.query = original }
  })
  checks.push('borrowed-database-only')
})
