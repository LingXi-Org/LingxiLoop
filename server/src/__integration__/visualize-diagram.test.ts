import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import type { ActionContext } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { visualizeTools } from '../agent-runtime/visualize-tools.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { readAuthorizedVisualizeDocument } from '../im/visualize.js'
import { ensureSchemaOnce, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Written before the public action implementation. Use only a dedicated test DB.
const suffix = randomUUID()
const channelId = `diagram-room-${suffix}`, userId = `diagram-owner-${suffix}`, runId = `diagram-run-${suffix}`
let companyId: string, agentId: string
before(async () => {
  const target = new URL(process.env.DATABASE_URL!)
  const databaseName = decodeURI(target.pathname.slice(1))
  const databaseHost = decodeURIComponent(target.searchParams.getAll('host').at(-1) || target.hostname)
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol))
  assert.match(databaseName, /(?:^|[_-])test(?:$|[_-])/i)
  assert.doesNotMatch(databaseName, /(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
  assert.doesNotMatch(databaseHost, /\b(prod|production|main|live)\b/i)
  await ensureSchemaOnce()
  const seeded = await seedCompanyWithAgent(); companyId = seeded.companyId; agentId = seeded.agentId
  await seedUserMembership(userId, companyId)
  const members = [userId, agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [channelId, companyId, seeded.projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol) VALUES($1,$2,$3,$3,$4,$5,2)`, [runId, companyId, channelId, agentId, userId])
})
after(async () => { await teardownAll() })
const diagram = { kind: 'sequence', title: 'Process', nodes: [{ id: 'input', label: 'Input' }, { id: 'output', label: 'Output' }] }
function context(signal = AbortSignal.timeout(10000)): ActionContext {
  return { database: pool, signal, action: { action: 'visualize.diagram' },
    work: { id: runId, tenantId: companyId, agentId, principalId: userId, kind: 'turn', lane: 'interactive', sessionId: channelId,
      fence: 1, homeEpoch: 1, triggerRef: 'diagram-request', meta: { conversationId: channelId } },
  } as unknown as ActionContext
}
const count = async () => (await pool.query('SELECT count(*)::int AS count FROM im_visualize_documents')).rows[0].count

test('diagram action is public, saves through the current actor/run boundary and returns an actual reference', async () => {
  assert.ok(visualizeSkill.actions.includes('visualize.diagram'))
  const tool = visualizeTools.find(t => t.action === 'visualize.diagram')!
  assert.ok(tool); assert.equal(tool.effect, 'transaction')
  const ctx = context(), input = tool.parse({ name: 'diagram-check', diagram })
  await tool.authorize(ctx, input)
  const result = await tool.execute(ctx, input)
  assert.equal(result.ok, true)
  const value = result.value as { path: string; reference: string; summary: { kind: string } }
  assert.equal(value.reference, `::visualize${JSON.stringify({ path: value.path })}`)
  assert.equal(value.summary.kind, 'sequence')
  const doc = await readAuthorizedVisualizeDocument({ companyId, channelId, userId, path: value.path })
  assert.match(doc.html, /lx-sequence-node/); assert.match(doc.html, /lx-sequence-connector/)
  assert.equal((await tool.verify!(ctx, input, result.value)).status, 'passed')
})
test('invalid computation and cancellation cause no save, while original authorization failures stay failures', async () => {
  const tool = visualizeTools.find(t => t.action === 'visualize.diagram')!, initial = await count()
  const invalid = tool.parse({ name: 'must-not-save', diagram: { ...diagram, edges: [{ from: 'input', to: 'missing' }] } })
  const failure = await tool.execute(context(), invalid)
  assert.equal(failure.ok, false); assert.equal(failure.executionState, 'no_effect')
  assert.equal(await count(), initial)
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(tool.execute(context(cancelled.signal), tool.parse({ name: 'cancelled', diagram })), { name: 'AbortError' })
  assert.equal(await count(), initial)
  const wrongRun = context(); wrongRun.work.id = 'unbound-run'
  await assert.rejects(tool.execute(wrongRun, tool.parse({ name: 'wrong-run', diagram })))
  assert.equal(await count(), initial)
  await pool.query('UPDATE conversations SET members=members-$3 WHERE company_id=$1 AND id=$2', [companyId, channelId, userId])
  await assert.rejects(tool.execute(context(), tool.parse({ name: 'revoked', diagram })))
  assert.equal(await count(), initial)
})
