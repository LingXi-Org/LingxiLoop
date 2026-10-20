import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

// Failure model: the roster blocks navigation; requests start before project
// authorization; a delayed roster restarts navigation or resets the chat cache.
test('authorized channel list completes startup without waiting for the roster', async () => {
  const order: string[] = []
  const state = { list: [{ id: 'p', status: 'ACTIVE' }], selectedId: null, loaded: true, companyId: 'c' }
  let finishRoster!: () => void
  const roster = new Promise<void>(resolve => { finishRoster = resolve })
  const stubStore = { getState: () => ({ reset() {} }) }
  mock.module('@/features/agents/state', { namedExports: {
    useParticipants: { getState: () => ({ reset() {}, load: () => { order.push('roster'); return roster } }) }, bootParticipants() {},
  } })
  mock.module('@/features/conversations/store', { namedExports: {
    useConversations: { getState: () => ({ reset() {}, load: async () => { order.push('channels') }, loaded: true, projectId: 'p' }) }, bootConversations() {},
  } })
  mock.module('@/features/chat/runtime/transport', { namedExports: { chatTransport: { boot: () => order.push('boot') } } })
  mock.module('@/features/documents/state', { namedExports: { useDocuments: stubStore } })
  mock.module('@/features/canvas/state', { namedExports: { useCanvas: stubStore } })
  mock.module('./state', { namedExports: { useKnowledgeSources: stubStore } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => null, setWorkspaceSession: () => order.push('scope') } })
  mock.module('@/stores/app', { namedExports: { useApp: { setState() {} } } })
  mock.module('@/stores/auth', { namedExports: { getActiveCompanyId: () => 'c', useAuth: { getState: () => ({ user: { id: 'u' }, companies: [] }) } } })
  mock.module('@/lib/webNavigation', { namedExports: { currentWebNavigation: () => 1, isCurrentWebNavigation: () => true, beginWebNavigation: () => 1 } })
  mock.module('./api', { namedExports: { knowledgeApi: { openProject: async () => { order.push('authorized') } } } })
  const { useWorkspace } = await import('./workspace')
  useWorkspace.setState(state as never)
  const ready = useWorkspace.getState().select('p')
  const result = await Promise.race([ready.then(() => 'ready'), new Promise(resolve => setTimeout(() => resolve('blocked'), 30))])
  finishRoster(); await ready
  assert.equal(result, 'ready')
  assert.deepEqual(order, ['authorized', 'scope', 'roster', 'channels', 'boot'])
})
