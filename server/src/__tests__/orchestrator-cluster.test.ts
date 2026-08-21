/**
 * Unit tests for the pure cluster-state helpers in orchestrator.ts:
 *   - parseClusterFuse: nodes + pods JSON → used/cap counts
 *   - pickAgentPodsForGc: who gets reaped on the GC sweep
 *   - evaluateFusePressureSample: when does the alert fire
 *
 * These are the post-incident (FUSE-cap, 2026-05-20) structural fixes:
 * cluster-aware admission, completed-pod GC, sustained-pressure alert.
 *
 * Run: node --import tsx --test server/src/__tests__/orchestrator-cluster.test.ts
 */

import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import {
  _resetFusePressureStateForTests,
  evaluateFusePressureSample,
  parseClusterFuse,
  pickAgentPodsForGc,
} from '../agents/runtime/orchestrator.js'
import { pool } from '../db/pool.js'

after(async () => {
  try { await pool.end() } catch { /* ignore */ }
  try {
    const { redis, sub } = await import('../redis.js')
    redis.disconnect()
    sub.disconnect()
  } catch { /* ignore */ }
})

// ── parseClusterFuse ─────────────────────────────────────────────────

test('parseClusterFuse: sums fuse capacity across nodes', () => {
  const nodes = JSON.stringify({
    items: [
      { status: { capacity: { 'devic.es/fuse': '10' } } },
      { status: { capacity: { 'devic.es/fuse': '10' } } },
      { status: { capacity: { 'devic.es/fuse': '20' } } },  // hypothetical bigger node
    ],
  })
  const pods = JSON.stringify({ items: [] })
  const r = parseClusterFuse(nodes, pods)
  assert.equal(r.cap, 40)
  assert.equal(r.used, 0)
})

test('parseClusterFuse: counts Pending + Running agent pods, skips Succeeded/Failed', () => {
  const nodes = JSON.stringify({ items: [{ status: { capacity: { 'devic.es/fuse': '10' } } }] })
  const pods = JSON.stringify({
    items: [
      { status: { phase: 'Running' } },
      { status: { phase: 'Running' } },
      { status: { phase: 'Pending' } },
      { status: { phase: 'Succeeded' } },
      { status: { phase: 'Failed' } },
      { status: { phase: 'Unknown' } },
    ],
  })
  const r = parseClusterFuse(nodes, pods)
  assert.equal(r.used, 3)  // 2 Running + 1 Pending
})

test('parseClusterFuse: malformed JSON returns zeros, not throws', () => {
  assert.deepEqual(parseClusterFuse('not json', '{}'), { used: 0, cap: 0 })
  assert.deepEqual(parseClusterFuse('{}', 'not json'), { used: 0, cap: 0 })
  assert.deepEqual(parseClusterFuse('', ''), { used: 0, cap: 0 })
})

test('parseClusterFuse: missing capacity field treated as 0, not crash', () => {
  const nodes = JSON.stringify({
    items: [
      { status: { capacity: {} } },
      { status: {} },
      {},
    ],
  })
  const r = parseClusterFuse(nodes, '{"items":[]}')
  assert.equal(r.cap, 0)
})

// ── pickAgentPodsForGc ───────────────────────────────────────────────

test('pickAgentPodsForGc: returns Succeeded/Failed/Unknown pods older than minAge', () => {
  const now = 1_000_000_000_000
  const tenMinAgo = new Date(now - 10 * 60_000).toISOString()
  const oneMinAgo = new Date(now - 60_000).toISOString()
  const pods = JSON.stringify({
    items: [
      // Old Succeeded — gets picked
      { metadata: { name: 'agent-a', creationTimestamp: tenMinAgo }, status: { phase: 'Succeeded' } },
      // Old Failed — gets picked
      { metadata: { name: 'agent-b', creationTimestamp: tenMinAgo }, status: { phase: 'Failed' } },
      // Old Unknown — gets picked
      { metadata: { name: 'agent-c', creationTimestamp: tenMinAgo }, status: { phase: 'Unknown' } },
      // Old Running — left alone
      { metadata: { name: 'agent-d', creationTimestamp: tenMinAgo }, status: { phase: 'Running' } },
      // Old Pending — left alone
      { metadata: { name: 'agent-e', creationTimestamp: tenMinAgo }, status: { phase: 'Pending' } },
      // YOUNG Succeeded — left alone (minAge guard)
      { metadata: { name: 'agent-f', creationTimestamp: oneMinAgo }, status: { phase: 'Succeeded' } },
    ],
  })
  const victims = pickAgentPodsForGc(pods, now, 5 * 60_000)
  assert.deepEqual(victims.sort(), ['agent-a', 'agent-b', 'agent-c'])
})

test('pickAgentPodsForGc: pod with no creationTimestamp passes the age check', () => {
  // Defensive: a missing creationTimestamp shouldn't cause us to skip the
  // pod (it's been there long enough to lose its metadata, almost certainly).
  const now = 1_000_000_000_000
  const pods = JSON.stringify({
    items: [{ metadata: { name: 'agent-old' }, status: { phase: 'Succeeded' } }],
  })
  const victims = pickAgentPodsForGc(pods, now, 5 * 60_000)
  assert.deepEqual(victims, ['agent-old'])
})

test('pickAgentPodsForGc: malformed JSON returns empty list', () => {
  assert.deepEqual(pickAgentPodsForGc('not json', Date.now(), 60_000), [])
})

test('pickAgentPodsForGc: empty items array returns empty', () => {
  assert.deepEqual(pickAgentPodsForGc('{"items":[]}', Date.now(), 60_000), [])
})

// ── evaluateFusePressureSample ───────────────────────────────────────

const baseThresholds = {
  pendingMin: 20,
  ratioMin: 0.95,
  sustainedMs: 5 * 60_000,
  alertCooldownMs: 30 * 60_000,
}

beforeEach(() => { _resetFusePressureStateForTests() })

test('evaluateFusePressureSample: below threshold → no fire, clears pressureSince', () => {
  const state = { lastSampleAt: 0, pressureSince: 999, lastAlertAt: null }
  const r = evaluateFusePressureSample(state, 5, 0.10, 1_000, baseThresholds)
  assert.equal(r.fire, false)
  assert.equal(state.pressureSince, null)
})

test('evaluateFusePressureSample: pressure just starts → no fire (within sustain window)', () => {
  const state = { lastSampleAt: 0, pressureSince: null, lastAlertAt: null }
  const r = evaluateFusePressureSample(state, 30, 0.50, 1_000, baseThresholds)
  assert.equal(r.fire, false)
  assert.equal(state.pressureSince, 1_000)
})

test('evaluateFusePressureSample: pressure sustained past sustainedMs → FIRES', () => {
  const state = { lastSampleAt: 0, pressureSince: 1_000, lastAlertAt: null }
  const t = 1_000 + 6 * 60_000
  const r = evaluateFusePressureSample(state, 30, 0.50, t, baseThresholds)
  assert.equal(r.fire, true)
  assert.equal(state.lastAlertAt, t)
  assert.match(r.reason, /pending=30/)
})

test('evaluateFusePressureSample: alert cooldown suppresses repeat fires', () => {
  const t0 = 10_000_000
  const state = { lastSampleAt: 0, pressureSince: t0 - 6 * 60_000, lastAlertAt: t0 - 5 * 60_000 }
  // 5min after last alert, still in 30min cooldown
  const r = evaluateFusePressureSample(state, 30, 0.50, t0, baseThresholds)
  assert.equal(r.fire, false)
  assert.match(r.reason, /cooldown/)
})

test('evaluateFusePressureSample: ratio above 95% trips even with low pending count', () => {
  const state = { lastSampleAt: 0, pressureSince: 0, lastAlertAt: null }
  const t = 1_000_000 + 6 * 60_000
  // 0 pending but cluster 98% saturated — still pressure
  state.pressureSince = 1_000_000
  const r = evaluateFusePressureSample(state, 0, 0.98, t, baseThresholds)
  assert.equal(r.fire, true)
})

test('evaluateFusePressureSample: recovery between samples clears pressureSince', () => {
  const state = { lastSampleAt: 0, pressureSince: 1_000, lastAlertAt: null }
  // Drop below threshold
  evaluateFusePressureSample(state, 0, 0.10, 2_000, baseThresholds)
  assert.equal(state.pressureSince, null)
  // Re-enter pressure — must restart the sustain window, not reuse old one
  const r = evaluateFusePressureSample(state, 30, 0.50, 3_000, baseThresholds)
  assert.equal(r.fire, false)
  assert.equal(state.pressureSince, 3_000)
})

test('evaluateFusePressureSample: alert cooldown expires → fires again', () => {
  const t0 = 100_000_000
  // 35min after last alert (>30min cooldown) AND 6min after pressureSince
  const state = { lastSampleAt: 0, pressureSince: t0 - 6 * 60_000, lastAlertAt: t0 - 35 * 60_000 }
  const r = evaluateFusePressureSample(state, 30, 0.50, t0, baseThresholds)
  assert.equal(r.fire, true)
})
