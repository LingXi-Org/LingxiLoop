/**
 * Unit tests for the Cloudflare Email Worker's pure helpers.
 *
 * The worker itself runs on Workers Runtime, but the helpers exercised
 * here only depend on Web Platform APIs (TextEncoder, btoa, crypto) that
 * Node 24 implements natively — no special test harness needed. The
 * `email()` handler itself isn't covered here (it'd need a fake
 * ForwardableEmailMessage + a network stub for the inbound POST) — those
 * paths are best validated end-to-end with `wrangler dev`.
 *
 * Run: npm test (from repo root)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalMessageId,
  recipientAccepted,
  readArrayHeader,
  toBase64,
  getHeader,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
} from './index.js'

/* ============================ recipientAccepted ============================ */

const envSingleDomain = { EMAIL_ROOT_DOMAINS: 'mail.loop.example.com' } as never as Parameters<typeof recipientAccepted>[1]
const envMultiDomain = { EMAIL_ROOT_DOMAINS: 'mail.loop.example.com, lingxiloop.dev , example.com' } as never as Parameters<typeof recipientAccepted>[1]

test('recipientAccepted matches exact apex', () => {
  assert.equal(recipientAccepted('alice@mail.loop.example.com', envSingleDomain), true)
})

test('recipientAccepted matches subdomain', () => {
  assert.equal(recipientAccepted('alice@acme.mail.loop.example.com', envSingleDomain), true)
})

test('recipientAccepted rejects unknown domain', () => {
  assert.equal(recipientAccepted('alice@evil.com', envSingleDomain), false)
})

test('recipientAccepted handles multi-domain allowlist', () => {
  assert.equal(recipientAccepted('alice@lingxiloop.dev', envMultiDomain), true)
  assert.equal(recipientAccepted('alice@example.com', envMultiDomain), true)
  assert.equal(recipientAccepted('alice@other.org', envMultiDomain), false)
})

test('recipientAccepted is case-insensitive', () => {
  assert.equal(recipientAccepted('ALICE@MAIL.LOOP.EXAMPLE.COM', envSingleDomain), true)
})

test('recipientAccepted rejects malformed', () => {
  assert.equal(recipientAccepted('no-at-sign', envSingleDomain), false)
})

test('recipientAccepted does NOT match suffix-of-other-domain (apple.com vs evilapple.com)', () => {
  // Guards against the classic mistake of `endsWith('apple.com')` matching
  // `evilapple.com`. The check requires either an exact match OR `.<root>`.
  const env = { EMAIL_ROOT_DOMAINS: 'apple.com' } as never as Parameters<typeof recipientAccepted>[1]
  assert.equal(recipientAccepted('x@evilapple.com', env), false)
  assert.equal(recipientAccepted('x@apple.com', env), true)
})

/* ============================== readArrayHeader =========================== */

test('readArrayHeader returns [] for empty/missing', () => {
  assert.deepEqual(readArrayHeader(undefined), [])
  assert.deepEqual(readArrayHeader(''), [])
  assert.deepEqual(readArrayHeader('   '), [])
})

test('readArrayHeader splits angle-bracketed References on whitespace', () => {
  const r = readArrayHeader('<a@x> <b@y>\n<c@z>')
  assert.deepEqual(r, ['a@x', 'b@y', 'c@z'])
})

test('readArrayHeader strips repeated angle brackets', () => {
  assert.deepEqual(readArrayHeader('<<a@x>>'), ['a@x'])
})

/* =================================== toBase64 ============================== */

test('toBase64 round-trips ASCII', () => {
  const bytes = new TextEncoder().encode('Hello, world')
  const b64 = toBase64(bytes)
  assert.equal(b64, 'SGVsbG8sIHdvcmxk')
})

test('toBase64 handles binary bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 255, 254])
  const b64 = toBase64(bytes)
  // Decode back via Buffer to verify symmetry without trusting our own impl.
  const back = Buffer.from(b64, 'base64')
  assert.deepEqual(Array.from(back), [0, 1, 2, 3, 255, 254])
})

test('toBase64 handles multi-chunk inputs (>32KB)', () => {
  // Chunk size in the impl is 0x8000 (32768). Build something larger so we
  // know the chunk-loop path runs.
  const big = new Uint8Array(70_000).fill(0x41)  // 70KB of 'A'
  const b64 = toBase64(big)
  const back = Buffer.from(b64, 'base64')
  assert.equal(back.length, 70_000)
  assert.equal(back[0], 0x41)
  assert.equal(back[69_999], 0x41)
})

/* =================================== getHeader ============================ */

test('getHeader does case-insensitive lookup', () => {
  const headers = [
    { key: 'X-Custom', value: 'one' },
    { key: 'auto-submitted', value: 'auto-replied' },
  ]
  assert.equal(getHeader(headers, 'Auto-Submitted'), 'auto-replied')
  assert.equal(getHeader(headers, 'x-custom'), 'one')
  assert.equal(getHeader(headers, 'missing'), undefined)
})

test('getHeader returns first match', () => {
  const headers = [
    { key: 'X-Foo', value: 'first' },
    { key: 'x-foo', value: 'second' },
  ]
  assert.equal(getHeader(headers, 'X-Foo'), 'first')
})

test('canonicalMessageId prefers the exact LingxiLoop identity over provider rewrites', () => {
  assert.equal(canonicalMessageId(
    [{ key: 'X-LingxiLoop-Message-ID', value: '<native@loop.example>' }],
    'provider-rewrite@amazonses.com',
  ), 'native@loop.example')
  assert.equal(canonicalMessageId(undefined, '<external@example.com>'), 'external@example.com')
})

/* ============================== attachment caps =========================== */

test('attachment byte limits are sensibly ordered', () => {
  // Sanity guards on the constants: per-attachment cap must be < total cap,
  // and total cap must leave headroom under the server's 25MB JSON limit
  // after base64 expansion (~33% overhead).
  assert.ok(MAX_ATTACHMENT_BYTES < MAX_TOTAL_ATTACHMENT_BYTES)
  assert.ok(MAX_TOTAL_ATTACHMENT_BYTES * 1.34 < 25 * 1024 * 1024)
})
