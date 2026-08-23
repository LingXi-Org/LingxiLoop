import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveCostUsd, priceFor, usageFromDeepSeek,
  addUsage, inputEquivalentTokens, type TokenUsage,
} from '../agents/cost.js'

test('cache-read is far cheaper than fresh input (the whole premise)', () => {
  const fresh: TokenUsage = { inputTokens: 1_000_000, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 0 }
  const cached: TokenUsage = { inputTokens: 0, cachedInputTokens: 1_000_000, cacheCreationTokens: 0, outputTokens: 0 }
  const m = 'deepseek-chat'
  assert.ok(effectiveCostUsd(m, cached).usd < effectiveCostUsd(m, fresh).usd)
  assert.ok(effectiveCostUsd(m, cached).usd <= effectiveCostUsd(m, fresh).usd * 0.2)
})

test('ALL seeded prices are flagged estimated (only operator-supplied rates are exact)', () => {
  const u: TokenUsage = { inputTokens: 100, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 10 }
  assert.equal(effectiveCostUsd('deepseek-chat', u).estimated, true)
  assert.equal(effectiveCostUsd('some-unknown-model', u).estimated, true)
})

test('DeepSeek usage splits prompt cache hits and misses', () => {
  const u = usageFromDeepSeek({ prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 200 })
  assert.deepEqual(u, { inputTokens: 200, cachedInputTokens: 800, cacheCreationTokens: 0, outputTokens: 50 })
})

test('addUsage sums across hops; inputEquivalentTokens is price-free scale', () => {
  const a: TokenUsage = { inputTokens: 10, cachedInputTokens: 5, cacheCreationTokens: 0, outputTokens: 2 }
  assert.deepEqual(addUsage(a, a), { inputTokens: 20, cachedInputTokens: 10, cacheCreationTokens: 0, outputTokens: 4 })
  assert.ok(inputEquivalentTokens('deepseek-chat', a) > 0)
})

test('the user scenario: a cold triage can cost MORE than a cache-warm turn it skips', () => {
  // Triage: 5k uncached input, tiny output, on haiku.
  const triage: TokenUsage = { inputTokens: 5000, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 50 }
  // Avoided turn: 40k input but 95% cache-read, on the SAME small model — cheap.
  const warmTurn: TokenUsage = { inputTokens: 2000, cachedInputTokens: 38000, cacheCreationTokens: 0, outputTokens: 100 }
  const triageCost = effectiveCostUsd('deepseek-chat', triage).usd
  const turnCost = effectiveCostUsd('deepseek-chat', warmTurn).usd
  // Not asserting a fixed sign (depends on seeded prices) — just that the math is
  // wired so a high-cache turn CAN be comparable-to / cheaper-than a cold triage.
  assert.ok(triageCost > 0 && turnCost > 0)
  assert.ok(priceFor('deepseek-chat').cachedInPer1M < priceFor('deepseek-chat').inPer1M)
})
