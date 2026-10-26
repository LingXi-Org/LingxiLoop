import { fault } from './journal.mjs'

// Retry only authenticated observations, inside the original read deadline.
// Mutations, helpers, invalid evidence, redirects and permission denials never
// enter this loop. No endpoint, credential, operation key or generation changes.
export async function controlRead(url, headers, action, { fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, random = Math.random, timeoutMs = 10000, record = () => {} } = {}) {
  const startedAt = now(), deadline = startedAt + timeoutMs
  let attempts = 0, outcome = 'CONTROL_UNAVAILABLE'
  try {
    for (;;) {
      attempts++
      let response, error, delay = 250 * 2 ** (attempts - 1) + Math.floor(random() * 250)
      try { response = await fetcher(url, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, deadline - now())) }) }
      catch { error = fault('CONTROL_UNAVAILABLE', `Independent ${action} control is unavailable`, 502) }
      if (response?.ok) {
        try { const value = await response.json(); outcome = 'success'; return value }
        catch { throw fault('CONTROL_INVALID_RESPONSE', `Independent ${action} control returned invalid evidence`, 502) }
      }
      if (response) {
        error = Object.assign(fault('CONTROL_REJECTED', `Independent ${action} control rejected the operation (HTTP ${response.status})`, 502), { httpStatus: response.status })
        const retryAfter = response.headers.get('retry-after')
        if (retryAfter) delay = Math.max(delay, /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now() || 0)
        await response.body?.cancel()
        if (![429,500,502,503,504].includes(response.status)) throw error
      }
      if (attempts >= 3 || now() + delay >= deadline) throw error
      await wait(delay)
      if (now() >= deadline) throw error
    }
  } catch (error) { outcome = error.code; error.uncertain = false; throw error }
  finally { record({ action, attempts, retries: attempts - 1, startedAt, completedAt: now(), elapsedMs: now() - startedAt, outcome }) }
}
