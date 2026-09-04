/**
 * Unit tests for the process-level alerting hook.
 *
 * The full notifyAlert() path makes real fetch calls — we exercise the
 * pure helpers (formatAlertContent, shouldSuppressAlert) directly and
 * stub global fetch for the integration-style behaviour tests.
 *
 * Run: node --import tsx --test server/src/__tests__/alerting.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAlertContent,
  shouldSuppressAlert,
  notifyAlert,
  notifyOperationalAlert,
  _resetAlertingForTests,
} from '../alerting.js'

// We swap env vars on the live `env` object via process.env so that
// alerting.ts (which captures env at import time) sees them. The
// captured object's fields are mutable refs in our case because env.ts
// returns a plain object literal — so we reassign env.ALERT_WEBHOOK_URL
// directly.
import { env } from '../env.js'

const SAVED_URL = env.ALERT_WEBHOOK_URL
const SAVED_DEDUPE = env.ALERT_DEDUPE_MS
const SAVED_FETCH = globalThis.fetch

beforeEach(() => {
  _resetAlertingForTests()
  env.ALERT_WEBHOOK_URL = ''
  env.ALERT_DEDUPE_MS = 60_000
})

afterEach(() => {
  env.ALERT_WEBHOOK_URL = SAVED_URL
  env.ALERT_DEDUPE_MS = SAVED_DEDUPE
  globalThis.fetch = SAVED_FETCH
})

// ── formatAlertContent ─────────────────────────────────────────────────

test('formatAlertContent: includes label, message, and stack', () => {
  const err = new Error('boom')
  err.stack = 'Error: boom\n    at <test>'
  const out = formatAlertContent({ label: 'test.case', error: err })
  assert.match(out, /\*\*\[test\.case\]\*\* boom/)
  assert.match(out, /Error: boom/)
})

test('formatAlertContent: handles a non-Error thrown value', () => {
  const out = formatAlertContent({ label: 'test.case', error: 'just a string' })
  assert.match(out, /just a string/)
  assert.ok(!out.includes('undefined'))
})

test('formatAlertContent: includes extras as a JSON block', () => {
  const out = formatAlertContent({
    label: 'pod',
    error: new Error('x'),
    extras: { agentId: 'a-1', runId: 'r-1' },
  })
  assert.match(out, /agentId/)
  assert.match(out, /a-1/)
})

test('formatAlertContent: truncates to Discord content max', () => {
  const err = new Error('x')
  err.stack = 'a'.repeat(5000)
  const out = formatAlertContent({ label: 'big', error: err })
  // Discord cap = 2000 chars; our budget keeps it ≤ 1950.
  assert.ok(out.length <= 1950, `expected ≤ 1950, got ${out.length}`)
  assert.ok(out.endsWith('...'), 'truncated output should end with ellipsis')
})

test('formatAlertContent: tolerates extras with circular references (skips silently)', () => {
  const circ: Record<string, unknown> = { a: 1 }
  circ.self = circ
  // Must not throw, even with the circular ref.
  const out = formatAlertContent({ label: 'circ', error: new Error('e'), extras: circ })
  assert.match(out, /\*\*\[circ\]/)
})

// ── shouldSuppressAlert (dedupe) ───────────────────────────────────────

test('shouldSuppressAlert: first call → false (lets it through)', () => {
  const r = shouldSuppressAlert({ label: 'x', error: new Error('boom') }, 1_000_000)
  assert.equal(r, false)
})

test('shouldSuppressAlert: duplicate within window → true', () => {
  const ctx = { label: 'x', error: new Error('boom') }
  shouldSuppressAlert(ctx, 1_000_000)
  const r = shouldSuppressAlert(ctx, 1_000_000 + 10_000) // inside 60s window
  assert.equal(r, true)
})

test('shouldSuppressAlert: same label, DIFFERENT message → not deduped', () => {
  shouldSuppressAlert({ label: 'x', error: new Error('alpha') }, 1_000_000)
  const r = shouldSuppressAlert({ label: 'x', error: new Error('beta') }, 1_000_000 + 10)
  assert.equal(r, false, 'different errors must not collapse under same fingerprint')
})

test('shouldSuppressAlert: DIFFERENT label, same message → not deduped', () => {
  shouldSuppressAlert({ label: 'one', error: new Error('boom') }, 1_000_000)
  const r = shouldSuppressAlert({ label: 'two', error: new Error('boom') }, 1_000_000 + 10)
  assert.equal(r, false, 'different labels must not collapse')
})

test('shouldSuppressAlert: after the dedupe window expires, alert fires again', () => {
  const ctx = { label: 'x', error: new Error('boom') }
  shouldSuppressAlert(ctx, 1_000_000)
  // 61s later — outside default 60s window.
  const r = shouldSuppressAlert(ctx, 1_000_000 + 61_000)
  assert.equal(r, false)
})

test('shouldSuppressAlert: respects ALERT_DEDUPE_MS = 0 (always pass)', () => {
  env.ALERT_DEDUPE_MS = 0
  const ctx = { label: 'x', error: new Error('boom') }
  assert.equal(shouldSuppressAlert(ctx, 1), false)
  assert.equal(shouldSuppressAlert(ctx, 2), false)
})

// ── notifyAlert end-to-end ─────────────────────────────────────────────

test('notifyAlert: no-op when ALERT_WEBHOOK_URL is empty (returns null)', async () => {
  let fetchCalls = 0
  globalThis.fetch = (async () => { fetchCalls += 1; return new Response('', { status: 204 }) }) as typeof fetch
  const r = await notifyAlert({ label: 'x', error: new Error('boom') })
  assert.equal(r, null)
  assert.equal(fetchCalls, 0, 'must NOT POST when webhook URL is empty')
})

test('notifyAlert: POSTs to ALERT_WEBHOOK_URL when set', async () => {
  env.ALERT_WEBHOOK_URL = 'https://example.invalid/webhook'
  let captured: { url: string; init: RequestInit } | null = null
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init: init ?? {} }
    return new Response('', { status: 200 })
  }) as typeof fetch
  const r = await notifyAlert({ label: 'x', error: new Error('boom') })
  assert.equal(r, 200)
  assert.ok(captured, 'fetch must be called')
  const c = captured as unknown as { url: string; init: RequestInit }
  assert.equal(c.url, 'https://example.invalid/webhook')
  assert.equal(c.init.method, 'POST')
  const body = JSON.parse(String(c.init.body))
  assert.match(body.content, /\[x\].*boom/)
})

test('notifyAlert: a fetch failure does NOT throw — alerting must never cascade', async () => {
  env.ALERT_WEBHOOK_URL = 'https://example.invalid/webhook'
  globalThis.fetch = (async () => { throw new Error('network down') }) as typeof fetch
  // Critical contract: the call returns; the throw is swallowed.
  const r = await notifyAlert({ label: 'x', error: new Error('boom') })
  assert.equal(r, null)
})

test('notifyAlert: deduped alerts skip the POST entirely', async () => {
  env.ALERT_WEBHOOK_URL = 'https://example.invalid/webhook'
  let fetchCalls = 0
  globalThis.fetch = (async () => { fetchCalls += 1; return new Response('', { status: 200 }) }) as typeof fetch
  const ctx = { label: 'x', error: new Error('boom') }
  await notifyAlert(ctx)
  await notifyAlert(ctx)
  await notifyAlert(ctx)
  assert.equal(fetchCalls, 1, 'duplicate within window must NOT POST')
})

test('structured operational alerts use the same authoritative webhook path', async () => {
  env.ALERT_WEBHOOK_URL = 'https://example.invalid/webhook'
  let capturedBody = ''
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '')
    return new Response(null, { status: 204 })
  }) as typeof fetch

  await notifyOperationalAlert({ title: 'email terminal failure', detail: 'message lost', level: 'error' })

  assert.match(capturedBody, /application\.error\.email terminal failure/)
  assert.match(capturedBody, /message lost/)
})
