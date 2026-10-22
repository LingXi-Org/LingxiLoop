import assert from 'node:assert/strict'
import test from 'node:test'
import { siliconFlowCost, siliconFlowPricing, siliconFlowPricingForModel } from '../agent-runtime/pricing.js'

// Failure cases are recorded before implementation in docs/evidence/issue-297/FAILURE-MODEL.md.
const chat = 'deepseek-ai/DeepSeek-V4.1-Flash'
const embedding = 'Pro/BAAI/bge-m3'
test('new chat model uses its own CNY tariff, with conservative admission and explicit charge-time snapshots', () => {
  assert.equal(siliconFlowPricing(7).inputPerMillion, 2)
  const peak = siliconFlowPricing(7, chat)
  assert.equal(peak.inputPerMillion, 2)
  assert.equal(peak.cachedInputPerMillion, 0.04)
  assert.equal(peak.outputPerMillion, 8)
  for (const [at, expected] of [
    ['2026-10-21T17:59:59.999Z', 2], ['2026-10-21T18:00:00.000Z', 1],
    ['2026-10-21T23:59:59.999Z', 1], ['2026-10-22T00:00:00.000Z', 2],
  ] as const) {
    const priced = siliconFlowPricing(7, chat, Date.parse(at))
    assert.equal(priced.inputPerMillion, expected)
    assert.equal(priced.outputPerMillion, expected * 4)
    const cost = siliconFlowCost({ available: true, inputTokens: 1000, outputTokens: 500, cachedInputTokens: 500 }, priced)
    assert.equal(cost.costCny, expected === 1 ? 0.00251 : 0.00502)
    assert.equal(cost.costUsd, cost.costCny / 7)
  }
  assert.throws(() => siliconFlowPricing(7, chat, NaN), /timestamp/)
})

test('Pro bge-m3 billing item is CNY 0.000070 per K input tokens, preserving legacy free BGE identity', () => {
  const price = siliconFlowPricing(7, embedding)
  assert.equal(price.currency, 'CNY')
  assert.equal(price.inputPerMillion, 0.07)
  assert.equal(price.outputPerMillion, 0)
  assert.equal(price.billingItem, 'pro/baai/bge-m3.online.input-tokens')
  const cost = siliconFlowCost({ available: true, inputTokens: 1000, outputTokens: 0 }, price)
  assert.equal(cost.costCny, 0.00007)
  assert.equal(cost.costUsd, 0.00007 / 7)
  assert.equal(siliconFlowCost({ available: true, inputTokens: 1000, outputTokens: 0 }, siliconFlowPricing(7, 'BAAI/bge-m3')).costCny, 0)
  assert.equal(siliconFlowPricing(7, 'zai-org/GLM-5.3-Flash').inputPerMillion, 0.8)
})

test('provider pricing never leaks to another endpoint or accepts missing/invalid production FX', () => {
  const before = process.env.SILICONFLOW_USD_CNY_RATE
  try {
    delete process.env.SILICONFLOW_USD_CNY_RATE
    assert.equal(siliconFlowPricingForModel('https://other.invalid/v1', embedding, true), undefined)
    assert.throws(() => siliconFlowPricingForModel('https://api.siliconflow.cn/v1', embedding, true), /required/)
    for (const value of ['0', '-7', 'NaN']) {
      process.env.SILICONFLOW_USD_CNY_RATE = value
      assert.throws(() => siliconFlowPricingForModel('https://api.siliconflow.cn/v1', chat, true), /positive/)
    }
    process.env.SILICONFLOW_USD_CNY_RATE = '7'
    assert.equal(siliconFlowPricingForModel('https://api.siliconflow.cn/v1', embedding, true)?.inputPerMillion, 0.07)
  } finally {
    if (before === undefined) delete process.env.SILICONFLOW_USD_CNY_RATE
    else process.env.SILICONFLOW_USD_CNY_RATE = before
  }
})
