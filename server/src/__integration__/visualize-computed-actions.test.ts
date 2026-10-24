import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import type { ActionContext } from '@lyyzka/lingxios'
import { withVisualizeAuthoringFixture } from './_visualize-authoring-fixture.js'
import { pool } from '../db/pool.js'
import { visualizeTools } from '../agent-runtime/visualize-tools.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { readAuthorizedVisualizeDocument } from '../im/visualize.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Both computations share the same actor/run persistence boundary. Keep each
// renderer's actual input, stored output and negative cases in one DB fixture.
const suffix = randomUUID()
const channelId = `computed-room-${suffix}`, userId = `computed-owner-${suffix}`, runId = `computed-run-${suffix}`
let companyId: string, agentId: string
before(async () => {
  const target = new URL(process.env.DATABASE_URL!)
  const databaseName = decodeURI(target.pathname.slice(1))
  const databaseHost = decodeURIComponent(target.searchParams.getAll('host').at(-1) || target.hostname)
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol))
  assert.match(databaseName, /(?:^|[_-])test(?:$|[_-])/i)
  assert.doesNotMatch(databaseName, /(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
  assert.doesNotMatch(databaseHost, /\b(prod|production|main|live)\b/i)
  await ensureSchemaOnce(); await resetAllTables()
  const seeded = await seedCompanyWithAgent(); companyId = seeded.companyId; agentId = seeded.agentId
  await seedUserMembership(userId, companyId)
  const members = [userId, agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [channelId, companyId, seeded.projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol) VALUES($1,$2,$3,$3,$4,$5,2)`, [runId, companyId, channelId, agentId, userId])
})
after(async () => { await teardownAll() })
const chart = { kind: 'linear', title: 'General plans', inputLabel: 'Quantity', inputUnit: 'units', valueUnit: 'cost', prefer: 'lower',
  domain: { min: 0, max: 20 }, samples: [0, 5, 20], series: [{ label: 'A', intercept: 30, slope: 1 }, { label: 'B', intercept: 0, slope: 4 }] }
const diagram = { kind: 'sequence', title: 'Process', nodes: [{ id: 'input', label: 'Input' }, { id: 'output', label: 'Output' }] }
const scenarios = [
  { action: 'visualize.chart', name: 'numeric', input: { chart }, invalid: { chart: { ...chart, samples: [2, 2] } }, kind: 'linear', markers: [/<svg/, /<table/] },
  { action: 'visualize.diagram', name: 'diagram', input: { diagram }, invalid: { diagram: { ...diagram, edges: [{ from: 'input', to: 'missing' }] } }, kind: 'sequence', markers: [/lx-sequence-node/, /lx-sequence-connector/] },
]
function context(action: string, signal = AbortSignal.timeout(10000)): ActionContext {
  return withVisualizeAuthoringFixture({ database: pool, signal, action: { action },
    work: { id: runId, tenantId: companyId, agentId, principalId: userId, kind: 'turn', lane: 'interactive', sessionId: channelId,
      fence: 1, homeEpoch: 1, triggerRef: 'computed-request', meta: { conversationId: channelId } },
  } as unknown as ActionContext)
}
const count = async () => (await pool.query('SELECT count(*)::int AS count FROM im_visualize_documents')).rows[0].count

test('numeric and diagram actions persist distinct authorized references and verify their computed output', async () => {
  const paths: string[] = []
  for (const scenario of scenarios) {
    assert.ok(visualizeSkill.actions.includes(scenario.action))
    const tool = visualizeTools.find(t => t.action === scenario.action)!
    assert.ok(tool); assert.equal(tool.effect, 'transaction')
    const ctx = context(scenario.action), input = tool.parse({ name: `${scenario.name}-check`, ...scenario.input })
    await tool.authorize(ctx, input)
    const result = await tool.execute(ctx, input)
    assert.equal(result.ok, true, scenario.action)
    const value = result.value as { path: string; reference: string; summary: { kind: string } }
    assert.equal(value.reference, `::visualize${JSON.stringify({ path: value.path })}`)
    assert.equal(value.summary.kind, scenario.kind)
    const doc = await readAuthorizedVisualizeDocument({ companyId, channelId, userId, path: value.path })
    for (const marker of scenario.markers) assert.match(doc.html, marker)
    assert.equal((await tool.verify!(ctx, input, result.value)).status, 'passed')
    paths.push(value.path)
  }
  assert.equal(new Set(paths).size, scenarios.length)
})
test('both computations reject invalid inputs, cancellation, unbound runs and revoked actors without saving', async () => {
  const initial = await count()
  for (const scenario of scenarios) {
    const tool = visualizeTools.find(t => t.action === scenario.action)!
    const invalid = tool.parse({ name: `${scenario.name}-invalid`, ...scenario.invalid })
    const failure = await tool.execute(context(scenario.action), invalid)
    assert.equal(failure.ok, false); assert.equal(failure.executionState, 'no_effect')
    assert.equal(await count(), initial)
    const cancelled = new AbortController(); cancelled.abort()
    await assert.rejects(tool.execute(context(scenario.action, cancelled.signal), tool.parse({ name: `${scenario.name}-cancelled`, ...scenario.input })), { name: 'AbortError' })
    assert.equal(await count(), initial)
    const wrongRun = context(scenario.action); wrongRun.work.id = 'unbound-run'
    await assert.rejects(tool.execute(wrongRun, tool.parse({ name: `${scenario.name}-wrong-run`, ...scenario.input })))
    assert.equal(await count(), initial)
  }
  await pool.query('UPDATE conversations SET members=members-$3 WHERE company_id=$1 AND id=$2', [companyId, channelId, userId])
  for (const scenario of scenarios) {
    const tool = visualizeTools.find(t => t.action === scenario.action)!
    await assert.rejects(tool.execute(context(scenario.action), tool.parse({ name: `${scenario.name}-revoked`, ...scenario.input })))
    assert.equal(await count(), initial)
  }
})
