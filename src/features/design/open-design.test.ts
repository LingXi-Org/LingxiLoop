import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let userId = 'user', companyId = 'company', projectId = 'project', conversationId = 'room'
let resolve!: (value: { id: string; title: string }) => void
const opened: string[] = []
mock.module('@/stores/auth', { namedExports: { useAuth: { getState: () => ({ user: { id: userId }, activeCompanyId: companyId }) } } })
mock.module('@/stores/app', { namedExports: { useApp: { getState: () => ({ selectedConversationId: conversationId }) } } })
mock.module('@/features/knowledge/workspace', { namedExports: { useWorkspace: { getState: () => ({ selectedId: projectId }) } } })
mock.module('@/stores/surface', { namedExports: { useSurface: { getState: () => ({ openDesign: (id: string) => opened.push(id) }) } } })
mock.module('@/features/artifacts/api', { namedExports: { artifactsApi: { ensureConversationDesign: () => new Promise<{ id: string; title: string }>(done => { resolve = done }) } } })
const { openConversationDesign } = await import('./open-design')

test('late Canvas requests cannot open a private board after scope changes', async () => {
  for (const change of [() => { userId = 'other-user' }, () => { companyId = 'other-company' }, () => { projectId = 'other-project' }, () => { conversationId = 'other-room' }]) {
    userId = 'user'; companyId = 'company'; projectId = 'project'; conversationId = 'room'
    const pending = openConversationDesign('room')
    change()
    resolve({ id: 'private-board', title: '私有画板' })
    await pending
    assert.deepEqual(opened, [])
  }
})

test('the current conversation opens the ensured board once per accepted request', async () => {
  conversationId = 'room'
  const pending = openConversationDesign('room')
  resolve({ id: 'current-board', title: '当前画板' })
  await pending
  assert.deepEqual(opened, ['current-board'])
})
