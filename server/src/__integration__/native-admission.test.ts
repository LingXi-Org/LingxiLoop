import { decodeNativePayload } from '../im/wukong.js'
import { createNativeMessage, type NativeMessage } from '../im/message-types.js'
import type { RunDisplayState } from '../../../src/lib/agentRunSnapshot.js'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { DeliveryPort, RunIdentity, WorkItem } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { WukongClient, _setWukongClientForTests } from '../im/wukong.js'
import type { ImMessage } from '../im/types.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce(); await resetAllTables() })
let worker: ReturnType<typeof createWorker> | undefined
const shutdown = new AbortController()
after(async () => { shutdown.abort(); await worker?.stop(); await teardownAll() })

// Lost-ACK fixture failures: accepting a write but omitting it from history,
// requiring another dispatch to recover, or hiding duplicate rows behind nonce
// deduplication. Count every actual send and durable row independently.
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
  const deliveries: Record<string, { payload: NativeMessage; clientNonce: string; messageId: string; calls: number }> = {}
  const terminalDeliveries: typeof deliveries = {}
  const requests = new Map<string, NativeMessage>()
  const durableMessages: ImMessage[] = [], recoveredHistory: ImMessage[] = []
  let lostAcknowledgements = 0
  const im = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk)
    const input = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    res.setHeader('content-type', 'application/json')
    if (req.url === '/channel/messagesync') {
      const payload = requests.get(input.channel_id)
      const rows: ImMessage[] = [
        ...(payload ? [{ channelId: input.channel_id, channelType: 2, fromUid: 'test-owner', clientMsgNo: payload.id,
          messageId: payload.id, messageSeq: 1, timestamp: Math.floor(Date.now() / 1000), payload }] : []),
        ...durableMessages.filter(message => message.channelId === input.channel_id),
      ].filter(message => !input.start_message_seq || message.messageSeq <= input.start_message_seq).slice(-(input.limit || 80))
      if (lostAcknowledgements && input.channel_id === 'slow-room') {
        recoveredHistory.push(...rows.filter(message => message.fromUid === agentId))
      }
      res.end(JSON.stringify({ messages: rows.map(message => ({ ...message,
        payload: Buffer.from(JSON.stringify({ type: 1001, ...message.payload })).toString('base64') })) }))
      return
    }
    if (req.url !== '/message/send') { res.end(JSON.stringify({ messages: [] })); return }
    const payload = decodeNativePayload(input.payload)
    const record = payload.role === 'system'
      ? terminalDeliveries[input.client_msg_no] ??= { payload,clientNonce: input.client_msg_no,messageId: `receipt-${input.client_msg_no}`,calls: 0 }
      : deliveries[input.channel_id] ??= { payload, clientNonce: input.client_msg_no, messageId: `receipt-${input.channel_id}`, calls: 0 }
    assert.equal(input.client_msg_no, record.clientNonce, 'delivery retries must preserve the WuKong idempotency key')
    assert.deepEqual(payload, record.payload, 'delivery retries must preserve the committed payload')
    record.calls++
    // Append on EVERY HTTP send, even if the nonce repeats, so a duplicate dispatch
    // cannot be hidden by this fixture. Persist before losing the acknowledgement.
    const message = { channelId: input.channel_id, channelType: input.channel_type, fromUid: input.from_uid,
      clientMsgNo: input.client_msg_no, messageId: record.calls === 1 ? record.messageId : `${record.messageId}-${record.calls}`,
      messageSeq: 2 + durableMessages.filter(message => message.channelId === input.channel_id).length,
      timestamp: Math.floor(Date.now() / 1000), payload }
    durableMessages.push(message)
    if (input.channel_id === 'slow-room' && record.calls === 1) {
      await slowDelivery
      lostAcknowledgements++
      res.destroy()
      return
    }
    if (input.channel_id === 'slow-room') await slowDelivery
    res.end(JSON.stringify({ message_id: message.messageId, message_seq: message.messageSeq, reason: 1 }))
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
      const clientMsgNo = `source-${conversationId}`
      requests.set(conversationId, createNativeMessage({ id: clientMsgNo, role: 'user', content: [{ type: 'text', text }],
        custom: { mentionedIds: [agentId] } }))
      const result = await receiveAgentRequest({ companyId, agentId, channelId: conversationId, clientMsgNo })
      assert.ok('runs' in result)
      assert.equal(result.runs.length, 1)
      return result.runs[0]
    }
    const admissionStarted = Date.now()
    const slow = await ingress('slow-room')
    await waitFor(() => Boolean(deliveries['slow-room']), 'foreground must reach delivery while background holds its slot')
    console.info(JSON.stringify({ scenario: 'human-message-with-busy-background', deliveryStartedMs: Date.now() - admissionStarted,
      backgroundStillLeased: (await api.readRun(background))?.status === 'leased' }))
    const fast = await ingress('fast-room')
    await waitFor(async () => (await api.readRunState(fast))?.delivery === 'delivered', 'another room must deliver while slow room is blocked')
    assert.equal((await api.readRun(background))?.status, 'leased')
    assert.equal(backgroundAborted, false)
    assert.equal(await api.cancel(background), true)
    await waitFor(() => backgroundAborted, 'cancel must abort the model request')
    await waitFor(() => worker!.activeRuns === 0, 'cancel must release the worker slot')
    const replay = async (run: RunIdentity, room: string) => {
      const work = claimed.get(run.runId)!, message = (await api.readMessage(run))!, sent = deliveries[room]
      assert.deepEqual((await pool.query(`SELECT status,echo->>'messageId' AS "messageId" FROM im_send_acceptances
        WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`, [companyId, agentId, sent.clientNonce])).rows,
      [{ status: 'accepted', messageId: sent.messageId }])
      const callsBeforeReplay = sent.calls
      const rowsBeforeReplay = durableMessages.length
      const view = sent.payload.metadata.custom.harness as RunDisplayState
      const commit: DeliveryContext['commit'] = { resultId: view.resultId!,fence: view.messageFence }
      assert.ok(work.conversation)
      const context: NonNullable<DeliveryContext['im']> = { tenantId: companyId,...work.conversation,replyKey: 'fixture-replay',messageKey: sent.clientNonce }
      const receipt = await createProductDelivery(lingxiOSControl).deliverMessage(work, message,
        { signal: shutdown.signal, deadlineAt: new Date(Date.now() + 15000).toISOString(), commit, im: context })
      assert.deepEqual(receipt, { messageId: sent.messageId })
      assert.equal(sent.calls, callsBeforeReplay, 'ACK replay must use the persisted WuKong receipt without another send')
      assert.equal(durableMessages.length, rowsBeforeReplay, 'ACK replay must not append another durable row')
      assert.equal(sent.payload.id, `run-${run.runId}`)
      assert.equal(sent.clientNonce,context.messageKey)
    }
    await replay(fast, 'fast-room')
    releaseDelivery()
    await waitFor(async () => (await api.readRunState(slow))?.delivery === 'delivered', 'slow delivery must finish after release')
    assert.equal(lostAcknowledgements, 1, 'one response must be lost after the durable write')
    assert.equal(deliveries['slow-room'].calls, 1, 'lost ACK recovery must read history without another send')
    const original = durableMessages.filter(message => message.channelId === 'slow-room' && message.fromUid === agentId)
    assert.equal(original.length, 1, 'count actual durable messages, including any duplicate nonce rows')
    assert.ok(recoveredHistory.length > 0, 'reconciliation must retrieve the accepted assistant message from history')
    assert.ok(recoveredHistory.every(message => message.messageId === original[0].messageId
      && message.messageSeq === original[0].messageSeq && message.clientMsgNo === original[0].clientMsgNo))
    assert.deepEqual(recoveredHistory[0].payload, original[0].payload)
    await replay(slow, 'slow-room')
    console.info(JSON.stringify({ scenario: 'lost-ack-authoritative-history', actualSendCalls: deliveries['slow-room'].calls,
      durableMessageRows: original.length, recoveredHistoryRows: recoveredHistory.length, replayAdditionalSends: 0 }))
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
