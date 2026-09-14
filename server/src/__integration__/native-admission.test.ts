import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { DeliveryPort, RunIdentity, WorkItem } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { WukongClient, _setWukongClientForTests } from '../im/wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce(); await resetAllTables() })
let worker: ReturnType<typeof createWorker> | undefined
const shutdown = new AbortController()
after(async () => { shutdown.abort(); await worker?.stop(); await teardownAll() })

test('product native admission, cancellation, revision, independent delivery and stable ACK replay', { timeout: 60000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  for (const room of ['slow-room', 'fast-room', 'revision-room']) {
    const members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
      [room, companyId, projectId, JSON.stringify(members)])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
      [room, companyId, JSON.stringify({ channelType: 2, members }), agentId])
  }
  let releaseDelivery!: () => void
  const slowDelivery = new Promise<void>(resolve => { releaseDelivery = resolve })
  type DeliveryContext = NonNullable<Parameters<DeliveryPort['deliverMessage']>[2]>
  const deliveries: Record<string, { payload: { clientMsgNo: string; data: { harnessCommit: DeliveryContext['commit']; im: NonNullable<DeliveryContext['im']> } }; messageId: string; calls: number }> = {}
  const im = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk)
    const input = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    res.setHeader('content-type', 'application/json')
    if (req.url !== '/message/send') { res.end(JSON.stringify({ messages: [] })); return }
    const payload = JSON.parse(Buffer.from(input.payload, 'base64').toString())
    const record = deliveries[input.channel_id] ??= { payload, messageId: `receipt-${input.channel_id}`, calls: 0 }
    record.calls++
    if (input.channel_id === 'slow-room') await slowDelivery
    res.end(JSON.stringify({ message_id: record.messageId, message_seq: 1 }))
  })
  await new Promise<void>(resolve => im.listen(0, '127.0.0.1', resolve))
  const address = im.address(); assert.ok(address && typeof address === 'object')
  _setWukongClientForTests(new WukongClient({ apiUrl: `http://127.0.0.1:${address.port}`, wsUrl: 'ws://unused', apiToken: 'fixture', webhookSecret: 'fixture' }))
  const api = await lingxiOSControl(), claimed = new Map<string, WorkItem>()
  let backgroundStarted = false, backgroundAborted = false
  let revisionStarted = false, revisionAborted = false
  const waitFor = async (check: () => boolean | Promise<boolean>, label: string) => {
    const deadline = Date.now() + 15000
    while (!await check()) { assert.ok(Date.now() < deadline, label); await delay(25) }
  }
  const usage = { available: true, inputTokens: 100, outputTokens: 10 }
  worker = createWorker({ controlPlane: { connectWorker(input) {
    const host = api.connectWorker(input)
    return { ...host, async claimWork(...args) { const work = await host.claimWork(...args); if (work) claimed.set(work.id, work); return work } }
  } }, worker: { id: 'product-admission', concurrency: 2, reservedInteractiveRuns: 1, shutdownGraceMs: 1000 },
    resources: { model: 2, python: 1 },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'admission-fixture', contextWindowTokens: 200000,
      async run(request) {
        const input = JSON.stringify(request.items)
        const holdRevision = input.includes('HOLD_REVISION') && !input.includes('RELEASE_REVISION')
        if (input.includes('HOLD_BACKGROUND') || holdRevision) {
          if (holdRevision) revisionStarted = true
          else backgroundStarted = true
          const signal = AbortSignal.any([shutdown.signal, ...request.signal ? [request.signal] : []])
          try { await delay(60000, undefined, { signal }) } finally {
            if (holdRevision) revisionAborted = signal.aborted
            else backgroundAborted = signal.aborted
          }
        }
        return { output: [{ role: 'assistant', content: 'Ready.' }], text: 'Ready.', model: 'admission-fixture', usage }
      },
      async structured() { return { value: { missing: [] }, model: 'admission-fixture', usage } },
      async compact() { throw new Error('bounded fixture must not compact') },
    } })
  const background = { tenantId: companyId, agentId, principalId: 'test-owner', sessionId: 'background-session', runId: 'background-run' }
  try {
    await api.enqueueJob({ ...background, id: background.runId, text: 'HOLD_BACKGROUND', kind: 'turn', lane: 'background', executionClass: 'operation',
      mode: 'chat', codeExecution: 'disabled', meta: { conversationId: 'fast-room' } })
    await bindProductRun(pool, background, 'fast-room')
    await worker.start()
    await waitFor(() => backgroundStarted, 'background model must occupy its slot')
    const ingress = async (conversationId: string, text = 'Reply Ready.') => {
      const policy = await syncConversationPolicy(api, companyId, conversationId)
      const result = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: `source-${conversationId}`, version: 1, author: { id: 'test-owner', kind: 'human' }, text, mentions: [agentId] },
      { mode: 'chat', executionClass: 'conversation', codeExecution: 'disabled' })
      assert.equal(result.runs.length, 1)
      await bindProductRun(pool, result.runs[0], conversationId)
      return result.runs[0]
    }
    const slow = await ingress('slow-room')
    await waitFor(() => Boolean(deliveries['slow-room']), 'foreground must reach delivery while background holds its slot')
    const fast = await ingress('fast-room')
    await waitFor(async () => (await api.readRunState(fast))?.delivery === 'delivered', 'another room must deliver while slow room is blocked')
    assert.equal((await api.readRun(background))?.status, 'leased')
    assert.equal(backgroundAborted, false)
    assert.equal(await api.cancel(background), true)
    await waitFor(() => backgroundAborted, 'cancel must abort the model request')
    await waitFor(() => worker!.activeRuns === 0, 'cancel must release the worker slot')
    const replay = async (run: RunIdentity, room: string) => {
      const work = claimed.get(run.runId)!, message = (await api.readMessage(run))!, sent = deliveries[room]
      const receipt = await createProductDelivery(lingxiOSControl).deliverMessage(work, message,
        { signal: shutdown.signal, deadlineAt: new Date(Date.now() + 15000).toISOString(), commit: sent.payload.data.harnessCommit, im: sent.payload.data.im })
      assert.deepEqual(receipt, { messageId: sent.messageId })
      assert.equal(sent.calls, 1, 'ACK replay must use the persisted WuKong receipt without another send')
      assert.equal(sent.payload.clientMsgNo, sent.payload.data.im.messageKey)
    }
    await replay(fast, 'fast-room')
    releaseDelivery()
    await waitFor(async () => (await api.readRunState(slow))?.delivery === 'delivered', 'slow delivery must finish after release')
    await replay(slow, 'slow-room')
    assert.ok((await pool.query('SELECT 1 FROM llm_calls WHERE company_id=$1 AND run_id=$2', [companyId, fast.runId])).rows.length,
      'product model calls must reach the shared ledger')
    const revised = await ingress('revision-room', 'HOLD_REVISION')
    await waitFor(() => revisionStarted, 'revision fixture must enter the original model request')
    assert.equal(await api.revise(revised, 'RELEASE_REVISION: reply Ready.'), true)
    await waitFor(async () => (await api.readRunState(revised))?.delivery === 'delivered', 'revised request must finish and deliver')
    const revisedState = (await api.readRunState(revised))!
    assert.equal(revisionAborted, true, 'revision must abort the superseded model call')
    assert.equal(revisedState.run.requestVersion, 2)
    assert.equal(revisedState.message?.envelope.requestVersion, 2)
    await replay(revised, 'revision-room')
  } finally {
    releaseDelivery(); shutdown.abort(); await worker.stop()
    await new Promise<void>((resolve, reject) => im.close(error => error ? reject(error) : resolve()))
  }
})
