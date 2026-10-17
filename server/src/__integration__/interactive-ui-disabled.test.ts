import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import type { AssistantMessage, DeliveryPort } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { createNativeMessage } from '../im/message-types.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { messageAcceptanceDigest } from '../im/messages-digest.js'
import { acceptSend, ensureSendAcceptance } from '../im/messages-repository.js'
import { commitUiRevisions } from '../im/interactive-ui.js'
import { assertUiInteractionAdmission } from '../im/interactive-ui-admission.js'
import { WukongWebhookApplication } from '../im/webhook-application.js'
import { wukongWebhookRouter } from '../im/webhook.js'
import { enqueueAgentWakes } from '../agent-runtime/ingress.js'
import { createProductContext } from '../agent-runtime/context.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { wukongClient } from '../im/wukong.js'
import { OPENUI_CATALOG_VERSION, OPENUI_COMPONENT, OPENUI_RENDERER_VERSION } from '../../../src/lib/interactive-ui/catalog.js'
import { parseLessonSource } from '../../../src/lib/interactive-ui/source.js'
import type { OpenUiEnvelope } from '../../../src/lib/interactive-ui/protocol.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure inventory: old controls still read/write or execute; an admitted receipt
// bypasses shutdown; prompts advertise generation/revisions; historical rows vanish;
// immutable delivery retries change payload or resend an unknown effect.
let server: Server, origin: string, companyId: string, projectId: string, agentId: string
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
const channelId = 'disabled-ui-room'
const source = '$angle = 30\nroot = Lesson("对比", "两者有共同点和区别。", [angle, explain])\nangle = Parameter("angle", "角度", $angle, 0, 90, 1, "°", "projectile.angle")\nexplain = LearningAction("explain", "explain", "解释当前结果")'
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  recording = await installRecordingWukong()
  ;({ companyId, projectId, agentId } = await seedCompanyWithAgent())
  await seedUserMembership('test-owner', companyId)
  await pool.query("UPDATE participants SET capabilities='[]'::jsonb WHERE id=$1", [agentId])
  const members = ['test-owner', agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  const app = await buildApiTestApp('test-owner')
  app.use('/webhooks/wukong', wukongWebhookRouter)
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
})
after(async () => { await recording?.close(); await teardownAll(server) })

function legacy(uiId: string, runId = `${uiId}-run`, fence = 1) {
  const lesson = parseLessonSource(source), clientNonce = `delivery-${runId}`, resultId = `result-${runId}`
  const envelope: OpenUiEnvelope = { schemaVersion: 1, catalogVersion: OPENUI_CATALOG_VERSION, rendererVersion: OPENUI_RENDERER_VERSION,
    uiId, messageId: `run-${runId}`, runId, revision: 1, baseRevision: 0, source,
    sourceHash: createHash('sha256').update(source).digest('hex'), fallback: lesson.fallback, phase: 'ready', fields: lesson.fields, actions: lesson.actions }
  const payload = createNativeMessage({ id: envelope.messageId, role: 'assistant', content: [{ type: 'generative-ui', spec: { root: { component: OPENUI_COMPONENT, props: envelope } } }],
    custom: { runId, controlPrincipalId: 'test-owner', harness: { requestVersion: 1 } } })
  return { envelope, payload, identity: { companyId, channelId, agentId, runId, clientNonce, resultId, fence, envelopes: [envelope] } }
}
async function seedRevision(value: ReturnType<typeof legacy>) {
  const { identity: input, envelope } = value
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES($1,$2,$3,$3,$4,'test-owner',2) ON CONFLICT DO NOTHING`, [input.runId, companyId, channelId, agentId])
  // Emulate a reservation made before shutdown, without reopening production admission.
  await pool.query(`INSERT INTO im_ui_revisions(company_id,channel_id,ui_id,revision,base_revision,native_message_id,run_id,agent_id,result_id,fence,client_nonce,source_hash)
    VALUES($1,$2,$3,1,0,$4,$5,$6,$7,$8,$9,$10)`, [companyId, channelId, envelope.uiId, envelope.messageId, input.runId, agentId, input.resultId, input.fence, input.clientNonce, envelope.sourceHash])
}
const headers = () => ({ 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId })
const counts = async () => (await pool.query(`SELECT
  (SELECT count(*)::int FROM im_ui_revisions WHERE company_id=$1) AS revisions,
  (SELECT count(*)::int FROM im_ui_user_states WHERE company_id=$1) AS states,
  (SELECT count(*)::int FROM im_send_acceptances WHERE company_id=$1) AS sends,
  (SELECT count(*)::int FROM lingxios_ingress_outbox WHERE company_id=$1) AS wakes`, [companyId])).rows

test('disabled state/action endpoints preserve authorization and historical messages without effects', async () => {
  const value = legacy('historical-controls')
  await seedRevision(value)
  const sent = await imMessagesApplication.acceptAgentMessage({ companyId, userId: agentId, channelId, clientNonce: value.identity.clientNonce, payload: value.payload })
  assert.equal(sent.kind, 'accepted'); if (sent.kind !== 'accepted') throw new Error('missing historical message')
  await commitUiRevisions({ ...value.identity, messageId: String(sent.echo.messageId) })
  await pool.query(`INSERT INTO im_ui_user_states(company_id,channel_id,ui_id,user_id,revision,state,version)
    VALUES($1,$2,$3,'test-owner',1,'{"$angle":30}',1)`, [companyId, channelId, value.envelope.uiId])
  const reference = { messageId: value.envelope.messageId, revision: 1, sourceHash: value.envelope.sourceHash }
  const state = `${origin}/api/im/channels/${channelId}/ui/${value.envelope.uiId}/state`
  const before = await counts(), writes = recording.messages.length
  const read = await fetch(`${state}?${new URLSearchParams({ ...reference, revision: '1' })}`, { headers: headers() })
  assert.equal(read.status, 410)
  assert.equal((await fetch(state, { method: 'PUT', headers: headers(), body: JSON.stringify({ ...reference, expectedVersion: 1, state: { $angle: 60 } }) })).status, 410)
  assert.equal((await fetch(state.replace('/state', '/actions'), { method: 'POST', headers: headers(), body: JSON.stringify({ ...reference, actionId: 'explain', idempotencyKey: 'old-button', state: { $angle: 60 } }) })).status, 410)
  assert.ok([403, 404].includes((await fetch(`${state}?${new URLSearchParams({ ...reference, revision: '1' })}`, { headers: { ...headers(), 'x-company-id': 'foreign' } })).status))
  assert.ok([403, 404].includes((await fetch(`${state}?${new URLSearchParams({ ...reference, revision: '1' })}`, { headers: { ...headers(), 'x-project-id': 'foreign' } })).status))
  assert.deepEqual(await counts(), before)
  assert.deepEqual((await pool.query('SELECT state,version FROM im_ui_user_states WHERE company_id=$1 AND ui_id=$2', [companyId, value.envelope.uiId])).rows, [{ state: { $angle: 30 }, version: 1 }])
  assert.equal(recording.messages.length, writes)
  const history = await imMessagesApplication.history({ companyId, userId: 'test-owner', channelId, limit: 100, beforeSequence: 0 })
  assert.deepEqual(history?.find(row => row.clientMsgNo === value.identity.clientNonce)?.payload.content, value.payload.content)
  assert.deepEqual((await pool.query('SELECT payload FROM im_send_acceptances WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3', [companyId, agentId, value.identity.clientNonce])).rows[0].payload, value.payload)
})

test('old admitted UI receipts cannot replay through generic acceptance or signed webhook admission', async () => {
  const payload = createNativeMessage({ id: 'old-admitted-ui-action', role: 'user', content: [{ type: 'text', text: '解释旧结果' }], custom: { mentionedIds: [agentId],
    uiInteraction: { uiId: 'historical-controls', messageId: 'run-historical-controls-run', revision: 1, sourceHash: 'a'.repeat(64), actionId: 'explain', kind: 'explain', idempotencyKey: 'old-receipt', state: {} } } })
  const input = { companyId, channelId, userId: 'test-owner', clientNonce: payload.id, payload }
  const historicalEcho = await wukongClient().sendMessage(channelId, 2, 'test-owner', payload)
  await ensureSendAcceptance(pool, { ...input, channelType: 2, inputDigest: messageAcceptanceDigest({ channelId, channelType: 2, payload }) })
  await acceptSend(pool, { ...input, echo: { ...historicalEcho, clientMsgNo: payload.id,
    channelId, channelType: 2, fromUid: 'test-owner', timestamp: Math.floor(Date.now() / 1000), payload } })
  const before = await counts(), writes = recording.messages.length
  await assert.rejects(assertUiInteractionAdmission(input), { status: 410 })
  assert.equal((await fetch(`${origin}/api/im/channels/${channelId}/messages/accept`, { method: 'POST', headers: headers(), body: JSON.stringify({ clientNonce: payload.id, payload }) })).status, 410)
  const webhook = new WukongWebhookApplication({ transaction: work => withTransaction(pool, work), verify: () => true, isKnowledgeAttachment: () => false,
    createKnowledgeJob: async () => { throw new Error('disabled actions must not ingest knowledge') }, enqueueAgentWakes, flushAgentWakes: async () => 0 })
  await assert.rejects(webhook.process({ eventId: 'old-ui-webhook', eventType: 'msg.notify', channelId, fromUid: 'test-owner', clientMsgNo: payload.id, payload, raw: Buffer.from(JSON.stringify(payload)) }), { status: 410 })
  const raw = JSON.stringify([{ message_idstr: 'signed-old-ui-webhook', channel_id: channelId, from_uid: 'test-owner', client_msg_no: payload.id,
    payload: Buffer.from(JSON.stringify({ type: 1001, ...payload })).toString('base64') }])
  const postWebhook = (signature: string) => fetch(`${origin}/webhooks/wukong`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-wukong-signature': signature }, body: raw })
  assert.equal((await postWebhook('invalid')).status, 401)
  assert.equal((await postWebhook(createHmac('sha256', 'fixture').update(raw).digest('hex'))).status, 410)
  await assert.rejects(receiveAgentRequest({ companyId, agentId, channelId, clientMsgNo: payload.id, authenticatedUserId: 'test-owner' }), { status: 410 })
  await assert.rejects(receiveAgentRequest({ companyId, agentId, channelId, clientMsgNo: payload.id, authenticatedUserId: 'outside' }), /authenticated human/)
  assert.deepEqual(await counts(), before)
  assert.equal(recording.messages.length, writes)
})

test('old accepted and unknown delivery receipts retain their immutable payload while new replies use text', async t => {
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, channelId)
  for (const state of ['accepted', 'unknown', 'absent', 'new'] as const) {
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version,
      messageId: `disabled-replay-${state}`, version: 1, author: { id: 'test-owner', kind: 'human' }, text: '请用文字解释。', mentions: [agentId] },
    { mode: 'execute', executionClass: 'conversation', codeExecution: 'disabled' })
    const identity = accepted.runs[0]; assert.ok(identity)
    await bindProductRun(pool, identity, channelId)
    const host = api.connectWorker({ workerId: 'disabled-ui-replay', workKinds: ['turn'] })
    const work = await host.claimWork(); assert.ok(work)
    const value = legacy(`legacy-${state}`, work.id, work.fence)
    const message: AssistantMessage = { version: 2, runId: work.id, agentId, sessionId: channelId,
      body: `\`\`\`lingxiloop-openui-v1\n${source}\n\`\`\``, envelope: { version: 1, body: `\`\`\`lingxiloop-openui-v1\n${source}\n\`\`\``,
        requestVersion: 1, evidenceSnapshotId: 'historical-evidence', citations: [], artifacts: [], goalOutcome: { status: 'satisfied', requestVersion: 1, verification: 'passed' } } }
    const commit = { resultId: value.identity.resultId, fence: work.fence }
    const context: NonNullable<Parameters<DeliveryPort['deliverMessage']>[2]> = { commit, signal: AbortSignal.timeout(10000), deadlineAt: new Date(Date.now() + 10000).toISOString() }
    // Keep the same nonce used by the delivery port's result identity.
    value.identity.clientNonce = `agent-${createHash('sha256').update(commit.resultId).digest('hex')}`
    try {
      if (state !== 'new') {
        await seedRevision(value)
        const input = { companyId, userId: agentId, channelId, clientNonce: value.identity.clientNonce, payload: value.payload }
        if (state === 'accepted') assert.equal((await imMessagesApplication.acceptAgentMessage(input)).kind, 'accepted')
        else {
          const client = wukongClient(), send = client.sendMessage.bind(client)
          const lost = t.mock.method(client, 'sendMessage', async (...args: Parameters<typeof client.sendMessage>) => {
            if (state === 'unknown') await send(...args)
            throw new Error('historical dispatch lost acknowledgement')
          })
          await assert.rejects(imMessagesApplication.acceptAgentMessage(input), /lost acknowledgement/)
          lost.mock.restore()
        }
      }
      const instructions = await createProductContext([]).contextProvider.loadContext(work)
      assert.equal(/installed interactive lesson renderer|Declare a literal default/.test(instructions.productRules ?? ''), false, 'disabled controls must not be advertised')
      assert.deepEqual(instructions.dynamic?.interactiveLessons, [])
      const receiptMessages = () => recording.messages.filter(message => message.clientMsgNo === value.identity.clientNonce)
      const before = await counts(), writes = receiptMessages().length
      if (state === 'absent') await assert.rejects(createProductDelivery(lingxiOSControl).deliverMessage(work, message, context), /unknown.*reconciliation/)
      else {
        const delivered = await createProductDelivery(lingxiOSControl).deliverMessage(work, message, context)
        assert.ok(delivered && delivered.messageId)
        const receipt = (await pool.query('SELECT payload,input_digest,status FROM im_send_acceptances WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3', [companyId, agentId, value.identity.clientNonce])).rows[0]
        assert.equal(receipt.status, 'accepted')
        if (state !== 'new') {
          assert.deepEqual(receipt.payload, value.payload)
          assert.equal(receipt.input_digest, messageAcceptanceDigest({ channelId, channelType: 2, payload: value.payload }))
          assert.equal((await pool.query('SELECT status FROM im_ui_revisions WHERE company_id=$1 AND ui_id=$2', [companyId, value.envelope.uiId])).rows[0].status, 'committed')
        } else {
          assert.ok(receipt.payload.content.every((part: { type: string }) => part.type === 'text'))
          assert.doesNotMatch(JSON.stringify(receipt.payload), /root =|generative-ui|lingxiloop-openui-v1/)
          assert.equal((await counts())[0].revisions, before[0].revisions)
        }
      }
      assert.equal(receiptMessages().length, writes + (state === 'new' ? 1 : 0), 'legacy receipt recovery never sends its accepted nonce again')
      if (state === 'absent') assert.deepEqual(await counts(), before)
    } finally { await host.completeWork(work, { status: 'cancelled' }) }
  }
})
