import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import express from 'express'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { createImMessagesApplication } from '../im/messages-facade.js'
import { wukongWebhookRouter } from '../im/webhook.js'
import { wukongClient, _setWukongClientForTests } from '../im/wukong.js'
import { createNativeMessage, nativeText } from '../im/message-types.js'
import { flushAgentWakes } from '../agent-runtime/ingress.js'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { WorkItem } from '@lyyzka/lingxios'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { assertFrozenAudience } from '../agent-runtime/identity.js'
import { wukongWebhookApplication } from '../im/webhook-facade.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure inventory: a committed HTTP send never reaches admission; callback
// batching/retry drops one author, wakes every Agent, crosses a tenant, duplicates
// a run, or echoes an Agent reply into another dispatch. Provider failures must
// remain terminal failures rather than a fabricated successful answer.
after(async () => { await teardownAll() })

test('HTTP acceptance durably queues one wake without any IM callback, including concurrent accepted replays', async t => {
  await ensureSchemaOnce(); await resetAllTables()
  const recording = await installRecordingWukong()
  t.after(() => recording.close())
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const channelId = 'synthetic347-callback-free', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  const app = await buildApiTestApp('test-owner'), server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const payload = createNativeMessage({ id: 'synthetic347-ci-source', role: 'user', content: [{ type: 'text', text: '合成教师普通消息。' }] })
  const send = () => fetch(`http://127.0.0.1:${address.port}/api/im/channels/${channelId}/messages/accept`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId },
    body: JSON.stringify({ clientNonce: payload.id, payload }),
  })
  assert.equal((await send()).status, 202)
  assert.ok((await Promise.all(Array.from({ length: 4 }, () => send()))).every(response => response.status === 200))
  assert.equal(recording.messages.length, 1)
  assert.deepEqual((await pool.query('SELECT event_id,agent_id,attempts FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows,
    [{ event_id: `msg.notify:${recording.messages[0].messageId}`, agent_id: agentId, attempts: 0 }])
  const callerPayload = createNativeMessage({ id: 'synthetic347-caller-transaction', role: 'user', content: [{ type: 'text', text: '合成外层事务。' }] })
  await assert.rejects(withTransaction(pool, async db => {
    const accepted = await createImMessagesApplication(undefined, db).acceptUserMessage({ companyId, userId: 'test-owner', channelId, clientNonce: callerPayload.id, payload: callerPayload })
    assert.equal(accepted.kind, 'accepted')
    throw new Error('Synthetic caller rollback')
  }), /Synthetic caller rollback/)
  assert.equal((await pool.query('SELECT 1 FROM im_send_acceptances WHERE client_nonce=$1', [callerPayload.id])).rows.length, 0)
  assert.equal((await pool.query('SELECT 1 FROM lingxios_ingress_outbox WHERE client_msg_no=$1', [callerPayload.id])).rows.length, 0,
    'the caller must own the transaction; admission cannot commit it early')
})

for (const scenario of [
  { name: 'callback delivered', dropCallback: false, text: '请介绍本课程。', targets: ['group-wake-a'] },
  { name: 'callback lost', dropCallback: true, text: '请介绍本课程。', targets: ['group-wake-a'] },
  { name: 'explicit mention from another teacher', dropCallback: true, text: '@group-wake-b 请核对本课程。', targets: ['group-wake-b'], peer: true },
  { name: 'single Agent with two humans', dropCallback: true, text: '请说明下一步。', targets: ['group-wake-a'], single: true },
  { name: 'explicit broadcast', dropCallback: true, text: '@all 请各自介绍。', targets: ['group-wake-a', 'group-wake-b'] },
  { name: 'enqueue rollback then history reconciliation', dropCallback: true, text: '请核对已提交的消息。', targets: ['group-wake-a'], rollback: true },
  { name: 'lost durable ACK then history reconciliation', dropCallback: true, text: '请回答已提交的问题。', targets: ['group-wake-a'], lostAck: true },
  { name: 'provider failure', dropCallback: true, text: '请回答这个问题。', targets: ['group-wake-a'], failed: true },
  { name: 'departed default in stale binding', dropCallback: true, text: '请仍在群中的助教回答。', targets: ['group-wake-b'], retired: true },
]) test(`a teacher group HTTP send routes and delivers (${scenario.name})`, {
  skip: process.env.LINGXIOS_REAL_WUKONG !== '1', timeout: 300000,
}, async t => {
  await ensureSchemaOnce(); await resetAllTables(); _setWukongClientForTests(null)
  const { companyId, projectId, agentId } = await seedCompanyWithAgent({ agentId: 'group-wake-a' })
  await seedUserMembership('test-owner', companyId)
  await seedUserMembership('group-wake-peer', companyId, { role: 'TEACHER', isAdmin: false })
  await seedUserMembership('group-wake-outsider', companyId, { role: 'TEACHER', isAdmin: false })
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,$2,'group-wake-peer','TEACHER')`, [companyId, projectId])
  const author = scenario.peer ? 'group-wake-peer' : 'test-owner'
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
    VALUES('group-wake-b',$1,'agent','Synthetic B','specialist','B','#abcdef','avail')`, [companyId])
  const callbacks: Array<{ status?: number; event: unknown; body?: string }> = []
  const app = express(); app.use('/webhooks/wukong', (req, res, next) => {
    const record = { event: req.query.event, status: undefined as number | undefined, body: undefined as string | undefined }; callbacks.push(record)
    res.on('finish', () => { record.status = res.statusCode })
    if (scenario.dropCallback && req.query.replay !== '1') {
      const chunks: Buffer[] = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => { record.body = Buffer.concat(chunks).toString(); res.sendStatus(200) }); return
    }
    next()
  }, wukongWebhookRouter)
  const ownerApp = await buildApiTestApp('test-owner'), peerApp = await buildApiTestApp('group-wake-peer')
  const outsiderApp = await buildApiTestApp('group-wake-outsider')
  app.use((req, res, next) => req.headers['x-synthetic-outsider'] === '1' ? outsiderApp(req, res, next)
    : req.headers['x-synthetic-peer'] === '1' ? peerApp(req, res, next) : ownerApp(req, res, next))
  const server = createServer(app)
  await new Promise<void>(resolve => server.listen(18547, '0.0.0.0', resolve))
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const headers = { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId }
  const created = await fetch(`http://127.0.0.1:18547/api/projects/${projectId}/conversations`, {
    method: 'POST', headers, body: JSON.stringify({ participantIds: ['group-wake-peer', agentId, ...scenario.single ? [] : ['group-wake-b']], title: 'Synthetic teacher group', requestId: 'synthetic347-create' }),
  })
  assert.equal(created.status, 201, await created.clone().text())
  const { id: channelId } = await created.json() as { id: string }
  if (scenario.retired) {
    await pool.query('UPDATE im_channel_bindings SET leader_agent_id=$2 WHERE channel_id=$1', [channelId, agentId])
    await pool.query('UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2', [companyId, agentId])
  }
  const payload = createNativeMessage({ id: 'synthetic347-source', role: 'user', content: [{ type: 'text', text: scenario.text }], custom: { mentionedIds: ['group-wake-b'], mentionAll: true } })
  const send = (body = payload, scope = companyId) => fetch(`http://127.0.0.1:18547/api/im/channels/${channelId}/messages/accept`, {
    method: 'POST', headers: { ...headers, 'x-company-id': scope, ...scenario.peer ? { 'x-synthetic-peer': '1' } : {} }, body: JSON.stringify({ clientNonce: body.id, payload: body }),
  })
  const outsider = await fetch(`http://127.0.0.1:18547/api/im/channels/${channelId}/messages/accept`, {
    method: 'POST', headers: { ...headers, 'x-synthetic-outsider': '1' }, body: JSON.stringify({ clientNonce: payload.id, payload }),
  })
  assert.equal(outsider.status, 404, 'a nonmember must not discover the private channel')
  assert.equal((await pool.query('SELECT 1 FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows.length, 0)
  if (scenario.rollback) {
    const failure = t.mock.method(wukongWebhookApplication, 'enqueue', async () => { throw new Error('Synthetic durable enqueue fault') })
    const rejected = await send(); assert.equal(rejected.status, 500)
    assert.deepEqual((await pool.query('SELECT status FROM im_send_acceptances WHERE company_id=$1', [companyId])).rows, [{ status: 'pending' }])
    assert.equal((await pool.query('SELECT 1 FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows.length, 0)
    failure.mock.restore()
  }
  if (scenario.lostAck) {
    const client = wukongClient(), dispatch = client.sendMessage.bind(client)
    const failure = t.mock.method(client, 'sendMessage', async (...args: Parameters<typeof dispatch>) => {
      await dispatch(...args); throw new Error('Synthetic ACK lost after real durable IM commit')
    })
    assert.equal((await send()).status, 500)
    assert.equal((await pool.query('SELECT 1 FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows.length, 0,
      'a lost ACK cannot authorize optimistic admission')
    failure.mock.restore()
  }
  const accepted = await send()
  assert.equal(accepted.status, scenario.rollback || scenario.lostAck ? 200 : 202, await accepted.clone().text())
  assert.equal((await send(payload, 'outside-company')).status, 403)
  assert.equal((await send({ ...payload, content: [{ type: 'text', text: 'Changed same nonce' }] })).status, 409)
  if (scenario.dropCallback) assert.equal((await pool.query('SELECT 1 FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows.length,
    scenario.targets.length, 'confirmed acceptance must durably enqueue its wake before reporting accepted, even with no callback')
  assert.deepEqual((await pool.query('SELECT agent_id FROM lingxios_ingress_outbox WHERE channel_id=$1 ORDER BY agent_id', [channelId])).rows.map(row => row.agent_id), scenario.targets,
    'wake recipients must match the active canonical policy, including when a binding retains a departed Agent')
  const repeated = await Promise.all(Array.from({ length: 4 }, () => send()))
  assert.ok(repeated.every(response => response.status === 200))
  await flushAgentWakes()
  const stop = Date.now() + 12000
  while (!(await pool.query('SELECT 1 FROM agent_run_bindings WHERE conversation_id=$1', [channelId])).rows.length && Date.now() < stop) await delay(100)
  const wakes = (await pool.query('SELECT event_id,agent_id,attempts,error,delivered_at FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows
  assert.equal(wakes.length, scenario.targets.length, JSON.stringify({ wakes, callbackCount: callbacks.length }))
  assert.deepEqual(wakes.map(wake => wake.agent_id).sort(), scenario.targets)
  assert.ok(wakes.every(wake => wake.delivered_at), JSON.stringify(wakes))
  const runs = (await pool.query('SELECT run_id,agent_id,principal_id,session_id FROM agent_run_bindings WHERE conversation_id=$1', [channelId])).rows
  assert.equal(runs.length, scenario.targets.length)
  assert.ok(runs.every(run => run.principal_id === author))
  const api = await lingxiOSControl()
  if (scenario.retired) {
    const run = runs[0]
    const work = (await pool.query<{ conversation: WorkItem['conversation'] }>('SELECT conversation FROM lingxios.agent_work_items WHERE id=$1', [run.run_id])).rows[0]
    assert.ok(work?.conversation)
    await assert.rejects(assertFrozenAudience(pool, { tenantId: companyId, conversation: work.conversation }), /frozen audience differs/,
      'delivery must still refuse the unreconciled IM audience; routing must not widen permissions')
    await mkdir('.e2e/issue347', { recursive: true })
    await writeFile('.e2e/issue347/departed-default.json', JSON.stringify({ syntheticOnly: true, admissionPassed: true,
      wakeAgentId: wakes[0].agent_id, runAgentId: run.agent_id, deliveryBlockedUntilAudienceReconciliation: true }, null, 2))
    return
  }
  let currentAgent = ''
  let generationCalls = 0
  const usage = { available: true, inputTokens: 10, outputTokens: 10 }
  const worker = createWorker({ controlPlane: { connectWorker(config) {
    const host = api.connectWorker(config)
    return { ...host, async claimWork(...args) { const work = await host.claimWork(...args); if (work) currentAgent = work.agentId; return work } }
  } }, worker: { id: 'synthetic347-worker', concurrency: 1, shutdownGraceMs: 1000 }, model: {
    modelId: 'synthetic347-model', contextWindowTokens: 200000,
    async run() {
      generationCalls++
      if (scenario.failed) throw Object.assign(new Error('Synthetic provider failure'), { status: 402 })
      const text = `${currentAgent} 合成群聊答复已完成。`
      return { text, output: [{ role: 'assistant', content: text }], usage }
    },
    async structured() { return { value: { missing: [] }, model: 'synthetic347-model', usage } },
    async compact() { throw new Error('bounded test must not compact') },
  } })
  t.after(() => worker.stop())
  await worker.start()
  const deadline = Date.now() + 15000
  while ((await pool.query("SELECT 1 FROM lingxios.agent_work_items WHERE tenant_id=$1 AND status IN ('queued','leased','waiting')", [companyId])).rows.length && Date.now() < deadline) await delay(50)
  const replyRole = scenario.failed ? 'system' : 'assistant'
  while ((await wukongClient().syncMessages(channelId, 2, 80, 'test-owner')).filter(message => message.payload.role === replyRole).length < scenario.targets.length && Date.now() < deadline) await delay(50)
  const browserCase = scenario.name === 'callback lost' && process.env.GROUP_WAKE_BROWSER === '1'
  if (!browserCase) await worker.stop()
  const history = await wukongClient().syncMessages(channelId, 2, 80, 'test-owner')
  assert.equal(history.filter(message => message.payload.role === 'user').length, 1)
  const replies = history.filter(message => message.payload.role === replyRole)
  assert.equal(replies.length, scenario.targets.length)
  if (scenario.failed) {
    assert.equal((await pool.query("SELECT 1 FROM lingxios.agent_work_items WHERE tenant_id=$1 AND status='failed'", [companyId])).rows.length, 1)
    assert.ok(replies.every(reply => reply.payload.metadata.custom.terminalStatus === 'failed'))
    assert.ok(replies.every(reply => nativeText(reply.payload).includes('未能完成') && !nativeText(reply.payload).includes('合成群聊答复已完成。')))
  } else assert.ok(replies.every(reply => nativeText(reply.payload).endsWith('合成群聊答复已完成。')))
  if (!scenario.failed) assert.equal(generationCalls, scenario.targets.length, 'accepted retries must not repeat generation')
  for (const run of runs) {
    const identity = { tenantId: companyId, runId: run.run_id, agentId: run.agent_id, principalId: run.principal_id, sessionId: run.session_id }
    const delivered = async () => (scenario.failed ? await api.readTerminal(identity) : await api.readRunState(identity))?.delivery === 'delivered'
    while (!await delivered() && Date.now() < deadline) await delay(25)
    assert.ok(await delivered(), 'the durable runtime delivery receipt must settle before teardown')
  }
  // Replaying actual captured callback bytes after the trusted acceptance must
  // use the same wake, even when the IM initially lost that notification.
  if (scenario.dropCallback) for (const callback of callbacks.slice()) if (callback.event === 'msg.notify' && callback.body) {
    const response = await fetch(`http://127.0.0.1:18547/webhooks/wukong?token=synthetic347-webhook&event=msg.notify&replay=1`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: callback.body,
    })
    assert.equal(response.status, 200)
  }
  await flushAgentWakes()
  assert.equal((await pool.query('SELECT 1 FROM agent_run_bindings WHERE conversation_id=$1', [channelId])).rows.length, scenario.targets.length)
  assert.equal((await pool.query('SELECT 1 FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows.length, scenario.targets.length)
  if (browserCase) {
    app.get('/api/__group_wake/manifest', (_req, res) => res.json({ companyId, projectId, channelId, agentIds: [agentId, 'group-wake-b'] }))
    app.get('/api/__group_wake/stats', async (_req, res) => {
      const messages = await wukongClient().syncMessages(channelId, 2, 80, 'test-owner')
      res.json({ humans: messages.filter(message => message.payload.role === 'user').length, replies: messages.filter(message => message.payload.role === 'assistant').length,
        wakes: (await pool.query('SELECT 1 FROM lingxios_ingress_outbox WHERE channel_id=$1', [channelId])).rows.length,
        runs: (await pool.query('SELECT 1 FROM agent_run_bindings WHERE conversation_id=$1', [channelId])).rows.length })
    })
    const interval = setInterval(() => { void flushAgentWakes().catch(() => undefined) }, 150)
    const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'e2e/group-wake.vite.config.ts', '--host', '127.0.0.1', '--port', '18548', '--strictPort'], {
      env: { ...process.env, LINGXILOOP_DEV_API_TARGET: 'http://127.0.0.1:18547' }, stdio: 'ignore',
    })
    t.after(() => { clearInterval(interval); vite.kill() })
    const ready = Date.now() + 45000
    while (true) {
      try { if ((await fetch('http://127.0.0.1:18548/e2e/group-wake.html')).ok) break } catch { /* startup */ }
      assert.ok(Date.now() < ready, 'fixture Vite did not start'); await delay(100)
    }
    await new Promise<void>((resolve, reject) => {
      const browser = spawn(process.execPath, ['e2e/web/run.mjs', 'e2e/web/group-wake.e2e.ts', '--output', '.e2e/issue347/browser'], {
        env: { ...process.env, E2E_PROJECT: 'web', E2E_BASE_URL: 'http://127.0.0.1:18548' }, stdio: 'inherit',
      })
      browser.once('error', reject); browser.once('exit', code => code === 0 ? resolve() : reject(new Error(`official browser failed (${code})`)))
    })
    clearInterval(interval); await worker.stop(); vite.kill()
  }
  await mkdir('.e2e/issue347', { recursive: true })
  await writeFile(`.e2e/issue347/${scenario.name.replaceAll(' ', '-')}.json`, JSON.stringify({ passed: true, syntheticOnly: true,
    scenario: scenario.name, actualRecipients: runs.map(run => run.agent_id), author, initialConfirmedHumanMessages: 1,
    replies: replies.map(reply => ({ role: reply.payload.role, text: nativeText(reply.payload) })),
    callbackMode: scenario.dropCallback ? 'captured, initially dropped, later replayed through signed product webhook' : 'ordinary product callback',
    expectedRuns: scenario.targets.length, actualRuns: runs.length,
  }, null, 2))
})
