import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let user = 'user', company = 'company', project = 'project'
const requests: { resolve(value: unknown[]): void; reject(error: Error): void }[] = []
let channels: string[] = []
const app = { selectedConversationId: null, autoSelectConversation: false, navigationPending: false, navigationReady: false }
mock.module('./api', { namedExports: { conversationsApi: { getConversations: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) } } })
mock.module('@/stores/auth', { namedExports: { useAuth: { getState: () => ({ user: { id: user }, activeCompanyId: company }) } } })
mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: company, projectId: project }) } })
mock.module('@/stores/app', { namedExports: { useApp: { getState: () => app, setState: () => {} } } })
mock.module('@/stores/surface', { namedExports: { useSurface: { getState: () => ({}) } } })
mock.module('@/api/core/realtime', { namedExports: { ws: {} } })
mock.module('@/features/chat/runtime/transport', { namedExports: { chatTransport: { setWorkspaceChannels: (ids: string[]) => { channels = ids } } } })
mock.module('@/features/chat/runtime/latency', { namedExports: { chatLatency: { opened: () => {} } } })
mock.module('@/features/chat/runtime/store', { namedExports: { useChatThreadStore: { getState: () => ({ conversations: {} }) } } })
mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
const { useConversations } = await import('./store')
const row = (id: string) => ({ id, title: id, kind: 'group', members: [], updatedAt: new Date().toISOString(), unreadCount: 0 })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('refresh bursts share one in-flight read and await a trailing read; failures remain retryable', async () => {
  useConversations.getState().reset(); requests.length = 0
  const first = useConversations.getState().reload()
  const second = useConversations.getState().reload()
  useConversations.getState().reload()
  assert.equal(first, second); assert.equal(requests.length, 1)
  requests[0].resolve([row('first')]); await tick()
  assert.equal(requests.length, 2)
  requests[1].resolve([row('latest')]); await first
  assert.deepEqual(channels, ['latest'])
  const failed = useConversations.getState().reload(); requests[2].reject(Error('offline')); await failed
  assert.ok(useConversations.getState().error)
  assert.deepEqual(channels, ['latest'])
  const retry = useConversations.getState().reload(); requests[3].resolve([row('retry')]); await retry
  assert.equal(useConversations.getState().error, null)
  assert.deepEqual(channels, ['retry'])
})

test('an in-flight old identity cannot install its list or channels after a scope switch', async () => {
  for (const change of [() => { user += 'x' }, () => { company += 'x' }, () => { project += 'x' }]) {
    useConversations.getState().reset(); requests.length = 0
    const old = useConversations.getState().reload()
    change(); useConversations.getState().reset()
    const current = useConversations.getState().reload()
    requests[0].resolve([row('old-private')]); await tick()
    assert.deepEqual(channels, [])
    assert.deepEqual(useConversations.getState().list, [])
    requests[1].resolve([row('current')]); await Promise.all([old, current])
    assert.deepEqual(channels, ['current'])
    assert.deepEqual(useConversations.getState().list.map(item => item.id), ['current'])
  }
})
