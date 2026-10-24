// Failure model: the migration route must not widen the ordinary model route,
// issue an unreserved retry, omit the ledger, accept another tenant/model or
// leak source text in the ledger or an error.
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { mock, test } from 'node:test'
import express from 'express'
import { env } from '../env.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { __setLlmLedgerOverrideForTesting } from '../llm-ledger.js'

mock.module('../db/pool.js', { namedExports: { pool: { query: async (_sql: string, values: string[]) => ({ rows: values[0] === 'company-a' ? [{}] : [] }) } } })
const { openNotebookEmbeddingRouter } = await import('../modules/knowledge/embedding-proxy.js')

test('Pro shadow route is authenticated, exact-model and single-attempt with measured ledger provenance', async () => {
  const originalModel = env.OPENAI_EMBEDDING_MODEL, originalBase = env.OPENAI_BASE_URL
  const priorKey = process.env.OPEN_NOTEBOOK_PASSWORD, priorFlag = process.env.OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED
  env.OPENAI_EMBEDDING_MODEL = 'BAAI/bge-m3'; env.OPENAI_BASE_URL = 'https://synthetic.invalid/v1'
  process.env.OPEN_NOTEBOOK_PASSWORD = 'synthetic-service-key'
  delete process.env.OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED
  const records: Array<Record<string, unknown>> = []
  let calls = 0, fail = false
  __setLlmLedgerOverrideForTesting(async record => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({ embeddings: { create: async (request: { model: string }, options: { maxRetries: number }) => {
    calls++; assert.equal(options.maxRetries, 0); assert.equal(request.model, 'Pro/BAAI/bge-m3')
    if (fail) throw Object.assign(new Error('PRIVATE_UNKNOWN_RESPONSE'), { status: 503 })
    return { model: request.model, data: [{ index: 0, embedding: [1] }], usage: { prompt_tokens: 3, total_tokens: 3 } }
  } } }) as never)
  const app = express(); app.use(express.json()); app.use(openNotebookEmbeddingRouter)
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(502).json({ error: 'provider unavailable' }) })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => { if (server.listening) resolve(); else server.once('listening', resolve) })
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const requestId = 'a'.repeat(64)
  const post = (path: string, options: { auth?: string; model?: string; company?: string; id?: string } = {}) => fetch(origin + path, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: options.auth ?? 'Bearer synthetic-service-key',
      'x-lingxi-company-id': options.company ?? 'company-a', 'x-lingxi-shadow-request-id': options.id ?? requestId },
    body: JSON.stringify({ model: options.model ?? 'Pro/BAAI/bge-m3', input: ['PRIVATE_SYNTHETIC_TEXT'] }),
  })
  try {
    assert.equal((await post('/v1/shadow/embeddings')).status, 404)
    process.env.OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED = 'true'
    assert.equal((await post('/v1/shadow/embeddings', { auth: 'Bearer wrong' })).status, 401)
    assert.equal((await post('/v1/shadow/embeddings', { model: 'BAAI/bge-m3' })).status, 400)
    assert.equal((await post('/v1/shadow/embeddings', { company: 'unknown' })).status, 404)
    assert.equal((await post('/v1/shadow/embeddings', { id: 'unbounded' })).status, 400)
    assert.equal((await post('/v1/embeddings')).status, 400)
    assert.equal(calls, 0)
    const response = await post('/v1/shadow/embeddings')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-lingxi-shadow-request-id'), requestId)
    assert.equal(calls, 1); assert.equal(records.length, 1)
    assert.equal((records[0]!.context as { extras: { shadowRequestId: string } }).extras.shadowRequestId, requestId)
    assert.equal(records[0]!.status, 'succeeded')
    fail = true
    assert.equal((await post('/v1/shadow/embeddings', { id: 'b'.repeat(64) })).status, 502)
    assert.equal(calls, 2); assert.equal(records.length, 2)
    assert.equal(records[1]!.status, 'failed')
    assert.doesNotMatch(JSON.stringify(records), /PRIVATE_/)
    delete process.env.OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED
    env.OPENAI_EMBEDDING_MODEL = 'Pro/BAAI/bge-m3'
    fail = false
    assert.equal((await post('/v1/shadow/embeddings', { id: 'c'.repeat(64) })).status, 200)
    // A live Pro generation also uses this immutable route for normal RAG
    // requests, which have no operator reservation header.
    assert.equal((await post('/v1/shadow/embeddings', { id: '' })).status, 200)
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    env.OPENAI_EMBEDDING_MODEL = originalModel; env.OPENAI_BASE_URL = originalBase
    if (priorKey === undefined) delete process.env.OPEN_NOTEBOOK_PASSWORD; else process.env.OPEN_NOTEBOOK_PASSWORD = priorKey
    if (priorFlag === undefined) delete process.env.OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED; else process.env.OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED = priorFlag
    __setLlmClientOverrideForTesting(null); __setLlmLedgerOverrideForTesting(null)
  }
})
