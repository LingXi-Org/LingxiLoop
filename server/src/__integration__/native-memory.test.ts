import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'
import type { MemoryDocument } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure cases: missing native methods, lost recall, unreviewed protected changes,
// stale writes, missing steps in HTTP/SSE/IM replay, private payload leaks and incomplete forgetting.
let server: Server, baseUrl: string, worker: ReturnType<typeof createWorker> | undefined
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async()=>{
  await ensureSchemaOnce();await resetAllTables();recording=await installRecordingWukong()
  server=createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address();assert.ok(address && typeof address==='object');baseUrl=`http://127.0.0.1:${address.port}/api/im`
})
after(async()=>{ await worker?.stop();await teardownAll(server);await recording?.close() })

test('native memory steps reach Run Activity and preserve reviewed versioned writes',async()=>{
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
  assert.ok(scope);assert.ok(scope.scopeId.startsWith('stable-memory:'))
  assert.equal((await fetch(`${baseUrl}/channels/${conversationId}/memories`,{ headers: { 'x-company-id': companyId } })).status,404)
  const response=await fetch(`${baseUrl}/channels/${conversationId}/agents/${agentId}/runs/${run.runId}/memory/scopes`,{ headers: { 'x-company-id': companyId } })
  assert.equal(response.status,404)

  const content={ path: 'notes/leases.md',title: 'Lease fencing',description: 'Checked learning note',body: 'Fencing rejects stale workers.',layer: 'core' as const,locked: true }
  let document: MemoryDocument | undefined,hop=0,reviewed=0, explicit=true
  let method='apply', args: Record<string,unknown> | undefined
  const methods=['apply','doctor','forget','history','list','read','reflect','restore','search']
  const usage={ available: true,inputTokens: 100,outputTokens: 30,cachedInputTokens: 20 }
  worker=createWorker({ controlPlane: app,worker: { id: 'native-memory-worker' },model: {
    modelId: 'native-memory-fixture',contextWindowTokens: 200000,
    async run(input) {
      // The host's summary tool is additional to the nine native memory methods.
      assert.deepEqual(input.tools!.filter(tool=>tool.name.startsWith('memory__')).map(tool=>tool.name.slice(8)).sort(),[...methods,'summary'].sort())
      if(document && method==='read') assert.ok(JSON.stringify(input).includes(document.body),'core memory reaches the next turn')
      hop++
      if(hop===1) return { output: [{ type: 'function_call',callId: document ? 'update-memory' : 'create-memory',name: `memory__${method}`,arguments: JSON.stringify({ scopeType: scope.scopeType,scopeId: scope.scopeId,
        ...(args ?? { changes: [document ? { action: 'update',id: document.id,expectedVersion: document.version,content: { ...content,body: 'Explicitly checked and updated fencing.' } } : { action: 'create',content }] }) }) }],text: '',model: 'native-memory-fixture',usage }
      return { output: [{ role: 'assistant',content: 'Done.' }],text: 'Done.',model: 'native-memory-fixture',usage }
    },
    async structured(input) {
      if (input.instructions.includes('"approved":boolean')) { reviewed++;return { value: { approved: true,explicit,confidence: 1 },model: 'native-memory-fixture',usage } }
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
  document=(await memory.read(nextIdentity,scope,document.id))!
  assert.equal(document.version,2);assert.equal(document.body,'Explicitly checked and updated fencing.')
  async function action(name: string, input: Record<string,unknown>, text='Check the existing note.') {
    method=name; args=input; hop=0
    const actionRun=await enqueue(`action-${++index}`,text)
    assert.equal(await worker!.runNext(),true)
    const events=(await app.readEvents(actionRun,0)).events
    const started=events.find(event=>event.kind==='tool.started' && event.data.name===`memory.${name}`)
    const completion=events.find(event=>event.kind==='tool.completed' && event.data.toolCallId===started?.data.toolCallId)
    assert.ok(completion,`${name} must execute`)
    const result=completion.data.result as {status:string;value?:unknown}
    const projection=await readRunProjection(app,actionRun,true)
    assert.ok(projection.snapshot.message.content.some(part=>part.type==='tool-call' && part.toolName===`memory.${name}`))
    assert.doesNotMatch(JSON.stringify(projection.snapshot),/(?:im|stable)-memory:|Fencing rejects stale workers|Explicitly checked and updated fencing/)
    const response=await fetch(`${baseUrl}/channels/${conversationId}/agents/${agentId}/runs/${actionRun.runId}`,{headers:{'x-company-id':companyId}})
    assert.equal(response.status,200)
    assert.match(await response.text(),new RegExp(`memory\\.${name}`))
    const stream=await fetch(`${baseUrl}/companies/${companyId}/channels/${conversationId}/agents/${agentId}/runs/${actionRun.runId}/stream`,
      {headers:{'x-company-id':companyId},signal:AbortSignal.timeout(15000)})
    assert.equal(stream.status,200)
    assert.match(await stream.text(),new RegExp(`memory\\.${name}`))
    return {result,identity:{...identity,sessionId:actionRun.sessionId,workId:actionRun.runId}}
  }
  let index=0
  for(const [name,input] of [['list',{}],['read',{id:document.id}],['search',{query:'fencing'}],['history',{id:document.id}],['doctor',{}],['reflect',{}]] as const) {
    const {result}=await action(name,input)
    assert.equal(result.status,'completed',name)
    if(name==='reflect') assert.ok(Array.isArray((result.value as {jobIds:unknown[]}).jobIds))
  }
  const stale=await action('apply',{changes:[{action:'update',id:document.id,expectedVersion:1,content}]},'Explicitly update the fencing note.')
  assert.notEqual(stale.result.status,'completed')
  assert.equal((await memory.read(stale.identity,scope,document.id))!.version,2)
  explicit=false
  const denied=await action('apply',{changes:[{action:'update',id:document.id,expectedVersion:2,content}]})
  assert.notEqual(denied.result.status,'completed','locked memory requires explicit authorization')
  const forgetDenied=await action('forget',{})
  assert.notEqual(forgetDenied.result.status,'completed')
  explicit=true
  const restored=await action('restore',{id:document.id,expectedVersion:2,version:1},'Explicitly restore the fencing note to version one.')
  assert.equal(restored.result.status,'completed')
  document=(await memory.read(restored.identity,scope,document.id))!
  assert.equal(document.version,3);assert.equal(document.body,content.body)
  const forgotten=await action('forget',{},'Explicitly forget all long-term memory and evidence in this scope.')
  assert.equal(forgotten.result.status,'completed')
  assert.deepEqual((await memory.list(forgotten.identity,scope)).items,[])
  assert.equal(await memory.read(forgotten.identity,scope,document.id,1),null)
  assert.equal(reviewed,6,'stale writes fail before review; each current mutation is independently reviewed')
  const deadline=Date.now()+15000
  while(recording.messages.filter(message=>message.payload.role==='assistant').length<index+2) {
    assert.ok(Date.now()<deadline,'all completed runs must reach durable IM delivery')
    await delay(50)
  }
  const delivered=JSON.stringify(recording.messages.map(message=>message.payload))
  for(const name of methods) assert.ok(delivered.includes(`memory.${name}`),`${name} reaches durable history`)
  assert.doesNotMatch(delivered,/(?:im|stable)-memory:|Fencing rejects stale workers|Explicitly checked and updated fencing/)
})
