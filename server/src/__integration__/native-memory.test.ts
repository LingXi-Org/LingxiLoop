import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import type { DecisionDriver, MemoryDocument } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let server: Server, baseUrl: string, worker: ReturnType<typeof createWorker> | undefined
before(async()=>{
  await ensureSchemaOnce();await resetAllTables();installFakeWukong()
  server=createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address();assert.ok(address && typeof address==='object');baseUrl=`http://127.0.0.1:${address.port}/api/im`
})
after(async()=>{ await worker?.stop();await teardownAll(server) })

for (const jev of [false,true]) test(`native memory writes remain Agent-only and preserve reviewed versioned writes (${jev ? 'Jev' : 'generative'})`,async()=>{
  await worker?.stop();await resetAllTables()
  const { companyId,projectId,agentId }=await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  const conversationId='memory-room',members=['test-owner',agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Memory',$4::jsonb)",[conversationId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[conversationId,companyId,JSON.stringify({ channelType: 2,members })])
  const app=await lingxiOSControl(),memory=app.memory
  assert.ok(memory)
  const policy=await syncConversationPolicy(app,companyId,conversationId)
  async function enqueue(messageId: string,text: string) {
    const accepted=await app.conversations.ingest({ tenantId: companyId,conversationId,policyVersion: policy.version,messageId,version: 1,
      author: { id: 'test-owner',kind: 'human' },text,mentions: [agentId] },{ mode: 'execute',executionClass: 'operation' })
    const run=accepted.runs[0];assert.ok(run);await bindProductRun(pool,run,conversationId);return run
  }

  const run=await enqueue('create-memory','Explicitly remember the checked lease-fencing fact.')
  const identity={ tenantId: companyId,principalId: 'test-owner',agentId,sessionId: run.sessionId,workId: run.runId }
  const scopes=await memory.scopes(identity),scope=scopes.find(item=>item.scopeType==='learner')
  assert.ok(scope);assert.ok(scope.scopeId.startsWith('im-memory:'))
  const response=await fetch(`${baseUrl}/channels/${conversationId}/agents/${agentId}/runs/${run.runId}/memory/scopes`,{ headers: { 'x-company-id': companyId } })
  assert.equal(response.status,404)

  const content={ path: 'notes/leases.md',title: 'Lease fencing',description: 'Checked learning note',body: 'Fencing rejects stale workers.',layer: 'core' as const,locked: true }
  let document: MemoryDocument | undefined,hop=0,reviewed=0
  const usage={ available: true,inputTokens: 100,outputTokens: 30,cachedInputTokens: 20 }
  const decisions: DecisionDriver = { modelId: 'jev-1.13.0',configurationFingerprint: 'jev-integration-fixture',inputCostMicrosPerMillion: 42000,
    mode: purpose=>purpose==='memory-write-review' ? 'active' : 'off',async decide(request) { reviewed++;return { model: 'jev-1.13.0',usage,
      answers: Object.fromEntries(Object.keys(request.questions).map(key=>[key,{ type: 'choice' as const,choice: 'yes',confidence: 1,probabilities: { yes: 1,no: 0,uncertain: 0 } }])) } } }
  worker=createWorker({ ...(jev ? { decisions } : {}),controlPlane: app,worker: { id: 'native-memory-worker' },model: {
    modelId: 'native-memory-fixture',contextWindowTokens: 200000,
    async run() {
      hop++
      if(hop===1) return { output: [{ type: 'function_call',callId: document ? 'update-memory' : 'create-memory',name: 'memory__apply',arguments: JSON.stringify({ scopeType: scope.scopeType,scopeId: scope.scopeId,
        changes: [document ? { action: 'update',id: document.id,expectedVersion: document.version,content: { ...content,body: 'Explicitly checked and updated fencing.' } } : { action: 'create',content }] }) }],text: '',model: 'native-memory-fixture',usage }
      return { output: [{ role: 'assistant',content: 'Checked the protected memory.' }],text: 'Checked the protected memory.',model: 'native-memory-fixture',usage }
    },
    async structured(input) {
      if (input.instructions.includes('"approved":boolean')) { assert.equal(jev,false,'active Jev must replace this generative reviewer');reviewed++;return { value: { approved: true,explicit: true,confidence: 1 },model: 'native-memory-fixture',usage } }
      return { value: { missing: [] },model: 'native-memory-fixture',usage }
    },async compact(){throw new Error('fixture must not compact')},
  } })
  assert.equal(await worker.runNext(),true)
  assert.ok(reviewed>0,'native independent reviewer must execute')
  const entries=await memory.list(identity,scope)
  assert.equal(entries.items.length,1)
  document=(await memory.read(identity,scope,entries.items[0].id))!
  assert.equal(document.origin,'explicit');assert.equal(document.version,1);assert.equal(document.body,content.body)

  const nextRun=await enqueue('update-memory','Explicitly update the protected fencing memory to the newly checked content.')
  const nextIdentity={ ...identity,sessionId: nextRun.sessionId,workId: nextRun.runId }
  assert.deepEqual(await memory.scopes(nextIdentity),scopes)
  hop=0
  assert.equal(await worker.runNext(),true)
  if (jev) {
    let calls: Array<{ model: string; cost_usd: string }> = []
    for (let attempt=0;attempt<50;attempt++) {
      calls=(await pool.query("SELECT model,cost_usd FROM llm_calls WHERE company_id=$1 AND purpose='lingxios.memory-write-review'",[companyId])).rows
      if (calls.length>=2) break
      await delay(100)
    }
    assert.ok(calls.length>=2,'Jev calls must reach the shared product ledger')
    assert.deepEqual(calls.map(call=>({ model: call.model,costUsd: Number(call.cost_usd) })),
      calls.map(()=>({ model: 'jev-1.13.0',costUsd: 0.000005 })))
  }
  document=(await memory.read(nextIdentity,scope,document.id))!
  assert.equal(document.version,2);assert.equal(document.body,'Explicitly checked and updated fencing.')
})
