import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createLingxiOS, type CitationEvidence } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { z } from 'zod'
import { nativeTool } from '../agents/tools.js'
import { pool } from '../db/pool.js'
import { createProductContext, ProductRuntimePolicy } from '../agent-runtime/context.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { _setWukongClientForTests, WukongClient } from '../im/wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce(); await resetAllTables() })
after(async () => { await teardownAll() })

test('product correction commits frozen excerpts and preserves them in IM delivery and authenticated reconnects', async (t) => {
  const notebookEnabled = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'false'
  t.after(() => {
    if (notebookEnabled === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = notebookEnabled
  })
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const conversationId = 'citation-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Citations',$4::jsonb)`,
    [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members }), agentId])
  await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,conversation_id,title,kind,status,visibility_scope,owner_user_id,created_by_user_id,created_via)
    VALUES('source',$1,$2,$3,'学习指南','text','ready','PRIVATE','test-owner','test-owner','USER')`, [companyId, projectId, conversationId])
  const evidence: CitationEvidence[] = ['将复习分散到不同日期，有助于长期记忆。', '通过 `retrieval` 主动回忆。', '结合间隔复习与主动回忆。']
    .map((excerpt, index) => ({ marker: `S${index + 1}`, sourceId: 'source', sourceVersion: 'v1', chunkId: `chunk-${index + 1}`,
      title: '学习指南', excerpt, truncated: true }))
  const frozen = structuredClone(evidence)
  const appended = { ...frozen[0], marker: 'S4', chunkId: 'chunk-4', excerpt: '根据练习结果调整复习间隔。' }
  const expectedEvidence = [...frozen, appended]
  const search = nativeTool('knowledge.search', z.object({}).strict(), {
    description: 'Read citation fixture excerpts', effect: 'read', approval: false,
    async authorize() {},
    async execute() {
      const evidence = [frozen[0], appended].map(({ marker: _marker, ...item }) => item)
      return { ok: true, value: { matches: evidence }, evidence }
    },
  })
  await pool.query("UPDATE participants SET capabilities='[\"knowledge\"]'::jsonb WHERE id=$1", [agentId])
  const product = createProductContext([search])
  const application = createLingxiOS({ database: pool, ...product, tools: [search],
    contextProvider: { ...product.contextProvider, async loadContext(work) {
      return { ...await product.contextProvider.loadContext(work), evidence }
    } }, delivery: createProductDelivery(() => application) })
  const api = await application
  let calls = 0
  const body = '建议[**分散安排**复习](#cite-S1)，并[隔天回顾](#cite-S1)，[主动回忆](#cite-S2)，[结合练习](#cite-S1,S3)，[调整间隔](#cite-S4)。'
  const worker = createWorker({ controlPlane: api, policy: new ProductRuntimePolicy(),
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'citation-fixture', contextWindowTokens: 200000, async run(request) {
      calls++
      if (calls === 1) evidence[0].excerpt = '后来更新的内容，不应替换已冻结节选。'
      else if (calls === 2) {
        assert.match(JSON.stringify(request.items), /supported answer wording/)
        return { text: '', output: [{ type: 'function_call', callId: 'citation-search', name: 'knowledge__search', arguments: '{}' }],
          usage: { available: true, inputTokens: 100, outputTokens: 30 } }
      }
      const text = calls === 1 ? '建议复习[【S1】](#cite-S1)' : body
      return { text, output: [{ role: 'assistant', content: text }], usage: { available: true, inputTokens: 100, outputTokens: 30 } }
    }, async structured() { throw new Error('unexpected auxiliary call') }, async compact() { throw new Error('unexpected compaction') } } })
  const server = createServer(await buildApiTestApp('test-owner'))
  const im = createServer(async (request, response) => {
    if (request.url === '/channel/messagesync') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ messages: [] }))
      return
    }
    assert.equal(request.url, '/message/send')
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const sent = JSON.parse(Buffer.concat(chunks).toString())
    assert.deepEqual(JSON.parse(Buffer.from(sent.payload, 'base64').toString()).data.harness.citationEvidence, expectedEvidence)
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ message_id: 'im-result', message_seq: 1 }))
  })
  try {
    await new Promise<void>(resolve => im.listen(0, '127.0.0.1', resolve))
    const imAddress = im.address()
    assert.ok(imAddress && typeof imAddress === 'object')
    _setWukongClientForTests(new WukongClient({ apiUrl: `http://127.0.0.1:${imAddress.port}`, wsUrl: 'ws://unused', apiToken: 'test', webhookSecret: 'test' }))
    const policy = await syncConversationPolicy(api, companyId, conversationId)
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'citation-request', version: 1, author: { id: 'test-owner', kind: 'human' }, text: '如何安排复习？', mentions: [agentId] })
    const identity = accepted.runs[0]
    assert.ok(identity)
    // The local database clock can lag the process that schedules the work.
    const workDeadline = Date.now() + 10_000
    let executed = await worker.runNext()
    while (!executed && Date.now() < workDeadline) {
      await delay(50)
      executed = await worker.runNext()
    }
    assert.equal(executed, true)
    const result = { message: await api.readMessage(identity) }
    assert.equal(calls, 3)
    assert.equal(result.message?.body, body)
    assert.deepEqual(result.message?.envelope.citationEvidence, expectedEvidence)
    assert.deepEqual(result.message?.envelope.citations.map(citation => citation.sources.map(source => source.chunkIds)),
      [[['chunk-1']], [['chunk-1']], [['chunk-2']], [['chunk-1'], ['chunk-3']], [['chunk-4']]])
    const deadline = Date.now() + 5000
    while (await api.readDelivery(identity) === 'pending' && Date.now() < deadline) await delay(25)
    assert.equal(await api.readDelivery(identity), 'delivered')
    const delivered = (await pool.query('SELECT payload FROM im_send_acceptances WHERE company_id=$1', [companyId])).rows
    assert.equal(delivered.length, 1)
    assert.deepEqual(delivered[0].payload.data.harness, result.message!.envelope)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    for (let reconnect = 0; reconnect < 2; reconnect++) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/im/companies/${companyId}/channels/${conversationId}/agents/${agentId}/runs/${identity.runId}/stream`,
        { signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, 200)
      const reader = response.body!.getReader()
      try {
        let frame = ''
        while (!frame.includes('\n\n')) {
          const chunk = await reader.read()
          assert.equal(chunk.done, false)
          frame += new TextDecoder().decode(chunk.value)
        }
        const state = JSON.parse(frame.split('\n').find(line => line.startsWith('data: '))!.slice(6))
        assert.deepEqual(state.state.message.envelope, result.message!.envelope)
      } finally { await reader.cancel() }
    }
  } finally {
    await worker.stop()
    await api.stop()
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await new Promise<void>((resolve, reject) => im.close(error => error ? reject(error) : resolve()))
  }
})
