import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import express from 'express'
import { skillIndex, type ActionContext, type WorkItem, type RunVerificationContext } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { api } from '../api/router.js'
import { env } from '../env.js'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { lingxiOSControl, runtimeModelConfiguration } from '../agent-runtime/runtime.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { startNativeEventWorker } from '../agents/native-event-worker.js'
import { createNativeMessage, nativeText } from '../im/message-types.js'
import { artifactSkills } from '../modules/artifacts/skills.js'
import { artifactEditorRouter } from '../modules/artifacts/editor-router.js'
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
  const app = express(); app.use('/artifact-editor', artifactEditorRouter); app.use(express.json()); app.use('/api', api)
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
async function deliverUserEvents(events: { clientNonce: string; channelId: string }[]) {
  const delivery = startNativeEventWorker()
  try {
    const deadline = AbortSignal.timeout(10_000)
    while (true) {
      const pending = await pool.query(`SELECT id FROM agent_native_event_outbox
        WHERE event->>'clientNonce'=ANY($1::text[]) AND delivered_at IS NULL AND failed_at IS NULL`, [events.map(event => event.clientNonce)])
      if (!pending.rows.length) break
      deadline.throwIfAborted(); await delay(20)
    }
    for (const event of events) assert.ok(im.messages.some(message => message.clientMsgNo === event.clientNonce
      && message.channelId === event.channelId && message.fromUid === userId), 'queued user event must actually reach its execution room')
  } finally { await delivery.stop() }
}
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
  await deliverUserEvents(requests.map(row => row.event))

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
  const assignment = await request(`/artifacts/${deck.id}/assignments`, 'POST', { agentId: builderId, assignment: 'Continue the source-room work' })
  assert.equal(assignment.status, 200)
  const workspace = await (await request(`/artifacts/${deck.id}/slides-workspace`, 'POST')).json() as { conversationId: string }
  assert.deepEqual((await pool.query('SELECT conversation_id,execution_conversation_id FROM artifacts WHERE id=$1', [deck.id])).rows,
    [{ conversation_id: 'slides-flow-source', execution_conversation_id: null }])
  assert.equal(await loadArtifactRunContext(pool, work(builderId, workspace.conversationId)), null)
  assert.equal((await loadArtifactRunContext(pool, work(builderId, 'slides-flow-source')))?.artifact_id, deck.id)
  const requests = (await pool.query("SELECT event FROM agent_native_event_outbox WHERE event->>'artifactId'=$1 AND event->>'type'='im.user'", [deck.id])).rows
  assert.ok(requests.length > 0 && requests.every(row => row.event.channelId === 'slides-flow-source'))
  await deliverUserEvents(requests.map(row => row.event))
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('slides-unrelated',$1,$2,'group','Unrelated',$3::jsonb)`, [companyId, projectId, JSON.stringify([userId, builderId])])
  await assert.rejects(pool.query("UPDATE artifacts SET execution_conversation_id='slides-unrelated' WHERE id=$1", [deck.id]),
    (error: unknown) => (error as { code: string }).code === '23514')
})

test('a sent editor comment is delivered to the dedicated room through the real native event worker', async () => {
  const created = await request(`/projects/${projectId}/slides`, 'POST', { title: 'Comment delivery' })
  const deck = await created.json() as { id: string }
  const workspace = await (await request(`/artifacts/${deck.id}/slides-workspace`, 'POST')).json() as { conversationId: string }
  const grant = await (await request(`/artifacts/${deck.id}/editor-grant`, 'POST')).json() as { url: string }
  const response = await fetch(origin + grant.url + '__comments', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ anchor: 'slide:one', label: '第一页', text: '请修改选中标题。', send: true }) })
  assert.equal(response.status, 201)
  const requests = (await pool.query("SELECT event FROM agent_native_event_outbox WHERE event->>'artifactId'=$1 AND event->>'type'='im.user'", [deck.id])).rows
  assert.equal(requests.length, 1)
  assert.equal(requests[0].event.channelId, workspace.conversationId)
  await deliverUserEvents(requests.map(row => row.event))
  const snapshot = await (await fetch(origin + grant.url + '__comments')).json() as { threads: { agent?: { status: string } }[] }
  assert.equal(snapshot.threads[0]?.agent?.status, 'delivered')
})

test('authenticated message reaches the formal worker, loads the Slides skill, edits with CAS and replays the saved answer', { timeout: 60_000 }, async () => {
  const created = await request(`/projects/${projectId}/slides`, 'POST', { title: 'Model flow' })
  assert.equal(created.status, 201)
  const deck = await created.json() as { id: string }
  const workspace = await (await request(`/artifacts/${deck.id}/slides-workspace`, 'POST')).json() as { conversationId: string; agentId: string }
  const path = 'project/slides/selected.html', original = '<section id="selected"><h1>Original title</h1></section>'
  const revised = original.replace('Original title', 'Saved by the native Slides tool')
  await invoke(work(workspace.agentId, workspace.conversationId), 'write_files', { artifactId: deck.id, files: { [path]: { content: original, ifMatch: null } } })
  const hash = (await pool.query('SELECT sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [deck.id, path])).rows[0].sha256 as string
  const context = await request(`/artifacts/${deck.id}/editor-context`, 'PUT', { slideId: 'selected', selectedElementIds: ['heading'],
    selectedText: 'Original title', selection: [{ id: 'heading', kind: 'text', label: 'Original title' }], mode: 'edit', dirty: false, version: null })
  assert.equal(context.status, 200)
  const { name, version, hash: skillHash } = skillIndex(artifactSkills.find(skill => skill.name === 'claude-slides')!)
  const calls = [
    { name: 'skills__load', args: { name, version, hash: skillHash } },
    { name: 'slides__read_file', args: { artifactId: deck.id, path } },
    { name: 'slides__write_files', args: { artifactId: deck.id, files: { [path]: { content: revised, ifMatch: hash } } } },
    { name: 'slides__read_file', args: { artifactId: deck.id, path } },
    { name: 'public_answer', args: { operation: { kind: 'append', supersedes: [] }, commentary: '',
      answer: '已保存并重新读取选中页面的标题。', outcome: { status: 'satisfied', gaps: [] } } },
  ]
  let issued = 0
  const providerErrors: string[] = []
  const provider = createServer(async (req, res) => {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk
      const input = JSON.parse(raw), step = calls[issued++]
      assert.ok(step, 'worker must stop after the verified public answer')
      assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === step.name), `missing tool ${step.name}`)
      const prompt = JSON.stringify(input.messages)
      assert.ok(prompt.includes('Original title'), 'persisted editor selection/source must reach the actual model request')
      if (issued === 3) assert.ok(prompt.includes(hash), 'the model must receive the preceding read receipt')
      if (issued === 5) assert.ok(prompt.includes('Saved by the native Slides tool'), 'read-back must reach the model before completion')
      const call = { id: `slides-model-${issued}`, type: 'function', function: { name: step.name, arguments: JSON.stringify(step.args) } }
      const usage = { prompt_tokens: 10, completion_tokens: 12 }
      res.writeHead(200, { 'content-type': input.stream ? 'text/event-stream' : 'application/json' })
      res.end(input.stream ? `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, ...call }] }, finish_reason: 'tool_calls' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`
        : JSON.stringify({ choices: [{ message: { role: 'assistant', tool_calls: [call] }, finish_reason: 'tool_calls' }], usage }))
    } catch (error) { providerErrors.push(error instanceof Error ? error.message : 'provider fixture failed'); res.writeHead(500); res.end('{}') }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const clientNonce = randomUUID(), payload = createNativeMessage({ id: clientNonce, role: 'user', content: [{ type: 'text', text: '请修改当前选中页的标题，保存后重新读取确认。' }] })
    const accepted = await request(`/im/channels/${workspace.conversationId}/messages/accept`, 'POST', { clientNonce, payload })
    assert.equal(accepted.status, 202, await accepted.clone().text())
    assert.ok(im.messages.some(message => message.clientMsgNo === clientNonce && message.fromUid === userId))
    const received = await receiveAgentRequest({ companyId, agentId: workspace.agentId, channelId: workspace.conversationId, clientMsgNo: clientNonce, authenticatedUserId: userId })
    assert.ok('runs' in received && received.runs.length === 1)
    const run = received.runs[0], control = await lingxiOSControl(), address = provider.address()
    assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: control, policy: new ProductRuntimePolicy(), model: {
      ...runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash', apiKey: 'isolated-slides-fixture', baseUrl: 'https://api.siliconflow.cn/v1' }, 90_000),
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
    }, worker: { id: 'slides-product-flow', concurrency: 1 } })
    assert.equal(await worker.runNext(), true)
    assert.deepEqual(providerErrors, [])
    assert.equal((await control.readRun(run))?.status, 'succeeded')
    assert.equal(issued, calls.length)
    const deadline = AbortSignal.timeout(5000)
    while ((await control.readRunState(run))?.delivery !== 'delivered') { deadline.throwIfAborted(); await delay(20) }
    const saved = (await pool.query('SELECT body,sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [deck.id, path])).rows[0]
    assert.equal(saved.body.toString('utf8'), revised); assert.notEqual(saved.sha256, hash)
    assert.ok(im.messages.some(message => message.channelId === workspace.conversationId && message.fromUid === workspace.agentId && nativeText(message.payload).includes('已保存')))
    const replay = await request(`/im/channels/${workspace.conversationId}/agents/${workspace.agentId}/runs/${run.runId}`)
    assert.equal(replay.status, 200, await replay.clone().text())
    assert.match(await replay.text(), /已保存/)
    // Memory retrieval can independently add an embedding receipt in a live
    // configured environment. Count the five actual worker chat requests.
    const ledger = await pool.query("SELECT count(*)::int AS n FROM llm_calls WHERE run_id=$1 AND purpose='lingxios.agent-turn'", [run.runId])
    assert.equal(ledger.rows[0].n, calls.length)
    const duplicate = await receiveAgentRequest({ companyId, agentId: workspace.agentId, channelId: workspace.conversationId, clientMsgNo: clientNonce, authenticatedUserId: userId })
    assert.equal(duplicate.deduplicated, true)
    assert.equal(await worker.runNext(), false)
    assert.equal(issued, calls.length)
  } finally { await worker?.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())) }
})
