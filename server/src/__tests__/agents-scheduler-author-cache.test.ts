/**
 * Unit tests for the scheduler's author-name cache. The cache exists
 * so a group-chat message doesn't trigger N participants-lookups (one
 * per agent member that gets a steer routing decision).
 *
 * Strategy: monkey-patch `pool.query` to count + control responses,
 * then exercise `resolveAuthorName` directly. Pins the cache contract
 * (TTL, capacity trim, fallback-on-error).
 *
 * Run: node --import tsx --test server/src/__tests__/agents-scheduler-author-cache.test.ts
 */
import { test, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../db/pool.js'
import { resolveAuthorName, _resetAuthorNameCacheForTests } from '../agents/scheduler.js'

type PoolQueryFn = typeof pool.query
const SAVED_QUERY = pool.query

let queryCount = 0
let nextResponse: { rows: { name: string | null }[] } | Error = { rows: [{ name: 'default' }] }

beforeEach(() => {
  _resetAuthorNameCacheForTests()
  queryCount = 0
  nextResponse = { rows: [{ name: 'default' }] }
  ;(pool as unknown as { query: PoolQueryFn }).query = (async () => {
    queryCount += 1
    if (nextResponse instanceof Error) throw nextResponse
    return nextResponse
  }) as unknown as PoolQueryFn
})

afterEach(() => {
  ;(pool as unknown as { query: PoolQueryFn }).query = SAVED_QUERY
})

after(async () => {
  // scheduler.ts transitively imports redis.ts which opens Redis
  // connections at module load. Tear them down here so the test
  // process can exit instead of hanging for 30s on dangling
  // handles.
  try { await pool.end() } catch { /* ignore */ }
  try {
    const { redis, sub } = await import('../redis.js')
    redis.disconnect()
    sub.disconnect()
  } catch { /* ignore */ }
})

// ── cache hit/miss ─────────────────────────────────────────────────────

test('resolveAuthorName: first call hits the DB and returns the name', async () => {
  nextResponse = { rows: [{ name: 'Alice' }] }
  const name = await resolveAuthorName('u-1')
  assert.equal(name, 'Alice')
  assert.equal(queryCount, 1)
})

test('resolveAuthorName: SECOND call inside TTL window does NOT hit the DB', async () => {
  nextResponse = { rows: [{ name: 'Alice' }] }
  await resolveAuthorName('u-1')
  assert.equal(queryCount, 1)
  // Same id again — cache hit; no second query.
  const name = await resolveAuthorName('u-1')
  assert.equal(name, 'Alice')
  assert.equal(queryCount, 1, 'cache HIT — no extra DB query')
})

test('resolveAuthorName: different ids → independent DB queries', async () => {
  nextResponse = { rows: [{ name: 'Alice' }] }
  await resolveAuthorName('u-1')
  nextResponse = { rows: [{ name: 'Bob' }] }
  const bob = await resolveAuthorName('u-2')
  assert.equal(bob, 'Bob')
  assert.equal(queryCount, 2, 'each new id = one query')
})

test('resolveAuthorName: N callers for the same id in a group chat → 1 DB query (the steering N+1 fix)', async () => {
  nextResponse = { rows: [{ name: 'Alice' }] }
  // Simulate scheduler routing a message to 10 agents in the same
  // group — each member's wake calls resolveAuthorName(authorId)
  // for the SAME author. With the cache, only the first hits the DB.
  for (let i = 0; i < 10; i++) {
    const name = await resolveAuthorName('u-1')
    assert.equal(name, 'Alice')
  }
  assert.equal(queryCount, 1, '10 concurrent agents share a single DB lookup')
})

// ── fallback to authorId ──────────────────────────────────────────────

test('resolveAuthorName: missing participants row → falls back to authorId', async () => {
  nextResponse = { rows: [] }
  const name = await resolveAuthorName('u-orphan')
  assert.equal(name, 'u-orphan', 'no row → return the id verbatim')
  assert.equal(queryCount, 1)
})

test('resolveAuthorName: null name → falls back to authorId', async () => {
  nextResponse = { rows: [{ name: null }] }
  const name = await resolveAuthorName('u-anon')
  assert.equal(name, 'u-anon')
})

test('resolveAuthorName: DB error → returns authorId AND does NOT cache the failure', async () => {
  nextResponse = new Error('connection refused')
  const first = await resolveAuthorName('u-broken')
  assert.equal(first, 'u-broken', 'fallback to id on error')
  assert.equal(queryCount, 1)
  // Recovery: next call should RETRY, not return cached fallback.
  nextResponse = { rows: [{ name: 'Recovered' }] }
  const second = await resolveAuthorName('u-broken')
  assert.equal(second, 'Recovered', 'errored lookups are NOT cached — retry on next call')
  assert.equal(queryCount, 2)
})

// ── reset (test infra contract) ────────────────────────────────────────

test('_resetAuthorNameCacheForTests: discards entries, next call hits DB again', async () => {
  nextResponse = { rows: [{ name: 'Alice' }] }
  await resolveAuthorName('u-1')
  assert.equal(queryCount, 1)
  _resetAuthorNameCacheForTests()
  await resolveAuthorName('u-1')
  assert.equal(queryCount, 2, 'reset cleared the cache — second call re-queries')
})
