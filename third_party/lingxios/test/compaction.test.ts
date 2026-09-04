import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_COMPACTION, HardLimitExceededError, compactIfNeeded, estimateTokens, summaryItem,
} from '../src/runtime/compaction.js'
import type {
  CompactionRequest, CompactionResult, ModelDriver, ModelTurnRequest, ModelTurnResult,
  StructuredCallRequest, StructuredCallResult,
} from '../src/model/driver.js'
import type { ModelItem, SessionRecord } from '../src/protocol/types.js'

function fakeDriver(overrides: Partial<ModelDriver> = {}): ModelDriver {
  return {
    modelId: 'fake-model',
    run(_request: ModelTurnRequest): Promise<ModelTurnResult> {
      throw new Error('not implemented')
    },
    structured(_request: StructuredCallRequest): Promise<StructuredCallResult> {
      throw new Error('not implemented')
    },
    compact(request: CompactionRequest): Promise<CompactionResult> {
      return Promise.resolve({
        value: `summary of ${request.items.length} items`,
        model: 'fake-model',
        usage: { available: true, inputTokens: 10, outputTokens: 5 },
      })
    },
    ...overrides,
  }
}

function session(history: ModelItem[], summary?: string): SessionRecord {
  return {
    key: 't1:a1:s1:-', tenantId: 't1', agentId: 'a1', sessionId: 's1',
    history, appliedWorkIds: [], revision: 1, compactionEpoch: 0,
    ...(summary !== undefined ? { summary } : {}),
  }
}

function longHistory(count: number): ModelItem[] {
  return Array.from({ length: count }, (_, i) => ({
    role: 'user' as const,
    content: `message ${i} `.repeat(200), // long enough to cross the soft threshold
  }))
}

describe('estimateTokens', () => {
  it('estimates roughly chars / 4', () => {
    const items: ModelItem[] = [{ role: 'user', content: 'a'.repeat(400) }]
    const estimated = estimateTokens(items)
    const expected = Math.ceil(JSON.stringify(items).length / 4)
    assert.equal(estimated, expected)
  })
})

describe('summaryItem', () => {
  it('wraps the summary text with the untrusted-context preamble', () => {
    const item = summaryItem('the user asked about X') as { role: string; content: string }
    assert.equal(item.role, 'user')
    assert.match(item.content, /untrusted context/)
    assert.match(item.content, /the user asked about X/)
  })
})

describe('compactIfNeeded', () => {
  const smallOptions = {
    ...DEFAULT_COMPACTION,
    contextWindowTokens: 1_000,
    keepTailItems: 2,
  }

  it('does nothing when under the soft threshold', async () => {
    const s = session([{ role: 'user', content: 'hi' }])
    const outcome = await compactIfNeeded(s, 'instructions', fakeDriver(), smallOptions)
    assert.equal(outcome.compacted, false)
    assert.equal(s.compactionEpoch, 0)
  })

  it('does nothing when history is not longer than the kept tail', async () => {
    const s = session(longHistory(2))
    const outcome = await compactIfNeeded(s, 'instructions', fakeDriver(), smallOptions)
    assert.equal(outcome.compacted, false)
  })

  it('compacts older history into a summary, keeping the tail verbatim', async () => {
    const history = longHistory(10)
    const s = session(history)
    const outcome = await compactIfNeeded(s, 'instructions', fakeDriver(), smallOptions)
    assert.equal(outcome.compacted, true)
    assert.equal(s.compactionEpoch, 1)
    assert.equal(s.history.length, smallOptions.keepTailItems + 1) // summary + tail
    assert.deepEqual(s.history.slice(1), history.slice(-smallOptions.keepTailItems))
    assert.match(s.summary ?? '', /summary of 8 items/)
  })

  it('combines with any prior summary and re-summarizes past maxSummaryChars', async () => {
    const history = longHistory(10)
    const s = session(history, 'existing summary')
    let calls = 0
    const driver = fakeDriver({
      compact(request: CompactionRequest) {
        calls += 1
        if (calls === 1) {
          return Promise.resolve({
            value: 'x'.repeat(50),
            model: 'fake-model',
            usage: { available: true, inputTokens: 10, outputTokens: 5 },
          })
        }
        // Second call re-summarizes the combined (over-length) summary.
        assert.equal(request.items.length, 1)
        return Promise.resolve({
          value: 'recompacted summary',
          model: 'fake-model-2',
          usage: { available: true, inputTokens: 3, outputTokens: 2 },
        })
      },
    })
    const completedModels: string[] = []
    const latencies: number[] = []
    const outcome = await compactIfNeeded(s, 'instructions', driver, { ...smallOptions, maxSummaryChars: 10 }, undefined, {
      completed: async (result) => { completedModels.push(result.model); latencies.push(result.latencyMs) },
      failed: async () => { throw new Error('unexpected compaction failure') },
    })
    assert.equal(calls, 2)
    assert.equal(outcome.compacted, true)
    assert.equal(s.summary, 'recompacted summary')
    assert.equal(outcome.usage?.inputTokens, 13)
    assert.equal(outcome.usage?.outputTokens, 7)
    assert.deepEqual(completedModels, ['fake-model', 'fake-model-2'])
    assert.equal(latencies.length, 2)
    assert.ok(latencies.every((latency) => Number.isSafeInteger(latency) && latency >= 0))
  })

  it('tolerates compaction failure below the hard limit', async () => {
    const history = longHistory(10)
    const s = session(history)
    const driver = fakeDriver({
      compact() {
        return Promise.reject(new Error('model unavailable'))
      },
    })
    let failures = 0
    const outcome = await compactIfNeeded(s, 'instructions', driver, {
      ...smallOptions, hardRatio: 100, // hard limit far above estimated tokens
    }, undefined, {
      completed: async () => { throw new Error('unexpected compaction success') },
      failed: async (_error, latencyMs) => {
        assert.ok(Number.isSafeInteger(latencyMs) && latencyMs >= 0)
        failures += 1
      },
    })
    assert.equal(outcome.compacted, false)
    assert.equal(s.compactionEpoch, 0)
    assert.equal(failures, 1)
  })

  it('throws HardLimitExceededError when compaction fails past the hard limit', async () => {
    const history = longHistory(10)
    const s = session(history)
    const driver = fakeDriver({
      compact() {
        return Promise.reject(new Error('model unavailable'))
      },
    })
    await assert.rejects(
      compactIfNeeded(s, 'instructions', driver, { ...smallOptions, hardRatio: 0.0001 }),
      HardLimitExceededError,
    )
  })
})
