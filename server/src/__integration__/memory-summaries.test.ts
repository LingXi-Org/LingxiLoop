import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import {
  buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables,
  seedCompanyWithAgent, seedUserMembership, teardownAll,
} from './_helpers.js'

let server: Server, baseUrl: string
before(async () => {
  await ensureSchemaOnce(); await resetAllTables(); installFakeWukong()
  server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}/api/im`
})
after(async () => { await teardownAll(server) })

// Failure cases: stale or repeated forget removes a newer/other fact, raw bodies leak,
// or a browser request crosses tenant/project/user/agent/room/thread/audience boundaries.
test('memory chips and explicit forgetting preserve native authorization and versions', async () => {
  const { companyId,projectId,agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  await seedUserMembership('memory-other',companyId)
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
    VALUES('memory-peer',$1,'agent','Peer','tester','P','#abcdef','avail')`,[companyId])
  const members=['test-owner','memory-other',agentId,'memory-peer']
  for(const room of ['memory-room','memory-other-room']) {
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
      VALUES($1,$2,$3,'group','Memory',$4::jsonb)`,[room,companyId,projectId,JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [room,companyId,JSON.stringify({channelType:2,members})])
  }
  const app=await lingxiOSControl(),memory=app.memory!
  let sequence=0
  async function seedRun(principalId='test-owner',agent=agentId,room='memory-room',threadId?:string) {
    const policy=await syncConversationPolicy(app,companyId,room)
    if(threadId) await app.conversations.registerThread({tenantId:companyId,conversationId:room,threadId,policyVersion:policy.version})
    const accepted=await app.conversations.ingest({tenantId:companyId,conversationId:room,policyVersion:policy.version,
      messageId:`memory-${++sequence}`,version:1,author:{id:principalId,kind:'human'},text:'Remember the checked fact',mentions:[agent],
      ...(threadId?{threadId}:{})},{mode:'execute',executionClass:'operation'})
    const run=accepted.runs[0];assert.ok(run);await bindProductRun(pool,run,room)
    return {...run,workId:run.runId}
  }
  const identity=await seedRun(),scope=(await memory.scopes(identity)).find(item=>item.scopeType==='session')!
  const input={scope,documents:[{path:'notes/fact.md',title:'Preference',description:'Use Chinese',body:'PRIVATE BODY',layer:'core' as const}],
    idempotencyKey:'private-seed',sourceRef:'memory-1'}
  const created=await memory.initialize(identity,input)
  assert.deepEqual(await memory.initialize(identity,input),created,'replayed initialization must be idempotent')
  assert.equal((await memory.list(identity,scope)).items.length,1)
  for(const other of [await seedRun('memory-other'),await seedRun('test-owner','memory-peer'),
    await seedRun('test-owner',agentId,'memory-other-room'),await seedRun('test-owner',agentId,'memory-room','thread')]) {
    const otherScope=(await memory.scopes(other)).find(item=>item.scopeType==='session')!
    assert.notEqual(otherScope.scopeId,scope.scopeId)
    assert.deepEqual((await memory.list(other,otherScope)).items,[])
    await assert.rejects(memory.list(other,scope),/revoked/)
  }
  await assert.rejects(memory.list({...identity,tenantId:'other-tenant'},scope))
  await assert.rejects(memory.list({...identity,agentId:'memory-peer'},scope))
  const requestHeaders: Record<string,string>[] = [{'x-company-id':companyId,'x-project-id':projectId},
    {'x-company-id':companyId,'x-project-id':'other-project'},{'x-company-id':'other-tenant'}]
  for(const headers of requestHeaders) {
    const response=await fetch(`${baseUrl}/channels/memory-room/memories`,{headers})
    assert.equal(response.status,404)
    assert.doesNotMatch(await response.text(),/PRIVATE/)
  }
  const doc=created.documents[0], headers={ 'x-company-id':companyId,'x-project-id':projectId,'Content-Type':'application/json' }
  const url=`${baseUrl}/channels/memory-room/agents/${agentId}/runs/${identity.runId}/memory`
  const read=await fetch(`${url}?ids=${doc.id}`,{headers})
  assert.equal(read.status,200)
  assert.deepEqual(await read.json(),{chips:[{id:doc.id,text:'Use Chinese',version:1,change:'existing'}]})
  for(const patch of [{'x-project-id':'other-project'},{'x-company-id':'other-tenant'}]) {
    assert.equal((await fetch(`${url}?ids=${doc.id}`,{headers:{...headers,...patch}})).status,403)
  }
  assert.equal((await fetch(url.replace(identity.runId,'missing')+`?ids=${doc.id}`,{headers})).status,404)
  const other=await seedRun('memory-other')
  assert.equal((await fetch(url.replace(identity.runId,other.runId)+`?ids=${doc.id}`,{headers})).status,404)
  const another=await memory.initialize(identity,{...input,documents:[{...input.documents[0],path:'notes/other.md'}],idempotencyKey:'second'})
  const forget=(version:number)=>fetch(`${url}/${doc.id}`,{method:'DELETE',headers,body:JSON.stringify({expectedVersion:version})})
  assert.equal((await forget(2)).status,409)
  assert.ok(await memory.read(identity,scope,doc.id))
  assert.equal((await forget(1)).status,200)
  assert.equal((await forget(1)).status,200,'retry is idempotent')
  assert.equal(await memory.read(identity,scope,doc.id),null)
  assert.ok(await memory.read(identity,scope,another.documents[0].id),'forget only affects the selected document')
  assert.deepEqual(await (await fetch(`${url}?ids=${doc.id}`,{headers})).json(),{chips:[]},'reload does not restore forgotten chips')
  const reduced=JSON.stringify(['test-owner',agentId])
  await pool.query("UPDATE conversations SET members=$2::jsonb WHERE id=$1",['memory-room',reduced])
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1",['memory-room',reduced])
  await syncConversationPolicy(app,companyId,'memory-room')
  assert.equal((await fetch(`${url}?ids=${another.documents[0].id}`,{headers})).status,403)
  assert.equal((await fetch(`${url}/${another.documents[0].id}`,{method:'DELETE',headers,body:JSON.stringify({expectedVersion:1})})).status,403)
  await assert.rejects(memory.list(identity,scope),'changed audience invalidates the old scope')
  await pool.query("UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id='test-owner'",[companyId])
  await assert.rejects(memory.scopes(identity),/revoked/)
})
