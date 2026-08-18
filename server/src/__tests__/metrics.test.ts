/**
 * Unit tests for the in-process metrics counter store.
 *
 * Counters are tiny and exposition format is plain text — easy targets
 * for unit testing, and there's enough format detail (HELP/TYPE headers,
 * label escaping, zero-row for unobserved counters) that a regression
 * could silently break Prometheus parsing.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { inc, renderProm, resetForTesting } from '../metrics.js'

beforeEach(() => { resetForTesting() })

test('renderProm emits zero rows for counters that haven\'t fired yet', () => {
  const out = renderProm()
  // Every counter in the registry should appear with a zero baseline so
  // Prometheus has a stable series from process start, not just after
  // the first event.
  assert.match(out, /# HELP email_send_ok /)
  assert.match(out, /# TYPE email_send_ok counter/)
  assert.match(out, /^email_send_ok 0$/m)
  assert.match(out, /^email_retry_terminal 0$/m)
})

test('inc bumps the counter for the matching labelset', () => {
  inc('email.send.ok', { mock: false })
  inc('email.send.ok', { mock: false })
  inc('email.send.ok', { mock: true })
  const out = renderProm()
  assert.match(out, /email_send_ok\{mock="false"\} 2/)
  assert.match(out, /email_send_ok\{mock="true"\} 1/)
})

test('inc on a label-less counter renders without {}', () => {
  inc('email.inbound.dedup')
  inc('email.inbound.dedup')
  inc('email.inbound.dedup')
  const out = renderProm()
  assert.match(out, /^email_inbound_dedup 3$/m)
})

test('labels with quotes/backslashes/newlines are escaped per Prom format', () => {
  // Label values come from caller-provided env strings in some sites;
  // make sure a hostile one can't break the exposition.
  inc('email.send.fail', { mock: 'hello "world"\\\nbreak' as unknown as boolean })
  const out = renderProm()
  // Each special character should appear as its escaped form.
  assert.match(out, /mock="hello \\"world\\"\\\\\\nbreak"/)
})

test('renderProm groups multiple labelsets under one HELP/TYPE pair', () => {
  inc('email.send.ok', { mock: false })
  inc('email.send.ok', { mock: true })
  const out = renderProm()
  const helps = (out.match(/# HELP email_send_ok /g) ?? []).length
  const types = (out.match(/# TYPE email_send_ok counter/g) ?? []).length
  assert.equal(helps, 1, 'HELP header should appear exactly once per counter')
  assert.equal(types, 1, 'TYPE header should appear exactly once per counter')
})

test('inc throws on unknown counter names', () => {
  // @ts-expect-error — deliberately passing an unregistered name to verify
  //   the runtime guard catches counters that were renamed but not updated
  //   at the call site.
  assert.throws(() => inc('email.totally.bogus', {}), /unknown counter/)
})

test('renderProm output ends with a trailing newline', () => {
  // Prometheus parsers require a final \n; without it the last metric is
  // sometimes ignored. Guard against accidental .trim() in the renderer.
  const out = renderProm()
  assert.ok(out.endsWith('\n'), 'output must end with newline')
})
