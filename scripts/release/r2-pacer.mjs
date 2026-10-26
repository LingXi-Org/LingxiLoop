// Reused unchanged from cf32eb47005c6a7e0a1e5510734aa675657cf3dd (#495 handoff).
export const R2_REQUEST_INTERVAL_MS = 350
export const RETENTION_CONCURRENCY = 3
// One process-wide cadence covers GET and PUT starts; slow bodies may overlap.
export function createR2RequestPacer({ now = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let nextStart = 0, turn = Promise.resolve()
  return begin => {
    const started = turn.then(async () => {
      let delay
      while ((delay = nextStart - now()) > 0) await wait(Math.ceil(delay))
      nextStart = now() + R2_REQUEST_INTERVAL_MS
      return { response: begin() }
    })
    turn = started.then(() => {}, () => {})
    return started.then(({ response }) => response)
  }
}
