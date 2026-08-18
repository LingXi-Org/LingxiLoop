/**
 * Unit tests for ensureSchemaWithBootRetry — the boot-time wrapper that
 * keeps the server alive across transient pg-pool acquire timeouts
 * during the first few seconds after a DB hiccup.
 *
 * Run: node --import tsx --test server/src/__tests__/migrate-boot-retry.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureSchemaWithBootRetry } from '../db/migrate.js'

const noSleep = async (_ms: number): Promise<void> => {}

test('passes through when schemaFn succeeds on first try', async () => {
  let calls = 0
  await ensureSchemaWithBootRetry({
    schemaFn: async () => { calls++ },
    sleep: noSleep,
  })
  assert.equal(calls, 1)
})

test('retries transport-shaped errors and recovers', async () => {
  let calls = 0
  await ensureSchemaWithBootRetry({
    schemaFn: async () => {
      calls++
      if (calls < 3) throw new Error('Connection terminated due to connection timeout')
    },
    sleep: noSleep,
  })
  assert.equal(calls, 3)
})

test('retries on ECONNREFUSED', async () => {
  let calls = 0
  await ensureSchemaWithBootRetry({
    schemaFn: async () => {
      calls++
      if (calls < 2) throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
    },
    sleep: noSleep,
  })
  assert.equal(calls, 2)
})

test('retries lock-contention errors (40P01 deadlock) and recovers', async () => {
  // Regression: a boot migration that loses a deadlock against live traffic
  // used to fail fast and crashloop the pod; with two replicas down at once the
  // LB served 502. A 40P01 (and 55P03 / 40001) must now be retried.
  let calls = 0
  await ensureSchemaWithBootRetry({
    schemaFn: async () => {
      calls++
      if (calls < 3) {
        const err = new Error('deadlock detected') as Error & { code: string }
        err.code = '40P01'
        throw err
      }
    },
    sleep: noSleep,
  })
  assert.equal(calls, 3)
})

test('retries lock_not_available (55P03) from lock_timeout', async () => {
  let calls = 0
  await ensureSchemaWithBootRetry({
    schemaFn: async () => {
      calls++
      if (calls < 2) {
        const err = new Error('canceling statement due to lock timeout') as Error & { code: string }
        err.code = '55P03'
        throw err
      }
    },
    sleep: noSleep,
  })
  assert.equal(calls, 2)
})

test('throws on the last attempt even if transport-shaped', async () => {
  let calls = 0
  await assert.rejects(
    () => ensureSchemaWithBootRetry({
      schemaFn: async () => {
        calls++
        throw new Error('timeout exceeded when trying to connect')
      },
      sleep: noSleep,
      maxAttempts: 3,
    }),
    /timeout exceeded/,
  )
  assert.equal(calls, 3)
})

test('fails fast on non-transport errors (no retry)', async () => {
  let calls = 0
  await assert.rejects(
    () => ensureSchemaWithBootRetry({
      schemaFn: async () => {
        calls++
        throw new Error('permission denied for relation users')
      },
      sleep: noSleep,
    }),
    /permission denied/,
  )
  assert.equal(calls, 1)
})

test('does not retry on syntax errors', async () => {
  let calls = 0
  await assert.rejects(
    () => ensureSchemaWithBootRetry({
      schemaFn: async () => {
        calls++
        throw new Error('syntax error at or near "CRAETE"')
      },
      sleep: noSleep,
    }),
    /syntax error/,
  )
  assert.equal(calls, 1)
})

test('uses exponential backoff sequence (1s, 2s, 4s, 8s, 16s, 30s cap)', async () => {
  const delays: number[] = []
  let calls = 0
  await assert.rejects(
    () => ensureSchemaWithBootRetry({
      schemaFn: async () => {
        calls++
        throw new Error('Connection terminated unexpectedly')
      },
      sleep: async (ms) => { delays.push(ms) },
      maxAttempts: 6,
    }),
  )
  assert.equal(calls, 6)
  // 5 sleeps between 6 attempts; final attempt throws without sleeping.
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 16_000])
})
