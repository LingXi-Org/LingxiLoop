import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hashToken, MemoryActionLedger, MemoryEventStore, MemorySessionStore, MemoryWorkStore,
} from '../src/control-plane/memory-store.js'
import type { EnqueueWorkInput } from '../src/control-plane/stores.js'
import type { SessionRecord } from '../src/protocol/types.js'

function input(overrides: Partial<EnqueueWorkInput> = {}): EnqueueWorkInput {
  return {
    tenantId: 't1', agentId: 'a1', sessionId: 's1', kind: 'turn',
    lane: 'interactive', triggerRef: 'msg-1', ...overrides,
  }
}

describe('MemoryWorkStore lease state machine', () => {
  it('claims by lane priority, then priority, then age', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'bg', lane: 'background', sessionId: 'sa' }))
    await store.enqueue(input({ id: 'hi', lane: 'interactive', sessionId: 'sb' }))
    await store.enqueue(input({ id: 'hi2', lane: 'interactive', sessionId: 'sc', priority: 5 }))
    const first = await store.claim('w1')
    assert.equal(first?.id, 'hi2')
    const second = await store.claim('w1')
    assert.equal(second?.id, 'hi')
    const third = await store.claim('w1')
    assert.equal(third?.id, 'bg')
  })

  it('advances the fence on every lease and dedupes enqueue by id', async () => {
    const store = new MemoryWorkStore()
    const first = await store.enqueue(input({ id: 'work-1' }))
    const duplicate = await store.enqueue(input({ id: 'work-1' }))
    assert.equal(first.deduplicated, false)
    assert.equal(duplicate.deduplicated, true)
    const claimed = await store.claim('w1')
    assert.equal(claimed?.fence, 1)
    store.expireLease('work-1')
    const reclaimed = await store.claim('w1')
    assert.equal(reclaimed?.fence, 2)
  })

  it('enforces session exclusivity: one live lease per session key', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'w-a', triggerRef: 'm1' }))
    await store.enqueue(input({ id: 'w-b', triggerRef: 'm2' }))
    const first = await store.claim('w1')
    assert.equal(first?.id, 'w-a')
    assert.equal(await store.claim('w1'), null) // same session is locked
    await store.complete('w-a', first!.fence, hashToken(first!.leaseToken), { status: 'completed' })
    const second = await store.claim('w1')
    assert.equal(second?.id, 'w-b')
  })

  it('routes a session to one worker and bumps homeEpoch on takeover from a dead worker', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'w-a', triggerRef: 'm1' }))
    const first = await store.claim('w1')
    assert.equal(first?.homeEpoch, 1)
    await store.complete('w-a', first!.fence, hashToken(first!.leaseToken), { status: 'completed' })

    // While w1 is alive, w2 must not claim this session's work.
    await store.enqueue(input({ id: 'w-b', triggerRef: 'm2' }))
    assert.equal(await store.claim('w2'), null)

    // After w1 dies, w2 takes over and the home epoch advances.
    store.markWorkerDead('w1')
    const takeover = await store.claim('w2')
    assert.equal(takeover?.id, 'w-b')
    assert.equal(takeover?.homeEpoch, 2)
  })

  it('rejects stale fences and wrong tokens', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'w-a' }))
    const claimed = await store.claim('w1')
    assert.equal(await store.heartbeat('w-a', claimed!.fence + 1, hashToken(claimed!.leaseToken)), null)
    assert.equal(await store.heartbeat('w-a', claimed!.fence, hashToken('wrong')), null)
    assert.notEqual(await store.heartbeat('w-a', claimed!.fence, hashToken(claimed!.leaseToken)), null)
  })

  it('transports cancel, preempt, and steer through heartbeats', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'w-a' }))
    const claimed = await store.claim('w1')
    const tokenHash = hashToken(claimed!.leaseToken)
    await store.addSteer('w-a', 'focus on the summary')
    await store.requestPreempt('w-a')
    await store.requestCancel('w-a')
    const beat = await store.heartbeat('w-a', claimed!.fence, tokenHash)
    assert.equal(beat?.cancelRequested, true)
    assert.equal(beat?.preemptRequested, true)
    assert.equal(beat?.steer[0]?.text, 'focus on the summary')
  })

  it('cancels queued work immediately', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'w-a' }))
    assert.equal(await store.requestCancel('w-a'), true)
    assert.equal(await store.claim('w1'), null)
    assert.equal(store.inspect('w-a')?.status, 'cancelled')
  })

  it('yields only preempted work, advancing the fence and counting the preemption', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'w-a' }))
    const claimed = await store.claim('w1')
    const tokenHash = hashToken(claimed!.leaseToken)
    assert.equal(await store.yieldWork('w-a', claimed!.fence, tokenHash), false)
    await store.requestPreempt('w-a')
    assert.equal(await store.yieldWork('w-a', claimed!.fence, tokenHash), true)
    const row = store.inspect('w-a')
    assert.equal(row?.status, 'queued')
    assert.equal(row?.fence, claimed!.fence + 1)
    assert.equal(row?.preemptions, 1)
  })

  it('honors availableAt scheduling', async () => {
    const store = new MemoryWorkStore()
    await store.enqueue(input({ id: 'later', availableAt: new Date(Date.now() + 60_000).toISOString() }))
    assert.equal(await store.claim('w1'), null)
  })
})

describe('MemorySessionStore optimistic concurrency', () => {
  function session(revision: number): SessionRecord {
    return {
      key: 't1:a1:s1:-', tenantId: 't1', agentId: 'a1', sessionId: 's1',
      history: [{ role: 'user', content: 'hi' }], appliedWorkIds: [], revision, compactionEpoch: 0,
    }
  }

  it('creates at revision 0 and conflicts on stale revisions', async () => {
    const store = new MemorySessionStore()
    const created = await store.save(session(0))
    assert.deepEqual(created, { ok: true, revision: 1 })
    assert.deepEqual(await store.save(session(0)), { ok: false, conflict: true })
    assert.deepEqual(await store.save(session(1)), { ok: true, revision: 2 })
    const loaded = await store.get('t1:a1:s1:-')
    assert.equal(loaded?.revision, 2)
  })
})

describe('MemoryEventStore', () => {
  it('dedupes on (runId, seq) and lists ranges in order', async () => {
    const store = new MemoryEventStore()
    const base = { runId: 'r1', tenantId: 't1', agentId: 'a1', kind: 'model.delta', stage: 'delta' as const, visibility: 'internal' as const, data: {}, recordedAt: 'now' }
    assert.equal(await store.append({ ...base, seq: 2 }), true)
    assert.equal(await store.append({ ...base, seq: 2 }), false)
    assert.equal(await store.append({ ...base, seq: 1 }), true)
    assert.equal(await store.append({ ...base, seq: 100_001, kind: 'other' }), true)
    const range = await store.listRange('r1', 0, 100_000)
    assert.deepEqual(range.map((event) => event.seq), [1, 2])
    const filtered = await store.listRange('r1', 0, 200_000, ['other'])
    assert.deepEqual(filtered.map((event) => event.seq), [100_001])
  })
})

describe('MemoryActionLedger', () => {
  it('returns the first recorded result for duplicate keys', async () => {
    const ledger = new MemoryActionLedger()
    assert.equal(await ledger.find('k1'), null)
    const first = await ledger.record('k1', { ok: true, value: 1 })
    assert.deepEqual(first, { ok: true, value: 1 })
    const second = await ledger.record('k1', { ok: true, value: 2 })
    assert.deepEqual(second, { ok: true, value: 1 })
    assert.deepEqual(await ledger.find('k1'), { ok: true, value: 1 })
  })
})
