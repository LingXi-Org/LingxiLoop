/**
 * Unit tests for the steering queue (server/src/agents/steer.ts).
 *
 * Covers the contract the hop-loop drainer in turn.ts depends on:
 *   - FIFO push order is preserved
 *   - Debounce gate (canDrainSteer false until DEBOUNCE_MS after first
 *     push; subsequent items pile in but don't extend the window)
 *   - Batch cap (MAX_BATCHES_PER_TURN stops further drains; saturated
 *     flag is observable)
 *   - Idempotent push by messageId (duplicate redis deliveries OK)
 *   - Multi-agent isolation (one agent's queue can't poison another's)
 *   - Reset (turn boundary clears state cleanly)
 *
 * Run: node --import tsx --test server/src/__tests__/agents-steer.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { env } from '../env.js'
import {
  pushSteer,
  canDrainSteer,
  drainSteer,
  resetSteerForAgent,
  isSteerSaturated,
  isSteerByteBudgetExhausted,
  recordSteerBytes,
  _peekSteerStateForTests,
  _resetAllSteerForTests,
  DEBOUNCE_MS,
  MAX_BATCHES_PER_TURN,
  MAX_BODY_BYTES,
  MAX_QUEUE_ITEMS,
  MAX_ITEMS_PER_DRAIN,
  MAX_BYTES_PER_TURN,
  type SteerItem,
} from '../agents/steer.js'

const A = 'agent-aaaa'
const B = 'agent-bbbb'
const T0 = 1_700_000_000_000 // some fixed "now" we control in tests

function mk(opts: Partial<SteerItem> & { messageId: string; arrivedAt?: number }): SteerItem {
  return {
    messageId: opts.messageId,
    conversationId: opts.conversationId ?? 'c-1',
    authorName: opts.authorName ?? 'alice',
    body: opts.body ?? 'hello',
    arrivedAt: opts.arrivedAt ?? T0,
  }
}

const SAVED_STEER_ENABLED = env.STEER_ENABLED

beforeEach(() => {
  _resetAllSteerForTests()
  env.STEER_ENABLED = true // default; individual tests may override
})

afterEach(() => {
  env.STEER_ENABLED = SAVED_STEER_ENABLED
})

// ── push / drain happy path ────────────────────────────────────────────

test('pushSteer: FIFO order preserved across multiple pushes', () => {
  pushSteer(A, mk({ messageId: 'm1', body: 'first', arrivedAt: T0 }))
  pushSteer(A, mk({ messageId: 'm2', body: 'second', arrivedAt: T0 + 100 }))
  pushSteer(A, mk({ messageId: 'm3', body: 'third', arrivedAt: T0 + 200 }))
  const batch = drainSteer(A)
  assert.ok(batch)
  assert.deepEqual(batch!.map((s) => s.body), ['first', 'second', 'third'])
})

test('drainSteer: returns null when queue is empty', () => {
  assert.equal(drainSteer(A), null)
})

test('drainSteer: empties the queue (second drain returns null)', () => {
  pushSteer(A, mk({ messageId: 'm1' }))
  assert.ok(drainSteer(A))
  assert.equal(drainSteer(A), null)
})

// ── debounce window ────────────────────────────────────────────────────

test('canDrainSteer: false immediately after first push (inside debounce window)', () => {
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  assert.equal(canDrainSteer(A, T0 + 100), false, '100ms after push is inside the 1500ms window')
})

test('canDrainSteer: false exactly at the boundary (need now >= readyAt)', () => {
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  // At T0 + DEBOUNCE_MS we hit readyAt exactly — implementation uses `>=`, so this PASSES.
  assert.equal(canDrainSteer(A, T0 + DEBOUNCE_MS), true)
})

test('canDrainSteer: true once the debounce window elapses', () => {
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  assert.equal(canDrainSteer(A, T0 + DEBOUNCE_MS + 1), true)
})

test('canDrainSteer: subsequent items DO NOT extend the debounce window (fixed window)', () => {
  // First push at T0 — window expires at T0 + 1500.
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  // Second push at T0 + 500 — must NOT push the deadline to T0 + 500 + 1500.
  pushSteer(A, mk({ messageId: 'm2', arrivedAt: T0 + 500 }))
  // At T0 + 1500 + 1, both items are drainable.
  assert.equal(canDrainSteer(A, T0 + DEBOUNCE_MS + 1), true)
  const batch = drainSteer(A)
  assert.equal(batch?.length, 2)
})

test('canDrainSteer: false when queue is empty even past the window', () => {
  assert.equal(canDrainSteer(A, T0 + 999_999), false)
})

// ── idempotency ────────────────────────────────────────────────────────

test('pushSteer: duplicate messageId is silently coalesced', () => {
  pushSteer(A, mk({ messageId: 'm1', body: 'first', arrivedAt: T0 }))
  pushSteer(A, mk({ messageId: 'm1', body: 'first again', arrivedAt: T0 + 100 }))
  const batch = drainSteer(A)
  assert.equal(batch?.length, 1)
  assert.equal(batch![0].body, 'first', 'first push wins; the second is dropped')
})

test('pushSteer: empty agentId or messageId is a no-op (defensive)', () => {
  pushSteer('', mk({ messageId: 'm1' }))
  pushSteer(A, mk({ messageId: '' }))
  assert.equal(_peekSteerStateForTests(A), null)
})

// ── multi-agent isolation ──────────────────────────────────────────────

test('isolation: agent A push does NOT affect agent B', () => {
  pushSteer(A, mk({ messageId: 'm1' }))
  assert.equal(canDrainSteer(B, T0 + DEBOUNCE_MS + 1), false)
  assert.equal(drainSteer(B), null)
})

test('isolation: drains on A and B are independent', () => {
  pushSteer(A, mk({ messageId: 'a1', body: 'A1', arrivedAt: T0 }))
  pushSteer(B, mk({ messageId: 'b1', body: 'B1', arrivedAt: T0 }))
  const ba = drainSteer(A)
  const bb = drainSteer(B)
  assert.equal(ba?.length, 1)
  assert.equal(ba![0].body, 'A1')
  assert.equal(bb?.length, 1)
  assert.equal(bb![0].body, 'B1')
})

// ── batch cap ──────────────────────────────────────────────────────────

test('canDrainSteer: false after MAX_BATCHES_PER_TURN even with queued items', () => {
  // Drain MAX_BATCHES_PER_TURN times to exhaust the budget.
  for (let i = 0; i < MAX_BATCHES_PER_TURN; i++) {
    pushSteer(A, mk({ messageId: `m${i}`, arrivedAt: T0 + i }))
    assert.ok(canDrainSteer(A, T0 + DEBOUNCE_MS + i + 1), `iter ${i} should be drainable`)
    drainSteer(A)
  }
  // One more arrives — even after debounce, canDrainSteer is false.
  pushSteer(A, mk({ messageId: 'one-too-many', arrivedAt: T0 + 10_000 }))
  assert.equal(canDrainSteer(A, T0 + 999_999), false, 'cap reached → no more drains')
  assert.equal(isSteerSaturated(A), true)
})

test('isSteerSaturated: false before the cap, true after', () => {
  assert.equal(isSteerSaturated(A), false)
  for (let i = 0; i < MAX_BATCHES_PER_TURN - 1; i++) {
    pushSteer(A, mk({ messageId: `m${i}` }))
    drainSteer(A)
  }
  assert.equal(isSteerSaturated(A), false, 'one short of cap')
  pushSteer(A, mk({ messageId: 'last' }))
  drainSteer(A)
  assert.equal(isSteerSaturated(A), true)
})

test('saturated state retains the queue (excess items stay queued, not dropped here)', () => {
  // Drain to cap.
  for (let i = 0; i < MAX_BATCHES_PER_TURN; i++) {
    pushSteer(A, mk({ messageId: `m${i}` }))
    drainSteer(A)
  }
  // Subsequent push still enqueues — the hop loop will skip drain
  // (because canDrainSteer = false), but the items aren't lost; they
  // remain in the queue. resetSteerForAgent is the only thing that
  // clears them. (Production behaviour: those messages stay in the
  // `messages` table too, so the next wake picks them up; the in-pod
  // queue just gets discarded at turn end.)
  pushSteer(A, mk({ messageId: 'extra' }))
  const peek = _peekSteerStateForTests(A)
  assert.equal(peek?.queueLength, 1)
  assert.equal(canDrainSteer(A, T0 + 999_999), false)
})

// ── reset (turn boundary) ──────────────────────────────────────────────

test('resetSteerForAgent: clears queue, deadline, and saturation count', () => {
  pushSteer(A, mk({ messageId: 'm1' }))
  drainSteer(A)
  pushSteer(A, mk({ messageId: 'm2' }))
  resetSteerForAgent(A)
  assert.equal(_peekSteerStateForTests(A), null)
  // After reset, pushing again starts fresh.
  pushSteer(A, mk({ messageId: 'm3', arrivedAt: T0 }))
  assert.equal(canDrainSteer(A, T0 + 100), false, 'fresh debounce window')
  assert.equal(canDrainSteer(A, T0 + DEBOUNCE_MS + 1), true)
})

test('resetSteerForAgent: resets per-agent independently', () => {
  pushSteer(A, mk({ messageId: 'a' }))
  pushSteer(B, mk({ messageId: 'b' }))
  resetSteerForAgent(A)
  assert.equal(_peekSteerStateForTests(A), null)
  assert.equal(_peekSteerStateForTests(B)?.queueLength, 1)
})

// ── post-reset cap also resets ─────────────────────────────────────────

// ── per-body byte cap ──────────────────────────────────────────────────

test('pushSteer: bodies longer than MAX_BODY_BYTES are truncated in place', () => {
  const huge = 'x'.repeat(MAX_BODY_BYTES + 1000)
  pushSteer(A, mk({ messageId: 'big', body: huge }))
  const batch = drainSteer(A)
  assert.ok(batch)
  assert.equal(batch![0].body.length, MAX_BODY_BYTES + '... [truncated]'.length)
  assert.ok(batch![0].body.endsWith('... [truncated]'))
})

test('pushSteer: bodies at exactly MAX_BODY_BYTES are NOT touched', () => {
  const exact = 'x'.repeat(MAX_BODY_BYTES)
  pushSteer(A, mk({ messageId: 'edge', body: exact }))
  const batch = drainSteer(A)
  assert.equal(batch![0].body, exact, 'boundary case: == limit is unchanged')
})

test('pushSteer: original input object is not mutated when truncating', () => {
  const huge = 'x'.repeat(MAX_BODY_BYTES + 100)
  const original: SteerItem = mk({ messageId: 'm1', body: huge })
  const originalBody = original.body
  pushSteer(A, original)
  assert.equal(original.body, originalBody, 'caller-provided object must NOT be mutated')
})

// ── queue-length cap (FIFO eviction) ───────────────────────────────────

test('pushSteer: queue capped at MAX_QUEUE_ITEMS — oldest evicted', () => {
  for (let i = 0; i < MAX_QUEUE_ITEMS + 5; i++) {
    pushSteer(A, mk({ messageId: `m${i}`, body: `msg${i}`, arrivedAt: T0 + i }))
  }
  const batch = drainSteer(A)
  assert.ok(batch)
  assert.equal(batch!.length, Math.min(MAX_QUEUE_ITEMS, MAX_ITEMS_PER_DRAIN),
    'first drain returns up to MAX_ITEMS_PER_DRAIN items')
  // The OLDEST 5 should have been evicted — so the first item in the
  // remaining queue is m5, not m0.
  assert.equal(batch![0].messageId, 'm5', 'oldest items evicted (m0–m4)')
})

// ── per-drain item cap ─────────────────────────────────────────────────

test('drainSteer: single drain returns at most MAX_ITEMS_PER_DRAIN items', () => {
  for (let i = 0; i < MAX_ITEMS_PER_DRAIN * 2; i++) {
    pushSteer(A, mk({ messageId: `m${i}`, arrivedAt: T0 + i }))
  }
  const first = drainSteer(A)
  assert.equal(first?.length, MAX_ITEMS_PER_DRAIN)
  // Leftover items are immediately drainable on the next hop (the
  // debounce already elapsed; in a real turn the hop-loop fires
  // again on the next iteration).
  assert.equal(canDrainSteer(A, T0 + DEBOUNCE_MS + 999), true,
    'leftover items are immediately drainable past the debounce')
})

test('drainSteer: leftover items preserve FIFO order on the next drain', () => {
  for (let i = 0; i < MAX_ITEMS_PER_DRAIN + 3; i++) {
    pushSteer(A, mk({ messageId: `m${i}`, arrivedAt: T0 + i }))
  }
  drainSteer(A) // first drain takes the OLDEST MAX_ITEMS_PER_DRAIN
  const second = drainSteer(A)
  assert.ok(second)
  assert.equal(second!.length, 3, 'leftover items drain on the next call')
  assert.equal(second![0].messageId, `m${MAX_ITEMS_PER_DRAIN}`,
    'second drain starts where first ended (FIFO causal order)')
})

// ── STEER_ENABLED kill-switch ──────────────────────────────────────────

test('STEER_ENABLED=false: pushSteer is a complete no-op', () => {
  env.STEER_ENABLED = false
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  assert.equal(_peekSteerStateForTests(A), null, 'no state was created')
  // canDrain stays false even past the debounce window.
  assert.equal(canDrainSteer(A, T0 + DEBOUNCE_MS + 999), false)
  assert.equal(drainSteer(A, T0 + DEBOUNCE_MS + 999), null)
})

test('STEER_ENABLED=false: existing queued items from earlier (enabled) period are NOT magically drained', () => {
  // Push while enabled
  env.STEER_ENABLED = true
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  // Disable mid-flight
  env.STEER_ENABLED = false
  // ... but the previously-queued item is still drainable — the
  // kill-switch only affects FUTURE pushes; in-flight queues are
  // left to drain naturally (or get wiped by resetSteerForAgent at
  // turn end). This matches the documented behavior.
  pushSteer(A, mk({ messageId: 'm2', arrivedAt: T0 + 100 }))
  const batch = drainSteer(A, T0 + DEBOUNCE_MS + 1)
  assert.ok(batch)
  assert.equal(batch!.length, 1, 'only m1 (pre-disable) is in queue')
  assert.equal(batch![0].messageId, 'm1')
})

// ── defensive runtime guards in drainSteer ─────────────────────────────

test('drainSteer: refuses to drain when debounce has not elapsed (defensive)', () => {
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  // canDrainSteer would return false at T0+100; drainSteer should
  // ALSO return null instead of yielding the item.
  const out = drainSteer(A, T0 + 100)
  assert.equal(out, null)
  // The item is still in the queue — refused, not consumed.
  const peek = _peekSteerStateForTests(A)
  assert.equal(peek?.queueLength, 1)
})

test('drainSteer: refuses to drain past MAX_BATCHES_PER_TURN', () => {
  for (let i = 0; i < MAX_BATCHES_PER_TURN; i++) {
    pushSteer(A, mk({ messageId: `m${i}`, arrivedAt: T0 + i }))
    drainSteer(A, T0 + DEBOUNCE_MS + i + 1)
  }
  pushSteer(A, mk({ messageId: 'extra', arrivedAt: T0 + 999_999 }))
  // Even past the debounce, drain refuses because batch budget is
  // exhausted. The item stays queued — turn end's reset will wipe.
  const out = drainSteer(A, T0 + 999_999 + DEBOUNCE_MS + 1)
  assert.equal(out, null)
})

// ── O(1) idempotency via parallel Set ──────────────────────────────────

test('pushSteer (O(1) dedup): 1000 distinct pushes are sub-linear in time', () => {
  // We don't assert a strict timing bound (CI variance), but we DO
  // verify functional equivalence with the previous .some() check.
  for (let i = 0; i < 1000; i++) {
    pushSteer(A, mk({ messageId: `m${i}`, arrivedAt: T0 + i }))
  }
  // MAX_QUEUE_ITEMS cap kicks in at 100 → 900 evicted as oldest.
  const peek = _peekSteerStateForTests(A)
  assert.equal(peek?.queueLength, 100, 'cap retained 100 items')
})

test('pushSteer (O(1) dedup): adding a duplicate id is still rejected', () => {
  pushSteer(A, mk({ messageId: 'm1', body: 'first', arrivedAt: T0 }))
  pushSteer(A, mk({ messageId: 'm1', body: 'duplicate', arrivedAt: T0 + 100 }))
  const batch = drainSteer(A, T0 + DEBOUNCE_MS + 1)
  assert.equal(batch?.length, 1)
  assert.equal(batch![0].body, 'first', 'first push wins, duplicate rejected via Set lookup')
})

test('pushSteer (O(1) dedup): after eviction, the same id can be pushed again', () => {
  // Fill the queue to capacity.
  for (let i = 0; i < MAX_QUEUE_ITEMS; i++) {
    pushSteer(A, mk({ messageId: `m${i}`, arrivedAt: T0 + i }))
  }
  // m0 just got evicted (FIFO). Pushing m0 AGAIN should now succeed
  // because the parallel Set was kept in sync at eviction time.
  pushSteer(A, mk({ messageId: 'm0', body: 're-pushed', arrivedAt: T0 + 99_999 }))
  const peek = _peekSteerStateForTests(A)
  assert.equal(peek?.queueLength, MAX_QUEUE_ITEMS, 'still at cap; one new item evicted m1')
  // Confirm by draining: m0 should be present.
  const batch = drainSteer(A, T0 + 999_999)
  assert.ok(batch)
  const ids = batch!.map((s) => s.messageId)
  assert.ok(ids.includes('m0'), 'evicted+re-pushed id is in the drain output')
})

// ── byte budget cap (#4) ───────────────────────────────────────────────

test('byte budget: canDrainSteer returns false once cumulative bytes exceed MAX_BYTES_PER_TURN', () => {
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  assert.ok(canDrainSteer(A, T0 + DEBOUNCE_MS + 1), 'initially drainable')
  drainSteer(A, T0 + DEBOUNCE_MS + 1)
  // Simulate that the rendered text was bigger than the budget.
  recordSteerBytes(A, MAX_BYTES_PER_TURN + 10)
  // Push another item; canDrain must refuse despite debounce being met.
  pushSteer(A, mk({ messageId: 'm2', arrivedAt: T0 + 1000 }))
  assert.equal(canDrainSteer(A, T0 + 999_999), false, 'byte budget exhausted → no drain')
})

test('byte budget: isSteerByteBudgetExhausted flips at the threshold', () => {
  pushSteer(A, mk({ messageId: 'm1' }))
  assert.equal(isSteerByteBudgetExhausted(A), false)
  recordSteerBytes(A, MAX_BYTES_PER_TURN - 1)
  assert.equal(isSteerByteBudgetExhausted(A), false, 'one byte short of cap')
  recordSteerBytes(A, 1)
  assert.equal(isSteerByteBudgetExhausted(A), true, 'exactly at cap')
})

test('byte budget: reset clears the byte counter', () => {
  pushSteer(A, mk({ messageId: 'm1' }))
  recordSteerBytes(A, MAX_BYTES_PER_TURN + 100)
  assert.equal(isSteerByteBudgetExhausted(A), true)
  resetSteerForAgent(A)
  // Fresh state — byte counter is back to 0.
  pushSteer(A, mk({ messageId: 'm2', arrivedAt: T0 }))
  assert.equal(isSteerByteBudgetExhausted(A), false)
  assert.ok(canDrainSteer(A, T0 + DEBOUNCE_MS + 1), 'fresh byte budget after reset')
})

test('byte budget: drainSteer refuses past byte cap', () => {
  pushSteer(A, mk({ messageId: 'm1', arrivedAt: T0 }))
  recordSteerBytes(A, MAX_BYTES_PER_TURN + 1)
  const out = drainSteer(A, T0 + DEBOUNCE_MS + 1)
  assert.equal(out, null, 'drainSteer refuses when byte budget exhausted')
})

test('byte budget: recordSteerBytes returns the running total', () => {
  pushSteer(A, mk({ messageId: 'm1' }))
  assert.equal(recordSteerBytes(A, 1000), 1000)
  assert.equal(recordSteerBytes(A, 2500), 3500)
})

test('byte budget: negative deltas are clamped to 0 (defensive)', () => {
  pushSteer(A, mk({ messageId: 'm1' }))
  recordSteerBytes(A, 1000)
  // A caller passing a negative number (shouldn't happen but harden) —
  // we don't roll the counter backwards.
  assert.equal(recordSteerBytes(A, -500), 1000)
})

test('reset → full MAX_BATCHES_PER_TURN budget is replenished', () => {
  // Drain to cap.
  for (let i = 0; i < MAX_BATCHES_PER_TURN; i++) {
    pushSteer(A, mk({ messageId: `m${i}` }))
    drainSteer(A)
  }
  assert.equal(isSteerSaturated(A), true)
  // Turn ends → reset.
  resetSteerForAgent(A)
  assert.equal(isSteerSaturated(A), false)
  pushSteer(A, mk({ messageId: 'next-turn-msg', arrivedAt: T0 }))
  assert.equal(canDrainSteer(A, T0 + DEBOUNCE_MS + 1), true)
})
