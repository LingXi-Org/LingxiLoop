import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import { NoEffectError, type WorkItem } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { nativeText } from '../im/message-types.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

let recording: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker> | undefined
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await worker?.stop(); await teardownAll(); await recording?.close() })

async function fixture(room: string) {
  const { companyId,projectId,agentId } = await seedCompanyWithAgent()
  const principalId = `human-${room}`
  await seedUserMembership(principalId,companyId)
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER')",[projectId,companyId,principalId])
  const members = [principalId,agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Reliability',$4::jsonb)",[room,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[room,companyId,JSON.stringify({ channelType: 2,members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,room)
  const enqueue = async (id: string) => {
    const accepted = await api.conversations.ingest({ tenantId: companyId,conversationId: room,policyVersion: policy.version,
      messageId: id,version: 1,author: { id: principalId,kind: 'human' },text: 'Explain this general concept.',mentions: [agentId] },
    { mode: 'chat',codeExecution: 'disabled',executionClass: 'conversation' })
    const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool,run,room); return run
  }
  return { api,enqueue,companyId,agentId,room,principalId }
}

test('optional scope outages omit memory while mandatory authorization and implementation errors stay strict', async () => {
  const { api,enqueue,principalId } = await fixture('optional-memory-product')
  const run = await enqueue('optional-memory-source')
  const host = api.connectWorker({ workerId: 'optional-memory',workKinds: ['turn'] }), work = (await host.claimWork())!
  const memory = api.memory!, original = memory.scopes
  try {
    for (const fault of [Object.assign(new Error('PRIVATE_SQL'),{ code: '57014' }),new NoEffectError('PRIVATE_SCOPE','forbidden')]) {
      memory.scopes = async () => { throw fault }
      const context = await host.loadContext(work)
      assert.deepEqual(context.dynamic?.memoryScopes,[])
      assert.equal(context.dynamic?.memoryScopesStatus,'unavailable')
      assert.doesNotMatch(JSON.stringify(context),/PRIVATE_/)
      await assert.rejects(memory.scopes({ tenantId: work.tenantId,agentId: work.agentId,principalId: work.principalId!,sessionId: work.sessionId,workId: work.id }))
    }
    const implementation = new TypeError('PRIVATE_IMPLEMENTATION')
    memory.scopes = async () => { throw implementation }
    await assert.rejects(host.loadContext(work),error => error === implementation)
    memory.scopes = async () => []
    await pool.query("UPDATE users SET suspended_at=NOW() WHERE id=$1",[principalId])
    await assert.rejects(host.loadContext(work))
  } finally {
    memory.scopes = original
    await pool.query("UPDATE users SET suspended_at=NULL WHERE id=$1",[principalId])
    await api.cancel(run)
  }
})

test('failed and cancelled turns persist one system feedback, preserve work state and allow the next message', { timeout: 30000 }, async () => {
  const { api,enqueue,companyId,room } = await fixture('terminal-product')
  let fail = true, modelCalls = 0
  const claimed = new Map<string,WorkItem>(), usage = { available: true,inputTokens: 10,outputTokens: 2 }
  worker = createWorker({ controlPlane: { connectWorker(input) {
    const host = api.connectWorker(input)
    return { ...host,async claimWork(...args) { const work = await host.claimWork(...args); if (work) claimed.set(work.id,work); return work } }
  } },model: { modelId: 'terminal-fixture',contextWindowTokens: 200000,
    async run() {
      modelCalls++
      if (fail) throw Object.assign(new Error('PRIVATE_PROVIDER_BODY'),{ status: 402,request_id: 'safe-terminal-request' })
      return { text: 'Ready.',output: [{ role: 'assistant',content: 'Ready.' }],model: 'terminal-fixture',usage }
    },async structured() { return { value: { missing: [] },model: 'terminal-fixture',usage } },
    async compact() { throw new Error('fixture must not compact') },
  },worker: { id: 'terminal-product',concurrency: 1 } })
  const until = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 200; i++) { if (await check()) return; await delay(25) }
    assert.fail('durable terminal delivery did not converge')
  }
  const failed = await enqueue('terminal-failed'); await worker.runNext()
  assert.equal((await api.readRun(failed))?.status,'failed')
  assert.equal((await api.readRun(failed))?.resultId,null)
  await until(async () => (await api.readTerminal(failed))?.delivery === 'delivered')
  const terminal = (await api.readTerminal(failed))!
  assert.equal(terminal.feedback.reason,'model_unavailable'); assert.equal(modelCalls,1)
  const messages = () => recording.messages.filter(message => message.channelId === room)
  assert.equal(messages().length,1); assert.equal(messages()[0]!.payload.role,'system')
  assert.equal(messages()[0]!.payload.metadata.custom.suppressAgentWake,true)
  assert.doesNotMatch(nativeText(messages()[0]!.payload),/PRIVATE_|成功/)
  const deliver = createProductDelivery(lingxiOSControl).deliverTerminal!
  const context = { signal: AbortSignal.timeout(5000),deadlineAt: new Date(Date.now()+5000).toISOString() }
  await deliver(claimed.get(failed.runId)!,terminal.feedback,context)
  assert.equal(messages().length,1,'same terminal identity must not dispatch twice')
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM lingxios.agent_work_items WHERE tenant_id=$1',[companyId])).rows[0].n,1,'system feedback cannot enqueue an agent turn')
  fail = false
  const next = await enqueue('terminal-next'); await worker.runNext()
  assert.equal((await api.readRun(next))?.status,'succeeded')
  await until(async () => (await api.readRunState(next))?.delivery === 'delivered')
  const cancelled = await enqueue('terminal-cancelled'); const beforeCancel = modelCalls
  await api.cancel(cancelled)
  await until(async () => (await api.readTerminal(cancelled))?.delivery === 'delivered')
  assert.equal((await api.readRun(cancelled))?.status,'cancelled'); assert.equal(modelCalls,beforeCancel)
  assert.equal(messages().filter(message => message.payload.role === 'system').length,2)
  await mkdir('artifacts/runtime-reliability',{ recursive: true })
  await writeFile('artifacts/runtime-reliability/terminal.json',JSON.stringify({ failedWorkStatus: 'failed',failedResultId: null,
    providerFailureCalls: 1,terminalReplayExtraMessages: 0,systemMessages: 2,nextWorkStatus: 'succeeded',cancelExtraModelCalls: 0 },null,2)+'\n')
})
