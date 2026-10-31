import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

mock.module('@/features/chat/runtime/latency', { namedExports: { chatLatency: { opened: () => {} } } })
mock.module('@/lib/webNavigation', { namedExports: { beginWebNavigation: () => {}, writeWebDestination: () => {} } })
mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => null } })
const { useApp } = await import('@/stores/app')
const { useSurface } = await import('@/stores/surface')

test('conversation navigation dismisses a private Canvas before the next conversation', () => {
  useApp.getState().selectConversation('first')
  useSurface.getState().openDesign('first-private-board', '第一张画板')
  useApp.getState().selectConversation('second')
  assert.equal(useSurface.getState().surface, null)
  assert.equal(useApp.getState().selectedConversationId, 'second')
})

test('closing and reopening the same board changes only the surface, retaining conversation identity', () => {
  useApp.getState().selectConversation('current')
  useSurface.getState().openDesign('board', '画板')
  useSurface.getState().closeDesign()
  assert.equal(useSurface.getState().surface, null)
  assert.equal(useApp.getState().selectedConversationId, 'current')
  useSurface.getState().openDesign('board', '画板')
  assert.deepEqual(useSurface.getState().surface, { kind: 'design', artifactId: 'board', title: '画板' })
})

test('view and mobile-list navigation clear the Canvas using the existing surface owner', () => {
  useSurface.getState().openDesign('board', '画板')
  useApp.getState().showConversationList()
  assert.equal(useSurface.getState().surface, null)
  useSurface.getState().openDesign('board', '画板')
  useApp.getState().setView('forum')
  assert.equal(useSurface.getState().surface, null)
})
