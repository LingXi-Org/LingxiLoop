import assert from 'node:assert/strict'
import test from 'node:test'
import { __setLlmClientOverrideForTesting,createChatCompletion,createEmbedding } from '../llm.js'
import { __setLlmLedgerOverrideForTesting } from '../llm-ledger.js'

// Failure model: issue-296/FAILURE-MODEL.md, written before implementation.
test('each real product attempt captures wall-clock endpoints and classifies embedding usage without output tokens',async () => {
  const records: unknown[] = []
  __setLlmLedgerOverrideForTesting(async record => { records.push(record) })
  __setLlmClientOverrideForTesting(()=>({ embeddings: { create: async ()=>({ data: [{ embedding: [1,2] }],usage: { prompt_tokens: 10,total_tokens: 10 } }) },
    chat: { completions: { create: async ()=>({ choices: [{ message: { content: 'synthetic answer' } }],usage: { prompt_tokens: 5,completion_tokens: 2 } }) } } }) as never)
  const began = Date.now()
  try {
    await createEmbedding({ companyId: 'synthetic',purpose: 'embedding' },{ model: 'Pro/BAAI/bge-m3',input: 'PRIVATE_INPUT' })
    await createChatCompletion({ companyId: 'synthetic',purpose: 'chat' },{ model: 'synthetic-chat',messages: [{ role: 'user',content: 'PRIVATE_PROMPT' }] })
    assert.equal(records.length,2)
    for (const record of records as unknown as { context: { extras: Record<string,unknown> };usage: unknown }[]) {
      const { startedAt,completedAt } = record.context.extras
      assert.ok(typeof startedAt === 'number' && startedAt >= began)
      assert.ok(typeof completedAt === 'number' && completedAt >= Number(startedAt) && completedAt <= Date.now())
      assert.doesNotMatch(JSON.stringify(record),/PRIVATE_INPUT|PRIVATE_PROMPT/)
    }
    const embedding = records[0] as unknown as { context: { extras: Record<string,unknown> };usage: unknown }
    assert.equal(embedding.context.extras.apiKind,'embedding')
    assert.deepEqual(embedding.usage,{ prompt_tokens: 10,completion_tokens: 0 })
    assert.equal((records[1] as unknown as { context: { extras: Record<string,unknown> } }).context.extras.apiKind,'chat')
  } finally { __setLlmClientOverrideForTesting(null);__setLlmLedgerOverrideForTesting(null) }
})
