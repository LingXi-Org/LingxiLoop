import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import type { MemoryApplyInput, MemoryDocument, MemoryScope } from '@lyyzka/lingxios'
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

test('native memory management preserves authorization, reviewed edits, versions, recovery and forgetting',async()=>{
  const { companyId,projectId,agentId }=await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  const conversationId='memory-room',members=['test-owner',agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Memory',$4::jsonb)",[conversationId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[conversationId,companyId,JSON.stringify({ channelType: 2,members })])
  const app=await lingxiOSControl(),memory=app.memory!
  assert.ok(memory)
  const policy=await syncConversationPolicy(app,companyId,conversationId)
  async function enqueue(messageId: string,text: string) {
    const accepted=await app.conversations.ingest({ tenantId: companyId,conversationId,policyVersion: policy.version,messageId,version: 1,
      author: { id: 'test-owner',kind: 'human' },text,mentions: [agentId] },{ mode: 'execute',executionClass: 'operation' })
    const run=accepted.runs[0];assert.ok(run);await bindProductRun(pool,run,conversationId);return run
  }
  const run=await enqueue('initial','Inspect the stored memory; do not modify protected content.')
  const identity={ tenantId: companyId,principalId: 'test-owner',agentId,sessionId: run.sessionId,workId: run.runId }
  const root=`${baseUrl}/channels/${conversationId}/agents/${agentId}/runs/${run.runId}/memory`
  const request=async(path: string,body?: unknown)=>fetch(root+path,{ headers: { 'x-company-id': companyId,'content-type': 'application/json' },...body ? { method: 'POST',body: JSON.stringify(body) } : {} })
  const response=await request('/scopes');assert.equal(response.status,200)
  const scopes=await response.json() as MemoryScope[];assert.equal(scopes.length,3)
  const scope=scopes.find(item=>item.scopeType==='learner')!;assert.ok(scope.scopeId.startsWith('im-memory:'))
  const query=new URLSearchParams({ scopeType: scope.scopeType,scopeId: scope.scopeId })
  const content={ path: 'notes/leases.md',title: 'Lease fencing',description: 'Checked learning note',body: 'Fencing rejects stale workers.',layer: 'core' as const,locked: true }
  const create: MemoryApplyInput={ scope,changes: [{ action: 'create',content }],idempotencyKey: 'create-memory',sourceRef: 'client-untrusted-source' }
  const created=await request('/apply',create);assert.equal(created.status,200)
  let document=(await created.json() as { documents: MemoryDocument[] }).documents[0]
  assert.equal(document.origin,'explicit');assert.equal(document.locked,true)
  assert.equal(document.sources[0].authorId,'test-owner');assert.ok(document.sources[0].sourceRef.startsWith('user:test-owner:memory:'))
  assert.equal((await (await request('/apply',create)).json() as { documents: MemoryDocument[] }).documents[0].id,document.id)
  assert.equal((await request('/apply',{ ...create,idempotencyKey: 'malformed',changes: [{ action: 'update',id: document.id,expectedVersion: 1,content: { ...content,unexpected: true } }] })).status,400)
  assert.equal((await request('/apply',{ ...create,idempotencyKey: 'foreign',scope: { ...scope,tenantId: 'foreign' } })).status,403)
  assert.equal((await memory.search(identity,scope,{ query: 'Fencing' })).items.length,1)
  assert.equal((await request('/documents?'+query)).status,200)

  let mode: 'implicit'|'explicit'='implicit',hop=0,reviewed=0
  const usage={ available: true,inputTokens: 100,outputTokens: 30,cachedInputTokens: 20 }
  worker=createWorker({ controlPlane: app,worker: { id: 'native-memory-worker' },model: {
    modelId: 'native-memory-fixture',contextWindowTokens: 200000,
    async run() {
      hop++
      if(hop===1) return { output: [{ type: 'function_call',callId: `change-${mode}`,name: 'memory__apply',arguments: JSON.stringify({ scopeType: scope.scopeType,scopeId: scope.scopeId,
        changes: [{ action: 'update',id: document.id,expectedVersion: document.version,content: { ...content,body: 'Explicitly checked and updated fencing.' } }] }) }],text: '',model: 'native-memory-fixture',usage }
      return { output: [{ role: 'assistant',content: 'Checked the protected memory.' }],text: 'Checked the protected memory.',model: 'native-memory-fixture',usage }
    },
    async structured(input) {
      if (input.instructions.includes('"approved":boolean')) { reviewed++;return { value: { approved: mode==='explicit',explicit: mode==='explicit',confidence: 1 },model: 'native-memory-fixture',usage } }
      return { value: { missing: [] },model: 'native-memory-fixture',usage }
    },async compact(){throw new Error('fixture must not compact')},
  } })
  assert.equal(await worker.runNext(),true)
  assert.ok(reviewed>0,'native independent reviewer must execute')
  assert.equal((await memory.read(identity,scope,document.id))!.body,content.body)
  mode='explicit';hop=0
  const nextRun=await enqueue('explicit','Explicitly update the protected fencing memory to the newly checked content.')
  assert.deepEqual(await memory.scopes({ ...identity,sessionId: nextRun.sessionId,workId: nextRun.runId }),scopes)
  assert.equal(await worker.runNext(),true)
  document=(await memory.read(identity,scope,document.id))!
  assert.equal(document.version,2);assert.equal(document.body,'Explicitly checked and updated fencing.')
  assert.equal((await request('/apply',{ ...create,idempotencyKey: 'stale',changes: [{ action: 'update',id: document.id,expectedVersion: 1,content }] })).status,409)
  const history=await request(`/documents/${document.id}/history?${query}`);assert.equal(history.status,200)
  assert.ok((await history.json() as { items: unknown[] }).items.length>=2)
  const restored=await request('/restore',{ scope,id: document.id,expectedVersion: 2,version: 1,idempotencyKey: 'restore-memory',sourceRef: 'client' });assert.equal(restored.status,200)
  assert.equal((await memory.read(identity,scope,document.id))!.body,content.body)
  assert.equal((await request('/doctor?'+query)).status,200)
  assert.equal((await request('/evolution?'+query)).status,200)
  const reflection=await request('/reflect',scope);assert.equal(reflection.status,200)
  assert.ok(Array.isArray((await reflection.json() as { jobIds: string[] }).jobIds))
  await assert.rejects(memory.scopes({ ...identity,principalId: 'other-user' }))
  await assert.rejects(memory.scopes({ ...identity,tenantId: 'other-tenant' }))
  await assert.rejects(memory.scopes({ ...identity,threadId: 'other-thread' }))
  const forgotten=await request('/forget',scope);assert.equal(forgotten.status,200)
  assert.deepEqual((await memory.list(identity,scope)).items,[])
  await pool.query('UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2',[companyId,agentId])
  await assert.rejects(memory.scopes(identity))
})
