/**
 * Unit tests for the bounded-concurrency Semaphore — the backpressure
 * primitive that caps the scheduler's wake fan-out and the
 * orchestrator's kubectl shell-outs.
 *
 * Run: node --import tsx --test server/src/__tests__/concurrency.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Semaphore } from '../concurrency.js'

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

test('never exceeds max concurrent runners', async () => {
  const sem = new Semaphore(3)
  let active = 0
  let peak = 0
  const tasks = Array.from({ length: 50 }, () =>
    sem.run(async () => {
      active++
      peak = Math.max(peak, active)
      await tick()
      active--
    }),
  )
  await Promise.all(tasks)
  assert.equal(peak, 3, `peak concurrency should be capped at 3, got ${peak}`)
  assert.equal(active, 0)
  assert.equal(sem.available, 3)
  assert.equal(sem.queued, 0)
})

test('releases the permit even when the task throws', async () => {
  const sem = new Semaphore(1)
  await assert.rejects(sem.run(async () => { throw new Error('boom') }), /boom/)
  // If release() didn't run in the finally, this second acquire would
  // hang forever (and the test would time out).
  let ran = false
  await sem.run(async () => { ran = true })
  assert.equal(ran, true)
  assert.equal(sem.available, 1)
})

test('processes waiters in FIFO order', async () => {
  const sem = new Semaphore(1)
  const order: number[] = []
  // Hold the only permit so the rest queue up in call order.
  const gate = sem.run(async () => { await tick() })
  const queued = [1, 2, 3, 4].map((n) => sem.run(async () => { order.push(n) }))
  await Promise.all([gate, ...queued])
  assert.deepEqual(order, [1, 2, 3, 4])
})

test('a bad max (0 / negative / NaN) degrades to 1, never deadlocks', async () => {
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const sem = new Semaphore(bad as number)
    let ran = false
    await sem.run(async () => { ran = true })
    assert.equal(ran, true, `max=${bad} should still run`)
  }
})
