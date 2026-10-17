import assert from 'node:assert/strict'
import test from 'node:test'
import { __setLlmClientOverrideForTesting, createChatCompletion } from '../llm.js'
import { __setLlmLedgerOverrideForTesting, recordLlmCall } from '../llm-ledger.js'
import { siliconFlowCost, siliconFlowPricing } from '../agent-runtime/pricing.js'
import { env } from '../env.js'

// Failure modes: wrong micro-USD conversion, charging a different model at the primary
// rate, invalid prices reaching the provider, and treating absent usage as measured cost.
test('host judgments price measured primary-model tokens with the configured runtime rates', async () => {
  const records: Array<Record<string, unknown>> = []
  const names = ['AGENT_OS_INPUT_COST_MICROS_PER_MILLION', 'AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION'] as const
  const original = names.map(name => process.env[name])
  process.env[names[0]] = '2000000'
  process.env[names[1]] = '8000000'
  let calls = 0
  __setLlmLedgerOverrideForTesting(async record => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => {
    calls++
    return { choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }
  } } } }) as never)
  try {
    const request = { model: env.OPENAI_MODEL, messages: [{ role: 'user' as const, content: 'synthetic assessment' }] }
    await createChatCompletion({ purpose: 'homework.assess', companyId: 'company-1' }, request)
    assert.deepEqual({ costUsd: records[0]?.costUsd, estimated: records[0]?.costEstimated }, { costUsd: 0.006, estimated: true })
    await createChatCompletion({ purpose: 'different-model', companyId: 'company-1' }, { ...request, model: 'unpriced-other-model' })
    assert.equal(records[1]?.costUsd, undefined)
    process.env[names[0]] = 'NaN'
    await assert.rejects(createChatCompletion({ purpose: 'invalid-price', companyId: 'company-1' }, request), /AGENT_OS_INPUT_COST_MICROS_PER_MILLION/)
    assert.equal(calls, 2)
  } finally {
    names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index] })
    __setLlmClientOverrideForTesting(null)
    __setLlmLedgerOverrideForTesting(null)
  }
})

test('SiliconFlow work cost uses measured tokens and cache hits at fixed CNY rates',()=>{
  const pricing=siliconFlowPricing(7)
  const cost=siliconFlowCost({ available: true,inputTokens: 1_000_000,outputTokens: 1_000_000,cachedInputTokens: 500_000 },pricing)
  assert.equal(cost.costCny,10.65)
  assert.equal(cost.costUsd,10.65/7)
  assert.equal(cost.cachedUsageAvailable,true)
  assert.equal(siliconFlowCost({ available: true,inputTokens: 1_000_000,outputTokens: 0 },pricing).costCny,3)
  assert.deepEqual(siliconFlowCost({available:true,inputTokens:1_000_000,outputTokens:1_000_000,cachedInputTokens:500_000},siliconFlowPricing(7,'zai-org/GLM-5.2')),
    {costCny:33,costUsd:33/7,cachedUsageAvailable:true})
  assert.throws(()=>siliconFlowCost({ available: true,inputTokens: 1,outputTokens: 0,cachedInputTokens: 2 },pricing))
  assert.throws(()=>siliconFlowCost({ available: false,inputTokens: 0,outputTokens: 0 },pricing))
  assert.throws(()=>siliconFlowPricing(0))
})

test('product LLM completions disable thinking and record the authoritative call ledger', async () => {
  const records: Array<Record<string, unknown>> = []
  let providerRequest: Record<string, unknown> | undefined
  __setLlmLedgerOverrideForTesting(async (record) => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({
    chat: { completions: { create: async (request: Record<string, unknown>) => {
      providerRequest = request
      return { choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }
    } } },
  }) as never)
  try {
    await createChatCompletion({ purpose: 'test', companyId: 'company-1', agentId: 'agent-1' }, {
      model: 'test-model', messages: [{ role: 'user', content: 'hello' }], reasoning_effort: 'high',
    })
    assert.equal(records.length, 1)
    const { extras,...identity } = records[0]?.context as Record<string, unknown>
    assert.deepEqual(identity, { purpose: 'test', companyId: 'company-1', agentId: 'agent-1' })
    assert.equal((extras as { attempt: number }).attempt,1)
    assert.ok(typeof (extras as { callId: string }).callId === 'string')
    assert.equal(records[0]?.status, 'succeeded')
    assert.deepEqual(records[0]?.usage, { prompt_tokens: 7, completion_tokens: 3 })
    assert.equal(providerRequest?.reasoning_effort, undefined)
    assert.equal(providerRequest?.enable_thinking, false)
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

test('successful provider results are not returned until the ledger write succeeds', async () => {
  let attempts = 0
  __setLlmLedgerOverrideForTesting(async () => {
    attempts++
    if (attempts < 3) throw new Error('ledger unavailable')
  })
  __setLlmClientOverrideForTesting(() => ({
    chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } },
  }) as never)
  try {
    await createChatCompletion({ purpose: 'ledger-retry', companyId: 'company-1' }, {
      model: 'test-model', messages: [{ role: 'user', content: 'hello' }],
    })
    assert.equal(attempts, 3)
  } finally {
    __setLlmClientOverrideForTesting(null)
    __setLlmLedgerOverrideForTesting(null)
  }
})

test('a missing authoritative ledger record fails the product call', async () => {
  __setLlmLedgerOverrideForTesting(async () => { throw new Error('ledger unavailable') })
  __setLlmClientOverrideForTesting(() => ({
    chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }] }) } },
  }) as never)
  try {
    await assert.rejects(() => createChatCompletion({ purpose: 'ledger-required', companyId: 'company-1' }, {
      model: 'test-model', messages: [{ role: 'user', content: 'hello' }],
    }), /ledger unavailable/)
  } finally {
    __setLlmClientOverrideForTesting(null)
    __setLlmLedgerOverrideForTesting(null)
  }
})

test('caller-supplied call identity makes uncertain ledger retries idempotent', async () => {
  const writes: Array<{ sql: string; params: readonly unknown[] }> = []
  const db = { query: async (sql: string, params: readonly unknown[] = []) => {
    writes.push({ sql, params })
    return { rows: [], rowCount: 0, command: 'INSERT', oid: 0, fields: [] }
  } }
  const record = { context: { purpose: 'agent', companyId: 'company-1' }, model: 'model',
    latencyMs: 1, status: 'succeeded' as const, costUsd: 0.25 }
  await recordLlmCall(record, db, 'stable-call')
  await recordLlmCall(record, db, 'stable-call')
  assert.deepEqual(writes.map(write => write.params[0]), ['stable-call', 'stable-call'])
  assert.deepEqual(writes.map(write => write.params[11]), [0.25, 0.25])
  assert.ok(writes.every(write => /ON CONFLICT \(id\) DO NOTHING/.test(write.sql)))
})
