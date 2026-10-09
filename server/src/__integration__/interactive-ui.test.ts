import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { createNativeMessage } from '../im/message-types.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { wukongClient } from '../im/wukong.js'
import { commitUiRevisions, getUiState, reconcileUiDelivery, reserveUiRevisions, submitUiAction } from '../im/interactive-ui.js'
import { assertUiInteractionAdmission } from '../im/interactive-ui-admission.js'
import { WukongWebhookApplication } from '../im/webhook-application.js'
import { enqueueAgentWakes } from '../agent-runtime/ingress.js'
import { ensureTeacherAgentForCourse } from '../modules/learning/teacher-agent-application.js'
import { OPENUI_CATALOG_VERSION, OPENUI_COMPONENT, OPENUI_RENDERER_VERSION } from '../../../src/lib/interactive-ui/catalog.js'
import { parseLessonSource } from '../../../src/lib/interactive-ui/source.js'
import type { OpenUiEnvelope, UiState, UiStateResponse } from '../../../src/lib/interactive-ui/protocol.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure modes: unconfirmed previews; competing/stale revisions; forged source/hash/action;
// tenant, project, learner or revoked access; shared personal state; stale saves;
// incompatible parameter recovery; duplicate actions or nonce collisions; ACK loss;
// cancelled/failed runs, another learner's continuation or the wrong request version;
// unadmitted generic ingress; data mentions waking other agents; and publishing a revision with another run's identity.
let server: Server, baseUrl: string, recording: Awaited<ReturnType<typeof installRecordingWukong>>
let companyId: string, projectId: string, agentId: string
const channelId = 'interactive-ui-room'
const expectedChecks = ['personal-state-and-recovery', 'action-admission', 'action-recipient-authority', 'student-teacher-room-and-scope', 'pending-publication', 'action-lost-ACK', 'dispatch-unknown', 'concurrent-writes', 'runtime-control-admission']
const completedChecks: string[] = []
const startedAt = new Date().toISOString()
async function writeEvidence() {
  await mkdir('artifacts/interactive-ui', { recursive: true })
  await writeFile('artifacts/interactive-ui/persistence.json', JSON.stringify({
    passed: completedChecks.length === expectedChecks.length, startedAt, expectedChecks, completedChecks,
    command: 'npm run test:integration -- --file interactive-ui.test.ts',
  }, null, 2))
}
before(async () => {
  await writeEvidence()
  await ensureSchemaOnce(); await resetAllTables()
  recording = await installRecordingWukong()
  const seeded = await seedCompanyWithAgent()
  ;({ companyId, projectId, agentId } = seeded)
  await seedUserMembership('test-owner', companyId)
  await seedUserMembership('ui-peer', companyId)
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'ui-peer','TEACHER')`, [projectId, companyId])
  const members = ['test-owner', 'ui-peer', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
    [channelId, companyId, JSON.stringify({ members, channelType: 2 }), agentId])
  server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})
after(async () => { await writeEvidence(); await recording?.close(); await teardownAll(server) })

function source(uiId: string, revision: number, semantic = 'projectile.angle') {
  return `$angle = 30\nroot = Lesson("抛射实验", "无空气阻力且起落等高时，45°射程最大。", [angle, plot, explain]${revision > 1 ? `, ${JSON.stringify(uiId)}, ${revision - 1}` : ''})
angle = Parameter("angle", "角度", $angle, 0, 90, 1, "°", ${JSON.stringify(semantic)})
plot = ProjectilePlot($angle, 20, 9.81, 0)
explain = LearningAction("explain", "explain", "解释当前结果")`
}

async function draft(uiId: string, revision: number, semantic?: string, text = source(uiId, revision, semantic)) {
  const runId = `${uiId}-run-${revision}`, lesson = parseLessonSource(text)
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES($1,$2,$3,$3,$4,'test-owner',2) ON CONFLICT DO NOTHING`, [runId, companyId, channelId, agentId])
  const envelope: OpenUiEnvelope = {
    schemaVersion: 1, catalogVersion: OPENUI_CATALOG_VERSION, rendererVersion: OPENUI_RENDERER_VERSION,
    uiId, runId, messageId: `run-${runId}`, revision, baseRevision: revision - 1,
    source: text, sourceHash: createHash('sha256').update(text).digest('hex'), fallback: lesson.fallback,
    phase: 'ready', fields: lesson.fields, actions: lesson.actions,
  }
  const payload = createNativeMessage({ id: envelope.messageId, role: 'assistant',
    content: [{ type: 'generative-ui', spec: { root: { component: OPENUI_COMPONENT, props: envelope } } }],
    custom: { runId, controlPrincipalId: 'test-owner', harness: { requestVersion: 1 } } })
  return { envelope, payload, identity: { companyId, channelId, agentId, runId, clientNonce: `delivery-${runId}`,
    resultId: `result-${runId}`, fence: 1, envelopes: [envelope] } }
}

async function publish(uiId: string, revision: number, semantic?: string) {
  const lesson = await draft(uiId, revision, semantic)
  assert.equal(await reserveUiRevisions(lesson.identity), 'reserved')
  const result = await imMessagesApplication.acceptAgentMessage({ companyId, userId: agentId, channelId,
    clientNonce: lesson.identity.clientNonce, payload: lesson.payload })
  assert.equal(result.kind, 'accepted')
  if (result.kind !== 'accepted') throw new Error('test message was not accepted')
  await commitUiRevisions({ ...lesson.identity, messageId: String(result.echo.messageId) })
  return lesson
}

const reference = (envelope: OpenUiEnvelope) => ({ messageId: envelope.messageId, revision: envelope.revision, sourceHash: envelope.sourceHash })
const headers = () => ({ 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId })
function stateUrl(envelope: OpenUiEnvelope) {
  return `${baseUrl}/api/im/channels/${channelId}/ui/${envelope.uiId}/state?${new URLSearchParams({ ...reference(envelope), revision: String(envelope.revision) })}`
}
function action(envelope: OpenUiEnvelope, idempotencyKey: string, state: UiState = { $angle: 60 }) {
  return fetch(`${baseUrl}/api/im/channels/${channelId}/ui/${envelope.uiId}/actions`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ ...reference(envelope), actionId: 'explain', idempotencyKey, state }),
  })
}

test('personal state is scoped, conditionally saved, and restored only across compatible revisions', async () => {
  const first = await publish('state-lesson', 1)
  const read = await fetch(stateUrl(first.envelope), { headers: headers() })
  assert.equal(read.status, 200)
  assert.deepEqual(await read.json(), { state: { $angle: 30 }, version: 0, readOnly: false, status: 'committed', resetKeys: [] })
  const save = (expectedVersion: number) => fetch(stateUrl(first.envelope).split('?')[0], { method: 'PUT', headers: headers(),
    body: JSON.stringify({ ...reference(first.envelope), expectedVersion, state: { $angle: 60 } }) })
  assert.equal((await save(0)).status, 200)
  assert.equal((await save(0)).status, 409)
  assert.deepEqual((await getUiState({ companyId, channelId, userId: 'ui-peer', uiId: first.envelope.uiId,
    reference: reference(first.envelope) })).state, { $angle: 30 })
  const second = await publish('state-lesson', 2)
  const restored = await fetch(stateUrl(second.envelope), { headers: headers() })
  assert.deepEqual(await restored.json(), { state: { $angle: 60 }, version: 1, readOnly: false, status: 'committed', resetKeys: [] })
  assert.equal((await save(1)).status, 409)
  const oldState = await (await fetch(stateUrl(first.envelope), { headers: headers() })).json() as UiStateResponse
  assert.equal(oldState.status, 'superseded'); assert.equal(oldState.readOnly, true)
  const third = await publish('state-lesson', 3, 'another-physical-angle')
  const reset = await (await fetch(stateUrl(third.envelope), { headers: headers() })).json() as UiStateResponse
  assert.deepEqual(reset.state, { $angle: 30 }); assert.deepEqual(reset.resetKeys, ['$angle'])
  assert.ok([403, 404].includes((await fetch(stateUrl(third.envelope), { headers: { ...headers(), 'x-company-id': 'outside' } })).status))
  assert.ok([403, 404].includes((await fetch(stateUrl(third.envelope), { headers: { ...headers(), 'x-project-id': 'outside' } })).status))
  const forgedHash = { ...third.envelope, sourceHash: '0'.repeat(64) }
  assert.equal((await fetch(stateUrl(forgedHash), { headers: headers() })).status, 409)
  completedChecks.push('personal-state-and-recovery')
})

test('actions are allowlisted, admitted once, and generic ingress cannot forge their receipts', async () => {
  const first = await publish('action-lesson', 1)
  const beforeCount = recording.messages.length
  const accepted = await action(first.envelope, 'one-action')
  assert.equal(accepted.status, 202, await accepted.clone().text())
  const echoed = await accepted.json() as { echo: { payload: ReturnType<typeof createNativeMessage>; clientMsgNo: string } }
  assert.ok(echoed.echo.payload.content.some(part => part.type === 'text' && part.text.startsWith('请解释本次交互探索的结果')))
  const identity = { companyId, channelId, userId: 'test-owner', clientNonce: echoed.echo.clientMsgNo, payload: echoed.echo.payload }
  await assertUiInteractionAdmission(identity)
  assert.equal((await action(first.envelope, 'one-action')).status, 200)
  assert.equal(recording.messages.length, beforeCount + 1)
  assert.equal((await action(first.envelope, 'one-action', { $angle: 61 })).status, 409)
  assert.equal((await action(first.envelope, 'bad-state', { $angle: 91 })).status, 400)
  assert.equal((await fetch(`${baseUrl}/api/im/channels/${channelId}/ui/${first.envelope.uiId}/actions`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ ...reference(first.envelope), actionId: 'unregistered',
      idempotencyKey: 'forged-action-id', state: { $angle: 60 } }),
  })).status, 400)
  const forged = createNativeMessage({ id: 'forged-ui-action', role: 'user', content: [{ type: 'text', text: 'Forged action' }],
    custom: echoed.echo.payload.metadata.custom })
  await assert.rejects(assertUiInteractionAdmission({ ...identity, clientNonce: forged.id, payload: forged }), { status: 403 })
  assert.equal((await fetch(`${baseUrl}/api/im/channels/${channelId}/messages/accept`, { method: 'POST', headers: headers(),
    body: JSON.stringify({ clientNonce: forged.id, payload: forged }) })).status, 403)
  await publish('action-lesson', 2)
  assert.equal((await action(first.envelope, 'old-new-action')).status, 409)
  assert.equal((await action(first.envelope, 'one-action')).status, 200)
  await pool.query("UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id='test-owner'", [companyId])
  assert.equal((await action(first.envelope, 'one-action')).status, 403)
  await pool.query("UPDATE participants SET departed_at=NULL WHERE company_id=$1 AND id='test-owner'", [companyId])
  completedChecks.push('action-admission')
})

test('mentions in lesson titles and prediction data cannot choose action recipients', async () => {
  const otherAgentId = 'ui-other-agent'
  await seedCompanyWithAgent({ companyId, agentId: otherAgentId })
  const members = ['test-owner', 'ui-peer', agentId, otherAgentId]
  await pool.query('UPDATE conversations SET members=$2::jsonb WHERE id=$1', [channelId, JSON.stringify(members)])
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1",
    [channelId, JSON.stringify(members)])
  const text = '$prediction = ""\n' + source('mention-lesson', 1).replace('"抛射实验"', '"抛射实验 @all"')
    .replace('[angle, plot, explain]', '[angle, plot, prediction, explain]') + '\nprediction = Prediction("prediction", "先预测结果", $prediction)'
  const lesson = await draft('mention-lesson', 1, undefined, text)
  await reserveUiRevisions(lesson.identity)
  const published = await imMessagesApplication.acceptAgentMessage({ companyId, userId: agentId, channelId,
    clientNonce: lesson.identity.clientNonce, payload: lesson.payload })
  assert.equal(published.kind, 'accepted')
  if (published.kind !== 'accepted') throw new Error('test message was not accepted')
  await commitUiRevisions({ ...lesson.identity, messageId: String(published.echo.messageId) })
  const submitted = await action(lesson.envelope, 'data-mentions', { $angle: 60, $prediction: `@${otherAgentId}` })
  assert.equal(submitted.status, 202, await submitted.clone().text())
  const { echo } = await submitted.json() as { echo: { clientMsgNo: string; payload: ReturnType<typeof createNativeMessage> } }
  const application = new WukongWebhookApplication({
    transaction: work => withTransaction(pool, work), verify: () => true, isKnowledgeAttachment: () => false,
    createKnowledgeJob: async () => { throw new Error('UI action must not create knowledge jobs') },
    enqueueAgentWakes, flushAgentWakes: async () => 0,
  })
  const eventId = 'ui-action-data-mentions'
  const result = await application.process({ eventId, eventType: 'msg.notify', channelId, fromUid: 'test-owner',
    clientMsgNo: echo.clientMsgNo, payload: echo.payload, raw: Buffer.from(JSON.stringify(echo)) })
  assert.deepEqual(result.recipients, [agentId])
  assert.deepEqual((await pool.query('SELECT agent_id FROM lingxios_ingress_outbox WHERE event_id=$1 ORDER BY agent_id', [eventId])).rows,
    [{ agent_id: agentId }])
  completedChecks.push('action-recipient-authority')
})

test('real student, teacher-room, conversation and tenant scopes remain authoritative for UI requests', async () => {
  const first = await publish('scope-lesson', 1)
  const foreign = await seedCompanyWithAgent({ companyId: 'ui-foreign-company', agentId: 'ui-foreign-agent' })
  await assert.rejects(getUiState({ companyId: foreign.companyId, channelId, userId: 'test-owner',
    uiId: first.envelope.uiId, reference: reference(first.envelope) }), error => [403, 404].includes((error as { status: number }).status))
  const otherRoom = 'ui-other-room', otherMembers = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [otherRoom, companyId, projectId, JSON.stringify(otherMembers)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
    [otherRoom, companyId, JSON.stringify({ members: otherMembers, channelType: 2 }), agentId])
  await assert.rejects(getUiState({ companyId, channelId: otherRoom, userId: 'test-owner',
    uiId: first.envelope.uiId, reference: reference(first.envelope) }), { status: 404 })

  const studentId = 'ui-student', teacherProjectId = 'ui-teacher-project', courseId = 'ui-teacher-course'
  await seedUserMembership(studentId, companyId, { role: 'STUDENT', isAdmin: false })
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by) VALUES($1,$2,'INSTITUTIONAL_COURSE','UI teacher course','test-owner')`,
    [teacherProjectId, companyId])
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES($1,$2,$3,'test-owner')`,
    [courseId, companyId, teacherProjectId])
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role)
    VALUES($1,$2,'test-owner','TEACHER'),($1,$2,$3,'STUDENT')`, [teacherProjectId, companyId, studentId])
  const teacher = await ensureTeacherAgentForCourse(companyId, courseId, pool, work => withTransaction(pool, work))
  // Even a stale room membership snapshot must not grant a student teacher authority.
  await pool.query('UPDATE conversations SET members=members || to_jsonb(ARRAY[$2::text]) WHERE id=$1', [teacher.roomId, studentId])
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',(profile->'members') || to_jsonb(ARRAY[$2::text])) WHERE channel_id=$1",
    [teacher.roomId, studentId])
  const lesson = await draft('teacher-room-lesson', 1)
  await pool.query('UPDATE agent_run_bindings SET conversation_id=$2,session_id=$2,agent_id=$3 WHERE run_id=$1',
    [lesson.identity.runId, teacher.roomId, teacher.agentId])
  const delivery = { ...lesson.identity, channelId: teacher.roomId, agentId: teacher.agentId }
  await reserveUiRevisions(delivery)
  const published = await imMessagesApplication.acceptAgentMessage({ companyId, userId: teacher.agentId, channelId: teacher.roomId,
    clientNonce: delivery.clientNonce, payload: lesson.payload })
  assert.equal(published.kind, 'accepted')
  if (published.kind !== 'accepted') throw new Error('teacher lesson was not accepted')
  await commitUiRevisions({ ...delivery, messageId: String(published.echo.messageId) })
  const caller = { companyId, channelId: teacher.roomId, uiId: lesson.envelope.uiId }
  assert.equal((await getUiState({ ...caller, userId: 'test-owner', reference: reference(lesson.envelope) })).readOnly, false)
  await assert.rejects(submitUiAction({ ...caller, userId: 'test-owner', request: { ...reference(lesson.envelope),
    actionId: 'teacher.review_evaluation', idempotencyKey: 'not-a-teacher-approval', state: { $angle: 60 } } }), { status: 400 })

  const studentServer = createServer(await buildApiTestApp(studentId))
  await new Promise<void>(resolve => studentServer.listen(0, '127.0.0.1', resolve))
  try {
    const address = studentServer.address(); assert.ok(address && typeof address === 'object')
    const path = `http://127.0.0.1:${address.port}/api/im/channels/${teacher.roomId}/ui/${lesson.envelope.uiId}`
    const scopedHeaders = { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': teacherProjectId }
    const query = new URLSearchParams({ ...reference(lesson.envelope), revision: String(lesson.envelope.revision) })
    const requests = [
      fetch(`${path}/state?${query}`, { headers: scopedHeaders }),
      fetch(`${path}/state`, { method: 'PUT', headers: scopedHeaders,
        body: JSON.stringify({ ...reference(lesson.envelope), expectedVersion: 0, state: { $angle: 60 } }) }),
      fetch(`${path}/actions`, { method: 'POST', headers: scopedHeaders,
        body: JSON.stringify({ ...reference(lesson.envelope), actionId: 'explain', idempotencyKey: 'student-in-teacher-room', state: { $angle: 60 } }) }),
    ]
    assert.ok((await Promise.all(requests)).every(response => [403, 404].includes(response.status)))
    assert.deepEqual((await pool.query(`SELECT
      (SELECT count(*)::int FROM im_ui_user_states WHERE company_id=$1 AND channel_id=$2 AND user_id=$3) AS states,
      (SELECT count(*)::int FROM im_send_acceptances WHERE company_id=$1 AND channel_id=$2 AND user_id=$3) AS actions`,
    [companyId, teacher.roomId, studentId])).rows, [{ states: 0, actions: 0 }])
  } finally { await new Promise<void>((resolve, reject) => studentServer.close(error => error ? reject(error) : resolve())) }
  completedChecks.push('student-teacher-room-and-scope')
})

test('pending delivery fences actions, survives ACK loss, and commits only the original recorded message', async () => {
  const first = await publish('pending-lesson', 1)
  const second = await draft('pending-lesson', 2)
  assert.equal(await reserveUiRevisions(second.identity), 'reserved')
  assert.equal(await reserveUiRevisions(second.identity), 'pending')
  assert.equal(await reconcileUiDelivery(second.identity), null)
  assert.equal((await action(first.envelope, 'while-pending')).status, 409)
  const pendingState = await (await fetch(stateUrl(first.envelope), { headers: headers() })).json() as UiStateResponse
  assert.equal(pendingState.status, 'pending'); assert.equal(pendingState.readOnly, true)
  await assert.rejects(reserveUiRevisions({ ...second.identity, fence: 2 }), { status: 409 })
  const sent = await imMessagesApplication.acceptAgentMessage({ companyId, userId: agentId, channelId,
    clientNonce: second.identity.clientNonce, payload: second.payload })
  assert.equal(sent.kind, 'accepted')
  if (sent.kind !== 'accepted') throw new Error('missing accepted echo')
  // Simulate a lost acceptance ACK; the authoritative IM message still exists.
  await pool.query(`UPDATE im_send_acceptances SET status='pending',echo=NULL
    WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`, [companyId, agentId, second.identity.clientNonce])
  const count = recording.messages.length
  assert.deepEqual(await reconcileUiDelivery(second.identity), { messageId: String(sent.echo.messageId) })
  assert.equal(recording.messages.length, count)
  assert.equal(await reserveUiRevisions(second.identity), 'committed')
  assert.equal((await action(second.envelope, 'after-confirmation')).status, 202)
  completedChecks.push('pending-publication')
})

test('an action whose send lost its ACK is reconciled without a second human message', async t => {
  const lesson = await publish('action-ack-lesson', 1)
  const client = wukongClient(), send = client.sendMessage.bind(client), count = recording.messages.length
  const lostAck = t.mock.method(client, 'sendMessage', async (...args: Parameters<typeof client.sendMessage>) => {
    await send(...args)
    throw new Error('fixture ACK lost after durable write')
  })
  assert.equal((await action(lesson.envelope, 'lost-action-ack')).status, 500)
  lostAck.mock.restore()
  assert.equal((await action(lesson.envelope, 'lost-action-ack')).status, 200)
  assert.equal(recording.messages.length, count + 1)
  completedChecks.push('action-lost-ACK')
})

test('native UI dispatch reconciles a lost ACK and does not retry an unconfirmed absent message', async t => {
  const lesson = await draft('dispatch-ack-lesson', 1)
  await reserveUiRevisions(lesson.identity)
  const input = { companyId, userId: agentId, channelId, clientNonce: lesson.identity.clientNonce, payload: lesson.payload }
  const client = wukongClient(), send = client.sendMessage.bind(client), count = recording.messages.length
  const lostAck = t.mock.method(client, 'sendMessage', async (...args: Parameters<typeof client.sendMessage>) => {
    await send(...args)
    throw new Error('fixture ACK lost after durable write')
  })
  await assert.rejects(imMessagesApplication.acceptAgentMessage(input), /fixture ACK lost/)
  lostAck.mock.restore()
  const reconciled = await imMessagesApplication.acceptAgentMessage(input)
  assert.equal(reconciled.kind, 'accepted')
  if (reconciled.kind !== 'accepted') throw new Error('missing reconciled message')
  assert.equal(reconciled.duplicate, true)
  assert.equal(recording.messages.length, count + 1)
  await commitUiRevisions({ ...lesson.identity, messageId: String(reconciled.echo.messageId) })

  const absent = await draft('dispatch-absent-lesson', 1)
  await reserveUiRevisions(absent.identity)
  const missingInput = { ...input, clientNonce: absent.identity.clientNonce, payload: absent.payload }
  const noAck = t.mock.method(client, 'sendMessage', async () => { throw new Error('fixture unknown dispatch') })
  await assert.rejects(imMessagesApplication.acceptAgentMessage(missingInput), /fixture unknown dispatch/)
  noAck.mock.restore()
  await assert.rejects(imMessagesApplication.acceptAgentMessage(missingInput))
  assert.equal(recording.messages.length, count + 1)
  assert.equal(await reserveUiRevisions(absent.identity), 'pending')
  assert.equal(await reconcileUiDelivery(absent.identity), null)
  completedChecks.push('dispatch-unknown')
})

test('competing revisions and same-version state writes admit exactly one winner', async () => {
  const first = await publish('concurrent-lesson', 1)
  const writes = await Promise.all([60, 70].map(angle => fetch(stateUrl(first.envelope).split('?')[0], {
    method: 'PUT', headers: headers(), body: JSON.stringify({ ...reference(first.envelope), expectedVersion: 0, state: { $angle: angle } }),
  })))
  assert.deepEqual(writes.map(result => result.status).sort(), [200, 409])
  const next = await draft('concurrent-lesson', 2)
  const revisions = await Promise.allSettled([
    reserveUiRevisions({ ...next.identity, resultId: 'left-result' }),
    reserveUiRevisions({ ...next.identity, resultId: 'right-result' }),
  ])
  assert.equal(revisions.filter(result => result.status === 'fulfilled').length, 1)
  const rejected = revisions.find(result => result.status === 'rejected')
  assert.equal(rejected?.status === 'rejected' ? (rejected.reason as { status: number }).status : undefined, 409)
  completedChecks.push('concurrent-writes')
})

test('runtime control rejects cancelled or failed runs and binds only the original waiting request', async t => {
  const lesson = await publish('runtime-control-lesson', 1)
  const { lingxiOSControl } = await import('../agent-runtime/runtime.js')
  const api = await lingxiOSControl(), originalRead = api.readRun
  const snapshot: NonNullable<Awaited<ReturnType<typeof api.readRun>>> = {
    id: lesson.identity.runId, fence: 1, resultId: lesson.identity.resultId, resultFence: 1,
    status: 'cancelled', requestVersion: 1, kind: 'message', attempts: 1,
    createdAt: new Date().toISOString(), availableAt: new Date().toISOString(), heartbeatAt: null,
    lastProgressAt: null, goalOutcome: null, error: null,
  }
  t.mock.method(api, 'readRun', async (...args: Parameters<typeof api.readRun>) =>
    args[0].runId === lesson.identity.runId ? snapshot : originalRead(...args))
  assert.equal((await action(lesson.envelope, 'cancelled-new-action')).status, 409)
  snapshot.status = 'failed'
  assert.equal((await action(lesson.envelope, 'failed-new-action')).status, 409)
  snapshot.status = 'waiting'
  snapshot.goalOutcome = { status: 'awaiting_input', requestVersion: 1, verification: 'not_run' }
  await assert.rejects(submitUiAction({ companyId, channelId, userId: 'ui-peer', uiId: lesson.envelope.uiId,
    request: { ...reference(lesson.envelope), actionId: 'explain', idempotencyKey: 'peer-continuation', state: { $angle: 60 } } }), { status: 403 })
  const continued = await action(lesson.envelope, 'matching-continuation')
  assert.equal(continued.status, 202)
  const continuation = await continued.json() as { echo: { payload: ReturnType<typeof createNativeMessage> } }
  assert.deepEqual(continuation.echo.payload.metadata.custom.agentContinuation,
    { agentId, runId: lesson.identity.runId, requestVersion: 1 })
  snapshot.requestVersion = 2
  snapshot.goalOutcome.requestVersion = 2
  const historical = await action(lesson.envelope, 'historical-new-turn')
  assert.equal(historical.status, 202)
  assert.equal((await historical.json() as { echo: { payload: ReturnType<typeof createNativeMessage> } }).echo.payload.metadata.custom.agentContinuation, undefined)
  completedChecks.push('runtime-control-admission')
})
