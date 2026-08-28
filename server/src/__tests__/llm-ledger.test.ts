import assert from 'node:assert/strict'
import test from 'node:test'
import { __setLlmClientOverrideForTesting, createChatCompletion } from '../llm.js'
import { __setLlmLedgerOverrideForTesting } from '../llm-ledger.js'

test('every product LLM completion records the authoritative call ledger', async () => {
  const records: Array<Record<string, unknown>> = []
  __setLlmLedgerOverrideForTesting(async (record) => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({
    chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }) } },
  }) as never)
  try {
    await createChatCompletion({ purpose: 'test', companyId: 'company-1', agentId: 'agent-1' }, {
      model: 'test-model', messages: [{ role: 'user', content: 'hello' }],
    })
    assert.equal(records.length, 1)
    assert.deepEqual(records[0]?.context, { purpose: 'test', companyId: 'company-1', agentId: 'agent-1' })
    assert.equal(records[0]?.status, 'succeeded')
    assert.deepEqual(records[0]?.usage, { prompt_tokens: 7, completion_tokens: 3 })
  } finally {
    __setLlmClientOverrideForTesting(null)
    __setLlmLedgerOverrideForTesting(null)
  }
})

test('failed product LLM calls are recorded and propagate', async () => {
  const records: Array<Record<string, unknown>> = []
  __setLlmLedgerOverrideForTesting(async (record) => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => { throw new Error('provider down') } } } }) as never)
  try {
    await assert.rejects(() => createChatCompletion({ purpose: 'test-failure', companyId: 'company-1' }, {
      model: 'test-model', messages: [{ role: 'user', content: 'hello' }],
    }), /provider down/)
    assert.equal(records.length, 1)
    assert.equal(records[0]?.status, 'failed')
  } finally {
    __setLlmClientOverrideForTesting(null)
    __setLlmLedgerOverrideForTesting(null)
  }
})
