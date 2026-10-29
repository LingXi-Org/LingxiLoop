import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { releaseVersions } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { nativeText } from '../im/message-types.js'
import { WukongClient } from '../im/wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure inventory is preserved in Git history before issue #551.
test('process crash after native write preserves receipts; disconnected replacement and restarted terminal delivery recover', { timeout: 90000 }, async t => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  let api = await lingxiOSControl()
  let controlPort = await api.listenControlPlane({ serviceToken: 'basic-recovery-synthetic-service-token', port: 0 })
  let disconnected = false, heldResult = false, holdResult = true, rejectedRequests = 0
  const timeline: Record<string, unknown>[] = []
  const mark = (phase: string, values = {}) => timeline.push({ phase, at: new Date().toISOString(), ...values })
  const proxy = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk)
    if (disconnected) { rejectedRequests++; response.writeHead(503).end('{}'); return }
    try {
      const upstream = await fetch(`http://127.0.0.1:${controlPort}${request.url}`, {
        method: request.method, headers: Object.fromEntries(Object.entries(request.headers)
          .filter(([key, value]) => typeof value === 'string' && ['authorization', 'content-type', 'x-lingxios-fence', 'x-lingxios-lease', 'x-lingxios-artifact'].includes(key))) as Record<string, string>,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      })
      const body = await upstream.text()
      if (holdResult && request.url?.endsWith('/result') && upstream.ok) { heldResult = true; return }
      response.writeHead(upstream.status, { 'content-type': 'application/json' }).end(body)
    } catch { response.writeHead(502).end('{}') }
  })
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
  const address = proxy.address(); assert.ok(address && typeof address !== 'string')
  const children: { child: ReturnType<typeof spawn>; exit: Promise<unknown[]>; healthPort?: number; calls: number; errors: string }[] = []
  const until = async (check: () => Promise<boolean> | boolean, label: string) => {
    const deadline = Date.now() + 20000
    while (!await check()) {
      assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(children.map(({ child, errors }) => ({ code: child.exitCode, errors })))}`)
      await delay(25)
    }
  }
  const start = async (id: string, write = false) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/basic-recovery-worker.mjs', import.meta.url))], {
      env: { ...process.env, BASIC_WORKER_ID: id, BASIC_WRITE: write ? '1' : '0', BASIC_CONTROL_URL: `http://127.0.0.1:${address.port}` },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    })
    const entry: (typeof children)[number] = { child, exit: once(child, 'exit'), calls: 0, errors: '' }
    child.stderr?.on('data', chunk => { entry.errors = (entry.errors + chunk).slice(-4000) })
    child.on('message', (value: { kind: string; calls?: number; healthPort?: number }) => {
      if (value.kind === 'model') entry.calls = value.calls!
      if (value.kind === 'started') entry.healthPort = value.healthPort
    })
    children.push(entry)
    await until(() => Boolean(entry.healthPort) || child.exitCode !== null, 'Worker startup')
    assert.ok(entry.healthPort, entry.errors)
    return entry
  }
  const stop = async (entry: (typeof children)[number], signal: 'SIGKILL' | 'SIGTERM') => {
    entry.child.kill(signal)
    const exit = await entry.exit
    assert.deepEqual(exit, signal === 'SIGKILL' ? [null, 'SIGKILL'] : [0, null])
  }
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    const room = 'basic-process-recovery', members = ['test-owner', agentId]
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Basic recovery',$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
    const policy = await syncConversationPolicy(api, companyId, room)
    const enqueue = async (messageId: string) => {
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
        messageId, version: 1, author: { id: 'test-owner', kind: 'human' },
        text: messageId === 'before-crash' ? 'Send a brief progress message, then finish.' : 'Explain this general concept briefly.', mentions: [agentId] },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'operation', codeExecution: 'disabled' })
      assert.equal(accepted.runs.length, 1)
      await bindProductRun(pool, accepted.runs[0], room)
      return accepted.runs[0]
    }
    const first = await enqueue('before-crash')
    const original = await start('basic-original', true)
    await until(() => heldResult, 'committed result acknowledgement')
    await until(async () => (await api.readDelivery(first)) === 'delivered', 'first delivery')
    const result = (await api.readRun(first))!.resultId
    assert.ok(result)
    const counts = async () => (await pool.query(`SELECT
      (SELECT count(*)::int FROM lingxios.agent_action_intents i JOIN lingxios.agent_action_ledger l USING(idempotency_key)
        WHERE i.intent->>'workId'=$1 AND i.intent->'action'->>'action'='chat.send' AND (l.result->>'ok')::boolean) AS writes,
      (SELECT count(*)::int FROM lingxios.agent_model_budget_calls WHERE work_id=$1) AS model_calls,
      (SELECT count(*)::int FROM im_send_acceptances WHERE company_id=$2) AS acceptances`, [first.runId, companyId])).rows[0]
    const before = await counts()
    assert.equal(before.writes, 1)
    assert.equal(original.calls, 2)
    assert.equal(im.messages.filter(message => nativeText(message.payload) === 'Synthetic committed action.').length, 1)
    mark('native write and result committed; acknowledgement lost', { counts: before, agentTurnCalls: original.calls })
    await stop(original, 'SIGKILL'); holdResult = false; proxy.closeAllConnections()
    mark('original Worker SIGKILL confirmed')

    disconnected = true
    const next = await enqueue('during-disconnect')
    const replacement = await start('basic-replacement')
    await until(() => rejectedRequests > 0, 'control disconnect observed')
    await delay(300)
    assert.equal(replacement.calls, 0)
    assert.equal((await api.readRun(next))?.status, 'queued')
    assert.equal((await api.readRun(first))?.resultId, result)
    assert.deepEqual(await counts(), before)
    assert.equal((await fetch(`http://127.0.0.1:${replacement.healthPort}/readyz`)).status, 503)
    mark('replacement has no control contact; request stays queued', { rejectedRequests })
    disconnected = false
    await until(async () => (await api.readRunState(next))?.delivery === 'delivered', 'next message after disconnect')
    assert.equal((await api.readRun(next))?.status, 'succeeded')
    assert.equal((await api.readRun(first))?.resultId, result)
    assert.equal((await counts()).writes, 1)
    assert.equal((await counts()).model_calls, before.model_calls)
    assert.equal(replacement.calls, 1, 'replacement model only handles the new human request')
    assert.equal((await fetch(`http://127.0.0.1:${replacement.healthPort}/readyz`)).status, 200)
    mark('control restored; same original result, new message succeeded', { replacementCalls: replacement.calls })
    await stop(replacement, 'SIGTERM'); proxy.closeAllConnections()

    let terminalOffline = true
    const send = WukongClient.prototype.sendMessage
    t.mock.method(WukongClient.prototype, 'sendMessage', async function (this: WukongClient, ...args: Parameters<typeof send>) {
      const receipt = await send.apply(this, args)
      if (terminalOffline && args[3].role === 'system') throw new Error('synthetic terminal ACK loss after acceptance')
      return receipt
    })
    const cancelled = await enqueue('terminal-before-restart')
    await api.cancel(cancelled)
    await until(async () => (await pool.query('SELECT 1 FROM lingxios.agent_terminal_outbox WHERE root_work_id=$1 AND attempts>0 AND claim_token IS NULL', [cancelled.runId])).rowCount === 1, 'terminal outage receipt')
    const terminal = (await api.readTerminal(cancelled))!
    assert.equal(terminal.feedback.status, 'cancelled')
    assert.equal(im.messages.filter(message => message.payload.role === 'system').length, 1)
    await stopLingxiOSControl()
    api = await lingxiOSControl()
    controlPort = await api.listenControlPlane({ serviceToken: 'basic-recovery-synthetic-service-token', port: 0 })
    assert.deepEqual((await api.readTerminal(cancelled))!.feedback, terminal.feedback)
    assert.equal((await api.readRun(cancelled))?.resultId, null)
    mark('control service recreated; durable cancelled feedback identity preserved')
    terminalOffline = false
    await until(async () => (await api.readTerminal(cancelled))?.delivery === 'delivered', 'terminal recovery')
    const notices = im.messages.filter(message => message.payload.role === 'system')
    assert.equal(notices.length, 1)
    assert.equal(notices[0].clientMsgNo, `terminal-${terminal.feedback.id}`)
    assert.equal(notices[0].payload.metadata.custom.suppressAgentWake, true)
    assert.equal(await api.retryDelivery(cancelled, 'terminal'), false)
    assert.equal((await api.readTerminal(cancelled))?.delivery, 'delivered')
    const last = await enqueue('after-terminal-restart'), finalWorker = await start('basic-final')
    await until(async () => (await api.readRunState(last))?.delivery === 'delivered', 'message after terminal recovery')
    assert.equal((await api.readRun(last))?.status, 'succeeded')
    assert.equal(finalWorker.calls, 1)
    await stop(finalWorker, 'SIGTERM')
    assert.equal(im.messages.filter(message => nativeText(message.payload) === 'Synthetic committed action.').length, 1)
    assert.equal(im.messages.filter(message => message.payload.role === 'system').length, 1)
    const states = (await pool.query('SELECT status,count(*)::int AS count FROM lingxios.agent_work_items WHERE tenant_id=$1 GROUP BY status ORDER BY status', [companyId])).rows
    assert.deepEqual(states, [{ status: 'cancelled', count: 1 }, { status: 'succeeded', count: 3 }])
    mark('terminal delivered once; following message succeeded; no pending work', { states })
    await mkdir('artifacts/issues-153-161-basic', { recursive: true })
    await writeFile('artifacts/issues-153-161-basic/process-recovery.json', JSON.stringify({ passed: true,
      runtime: releaseVersions, node: process.version, actualWorkerProcesses: 3, originalTermination: 'SIGKILL',
      nativeWriteCount: 1, sameCommittedResult: true, originalAgentTurnCalls: 2, originalBudgetLedgerCalls: before.model_calls, replacementAgentTurnCalls: 1,
      terminalNotices: 1, workStates: states, timeline,
      scope: 'Product control/authorization/chat action/ledger/delivery; real PostgreSQL and public Worker HTTP; scripted model and recording IM.',
      unverified: ['live provider', 'real WuKong', 'full SPA', 'production sandbox', 'long soak', 'crash before atomic result commit'],
    }, null, 2) + '\n')
  } finally {
    for (const entry of children) {
      if (entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill('SIGKILL')
      await entry.exit
    }
    proxy.closeAllConnections()
    await new Promise<void>(resolve => proxy.close(() => resolve()))
    await teardownAll(); await im.close()
  }
})
