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

// Failure cases: a removed browser route still exposes content, or a memory scope
// crosses tenant/project/user/agent/room/thread/audience boundaries after restoration.
test('memory remains internal and native scopes isolate identities and revoked audiences', async () => {
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
  const identity=await seedRun(),scope=(await memory.scopes(identity))[0]
  const input={scope,documents:[{path:'notes/fact.md',title:'Private fact',description:'PRIVATE SUMMARY',body:'PRIVATE BODY',layer:'core' as const}],
    idempotencyKey:'private-seed',sourceRef:'memory-1'}
  const created=await memory.initialize(identity,input)
  assert.deepEqual(await memory.initialize(identity,input),created,'replayed initialization must be idempotent')
  assert.equal((await memory.list(identity,scope)).items.length,1)
  for(const other of [await seedRun('memory-other'),await seedRun('test-owner','memory-peer'),
    await seedRun('test-owner',agentId,'memory-other-room'),await seedRun('test-owner',agentId,'memory-room','thread')]) {
    const otherScope=(await memory.scopes(other))[0]
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
  const reduced=JSON.stringify(['test-owner',agentId])
  await pool.query("UPDATE conversations SET members=$2::jsonb WHERE id=$1",['memory-room',reduced])
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1",['memory-room',reduced])
  await syncConversationPolicy(app,companyId,'memory-room')
  await assert.rejects(memory.list(identity,scope),'changed audience invalidates the old scope')
  await pool.query("UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id='test-owner'",[companyId])
  await assert.rejects(memory.scopes(identity),/revoked/)
})
