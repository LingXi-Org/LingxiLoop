import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure cases: forged principal/tenant, changed decisions, stale request approvals,
// a successful decision without execution, and approval state missing from replay.
before(async () => { await ensureSchemaOnce(); await resetAllTables(); installFakeWukong() })
after(async () => { await teardownAll() })

test('HTTP approval decisions and expiry survive native message replay under a real worker lease', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  await pool.query(`UPDATE participants SET capabilities='["calendar"]'::jsonb WHERE id=$1`,[agentId])
  const conversationId = 'approval-room', members = ['test-owner',agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,[conversationId,companyId,projectId,JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,[conversationId,companyId,JSON.stringify({ channelType: 2,members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,conversationId)
  let outcome = 'approved', calls = 0
  const worker = createWorker({ controlPlane: api,worker: { id: 'approval-fixture',concurrency: 1,shutdownGraceMs: 1000 },
    modelBudget: { inputCostMicrosPerMillion: 1,outputCostMicrosPerMillion: 1 },
    model: { modelId: 'approval-fixture',contextWindowTokens: 200000,async run() {
      const usage = { available: true,inputTokens: 100,outputTokens: 20 }
      if (calls++ === 0) return { text: '',output: [{ type: 'function_call',callId: `calendar-${outcome}`,name: 'calendar__create',
        arguments: JSON.stringify({ title: outcome,startAt: '2026-10-03T10:00:00Z' }) }],usage }
      return { text: '已处理审批结果。',output: [{ role: 'assistant',content: '已处理审批结果。' }],usage }
    },async structured() { return { model: 'approval-fixture',value: { missing: [] },usage: { available: true,inputTokens: 10,outputTokens: 5 } } },async compact() { throw new Error('bounded approval fixture must not compact') } } })
  const next = async () => {
    const deadline = Date.now()+10000
    while (!await worker.runNext()) { assert.ok(Date.now()<deadline,'worker did not claim the queued run'); await delay(30) }
  }
  const server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const headers = { 'content-type': 'application/json','x-company-id': companyId,'x-project-id': projectId }
  const checks: string[] = []
  try {
    for (outcome of ['approved','denied','expired']) {
      calls = 0
      const accepted = await api.conversations.ingest({ tenantId: companyId,conversationId,policyVersion: policy.version,messageId: `approval-${outcome}`,
        version: 1,author: { id: 'test-owner',kind: 'human' },text: 'Schedule an approved review.',mentions: [agentId] },{ mode: 'execute',executionClass: 'conversation',codeExecution: 'disabled' })
      const identity = accepted.runs[0]
      await next()
      const pending = (await readRunProjection(api,identity,true)).snapshot.message.content.find(part => part.type === 'tool-call' && part.approval)
      assert.ok(pending?.type === 'tool-call' && pending.approval,JSON.stringify(pending))
      const approvalId = pending.approval.id
      const url: string = `http://127.0.0.1:${address.port}/api/im/approvals/${approvalId}/resolve`
      const resolve = (approved: boolean,company = companyId): Promise<Response> => fetch(url,{ method: 'POST',headers: { ...headers,'x-company-id': company },body: JSON.stringify({ approved }) })
      assert.equal((await resolve(true,'outside-company')).status,403)
      const part = async () => (await readRunProjection(api,identity,true)).snapshot.message.content.find(part => part.type === 'tool-call' && part.approval?.id === approvalId)
      const before = await part(); assert.ok(before?.type === 'tool-call' && before.approval?.approved === undefined && !before.approval?.resolution)
      if (outcome === 'expired') {
        assert.equal(await api.revise(identity,'Changed request; prior approval is stale.'),true)
        const expired = await part(); assert.ok(expired?.type === 'tool-call'); assert.equal(expired.approval?.resolution,'expired')
        assert.equal((await resolve(true)).status,409)
      } else {
        const approved = outcome === 'approved', response = await resolve(approved)
        assert.equal(response.status,200,await response.clone().text())
        const replay = await part(); assert.ok(replay?.type === 'tool-call'); assert.equal(replay.approval?.approved,approved)
        await next()
        const approval = await api.readApproval({ tenantId: companyId,principalId: 'test-owner',approvalId })
        assert.equal(approval?.result?.ok,approved,JSON.stringify(approval?.result))
        assert.equal((await resolve(!approved)).status,409)
      }
      await api.cancel(identity)
      checks.push(outcome)
    }
    assert.deepEqual((await pool.query('SELECT title FROM calendar_events WHERE company_id=$1',[companyId])).rows,[{ title: 'approved' }])
    await mkdir('artifacts/native-message',{ recursive: true })
    await writeFile('artifacts/native-message/approvals.json',JSON.stringify({ passed: true,checks },null,2))
  } finally {
    await worker.stop()
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
