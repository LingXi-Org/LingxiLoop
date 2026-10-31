import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import express from 'express'
import type { ActionContext, WorkItem, RunVerificationContext } from '@lyyzka/lingxios'
import { api } from '../api/router.js'
import { env } from '../env.js'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { createArtifactTools, createArtifactRuntime, loadArtifactRunContext, completeArtifactWork, createSlides } from '../modules/artifacts/index.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure boundaries: source provenance must not be reassigned; assignments,
// shared state and evidence must agree on the execution room; unrelated agents
// cannot join implicitly; a verifier cannot certify its own contribution.
// This test uses real gateway signature/nonce/session checks, public SDK APIs,
// HTTP product routes and PostgreSQL. Model decisions are exercised separately.
let server: Server, origin: string, companyId: string, projectId: string, builderId: string
let im: Awaited<ReturnType<typeof installRecordingWukong>>
const userId = 'slides-flow-person', verifierId = 'slides-flow-verifier', outsiderId = 'slides-flow-outsider'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  im = await installRecordingWukong()
  ;({ companyId, projectId, agentId: builderId } = await seedCompanyWithAgent())
  await seedUserMembership(userId, companyId, { isAdmin: false })
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')", [projectId, companyId, userId])
  await pool.query("UPDATE participants SET capabilities='[\"slides\"]'::jsonb WHERE id=$1 AND company_id=$2", [builderId, companyId])
  for (const id of [verifierId, outsiderId]) await pool.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,capabilities)
    VALUES($1,$2,'agent',$1,'演','transparent','avail','["slides"]'::jsonb)`, [id, companyId])
  const members = [userId, builderId, verifierId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('slides-flow-source',$1,$2,'group','Source',$3::jsonb)`, [companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES('slides-flow-source',$1,$2::jsonb)`,
    [companyId, JSON.stringify({ channelType: 2, members })])
  const app = express(); app.use(express.json()); app.use('/api', api)
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  origin = `http://127.0.0.1:${address.port}`
})
after(async () => { await teardownAll(server); await im?.close() })

function signedHeaders(path: string, method: string) {
  const payload = Buffer.from(JSON.stringify({ appUserId: userId, authUserId: userId, authSessionIssuedAt: Date.now(),
    method, path: `/api${path}`, timestamp: Date.now(), nonce: randomUUID() })).toString('base64url')
  return { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId,
    'x-lingxiloop-gateway': `${payload}.${createHmac('sha256', env.GATEWAY_HMAC_SECRET).update(payload).digest('base64url')}` }
}
const request = (path: string, method = 'GET', body?: unknown) => fetch(`${origin}/api${path}`, {
  method, headers: signedHeaders(path, method), ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
function work(agentId: string, conversationId: string, id = randomUUID()): Omit<WorkItem, 'leaseToken'> {
  return { id, tenantId: companyId, agentId, principalId: userId, sessionId: `session-${id}`, kind: 'turn', lane: 'interactive',
    triggerRef: `message-${id}`, fence: 1, homeEpoch: 1, createdAt: new Date().toISOString(), meta: { conversationId } } as unknown as Omit<WorkItem, 'leaseToken'>
}
const tools = createArtifactTools('slides', lingxiOSControl)
async function invoke(current: Omit<WorkItem, 'leaseToken'>, name: string, input: unknown) {
  const tool = tools.find(item => item.action === `slides.${name}`)!
  const args = tool.parse(input)
  return withTransaction(pool, async database => {
    const context = { work: current, database, requestVersion: 1, signal: AbortSignal.timeout(10_000),
      deadlineAt: new Date(Date.now() + 10_000).toISOString(), action: { action: tool.action, args,
        runId: current.id, cellId: 'fixture', callIndex: 0, idempotencyKey: randomUUID() } } as unknown as ActionContext
    await tool.authorize(context, args)
    const result = await tool.execute(context, args) as { ok: boolean; value: unknown }
    assert.equal(result.ok, true)
    if (tool.verify) await tool.verify(context, args, result.value)
    return result.value
  })
}

test('authenticated Slides cooperation keeps source provenance and completes in its dedicated room', { timeout: 45_000 }, async () => {
  const deck = await createSlides({ companyId, projectId, conversationId: 'slides-flow-source', title: 'Shared deck', actorId: userId, origin: 'user' })
  assert.equal((await fetch(`${origin}/api/artifacts/${deck.id}/slides-workspace`, { method: 'POST' })).status, 401)
  const opened = await request(`/artifacts/${deck.id}/slides-workspace`, 'POST')
  assert.equal(opened.status, 200, await opened.clone().text())
  const workspace = await opened.json() as { conversationId: string; agentId: string }
  const leader = work(workspace.agentId, workspace.conversationId)
  const agents = await invoke(leader, 'available_agents', {}) as { id: string }[]
  assert.ok(agents.some(agent => agent.id === builderId))
  assert.ok(agents.some(agent => agent.id === verifierId))
  assert.ok(!agents.some(agent => agent.id === outsiderId))
  const start = (members: unknown[]) => invoke(leader, 'start_workspace', { artifactId: deck.id, title: 'Shared deck', goal: 'Edit and verify the selected slide', members })
  await assert.rejects(start([{ agentId: outsiderId, assignment: 'must not enter' }]), /execution conversation/)
  await start([{ agentId: builderId, assignment: 'Edit the title', executionRole: 'specialist' },
    { agentId: verifierId, assignment: 'Verify the saved title', executionRole: 'verifier', verifiesAgentId: builderId }])
  assert.deepEqual((await pool.query('SELECT conversation_id,execution_conversation_id FROM artifacts WHERE id=$1', [deck.id])).rows,
    [{ conversation_id: 'slides-flow-source', execution_conversation_id: workspace.conversationId }])
  const update = await request(`/artifacts/${deck.id}/shared-state`, 'POST', { operationId: 'outline', changes: [{ field: 'outline', expectedVersion: 0, value: 'Evidence-based slides' }] })
  assert.equal(update.status, 200, await update.clone().text())
  const collaboration = await request(`/artifacts/${deck.id}/collaboration`)
  assert.equal(collaboration.status, 200)
  assert.match(await collaboration.text(), /Evidence-based slides/)
  const assignment = await request(`/artifacts/${deck.id}/assignments`, 'POST', { agentId: builderId, assignment: 'Edit the title from this room' })
  assert.equal(assignment.status, 200, await assignment.clone().text())
  const requests = (await pool.query("SELECT event FROM agent_native_event_outbox WHERE company_id=$1 AND event->>'artifactId'=$2 AND event->>'type'='im.user'", [companyId, deck.id])).rows
  assert.ok(requests.length > 0)
  assert.ok(requests.every(row => row.event.channelId === workspace.conversationId))

  const builder = work(builderId, workspace.conversationId), verifier = work(verifierId, workspace.conversationId)
  assert.equal((await loadArtifactRunContext(pool, builder))?.artifact_id, deck.id)
  assert.equal(await loadArtifactRunContext(pool, work(builderId, 'slides-flow-source')), null, 'a source-room turn cannot take a dedicated-room assignment')
  const path = 'project/slides/one.html'
  await invoke(builder, 'write_files', { artifactId: deck.id, files: { [path]: { content: '<section id="one"><h1>Verified title</h1></section>', ifMatch: null } } })
  const result = await invoke(builder, 'submit_report', { artifactId: deck.id, finding: 'Saved title', evidenceRefs: [{ kind: 'file', id: path }], confidence: 1 }) as { result: { id: string } }
  const verification = { artifactId: deck.id, finding: 'Read the saved title', evidenceRefs: [{ kind: 'file', id: path }], confidence: 1,
    verifiesReportId: result.result.id, disconfirmingChecks: ['Compared the saved file, not a chat claim'], verdict: 'supported' }
  await assert.rejects(invoke(builder, 'submit_verification', verification), /assigned role/)
  assert.equal((await loadArtifactRunContext(pool, verifier))?.artifact_id, deck.id)
  await invoke(verifier, 'submit_verification', verification)
  for (const current of [builder, verifier]) {
    const records = await createArtifactRuntime(lingxiOSControl).verify({ work: current, database: pool, requestVersion: 1,
      signal: AbortSignal.timeout(10_000) } as unknown as RunVerificationContext)
    assert.ok(records.length > 0 && records.every(record => record.status === 'passed'))
    await completeArtifactWork({ companyId, workId: current.id, status: 'completed' })
  }
  assert.equal((await pool.query('SELECT status FROM artifacts WHERE id=$1', [deck.id])).rows[0].status, 'completed')
  const progress = (await pool.query("SELECT event FROM agent_native_event_outbox WHERE company_id=$1 AND event->>'type'='im.system'", [companyId])).rows
  assert.ok(progress.length > 0 && progress.every(row => row.event.channelId === workspace.conversationId))
  assert.equal((await (await request(`/artifacts/${deck.id}/slides-workspace`, 'POST')).json() as typeof workspace).conversationId, workspace.conversationId)
})

test('opening a legacy active deck does not move its work, and unrelated rooms cannot become its execution scope', async () => {
  const deck = await createSlides({ companyId, projectId, conversationId: 'slides-flow-source', title: 'Legacy active', actorId: userId, origin: 'user' })
  await invoke(work(builderId, 'slides-flow-source'), 'start_workspace', { artifactId: deck.id, title: 'Legacy active', goal: 'Existing work',
    members: [{ agentId: builderId, assignment: 'Continue the existing assignment' }] })
  // Models the pre-upgrade row: new nullable column has no backfill.
  await pool.query('UPDATE artifacts SET execution_conversation_id=NULL WHERE id=$1', [deck.id])
  const workspace = await (await request(`/artifacts/${deck.id}/slides-workspace`, 'POST')).json() as { conversationId: string }
  assert.deepEqual((await pool.query('SELECT conversation_id,execution_conversation_id FROM artifacts WHERE id=$1', [deck.id])).rows,
    [{ conversation_id: 'slides-flow-source', execution_conversation_id: null }])
  assert.equal(await loadArtifactRunContext(pool, work(builderId, workspace.conversationId)), null)
  assert.equal((await loadArtifactRunContext(pool, work(builderId, 'slides-flow-source')))?.artifact_id, deck.id)
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('slides-unrelated',$1,$2,'group','Unrelated',$3::jsonb)`, [companyId, projectId, JSON.stringify([userId, builderId])])
  await assert.rejects(pool.query("UPDATE artifacts SET execution_conversation_id='slides-unrelated' WHERE id=$1", [deck.id]),
    (error: unknown) => (error as { code: string }).code === '23514')
})
