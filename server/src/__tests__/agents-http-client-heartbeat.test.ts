/**
 * Unit tests for the HttpRuntimeClient's busy-heartbeat alert path.
 *
 * The heartbeat is fire-and-forget — its failure must never crash a
 * turn — but a SUSTAINED failure means the server-side steer routing
 * has silently degraded for the affected pod. The
 * BUSY_HEARTBEAT_ALERT_THRESHOLD streak detector exists to surface
 * that silent failure to the webhook hook so someone notices instead
 * of finding it in stderr days later.
 *
 * This test pins the contract:
 *  - first N-1 failures only log
 *  - exactly the Nth failure triggers a notifyAlert (firing once,
 *    not every failure after)
 *  - a single success resets the streak — the next failure starts
 *    from zero
 *
 * Run: node --import tsx --test server/src/__tests__/agents-http-client-heartbeat.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { HttpRuntimeClient, _resetBusyHeartbeatStateForTests } from '../agents/runtime/http-client.js'
import { env } from '../env.js'
import { _resetAlertingForTests } from '../alerting.js'

const SAVED_URL = env.ALERT_WEBHOOK_URL
const SAVED_DEDUPE = env.ALERT_DEDUPE_MS
const SAVED_FETCH = globalThis.fetch

// Track every webhook POST the alert hook makes during a test so we
// can assert how many alerts fired.
let webhookCalls: { url: string; body: string }[] = []
let nextHeartbeatBehaviour: 'fail' | 'ok' = 'fail'

beforeEach(() => {
  _resetAlertingForTests()
  _resetBusyHeartbeatStateForTests()
  webhookCalls = []
  nextHeartbeatBehaviour = 'fail'
  env.ALERT_WEBHOOK_URL = 'https://example.invalid/webhook'
  env.ALERT_DEDUPE_MS = 0 // disable dedupe so we count every alert call
  // Stub globalThis.fetch — used by alerting.ts. HttpRuntimeClient
  // takes its own fetchImpl via constructor, so heartbeat calls and
  // alert POSTs route to different stubs.
  globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
    const u = String(url)
    if (u === env.ALERT_WEBHOOK_URL) {
      webhookCalls.push({ url: u, body: String(_init?.body ?? '') })
      return new Response('', { status: 204 })
    }
    throw new Error(`unexpected fetch to ${u}`)
  }) as typeof fetch
})

afterEach(() => {
  env.ALERT_WEBHOOK_URL = SAVED_URL
  env.ALERT_DEDUPE_MS = SAVED_DEDUPE
  globalThis.fetch = SAVED_FETCH
})

/** Build a HttpRuntimeClient with a fetch stub that fails or succeeds
 *  the heartbeat path based on `nextHeartbeatBehaviour`. */
function mkClient(): HttpRuntimeClient {
  return new HttpRuntimeClient({
    baseUrl: 'https://test.invalid',
    token: 'test-jwt',
    fetchImpl: (async () => {
      if (nextHeartbeatBehaviour === 'fail') {
        throw new Error('simulated runtime endpoint unreachable')
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch,
    timeoutMs: 1000,
  })
}

// ── tests ──────────────────────────────────────────────────────────────

test('recordBusyHeartbeat: a SINGLE failure does not alert (only logs)', async () => {
  const c = mkClient()
  await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 0, 'no alert on first failure')
})

test('recordBusyHeartbeat: alert fires EXACTLY at the 5th consecutive failure', async () => {
  const c = mkClient()
  for (let i = 0; i < 4; i++) {
    await c.recordBusyHeartbeat('agent-1')
    assert.equal(webhookCalls.length, 0, `no alert after failure #${i + 1}`)
  }
  await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 1, 'alert fires on the 5th failure')
  const body = JSON.parse(webhookCalls[0].body)
  assert.match(body.content, /busy_heartbeat_degraded/)
  assert.match(body.content, /steer routing has degraded to wake-only/)
})

test('recordBusyHeartbeat: a success RESETS the streak (no alert until 5 more)', async () => {
  const c = mkClient()
  // 4 failures (streak = 4, no alert yet)
  for (let i = 0; i < 4; i++) await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 0)
  // One success — streak resets.
  nextHeartbeatBehaviour = 'ok'
  await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 0, 'success does not trigger an alert')
  // Now 4 failures in a row again — still no alert (streak counted from reset)
  nextHeartbeatBehaviour = 'fail'
  for (let i = 0; i < 4; i++) await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 0, 'streak reset; 4 failures alone do not alert')
  // The 5th failure since the reset → alert
  await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 1, 'alert fires on the 5th post-reset failure')
})

test('recordBusyHeartbeat: continued failures past threshold do NOT spam the webhook', async () => {
  const c = mkClient()
  // Hit the threshold (5 failures) → 1 alert
  for (let i = 0; i < 5; i++) await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 1, 'one alert at threshold')
  // Keep failing — the streak counter keeps incrementing but the
  // "fire alert" branch only triggers when streak === THRESHOLD
  // (strict equality, not >=), so no further webhook calls.
  for (let i = 0; i < 20; i++) await c.recordBusyHeartbeat('agent-1')
  assert.equal(webhookCalls.length, 1, 'no further alerts despite 20 more failures')
})

test('recordBusyHeartbeat: alert never throws even if the webhook itself fails', async () => {
  // Re-stub globalThis.fetch so the alert webhook ALSO fails — the
  // alerting module should swallow it; recordBusyHeartbeat must
  // remain fire-and-forget.
  globalThis.fetch = (async () => { throw new Error('webhook also down') }) as typeof fetch
  const c = mkClient()
  // Should NOT throw, even when the threshold alert call fails.
  for (let i = 0; i < 5; i++) {
    await c.recordBusyHeartbeat('agent-1')
  }
  // No way to assert — we just need to not blow up.
})
