import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { AssistantTransportEncoder, AssistantStream, type AssistantStreamChunk } from 'assistant-stream'
import { createRunView } from '@lyyzka/lingxios/ui'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'

// Failure cases: tenant/project headers missing, native decoder bypassed, no DONE,
// old named-event protocol accepted, cancellation swallowed, body replay via HTTP.
test('run API consumes only assistant transport and reads the same projected snapshot', async () => {
  const snapshot: AgentRunSnapshot = { runId: 'run', createdAt: null, view: { ...createRunView('run'), lifecycle: 'leased' },
    content: [{ type: 'text', text: '第一段' }], status: { type: 'running' }, tools: [], memory: null,
    canControl: true, error: null, sourceRef: null }
  let protocol: 'native' | 'old' | 'truncated' = 'native'
  let reads = 0
  mock.module('@/api/core/http', { namedExports: { API: '/api', http: async (path: string, init: RequestInit) => {
    reads++
    assert.ok(init.signal)
    assert.doesNotMatch(path, /afterSeq/)
    return snapshot
  } } })
  mock.module('@/api/transport', { namedExports: { lingxiApiFetch: async (url: string, init: RequestInit) => {
    assert.match(url, /companies\/company\/channels\/room\/agents\/agent\/runs\/run\/stream/)
    assert.equal(init.credentials, 'include')
    assert.equal(new Headers(init.headers).get('x-company-id'), 'company')
    assert.equal(new Headers(init.headers).get('x-project-id'), 'project')
    assert.ok(init.signal)
    if (protocol === 'old') return new Response('event: preview\ndata: {}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    if (protocol === 'truncated') return new Response('data: {"type":"update-state","path":[],"operations":[]}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    return AssistantStream.toResponse(new ReadableStream<AssistantStreamChunk>({ start(controller) {
      controller.enqueue({ type: 'update-state', path: [], operations: [{ type: 'set', path: [], value: snapshot as never }] })
      controller.enqueue({ type: 'update-state', path: [], operations: [{ type: 'append-text', path: ['content', '0', 'text'], value: '继续' }] })
      controller.close()
    } }), new AssistantTransportEncoder())
  } } })
  mock.module('@/stores/auth', { namedExports: { getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId: 'project' }) } })
  const { harnessApi } = await import('./harness-api')
  const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
  const states: AgentRunSnapshot[] = []
  await harnessApi.subscribe(target, state => states.push(state), new AbortController().signal)
  assert.deepEqual(states.map(state => state.content), [[{ type: 'text', text: '第一段' }], [{ type: 'text', text: '第一段继续' }]])
  assert.equal(reads, 0)
  assert.deepEqual(await harnessApi.read(target), snapshot)
  for (const value of ['old', 'truncated'] as const) {
    protocol = value
    await assert.rejects(harnessApi.subscribe(target, () => {}, new AbortController().signal), /Unknown SSE|DONE/)
  }
  assert.equal(reads, 1, 'protocol failures must not trigger HTTP fallback')
})
