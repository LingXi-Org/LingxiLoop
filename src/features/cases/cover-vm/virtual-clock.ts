import { COVER_VM_LIMITS, invalidCoverData } from './protocol'

/** VM-local only. Host advances bounded virtual time; no native timers are exposed. */
export function createCoverClock() {
  let now = 0, nextId = 1, disposed = false
  const frames = new Map<number, (now: number) => void>()
  const timers = new Map<number, { due: number; callback: () => void }>()
  const reserve = () => {
    if (disposed || frames.size + timers.size >= COVER_VM_LIMITS.callbacks) invalidCoverData()
    return nextId++
  }
  return {
    now: () => now,
    requestAnimationFrame(callback: (now: number) => void) {
      if (typeof callback !== 'function') invalidCoverData()
      const id = reserve(); frames.set(id, callback); return id
    },
    cancelAnimationFrame(id: number) { frames.delete(id) },
    setTimeout(callback: () => void, delay = 0) {
      if (typeof callback !== 'function' || !Number.isFinite(delay) || delay < 0 || delay > 10000) invalidCoverData()
      const id = reserve(); timers.set(id, { due: now + delay, callback }); return id
    },
    clearTimeout(id: number) { timers.delete(id) },
    advance(delta: number) {
      if (disposed) return
      if (!Number.isFinite(delta) || delta < 0 || delta > 50) invalidCoverData()
      now += delta
      // Snapshot before calling code: recursively queued work waits for the next tick.
      const readyFrames = [...frames], readyTimers = [...timers].filter(([, timer]) => timer.due <= now)
      for (const [id, callback] of readyFrames) {
        if (disposed) return
        if (frames.delete(id)) callback(now)
      }
      for (const [id, timer] of readyTimers) {
        if (disposed) return
        if (timers.delete(id)) timer.callback()
      }
    },
    get pending() { return frames.size + timers.size },
    dispose() { disposed = true; frames.clear(); timers.clear() },
  }
}
