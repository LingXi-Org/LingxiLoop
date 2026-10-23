import assert from 'node:assert/strict'
import test from 'node:test'
import { readPublicLlmTrace } from '../agent-runtime/trace-activity.js'
import { buildRunTrace } from '../agent-runtime/run-trace.js'
import type { Queryable } from '../db/queryable.js'
import { readRunTrace } from '../../../src/lib/runTrace.js'

const identity = { tenantId: 't',runId: 'r',agentId: 'a',sessionId: 's',principalId: 'p' }
const row = { id: 'pro',model: 'Pro/BAAI/bge-m3',purpose: 'lingxios.embedding',status: 'succeeded',latency_ms: 100,
  measured: true,input_tokens: 1000,output_tokens: 0,cost_usd: '0.00001',cost_estimated: true,priced: true,
  cost_cny: '0.00007',price_currency: 'CNY',price_input: '0.07',price_cached_input: '0.07',price_output: '0',
  price_version: 'siliconflow-cn-2026-10-22',price_billing_item: 'pro/baai/bge-m3.online.input-tokens' }
const database = (rows: unknown[]) => ({ async query() { return { rows,rowCount: rows.length } } }) as unknown as Queryable

test('captured CNY survives public trace and replay without changing the USD budget amount',async () => {
  const calls = await readPublicLlmTrace(identity,database([row]))
  assert.equal(calls[0].cost,0.00001)
  assert.deepEqual(calls[0].costBreakdown,[{ currency: 'CNY',amount: 0.00007,estimated: true }])
  assert.deepEqual(calls[0].costPricing,{ currency: 'CNY',inputPerMillion: 0.07,cachedInputPerMillion: 0.07,outputPerMillion: 0,
    version: row.price_version,billingItem: row.price_billing_item })
  const trace = buildRunTrace({ runId: 'r',createdAt: '2026-10-23T00:00:00Z',lifecycle: 'succeeded',tools: [],llm: calls })
  const replay = readRunTrace(JSON.parse(JSON.stringify(trace)))!
  assert.equal(replay.root.cost,0.00001)
  assert.deepEqual(replay.root.costBreakdown,calls[0].costBreakdown)
  assert.deepEqual(replay.root.children[0].costPricing,calls[0].costPricing)
})

test('mixed original currencies aggregate separately, with missing costs remaining incomplete',async () => {
  const calls = await readPublicLlmTrace(identity,database([row,{ ...row,id: 'legacy',model: 'BAAI/bge-m3',cost_usd: '0.02',
    cost_cny: undefined,price_currency: undefined },{ ...row,id: 'unknown',priced: false,cost_cny: undefined }]))
  const trace = buildRunTrace({ runId: 'r',createdAt: '2026-10-23T00:00:00Z',lifecycle: 'succeeded',tools: [],llm: calls })
  assert.equal(trace.root.cost,null)
  assert.equal(trace.root.costIncomplete,true)
  assert.deepEqual(trace.root.costBreakdown,[{ currency: 'CNY',amount: 0.00007,estimated: true },{ currency: 'USD',amount: 0.02,estimated: true }])
  assert.equal(trace.root.children.find(x=>x.model === 'BAAI/bge-m3')!.cost,0.02)
})

test('missing or invalid CNY never borrows the current tariff and unmeasured rows remain unknown',async () => {
  for (const value of [undefined,null,'NaN','Infinity','-1','']) {
    const result = (await readPublicLlmTrace(identity,database([{ ...row,cost_cny: value }])))[0]
    assert.equal(result.cost,0.00001)
    assert.equal(result.costBreakdown,undefined)
    assert.equal(result.costPricing,undefined)
  }
  const unknown = (await readPublicLlmTrace(identity,database([{ ...row,measured: false }])))[0]
  assert.equal(unknown.cost,null)
  assert.equal(unknown.costBreakdown,undefined)
})
