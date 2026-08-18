/**
 * Mid-tool interrupt path — when a steer arrives while a long-running
 * tool is in flight, `pushSteer` aborts the registered batch controller
 * and the bash tool kills its child + returns `aborted: true`.
 *
 * Covered here:
 *   - registerActiveToolBatch + pushSteer → controller.abort fires once
 *     past the age floor
 *   - the abort is idempotent across a burst of steers in the same
 *     batch window
 *   - a steer arriving BEFORE the age floor does NOT fire abort
 *     (cheap tools complete normally; we don't thrash on every steer)
 *   - resetSteerForAgent clears the active-batch registration too
 *   - tBash with an already-aborted signal short-circuits without
 *     spawning a process and returns `aborted: true`
 *   - tBash with a live signal aborts a running `sleep 30` in <2s and
 *     surfaces the partial stdout that was captured pre-kill
 *
 * Run: node --import tsx --test server/src/__tests__/agents-steer-interrupt.test.ts
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  pushSteer,
  registerActiveToolBatch,
  clearActiveToolBatch,
  resetSteerForAgent,
  _peekActiveToolBatchForTests,
  _resetAllSteerForTests,
  type SteerItem,
} from '../agents/steer.js'
import { tBash } from '../agents/tools-shared.js'

function mk(opts: Partial<SteerItem> & { messageId: string; arrivedAt?: number }): SteerItem {
  return {
    messageId: opts.messageId,
    conversationId: opts.conversationId ?? 'c1',
    authorName: opts.authorName ?? 'human',
    body: opts.body ?? 'hello',
    arrivedAt: opts.arrivedAt ?? Date.now(),
  }
}

beforeEach(() => {
  _resetAllSteerForTests()
  // Drop the floor so the abort path fires immediately in tests
  // without us having to fake-sleep 20 seconds. interruptAfterMs reads
  // process.env on every call, so a per-test override is enough.
  process.env.STEER_INTERRUPT_AFTER_MS = '0'
})

test('pushSteer aborts an active tool batch past the age floor', () => {
  const controller = new AbortController()
  registerActiveToolBatch('a1', controller, ['bash'])
  assert.equal(controller.signal.aborted, false)

  pushSteer('a1', mk({ messageId: 'm1' }))
  assert.equal(controller.signal.aborted, true)

  const peek = _peekActiveToolBatchForTests('a1')
  assert.ok(peek, 'batch should still be registered until turn.ts clears it')
  assert.equal(peek!.aborted, true)
})

test('abort is fired exactly once across a burst of steers', () => {
  const controller = new AbortController()
  let abortCount = 0
  controller.signal.addEventListener('abort', () => { abortCount += 1 })
  registerActiveToolBatch('a1', controller, ['bash'])

  pushSteer('a1', mk({ messageId: 'm1' }))
  pushSteer('a1', mk({ messageId: 'm2' }))
  pushSteer('a1', mk({ messageId: 'm3' }))

  assert.equal(abortCount, 1, 'controller.abort() should fire only once')
})

test('steer arriving before the age floor does NOT abort', () => {
  process.env.STEER_INTERRUPT_AFTER_MS = '60000'
  const controller = new AbortController()
  registerActiveToolBatch('a1', controller, ['bash'])
  pushSteer('a1', mk({ messageId: 'm1' }))
  assert.equal(controller.signal.aborted, false)
})

test('resetSteerForAgent clears the active-batch registration', () => {
  const controller = new AbortController()
  registerActiveToolBatch('a1', controller, ['bash'])
  resetSteerForAgent('a1')
  assert.equal(_peekActiveToolBatchForTests('a1'), null)
})

test('clearActiveToolBatch removes the registration without aborting', () => {
  const controller = new AbortController()
  registerActiveToolBatch('a1', controller, ['bash'])
  clearActiveToolBatch('a1')
  assert.equal(_peekActiveToolBatchForTests('a1'), null)
  assert.equal(controller.signal.aborted, false)
})

test('tBash short-circuits when called with an already-aborted signal', async () => {
  const controller = new AbortController()
  controller.abort()
  const result = await tBash({ command: 'echo never-runs' }, 'a1', null, controller.signal)
  assert.equal(result.aborted, true)
  assert.equal(result.ok, false)
  const out = result.output as { stdout: string; aborted?: boolean }
  assert.equal(out.aborted, true)
  // Should have done NO work — the echo never ran.
  assert.equal(out.stdout, '')
})

test('tBash kills the child when the signal aborts mid-run', async () => {
  const controller = new AbortController()
  const t0 = Date.now()
  // sleep 30 would normally take 30s — we expect SIGTERM to land within
  // 2s of the abort + a small grace, so the whole call should resolve
  // well under 5 seconds.
  setTimeout(() => controller.abort(), 200)
  const result = await tBash({ command: 'sleep 30' }, 'a1', null, controller.signal)
  const elapsed = Date.now() - t0
  assert.equal(result.aborted, true, 'aborted flag must be set')
  assert.equal(result.ok, false)
  assert.ok(elapsed < 5000, `bash should die in <5s, took ${elapsed}ms`)
  const out = result.output as { aborted: boolean; abortReason: string }
  assert.equal(out.aborted, true)
  assert.equal(out.abortReason, 'steer_interrupt')
  assert.equal(result.display.status, 'aborted · steer')
})

test('tBash preserves partial stdout captured before the kill', async () => {
  const controller = new AbortController()
  // The full suite starts many test processes in parallel. Give the shell
  // enough time to be scheduled and flush its first line before aborting;
  // 400ms was shorter than process startup on a busy CI runner and made this
  // assertion race the spawn itself rather than exercise partial capture.
  setTimeout(() => controller.abort(), 2_000)
  // Print a marker line, then hang. We should see the marker in the
  // result's stdout even though the process got killed.
  const result = await tBash(
    { command: 'echo MARKER; sleep 30' },
    'a1',
    null,
    controller.signal,
  )
  const out = result.output as { stdout: string }
  assert.ok(out.stdout.includes('MARKER'), `expected MARKER in stdout, got: ${JSON.stringify(out.stdout)}`)
})
