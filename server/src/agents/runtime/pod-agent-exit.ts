/**
 * Pure pod-shutdown decision helpers — extracted from pod-agent.ts so
 * the test suite can import them without booting pod-agent.ts's
 * auto-running `main()` (same precedent as ./sse-parse.ts).
 *
 * See FUSE-cap postmortem 2026-05-20 for why the no-work-exit branch
 * exists: pods spawned during crashloop recovery used to sit on a
 * /dev/fuse slot for full AGENT_IDLE_MS even after handling their
 * one queued message and receiving no follow-up wake.
 */

export interface PodExitDecisionState {
  busy: boolean
  shuttingDown: boolean
  lastActivityAt: number
  firstWakeReceived: boolean
}

/** Returns an exit reason string when the pod should self-terminate,
 *  or null to keep going. Two distinct triggers:
 *    - **no-work-exit**: pod booted, bootstrap drain ran, but no
 *      SSE wake/steer arrived within `noWorkMs`. Frees the FUSE slot.
 *    - **idle-exit**: pod did real work, then sat quiet for `idleMs`. */
export function decidePodExit(
  s: PodExitDecisionState,
  bootedAt: number,
  now: number,
  idleMs: number,
  noWorkMs: number,
): string | null {
  if (s.busy || s.shuttingDown) return null
  if (!s.firstWakeReceived && now - bootedAt >= noWorkMs) {
    return `no-work-exit: no SSE wake received within ${Math.round(noWorkMs / 1000)}s of boot`
  }
  const idleFor = now - s.lastActivityAt
  if (idleFor >= idleMs) {
    return `idle ${Math.round(idleFor / 1000)}s ≥ ${Math.round(idleMs / 1000)}s`
  }
  return null
}
