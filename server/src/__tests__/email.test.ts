/**
 * Pure-function tests for the email helpers. Everything here is
 * dependency-free — no DB, no HTTP — so we can run `npm test` without
 * spinning up Postgres / Redis / the server. The functions exercised
 * here are the safety-critical bits (sanitization + address splitting +
 * threading id normalization); they're where a regression would silently
 * break either delivery (subject corruption, lost CC) or security (XSS
 * via HTML email).
 *
 * Run: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAgentAddress,
  formatAddress,
  normalizeMessageId,
  parseAddress,
  sanitizeEmailHtml,
  sanitizeSubject,
  splitReplyAddresses,
} from '../modules/email/addressing.js'
import {
  __setEmailProviderOverrideForTesting,
  assertEmailProviderConfigured,
  sendViaProvider,
} from '../modules/email/provider.js'
import { tenantEmailIdempotencyKey } from '../modules/email/idempotency.js'

test('email idempotency identity is stable within a tenant and distinct across tenants', () => {
  const first = tenantEmailIdempotencyKey('company-a', 'request-0001')
  assert.equal(first, tenantEmailIdempotencyKey('company-a', 'request-0001'))
  assert.notEqual(first, tenantEmailIdempotencyKey('company-b', 'request-0001'))
  assert.match(first, /^email\/[a-f0-9]{64}$/)
})

/* ============================== sanitizeSubject ============================ */

test('sanitizeSubject strips ASCII C0 controls and DEL', () => {
  assert.equal(sanitizeSubject('hello\x00world\x07'), 'hello world')
  assert.equal(sanitizeSubject('a\x7Fb'), 'a b')
})

test('sanitizeSubject collapses runs of whitespace', () => {
  assert.equal(sanitizeSubject('  a   b\t\nc   '), 'a b c')
})

test('sanitizeSubject caps at 200 chars', () => {
  const s = sanitizeSubject('x'.repeat(500))
  assert.equal(s.length, 200)
})

test('sanitizeSubject returns empty on whitespace-only input', () => {
  assert.equal(sanitizeSubject('   \t\n  '), '')
})

test('sanitizeSubject strips zero-width / BOM characters', () => {
  // ​ = zero-width space, ﻿ = BOM
  assert.equal(sanitizeSubject('hi​﻿there'), 'hithere')
})

/* ============================ parseAddress ================================ */

test('parseAddress handles bare address', () => {
  assert.deepEqual(parseAddress('alice@example.com'), { addr: 'alice@example.com', name: null })
})

test('parseAddress handles Name <addr> form', () => {
  assert.deepEqual(parseAddress('Alice <alice@example.com>'), { addr: 'alice@example.com', name: 'Alice' })
})

test('parseAddress handles quoted name', () => {
  assert.deepEqual(parseAddress('"Alice, A." <alice@example.com>'), { addr: 'alice@example.com', name: 'Alice, A.' })
})

test('parseAddress lowercases the address', () => {
  assert.deepEqual(parseAddress('Alice <ALICE@Example.COM>'), { addr: 'alice@example.com', name: 'Alice' })
})

test('parseAddress rejects garbage', () => {
  assert.equal(parseAddress(''), null)
  assert.equal(parseAddress('no-at-sign'), null)
  assert.equal(parseAddress('  '), null)
})

test('formatAddress quotes names with delimiters', () => {
  assert.equal(formatAddress('a@b.com', 'Plain Name'), 'Plain Name <a@b.com>')
  assert.equal(formatAddress('a@b.com', 'Has, Comma'), '"Has, Comma" <a@b.com>')
  assert.equal(formatAddress('a@b.com', null), 'a@b.com')
})

/* ============================ splitReplyAddresses ========================== */

test('splitReplyAddresses puts original From in TO, original To+Cc in CC', () => {
  const r = splitReplyAddresses({
    originalFrom: 'Alice <alice@example.com>',
    originalTo: ['bob@example.com', 'carol@example.com'],
    originalCc: ['dave@example.com'],
    selfAddresses: ['me@example.com'],
  })
  assert.deepEqual(r.to, ['Alice <alice@example.com>'])
  assert.deepEqual(r.cc, ['bob@example.com', 'carol@example.com', 'dave@example.com'])
})

test('splitReplyAddresses removes self from both lists', () => {
  const r = splitReplyAddresses({
    originalFrom: 'Alice <alice@example.com>',
    originalTo: ['me@example.com', 'bob@example.com'],
    originalCc: ['me@example.com'],
    selfAddresses: ['me@example.com'],
  })
  assert.deepEqual(r.to, ['Alice <alice@example.com>'])
  assert.deepEqual(r.cc, ['bob@example.com'])
})

test('splitReplyAddresses dedupes when From also appears in TO/CC', () => {
  const r = splitReplyAddresses({
    originalFrom: 'Alice <alice@example.com>',
    originalTo: ['alice@example.com'],
    originalCc: [],
    selfAddresses: ['me@example.com'],
  })
  assert.deepEqual(r.to, ['Alice <alice@example.com>'])
  assert.deepEqual(r.cc, [])
})

test('splitReplyAddresses returns empty TO when From is self', () => {
  const r = splitReplyAddresses({
    originalFrom: 'me@example.com',
    originalTo: ['bob@example.com'],
    originalCc: [],
    selfAddresses: ['me@example.com'],
  })
  assert.deepEqual(r.to, [])
  assert.deepEqual(r.cc, ['bob@example.com'])
})

/* ============================= sanitizeEmailHtml =========================== */

test('sanitizeEmailHtml strips <script> tag bodies', () => {
  const html = '<p>hello</p><script>alert(1)</script><p>world</p>'
  const out = sanitizeEmailHtml(html)
  assert.ok(!/<script/i.test(out), `expected no <script>, got: ${out}`)
  assert.ok(!out.includes('alert(1)'), `expected no script body, got: ${out}`)
})

test('sanitizeEmailHtml strips <iframe>', () => {
  const out = sanitizeEmailHtml('<iframe src="https://evil/"></iframe>')
  assert.ok(!/<iframe/i.test(out))
})

test('sanitizeEmailHtml strips <style> blocks', () => {
  const out = sanitizeEmailHtml('<style>body{display:none}</style><p>x</p>')
  assert.ok(!/<style/i.test(out))
  assert.ok(out.includes('<p>x</p>'))
})

test('sanitizeEmailHtml strips on* event handlers', () => {
  const out = sanitizeEmailHtml('<a href="x" onclick="alert(1)" onmouseover=evil>x</a>')
  assert.ok(!/onclick/i.test(out))
  assert.ok(!/onmouseover/i.test(out))
  assert.ok(out.includes('href'))
})

test('sanitizeEmailHtml neutralizes javascript: URLs', () => {
  const out = sanitizeEmailHtml('<a href="javascript:alert(1)">click</a>')
  assert.ok(!/javascript:/i.test(out))
})

test('sanitizeEmailHtml neutralizes vbscript: URLs', () => {
  const out = sanitizeEmailHtml('<a href="vbscript:msgbox">x</a>')
  assert.ok(!/vbscript:/i.test(out))
})

test('sanitizeEmailHtml strips <meta refresh>', () => {
  const out = sanitizeEmailHtml('<meta http-equiv="refresh" content="0;url=evil"><p>hi</p>')
  assert.ok(!/<meta/i.test(out))
})

test('sanitizeEmailHtml preserves normal mail markup', () => {
  const html = '<p>Dear customer,</p><table><tr><td>cell</td></tr></table>'
  const out = sanitizeEmailHtml(html)
  assert.ok(out.includes('<p>'))
  assert.ok(out.includes('<table'))
  assert.ok(out.includes('cell'))
})

test('sanitizeEmailHtml preserves data:image URLs', () => {
  const out = sanitizeEmailHtml('<img src="data:image/png;base64,abc">')
  assert.ok(/data:image\/png/i.test(out), `expected data:image preserved, got: ${out}`)
})

/* ============================ normalizeMessageId =========================== */

test('normalizeMessageId strips angle brackets + lowercases', () => {
  assert.equal(normalizeMessageId('<ABC@HOST>'), 'abc@host')
  assert.equal(normalizeMessageId('abc@host'), 'abc@host')
})

test('normalizeMessageId returns null on null/empty', () => {
  assert.equal(normalizeMessageId(null), null)
  assert.equal(normalizeMessageId(''), null)
  assert.equal(normalizeMessageId('  '), null)
})

/* ============================ computeAgentAddress ========================== */

test('computeAgentAddress emits <id>.<slug>@<EMAIL_DOMAIN>', () => {
  // Only valid when EMAIL_DOMAIN is set — guard so the test doesn't fail
  // in environments that intentionally leave it blank.
  const addr = computeAgentAddress('aurora', 'acme')
  if (!addr) return  // EMAIL_DOMAIN unset — skip
  assert.match(addr, /^aurora\.acme@/)
})

test('computeAgentAddress strips dots from id portion', () => {
  const addr = computeAgentAddress('a.b.c', 'acme')
  if (!addr) return
  // The id portion ("a.b.c") gets sanitized — dots removed (replaced with -).
  // The slug separator remains the LAST dot only.
  assert.equal(addr.split('@')[0].split('.').length, 2, `expected exactly one dot separator, got: ${addr}`)
})

test('email provider is unavailable without configuration or an explicit test seam', async () => {
  const previous = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  __setEmailProviderOverrideForTesting(null)
  try {
    assert.throws(() => assertEmailProviderConfigured(), /RESEND_API_KEY is required/)
    await assert.rejects(sendViaProvider({
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Unavailable provider',
      text: 'This must not fake success.',
      messageId: 'unavailable-provider@example.com',
    }), /RESEND_API_KEY is required/)
  } finally {
    if (previous === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = previous
  }
})

test('email provider tests use the explicit injected seam', async () => {
  __setEmailProviderOverrideForTesting(async (input) => ({
    ok: true,
    smtpMessageId: input.messageId,
    error: null,
  }))
  try {
    assert.doesNotThrow(() => assertEmailProviderConfigured())
    assert.deepEqual(await sendViaProvider({
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Injected provider',
      text: 'Delivered through the test seam.',
      messageId: 'explicit-message-id',
    }), { ok: true, smtpMessageId: 'explicit-message-id', error: null })
  } finally {
    __setEmailProviderOverrideForTesting(null)
  }
})

test('email provider success without the authoritative Message-ID fails closed', async () => {
  __setEmailProviderOverrideForTesting(async () => ({ ok: true, smtpMessageId: null, error: null }))
  try {
    await assert.rejects(sendViaProvider({
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Invalid provider response',
      text: 'A success response must preserve the Message-ID.',
      messageId: 'strict-message-id@example.com',
    }), /success without Message-ID/)
  } finally {
    __setEmailProviderOverrideForTesting(null)
  }
})
