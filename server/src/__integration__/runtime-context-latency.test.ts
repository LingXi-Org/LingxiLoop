import { learningTools } from '../modules/learning/public.js'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { createProductContext } from '../agent-runtime/context.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { advanceAgentReadReceipt, listReadReceiptAdvances } from '../im/read-receipts.js'
import { ReadReceiptsApplication } from '../im/read-receipts-application.js'
import { flushNativeEvents } from '../agents/native-events.js'
import { OpenNotebookClient, openNotebookClient } from '../modules/knowledge/provider.js'
import { knowledgeTools } from '../modules/knowledge/agent-tools.js'
import { createCanvasTools } from '../modules/canvas/index.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure cases: deep-context search blocks until the upstream's 90s timeout;
// parent cancellation becomes "unavailable"; Redis blocks automatic receipts;
// a failed outbox insert commits a cursor that can never be announced;
// independent learning/Canvas reads wait behind history, roster or RAG.
let im: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { await teardownAll(); await im?.close() })

test('context bounds automatic search and persists Agent receipts before asynchronous delivery', { timeout: 30000 }, async t => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const conversationId = 'context-latency-room', members = ['test-owner', agentId]
  await pool.query(`UPDATE participants SET capabilities='["knowledge","canvas","learning"]'::jsonb WHERE company_id=$1 AND id=$2`, [companyId, agentId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Latency',$4::jsonb)`,
    [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  await pool.query(`INSERT INTO knowledge_notebook_bindings(project_id,company_id,external_key,external_notebook_id,state)
    VALUES($1,$2,'latency-notebook','notebook','ready')`, [projectId, companyId])
  await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,kind,title,external_source_id,status,stage,
    visibility_scope,owner_user_id,created_by_user_id,created_via)
    VALUES('latency-source',$1,$2,'text','Evidence','external-source','ready','ready','PROJECT','test-owner','test-owner','USER')`, [companyId, projectId])
  im.messages.push({ channelId: conversationId, channelType: 2, fromUid: 'test-owner', messageId: 'input',
    clientMsgNo: 'input', messageSeq: 1, timestamp: Date.now() / 1000,
    payload: { version: 1, kind: 'text', clientMsgNo: 'input', body: 'Explain the evidence' } })
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
    messageId: 'input', version: 1, author: { id: 'test-owner', kind: 'human' }, text: 'Explain the evidence', mentions: [agentId] },
  { mode: 'execute', executionClass: 'operation' })
  const work = await api.connectWorker({ workerId: 'context-latency', workKinds: ['turn'] }).claimWork()
  assert.ok(work)
  const provider = createProductContext([...learningTools, ...knowledgeTools, ...createCanvasTools(lingxiOSControl)]).contextProvider
  let searches = 0, disconnected = 0, onSearch: (() => void) | undefined
  const upstream = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume the local fixture request */ }
    searches++
    res.once('close', () => { disconnected++ })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.write('{"results":[')
    onSearch?.()
  })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address(); assert.ok(address && typeof address !== 'string')
  const originalSearch = openNotebookClient.search, enabled = process.env.OPEN_NOTEBOOK_ENABLED
  const local = new OpenNotebookClient({ baseUrl: `http://127.0.0.1:${address.port}`, password: '' })
  openNotebookClient.search = local.search.bind(local)
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  try {
    let releaseRoster!: () => void, startedRoster!: () => void
    const rosterHeld = new Promise<void>(resolve => { releaseRoster = resolve })
    const rosterStarted = new Promise<void>(resolve => { startedRoster = resolve })
    const independentReads = new Set<string>(), query = pool.query
    const observer = t.mock.method(pool, 'query', ((sql: unknown, ...args: unknown[]) => {
      if (typeof sql === 'string') {
        if (sql.includes('project.kind AS project_kind')) independentReads.add('learning')
        if (sql === 'SELECT id FROM canvases WHERE company_id=$1 AND conversation_id=$2 LIMIT 1') independentReads.add('canvas')
        if (sql.startsWith('SELECT agent.id,agent.name,agent.role,agent.capabilities,agent.preset_key')) {
          startedRoster()
          return rosterHeld.then(() => Reflect.apply(query, pool, [sql, ...args]))
        }
      }
      return Reflect.apply(query, pool, [sql, ...args])
    }) as typeof pool.query)
    const began = performance.now()
    const loading = provider.loadContext(work, undefined, { responseProfile: 'deep' })
    let deep!: Awaited<typeof loading>
    try {
      await rosterStarted
      assert.deepEqual([...independentReads].sort(), ['canvas', 'learning'], 'authorized independent reads start while roster is held')
      assert.equal(searches, 0, 'independent reads do not wait for automatic RAG')
    } finally {
      releaseRoster()
      observer.mock.restore()
      deep = await loading
    }
    const elapsedMs = Math.round(performance.now() - began)
    assert.deepEqual(deep.dynamic?.knowledgeRetrieval, { status: 'unavailable', matchedChunks: 0 })
    assert.equal(searches, 2)
    assert.ok(elapsedMs >= 4500 && elapsedMs < 12000, `automatic search took ${elapsedMs}ms`)
    const parent = new AbortController(), reason = new Error('fixture worker disconnected')
    onSearch = () => parent.abort(reason)
    await assert.rejects(provider.loadContext(work, parent.signal, { responseProfile: 'deep' }), error => error === reason)
    onSearch = undefined
    const receiptInput = { companyId, channelId: conversationId, agentId, workId: work.id, readThroughSeq: 1 }
    assert.equal(await advanceAgentReadReceipt(receiptInput), null, 'loading the same history must not append another cursor')
    const pending = (await pool.query(`SELECT work_id,event FROM agent_native_event_outbox WHERE company_id=$1 AND event->>'type'='im.read_receipt'`, [companyId])).rows
    assert.equal(pending.length, 1)
    assert.equal(pending[0].work_id, work.id)
    assert.equal(pending[0].event.advance.readThroughSeq, 1)
    const signal = AbortSignal.timeout(5000)
    await flushNativeEvents(pool, async () => { throw new Error('fixture Redis unavailable') }, signal)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM agent_native_event_outbox WHERE company_id=$1 AND delivered_at IS NULL AND attempts=1', [companyId])).rows[0].n, 1)
    await pool.query('UPDATE agent_native_event_outbox SET available_at=NOW() WHERE company_id=$1', [companyId])
    const delivered: unknown[] = []
    await flushNativeEvents(pool, async event => { delivered.push(event) }, signal)
    assert.deepEqual(delivered, [pending[0].event])

    const broken = new ReadReceiptsApplication({ db: pool, transaction: operation => withTransaction(pool, async db => {
      const result = await operation(db)
      throw new Error(`fixture rollback after ${result ? 'advance' : 'repeat'}`)
    }), publish: async () => { throw new Error('automatic receipts must not publish inline') } })
    assert.equal(await broken.advanceAgent({ ...receiptInput, readThroughSeq: 2 }), null)
    const receipts = await listReadReceiptAdvances({ companyId, channelId: conversationId, fromSeq: 1, toSeq: 2 })
    assert.deepEqual(receipts.map(receipt => [receipt.readerId, receipt.readThroughSeq]), [[agentId, 1]])
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM agent_native_event_outbox WHERE company_id=$1', [companyId])).rows[0].n, 1)

    const http = createServer(await buildApiTestApp('test-owner'))
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    const port = http.address(); assert.ok(port && typeof port !== 'string')
    const url = `http://127.0.0.1:${port.port}/api/im/channels/${conversationId}`
    try {
      const human = await fetch(`${url}/read`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': companyId }, body: JSON.stringify({ readThroughSeq: 1 }) })
      assert.equal(human.status, 200)
      const response = await fetch(`${url}/read-receipts?fromSeq=1&toSeq=1`, { headers: { 'x-company-id': companyId } })
      assert.equal(response.status, 200)
      const result = await response.json() as { receipts: { readerId: string; readThroughSeq: number }[] }
      assert.deepEqual(result.receipts.map(receipt => [receipt.readerId, receipt.readThroughSeq]).sort(), [[agentId, 1], ['test-owner', 1]].sort())
    } finally { await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve())) }
    assert.ok(disconnected >= 2, 'both automatic searches must abort their upstream bodies')
    t.diagnostic(JSON.stringify({ independentContextReads: [...independentReads].sort(), automaticSearchElapsedMs: elapsedMs, cancelledSearches: disconnected, durableAgentReceipts: 1, outboxReplayed: true, humanReadVerified: true }))
  } finally {
    openNotebookClient.search = originalSearch
    if (enabled === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = enabled
    upstream.closeAllConnections()
    await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()))
  }
})
