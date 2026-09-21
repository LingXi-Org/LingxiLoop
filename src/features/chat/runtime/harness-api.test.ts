import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { RunEvent } from '@lyyzka/lingxios/ui'

test('HTTP replay follows event pages and folds a memory call split across page boundaries', async () => {
  const pages: number[] = []
  const first: RunEvent[] = Array.from({ length: 100 }, (_, index) => ({ runId: 'run', seq: index + 1,
    kind: index === 99 ? 'tool.started' : 'progress', stage: 'started', visibility: 'user',
    data: index === 99 ? { toolCallId: 'host:memory', name: 'memory.apply' } : {},
  }))
  const last: RunEvent = { runId: 'run', seq: 101, kind: 'tool.completed', stage: 'completed', visibility: 'user',
    data: { toolCallId: 'host:memory', result: { status: 'completed', value: {
      documents: [{ id: 'memory', description: '喜欢中文', status: 'active', body: 'private' }], deleted: [],
    } } } }
  let stale = false
  mock.module('@/api/core/http', { namedExports: { API: '/api', http: async (path: string, init: RequestInit) => {
    const seq = Number(new URL(path, 'http://test').searchParams.get('afterSeq'))
    pages.push(seq)
    assert.ok(init.signal)
    return { events: seq === 0 ? first : [last], nextSeq: seq === 0 || stale ? 100 : 101 }
  } } })
  mock.module('@/api/transport', { namedExports: { lingxiApiFetch: () => {} } })
  mock.module('@/stores/auth', { namedExports: { getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => null } })
  const { harnessApi } = await import('./harness-api')
  const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
  const result = await harnessApi.read(target, 0)
  assert.deepEqual(pages, [0, 100])
  assert.deepEqual(result.memory?.chips, [{ id: 'memory', text: '喜欢中文' }])
  assert.equal(result.nextSeq, 101)
  assert.doesNotMatch(JSON.stringify(result.memory), /private|body/)
  stale = true
  await assert.rejects(harnessApi.read(target, 0), /游标没有前进/)
})
