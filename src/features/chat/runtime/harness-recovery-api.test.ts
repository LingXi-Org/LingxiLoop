import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { RUN_RECOVERY } from './recovery'

// Bound both a hung HTTP handshake and a stream with no initial snapshot.
test('SSE admission and first snapshot time out and retain HTTP failure status', async () => {
  let mode: number | 'headers' | 'snapshot' = 'headers', cancelled = 0
  mock.module('@/api/core/http', { namedExports: { API: '/api', http: async () => {} } })
  mock.module('@/stores/auth', { namedExports: { getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => null } })
  mock.module('@/api/transport', { namedExports: { lingxiApiFetch: async (_url: string, init: RequestInit) => {
    if (typeof mode === 'number') return new Response('', { status: mode })
    if (mode === 'headers') return new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }))
    return new Response(new ReadableStream({ cancel() { cancelled++ } }), { headers: { 'content-type': 'text/event-stream' } })
  } } })
  const { harnessApi } = await import('./harness-api')
  const previous = RUN_RECOVERY.requestMs
  Object.assign(RUN_RECOVERY, { requestMs: 20 })
  try {
    for (const value of ['headers', 'snapshot', 401, 403, 404, 503] as const) {
      mode = value
      const controller = new AbortController()
      try {
        await assert.rejects(Promise.race([
          harnessApi.subscribe({ conversationId: 'room', agentId: 'agent', runId: 'run' }, () => {}, controller.signal),
          new Promise((_, reject) => setTimeout(() => reject(new Error('handshake remained pending')), 150)),
        ]), typeof value === 'number' ? new RegExp(String(value)) : { name: 'TimeoutError' })
      } finally { controller.abort() }
    }
    assert.equal(cancelled, 1, 'first-snapshot timeout cancels the actual response body')
  } finally { Object.assign(RUN_RECOVERY, { requestMs: previous }) }
})
