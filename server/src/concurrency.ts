/**
 * Bounded-concurrency primitive — a plain counting semaphore.
 *
 * Why this exists: several hot paths fan out work with `Promise.all`
 * over an unbounded set (e.g. the scheduler waking every recipient of a
 * group message, or the orchestrator shelling out to `kubectl` per
 * agent). Under a swarm / reply-storm that unbounded fan-out
 * oversubscribes shared resources — the pg connection pool (max 20),
 * the node's CPU/memory cgroup (each `kubectl` child is a ~50–100MB Go
 * binary), and the pod-admission cap (concurrent admit checks all read
 * "under cap" before any pod starts, so they all admit → overshoot).
 * That was the engine of the 2026-05-27 connection-exhaustion outage:
 * pool exhausted → triage gate times out → fails open → wakes more →
 * more load → permanent runaway that survives restarts.
 *
 * A semaphore turns that stampede into backpressure: at most `max`
 * operations run at once; the rest queue and drain at a sustainable
 * rate. Correctness is unchanged — work is delayed, never dropped.
 *
 * No external dep (we deliberately avoid p-limit/p-queue): a counting
 * semaphore is ~20 lines and trivially testable.
 */

/** A fair (FIFO) counting semaphore. */
export class Semaphore {
  private permits: number
  private readonly waiters: Array<() => void> = []

  constructor(max: number) {
    // Guard against a misconfigured env knob (0 / negative / NaN) that
    // would otherwise deadlock every caller forever.
    this.permits = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1
  }

  /** Wait for a permit. Resolves once one is available. */
  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve))
  }

  /** Return a permit. Hands it directly to the next waiter (if any)
   *  rather than incrementing — that keeps the in-flight count exact
   *  and the queue FIFO-fair. */
  release(): void {
    const next = this.waiters.shift()
    if (next) next()
    else this.permits++
  }

  /** Run `fn` while holding a permit; always releases, even on throw. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  /** Diagnostics: how many callers are queued waiting for a permit. */
  get queued(): number {
    return this.waiters.length
  }

  /** Diagnostics: how many permits are currently free. */
  get available(): number {
    return this.permits
  }
}
