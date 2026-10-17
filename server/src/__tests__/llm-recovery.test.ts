import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { __setLlmClientOverrideForTesting, createChatCompletion, createEmbedding } from '../llm.js'
import { __setLlmLedgerOverrideForTesting } from '../llm-ledger.js'

test('shared model calls bound retries, sanitize per-attempt ledger metadata and keep SDK retries disabled', async () => {
  for (const status of [402,429,503]) {
    const records: Array<Record<string, unknown>> = [], model = randomUUID()
    let calls = 0
    __setLlmLedgerOverrideForTesting(async record => { records.push(record as unknown as Record<string, unknown>) })
    __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async (_request: unknown,options: { maxRetries: number; signal: AbortSignal }) => {
      assert.equal(options.maxRetries,0); assert.ok(options.signal)
      calls++
      if (calls === 1 || status === 402) throw Object.assign(new Error('PRIVATE_BODY'),{ status,request_id: 'safe-request',headers: new Headers({ 'retry-after': '0' }) })
      return { choices: [{ message: { content: 'ok' } }],usage: { prompt_tokens: 5,completion_tokens: 2 } }
    } } } }) as never)
    try {
      const call = () => createChatCompletion({ purpose: 'recovery',companyId: 'test' },{ model,messages: [{ role: 'user',content: 'PRIVATE_PROMPT' }] })
      if (status === 402) { await assert.rejects(call); await assert.rejects(call); assert.equal(calls,1) }
      else { await call(); assert.equal(calls,2) }
      assert.equal(records.length,calls)
      const first = records[0]!.context as { extras: { attempt: number; failure: { status: number; requestId: string } } }
      assert.equal(first.extras.attempt,1); assert.equal(first.extras.failure.status,status)
      assert.equal(first.extras.failure.requestId,'safe-request')
      assert.doesNotMatch(JSON.stringify(records),/PRIVATE_/)
    } finally { __setLlmClientOverrideForTesting(null); __setLlmLedgerOverrideForTesting(null) }
  }
})

test('caller cancellation releases a hung request and embeddings never switch models', { timeout: 3000 }, async () => {
  const records: Array<Record<string, unknown>> = [], controller = new AbortController()
  let calls = 0, propagated = false
  __setLlmLedgerOverrideForTesting(async record => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async (_request: unknown,options: { signal?: AbortSignal }) => {
    calls++; options?.signal?.addEventListener('abort',() => { propagated = true }); controller.abort(); return new Promise(() => {})
  } } },embeddings: { create: async (request: { model: string }) => {
    calls++; assert.equal(request.model,'fixed-embedding-space'); throw Object.assign(new Error('PRIVATE_EMBEDDING'),{ status: 402 })
  } } }) as never)
  try {
    await assert.rejects(createChatCompletion({ purpose: 'cancel',companyId: 'test' },{ model: randomUUID(),messages: [] },{ signal: controller.signal }))
    assert.equal(propagated,true); assert.equal(calls,1)
    assert.equal(((records[0]!.context as { extras: { failure: { category: string } } }).extras.failure.category),'cancelled')
    await assert.rejects(createEmbedding({ purpose: 'embedding',companyId: 'test' },{ model: 'fixed-embedding-space',input: 'PRIVATE_INPUT' }))
    assert.equal(calls,2); assert.doesNotMatch(JSON.stringify(records),/PRIVATE_/)
  } finally { __setLlmClientOverrideForTesting(null); __setLlmLedgerOverrideForTesting(null) }
})
