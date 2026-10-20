import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { Conversation } from '@/types'

// Failure model, written before implementation: denied deletion drops a row;
// a pre-delete list response resurrects it; active selection/URL stay stale;
// scope A→B→A accepts an obsolete completion; restore does not reload the list.
test('personal removal commits only after authorization and fences stale list/scope completions', async () => {
  let userId = 'u', projectId = 'p', selected: string | null = 'a'
  let finishDelete!: () => void, finishList!: (rows: unknown[]) => void
  let rejectDelete = false, holdList = false, listCalls = 0
  let surfaceClosed = 0
  const routes: unknown[] = [], channels: string[][] = []
  const row = { id: 'a', kind: 'direct', title: 'A', members: ['u'], unreadCount: 0, updatedAt: new Date(0).toISOString() }
  const app = { selectedConversationId: selected, navigationReady: true, navigationPending: false, autoSelectConversation: false, view: 'conversations' }
  mock.module('./api', { namedExports: { conversationsApi: {
    deleteConversation: () => rejectDelete ? Promise.reject(new Error('403 denied')) : new Promise<void>(resolve => { finishDelete = resolve }),
    restoreConversation: async () => {},
    getConversations: async () => { listCalls++; return holdList ? new Promise(resolve => { finishList = resolve }) : [row] },
  } } })
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect() {}, on() {} } } })
  mock.module('@/stores/app', { namedExports: { useApp: { getState: () => app, setState: (value: object) => Object.assign(app, value) } } })
  mock.module('@/stores/surface', { namedExports: { useSurface: { getState: () => ({ closeForConversationChange: () => { surfaceClosed++ } }) } } })
  mock.module('@/stores/auth', { namedExports: { useAuth: { getState: () => ({ user: { id: userId }, activeCompanyId: 'c' }) } } })
  mock.module('@/features/chat/runtime/transport', { namedExports: { chatTransport: { setWorkspaceChannels: (ids: string[]) => channels.push(ids), reloadConversation() {} } } })
  mock.module('@/features/chat/runtime/latency', { namedExports: { chatLatency: { opened() {} } } })
  mock.module('@/features/chat/runtime/store', { namedExports: { useChatThreadStore: { getState: () => ({ conversations: {} }) } } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'c', projectId }) } })
  mock.module('@/lib/webNavigation', { namedExports: { writeWebDestination: (...args: unknown[]) => routes.push(args) } })
  const { useConversations, captureConversationScope } = await import('./store')
  useConversations.setState({ list: [row as unknown as Conversation], projectId, loaded: true })
  rejectDelete = true
  await assert.rejects(useConversations.getState().remove('a'), /403/)
  assert.equal(useConversations.getState().list.length, 1)
  rejectDelete = false; holdList = true
  const oldList = useConversations.getState().reload()
  const removal = useConversations.getState().remove('a')
  assert.equal(useConversations.getState().list.length, 1, 'wait for mutation acceptance')
  finishDelete(); assert.equal(await removal, true)
  finishList([row]); await oldList
  assert.deepEqual(useConversations.getState().list, [])
  assert.equal(app.selectedConversationId, null)
  assert.equal(routes.length, 1)
  assert.equal(surfaceClosed, 1)
  assert.deepEqual(channels.at(-1), [])

  useConversations.setState({ list: [row as unknown as Conversation], projectId, loaded: true })
  const isCurrent = captureConversationScope()
  const stale = useConversations.getState().remove('a')
  projectId = 'other'; useConversations.getState().reset()
  projectId = 'p'; useConversations.getState().reset()
  useConversations.setState({ list: [row as unknown as Conversation], projectId, loaded: true })
  assert.equal(isCurrent(), false)
  finishDelete(); assert.equal(await stale, false)
  assert.equal(useConversations.getState().list.length, 1)
  holdList = false
  const beforeRestore = listCalls
  assert.equal(await useConversations.getState().restore('a'), true)
  assert.equal(listCalls, beforeRestore + 1)
  userId = 'another'; assert.equal(captureConversationScope()(), true)
})
