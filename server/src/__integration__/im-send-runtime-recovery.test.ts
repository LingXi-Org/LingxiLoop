import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { WukongClient, wukongClient, _setWukongClientForTests } from '../im/wukong.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { authorizeAcceptanceRepair } from '../../../scripts/reconcile-im-send-acceptances.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure inventory before execution: stale acceptance permanently blocking original
// resultId, repair changing messageKey, outbox retry rerunning a model/action, or a
// frozen audience revocation allowing delivery. Only a NEW synthetic run is executed.
test('the published result outbox acknowledges the original result after receipt recovery', {
  skip: process.env.LINGXIOS_REAL_WUKONG !== '1', timeout: 90_000,
}, async t => {
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    await ensureSchemaOnce(); await resetAllTables(); _setWukongClientForTests(null)
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    const channelId = `result-recovery-${randomUUID()}`, members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
      VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [channelId, companyId, projectId, JSON.stringify(members)])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile)
      VALUES($1,$2,$3::jsonb)`, [channelId, companyId, JSON.stringify({ channelType: 2, members })])
    const client = wukongClient()
    await client.upsertChannel({ channelId, channelType: 2, title: 'Synthetic result recovery', members })
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, channelId)
    let modelCalls = 0, sendCalls = 0
    const realSend = WukongClient.prototype.sendMessage
    t.mock.method(WukongClient.prototype, 'sendMessage', async function (this: WukongClient, ...args: Parameters<typeof realSend>) {
      const receipt = await realSend.apply(this, args)
      if (args[0] === channelId) { sendCalls++; throw new Error('synthetic ACK loss after durable result delivery') }
      return receipt
    })
    worker = createWorker({ controlPlane: api, worker: { id: `receipt-recovery-${randomUUID()}`, concurrency: 1, shutdownGraceMs: 1000 },
      modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
      model: { modelId: 'scripted-receipt-fixture', contextWindowTokens: 200000,
        async run() { modelCalls++; return { text: '这是一条用于核对消息回执的测试答复。',
          output: [{ role: 'assistant', content: '这是一条用于核对消息回执的测试答复。' }], usage: { available: true, inputTokens: 100, outputTokens: 20 } } },
        async structured() { modelCalls++; return { model: 'scripted-receipt-fixture', value: { missing: [] }, usage: { available: true, inputTokens: 10, outputTokens: 5 } } },
        async compact() { throw new Error('bounded fixture must not compact') } } })
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version,
      messageId: 'receipt-recovery-source', version: 1, author: { id: 'test-owner', kind: 'human' },
      text: '请回复一句话，用于验证本次消息的回执。', mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    assert.equal(accepted.runs.length, 1)
    const identity = accepted.runs[0]; await bindProductRun(pool, identity, channelId)
    const until = async (predicate: () => Promise<boolean>) => {
      const deadline = Date.now() + 30_000
      while (!await predicate()) { assert.ok(Date.now() < deadline, 'condition timed out'); await delay(50) }
    }
    await until(() => worker!.runNext())
    await until(async () => (await pool.query(`SELECT 1 FROM lingxios.agent_delivery_outbox outbox
      JOIN lingxios.agent_results result ON result.id=outbox.result_id
      WHERE result.work_id=$1 AND outbox.attempts>0 AND outbox.claim_token IS NULL`, [identity.runId])).rowCount === 1)
    const run = (await api.readRun(identity))!; assert.ok(run.resultId)
    const history = await client.syncMessages(channelId, 2, 100, agentId)
    assert.equal(history.length, 1); assert.equal(sendCalls, 1)
    const original = history[0], messageKey = original.clientMsgNo
    const snapshot = async () => ({ modelCalls, usage: await api.readUsage(identity),
      ledger: (await pool.query(`SELECT (SELECT count(*)::int FROM lingxios.agent_action_ledger) AS actions,
        (SELECT count(*)::int FROM lingxios.agent_model_budget_calls) AS budget_calls`)).rows[0] })
    const before = await snapshot()
    // Simulate the historical incident's exhausted delivery on this NEW fixture run.
    // Maintenance repairs only the acceptance; the existing public retry API owns
    // re-enabling a failed result outbox without resetting or executing its work.
    assert.equal((await pool.query(`UPDATE lingxios.agent_delivery_outbox SET attempts=12,failed_at=NOW()
      WHERE result_id=$1 AND delivered_at IS NULL`, [run.resultId])).rowCount, 1)
    assert.equal(await api.readDelivery(identity), 'failed')
    await pool.query(`UPDATE im_send_acceptances SET status='accepted',echo=$4::jsonb,error=NULL
      WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
    [companyId, agentId, messageKey, JSON.stringify({ ...original, messageSeq: 0 })])
    const repairIdentity = { companyId, userId: agentId, clientNonce: messageKey }
    assert.equal((await imMessagesApplication.reconcileSendAcceptance({ ...repairIdentity, apply: true,
      authorize: (db, row) => authorizeAcceptanceRepair(db, repairIdentity, row) })).classification, 'confirmed')
    assert.equal(await api.retryDelivery(identity, 'message'), true)
    await until(async () => await api.readDelivery(identity) === 'delivered')
    const after = await snapshot()
    assert.equal(after.modelCalls, before.modelCalls)
    assert.equal(after.usage?.calls, before.usage?.calls)
    assert.deepEqual(after.ledger, before.ledger)
    assert.equal((await api.readRun(identity))?.resultId, run.resultId)
    const stored = (await pool.query(`SELECT receipt FROM lingxios.agent_delivery_outbox WHERE result_id=$1`, [run.resultId])).rows[0].receipt
    assert.equal(stored.messageKey, messageKey); assert.equal(stored.messageId, original.messageId)
    assert.equal((await client.syncMessages(channelId, 2, 100, agentId)).length, 1); assert.equal(sendCalls, 1)
    await mkdir('.e2e/issue-154', { recursive: true })
    await writeFile('.e2e/issue-154/runtime-recovery.json', JSON.stringify({ passed: true, realWuKong: true,
      scriptedModel: true, realProvider: false, newSyntheticRunOnly: true,
      states: ['saved result / ACK lost', '12 attempts / terminal outbox', 'accepted invalid receipt', 'guarded acceptance repair', 'existing authorized retry / same result delivered'],
      exhaustedOutboxRecovery: true,
      sameResultId: true, sameMessageKey: true, durableMessages: 1, sends: sendCalls,
      modelCallsBefore: before.modelCalls, modelCallsAfter: after.modelCalls, actionAndBudgetLedgerUnchanged: true }, null, 2))
  } finally { await worker?.stop(); await teardownAll() }
})
