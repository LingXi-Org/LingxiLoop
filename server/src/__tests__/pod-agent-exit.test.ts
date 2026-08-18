/**
 * Unit tests for `decidePodExit` — the pure helper extracted from
 * pod-agent.ts's idle watcher. Each branch corresponds to a distinct
 * pod-shutdown scenario; together they pin the post-incident
 * (FUSE-cap, 2026-05-20) recycle policy.
 *
 * Run: node --import tsx --test server/src/__tests__/pod-agent-exit.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidePodExit } from '../agents/runtime/pod-agent-exit.js'

const IDLE_MS = 3 * 60_000  // 3 min — current default
const NO_WORK_MS = 90_000   // 90 s — current default

const baseState = {
  busy: false,
  shuttingDown: false,
  lastActivityAt: 1_000_000,
  firstWakeReceived: false,
}

test('keeps running while inside both windows', () => {
  // Pod 30s old, last activity 30s ago, no wake yet — keep going.
  const r = decidePodExit({ ...baseState, lastActivityAt: 970_000 }, 970_000, 1_000_000, IDLE_MS, NO_WORK_MS)
  assert.equal(r, null)
})

test('busy pod never exits even if both thresholds crossed', () => {
  // Pod has been busy continuously; both timers exceeded but we
  // must not interrupt a turn.
  const r = decidePodExit(
    { ...baseState, busy: true, lastActivityAt: 0 },
    0,
    10 * 60_000,  // 10 min uptime
    IDLE_MS,
    NO_WORK_MS,
  )
  assert.equal(r, null)
})

test('shuttingDown pod is left to the existing exit path', () => {
  const r = decidePodExit(
    { ...baseState, shuttingDown: true, lastActivityAt: 0 },
    0,
    10 * 60_000,
    IDLE_MS,
    NO_WORK_MS,
  )
  assert.equal(r, null)
})

test('no-work-exit fires when boot is older than NO_WORK_MS and no SSE wake arrived', () => {
  // Pod booted at t=0, current t=95s, no firstWakeReceived. Exit.
  const r = decidePodExit(
    { ...baseState, lastActivityAt: 0, firstWakeReceived: false },
    0,
    95_000,
    IDLE_MS,
    NO_WORK_MS,
  )
  assert.match(r ?? '', /no-work-exit/)
})

test('no-work-exit does NOT fire if firstWakeReceived (even with no recent activity)', () => {
  // Pod got a wake at boot, did one turn, then went quiet. The
  // idle window (3 min) hasn't elapsed yet — keep going.
  const r = decidePodExit(
    { ...baseState, lastActivityAt: 0, firstWakeReceived: true },
    0,
    95_000,
    IDLE_MS,
    NO_WORK_MS,
  )
  assert.equal(r, null)
})

test('idle-exit fires after IDLE_MS of quiet with a wake history', () => {
  // Pod got real work earlier, then quiet for full IDLE_MS.
  const r = decidePodExit(
    { ...baseState, firstWakeReceived: true, lastActivityAt: 0 },
    0,
    IDLE_MS + 1_000,
    IDLE_MS,
    NO_WORK_MS,
  )
  assert.match(r ?? '', /^idle \d+s ≥ \d+s$/)
})

test('idle-exit message reports seconds at second-precision', () => {
  const r = decidePodExit(
    { ...baseState, firstWakeReceived: true, lastActivityAt: 0 },
    0,
    200_000,
    180_000,
    NO_WORK_MS,
  )
  assert.match(r ?? '', /^idle 200s ≥ 180s$/)
})

test('no-work-exit takes priority over idle-exit when both conditions met', () => {
  // Pod has been alive 4 min, no wake ever, no recent activity.
  // Both conditions are true; no-work-exit is the more specific signal.
  const r = decidePodExit(
    { ...baseState, lastActivityAt: 0, firstWakeReceived: false },
    0,
    4 * 60_000,
    IDLE_MS,
    NO_WORK_MS,
  )
  assert.match(r ?? '', /no-work-exit/)
})

test('keeps running while NO_WORK_MS not yet crossed', () => {
  // Pod is 60s old, no wake yet — still within no-work window.
  const r = decidePodExit(
    { ...baseState, lastActivityAt: 0, firstWakeReceived: false },
    0,
    60_000,
    IDLE_MS,
    NO_WORK_MS,
  )
  assert.equal(r, null)
})
