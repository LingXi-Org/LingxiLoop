import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { CH_AGENT_RUN_AVAILABLE, redis } from '../redis.js'
import type { WorkItem, RunIdentity } from '@lyyzka/lingxios'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import type { ConversationRunSummary } from '../../../src/lib/conversationRunSummary.js'

// Real product authorization, product binding SQL and formal runtime reads.
// Only synthetic principals/content and an in-process deterministic fake model;
// no native-table writes, external provider or message-history discovery.
let im: Awaited<ReturnType<typeof installRecordingWukong>>, server: Server, origin: string
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  im = await installRecordingWukong()
  server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  origin = `http://127.0.0.1:${address.port}`
})
after(async () => { await teardownAll(server); await im?.close() })

test('unopened authorized channel lists its actual wait; cancellation and membership changes invalidate it', async t => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const room = 'summary-course-room', secondRoom = 'summary-second-room', otherRoom = 'summary-other-course-room', otherProject = 'summary-other-course'
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,color,created_by) VALUES($1,$2,'INSTITUTIONAL_COURSE','Other synthetic course','#667085','test-owner')`, [otherProject, companyId])
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'test-owner','TEACHER')`, [otherProject, companyId])
  for (const [id, project] of [[room, projectId], [secondRoom, projectId], [otherRoom, otherProject]]) {
    const members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [id, companyId, project, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [id, companyId, JSON.stringify({ channelType: 2, members })])
  }
  const api = await lingxiOSControl()
  const usage = { available: true, inputTokens: 10, outputTokens: 5 }
  let fakeCalls = 0, beforeParkObserved = false, invalidationsAfterPark = 0
  let identity: RunIdentity | undefined, claimed: WorkItem | undefined
  const subscriber = redis.duplicate()
  await subscriber.subscribe(CH_AGENT_RUN_AVAILABLE)
  let resolveParked!: () => void, rejectParked!: (error: unknown) => void
  const parkedNotification = new Promise<void>((resolve, reject) => { resolveParked = resolve; rejectParked = reject })
  subscriber.on('message', (_channel, payload) => {
    const event = JSON.parse(payload) as { runId?: string; companyId?: string; conversationId?: string }
    if (!identity || event.runId !== identity.runId || event.companyId !== companyId || event.conversationId !== room) return
    void api.readRun(identity).then(current => {
      if (current?.status === 'waiting') { invalidationsAfterPark++; resolveParked() }
    }).catch(rejectParked)
  })
  const worker = createWorker({ controlPlane: { connectWorker(input) {
    const host = api.connectWorker(input)
    return { ...host, async claimWork(...args) { const next = await host.claimWork(...args); if (next) claimed = next; return next },
      async waitWork(proof, outcome) {
        // The real question message has arrived, but the native durable run is
        // still leased. An immediate message-triggered reload cannot see wait.
        const before = await (await fetch(`${origin}/api/im/channels`, { headers: { 'x-company-id': companyId, 'x-project-id': projectId } })).json() as Array<{ id: string; runSummary: ConversationRunSummary | null }>
        assert.equal(before.find(row => row.id === room)?.runSummary?.kind, 'processing')
        assert.ok(claimed)
        await assert.rejects(createProductDelivery(async () => api).onEvent(claimed, { runId: proof.id, seq: 1, kind: 'goal.waiting', stage: 'completed', visibility: 'user', data: { goalOutcome: outcome } },
          { signal: AbortSignal.timeout(1000), deadlineAt: new Date(Date.now() + 1000).toISOString() }), /awaits the durable run transition/)
        beforeParkObserved = true
        return host.waitWork(proof, outcome)
      },
    }
  } }, worker: { id: 'channel-summary-synthetic', concurrency: 1, shutdownGraceMs: 1000 },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'channel-summary-synthetic', contextWindowTokens: 200000,
      async run() {
        fakeCalls++
        return { text: '', output: [{ type: 'function_call', callId: 'summary-question', name: 'chat__ask', arguments: JSON.stringify({
          title: '合成子网练习', items: [{ name: 'attempt', prompt: '请填写自己的第一步', required: true, input: { label: '第一步' } }],
        }) }], usage }
      },
      async structured() { return { value: { missing: [] }, model: 'channel-summary-synthetic', usage } },
      async compact() { throw new Error('bounded fixture must not compact') },
    } })
  try {
    const admit = async (conversationId: string) => {
      const policy = await syncConversationPolicy(api, companyId, conversationId)
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: `request-${conversationId}`, version: 1, author: { id: 'test-owner', kind: 'human' }, text: '合成练习：先询问我的尝试。', mentions: [agentId] },
      { mode: 'execute', executionClass: 'operation', codeExecution: 'disabled' })
      const identity = accepted.runs[0]; assert.ok(identity)
      await bindProductRun(pool, identity, conversationId, false, `request-${conversationId}`)
      return identity
    }
    identity = await admit(room)
    assert.equal(identity.principalId, 'test-owner', 'native principal is the actual human, never a service-wide identity')
    assert.equal(await worker.runNext(), true)
    assert.equal((await api.readRun(identity))?.status, 'waiting')
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([parkedNotification, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('No durable post-park list invalidation observed')), 12_000) })]) }
    finally { clearTimeout(timer) }
    assert.equal(beforeParkObserved, true)
    assert.ok(invalidationsAfterPark >= 1, 'the actual native event outbox eventually publishes the existing Redis hint after park')
    await admit(secondRoom)
    await admit(otherRoom) // Same human/tenant active metadata must stay in its other course.
    const counts = { list: 0, run: 0 }
    const list = api.listRuns.bind(api), read = api.readRun.bind(api)
    t.mock.method(api, 'listRuns', async (...args: Parameters<typeof api.listRuns>) => { counts.list++; return list(...args) })
    t.mock.method(api, 'readRun', async (...args: Parameters<typeof api.readRun>) => { counts.run++; return read(...args) })
    const headers = { 'x-company-id': companyId, 'x-project-id': projectId }
    const response = await fetch(`${origin}/api/im/channels`, { headers })
    assert.equal(response.status, 200)
    const rows = await response.json() as Array<{ id: string; runSummary: ConversationRunSummary | null }>
    assert.deepEqual(rows.map(row => row.id).sort(), [room, secondRoom].sort())
    assert.equal(rows.find(row => row.id === secondRoom)?.runSummary?.kind, 'queued')
    assert.deepEqual(rows.find(row => row.id === room)?.runSummary, { kind: 'waiting_input', actor: 'you', runId: identity.runId, agentId,
      requestVersion: 1, fence: (await read(identity))!.fence })
    assert.equal(counts.list, 3); assert.equal(counts.run, 1)
    assert.equal(fakeCalls, 1, 'listing cannot invoke or resume the model')
    assert.doesNotMatch(JSON.stringify(rows), /summary-other-course|principalId|goalOutcome|verification|preview|executionMs|tokens|costMicros/)
    assert.ok([403, 404].includes((await fetch(`${origin}/api/im/channels`, { headers: { ...headers, 'x-company-id': 'foreign-tenant' } })).status))
    assert.ok([403, 404].includes((await fetch(`${origin}/api/im/channels`, { headers: { ...headers, 'x-project-id': 'foreign-course' } })).status))
    assert.equal(await api.cancel(identity), true)
    const cancelled = await (await fetch(`${origin}/api/im/channels`, { headers })).json() as typeof rows
    assert.equal(cancelled.find(row => row.id === room)?.runSummary, null, 'cancelled durable work cannot remain a personal pending action')
    await pool.query(`UPDATE conversations SET members=$3::jsonb WHERE company_id=$1 AND id=ANY($2::text[])`, [companyId, [room, secondRoom], JSON.stringify([agentId])])
    const before = counts.list
    assert.deepEqual(await (await fetch(`${origin}/api/im/channels`, { headers })).json(), [])
    assert.equal(counts.list, before, 'removed membership gives an empty authorized binding set and zero runtime queries')
    t.diagnostic(JSON.stringify({ firstList: { nativePages: 3, selectedWaitReads: 1 }, fakeCalls, beforeParkObserved, invalidationsAfterPark, multipleAuthorizedSessions: true, noChatHistory: true, noExternalProvider: true }))
  } finally { await worker.stop(); await subscriber.quit() }
})
