import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { WorkItem } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun, productRunIdentity, assertFrozenAudience } from '../agent-runtime/identity.js'
import { authorizeAudienceRead } from '../agents/tools.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce(); await resetAllTables() })
let worker: ReturnType<typeof createWorker> | undefined
const modelStop = new AbortController()
after(async () => { modelStop.abort(); await worker?.stop(); await teardownAll() })

test('product policy feeds native IM identities, graph waits, state conflicts and revocation', async () => {
  const { companyId,projectId,agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  const second = 'second-agent', conversationId = 'native-room'
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
    VALUES($1,$2,'agent','Second','tester','S','#abcdef','avail')`, [second,companyId])
  const members = ['test-owner',agentId,second]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Native',$4::jsonb)`,
    [conversationId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)',
    [conversationId,companyId,JSON.stringify({ channelType: 2,members }),agentId])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,conversationId)
  assert.deepEqual(policy.participants.filter(member => member.kind === 'agent').map(member => member.id).sort(),[agentId,second].sort())
  assert.equal((await syncConversationPolicy(api,companyId,conversationId)).version,policy.version)
  const scope = { tenantId: companyId,conversationId }
  const message = { ...scope,policyVersion: policy.version,messageId: 'source',version: 1,
    author: { id: 'test-owner',kind: 'human' as const },text: 'Please collaborate',mentions: [agentId,second] }
  const accepted = await api.conversations.ingest(message,{ mode: 'execute',executionClass: 'operation' })
  assert.equal(accepted.runs.length,2)
  assert.deepEqual((await api.conversations.ingest(message)).runs,accepted.runs)
  for (const run of accepted.runs) {
    assert.notEqual(run.sessionId,conversationId)
    await bindProductRun(pool,run,conversationId)
    assert.deepEqual(await productRunIdentity({ companyId,conversationId,agentId: run.agentId,runId: run.runId,principalId: 'test-owner' }),run)
  }
  const server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const url = `http://127.0.0.1:${address.port}/api/im/channels/${conversationId}/runs`
    const discover = async () => {
      const response = await fetch(url,{ headers: { 'x-company-id': companyId } })
      assert.equal(response.status,200)
      return await response.json() as { runId: string; requestVersion: number; fence: number; status: string }[]
    }
    assert.equal((await discover()).length,2)
    const target = accepted.runs[0]
    assert.equal(await api.revise(target,'Updated collaboration request'),true)
    const discovered = (await discover()).find(run => run.runId === target.runId)!
    const current = (await api.readRun(target))!
    assert.deepEqual([discovered.requestVersion,discovered.fence,discovered.status],[current.requestVersion,current.fence,current.status])
    assert.equal(discovered.requestVersion,2)
    for (let reconnect=0;reconnect<2;reconnect++) {
      const stream = await fetch(`http://127.0.0.1:${address.port}/api/im/companies/${companyId}/channels/${conversationId}/agents/${target.agentId}/runs/${target.runId}/stream`,{ signal: AbortSignal.timeout(5000) })
      assert.equal(stream.status,200)
      assert.ok(stream.headers.get('content-type')?.startsWith('text/event-stream'))
      const reader=stream.body!.getReader()
      try {
        let frame=''
        while (!frame.includes('\n\n')) {
          const next=await reader.read();assert.equal(next.done,false)
          frame+=new TextDecoder().decode(next.value)
        }
        assert.match(frame,/event: state/)
        const state=JSON.parse(frame.split('\n').find(line=>line.startsWith('data: '))!.slice(6))
        assert.deepEqual([state.type,state.state.run.id,state.state.run.requestVersion],['state',target.runId,2])
      } finally { await reader.cancel() }
    }
    const denied = await fetch(url,{ headers: { 'x-company-id': 'outside-company' } })
    assert.equal(denied.status,403)
  } finally { await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())) }
  let claimed: WorkItem | null = null
  let markStarted!: () => void
  const started = new Promise<void>(resolve => { markStarted = resolve })
  worker = createWorker({ controlPlane: { connectWorker(input) {
    const host = api.connectWorker(input)
    return { ...host, async claimWork(...args) { const work = await host.claimWork(...args); if (work) claimed = work; return work } }
  } }, worker: { id: 'native-test',concurrency: 1,shutdownGraceMs: 1000 },
    modelBudget: { inputCostMicrosPerMillion: 1,outputCostMicrosPerMillion: 1 },
    model: { modelId: 'integration-fixture',contextWindowTokens: 200000,
      async run(request) {
        markStarted()
        const signal = AbortSignal.any([modelStop.signal,...request.signal ? [request.signal] : []])
        await new Promise<void>((_resolve,reject) => {
          signal.throwIfAborted()
          signal.addEventListener('abort',() => reject(signal.reason),{ once: true })
        })
        throw new Error('fixture model must be cancelled')
      }, async structured() { throw new Error('no auxiliary model calls expected') }, async compact() { throw new Error('no compaction expected') },
    } })
  await worker.start()
  await Promise.race([started,new Promise<never>((_resolve,reject) => { const timer=setTimeout(() => reject(new Error('worker did not reach model')),15000); timer.unref() })])
  assert.ok(claimed)
  await assertFrozenAudience(pool,claimed)
  await authorizeAudienceRead({ work: claimed,database: pool },{ action: 'conversation:read',resource: { type: 'conversation',id: conversationId } })
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1", [conversationId,JSON.stringify([...members,'new-reader'])])
  await assert.rejects(assertFrozenAudience(pool,claimed), /frozen audience/)
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1", [conversationId,JSON.stringify(members)])
  await pool.query('UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2', [companyId,second])
  await assert.rejects(authorizeAudienceRead({ work: claimed,database: pool },{ action: 'conversation:read',resource: { type: 'conversation',id: conversationId } }), /audience is no longer available/)
  await pool.query('UPDATE participants SET departed_at=NULL WHERE company_id=$1 AND id=$2', [companyId,second])
  const parent = (await api.listRuns({ tenantId: companyId,status: 'leased',limit: 1 })).items[0].identity
  const graph = await api.graphs.enqueue(parent,{ id: 'research',nodes: [
    { id: 'first',agentId,text: 'Observe source' },
    { id: 'second',agentId: second,text: 'Verify observation',dependsOn: ['first'] },
  ] })
  assert.equal(graph.nodes.length,2)
  assert.equal((await api.graphs.waitForChildren(parent,graph.nodes.map(node => node.workId))).type,'defer')
  await assert.rejects(api.graphs.waitForChildren(parent,['outside-child']))
  const state = { ...scope,principalId: 'test-owner',stateId: 'canvas' }
  await api.sharedState.create(state)
  const change = { operationId: 'first-change',changes: [{ field: 'finding',expectedVersion: 0,value: 'Observed' }] }
  const updated = await api.sharedState.apply(state,change,{ messageId: 'source',version: 1 })
  assert.equal(updated.ok,true)
  assert.equal((await api.sharedState.apply(state,change,{ messageId: 'source',version: 1 })).deduplicated,true)
  const conflict = await api.sharedState.apply(state,{ operationId: 'stale-change',changes: [{ field: 'finding',expectedVersion: 0,value: 'Overwrite' }] })
  assert.equal(conflict.ok,false)
  assert.ok((await api.sharedState.history(state)).items.length)
  await pool.query("UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2", [companyId,second])
  await syncConversationPolicy(api,companyId,conversationId)
  await assert.rejects(api.graphs.read(parent,'research'))
})
