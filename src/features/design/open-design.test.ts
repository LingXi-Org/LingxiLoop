import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

let userId = 'user', companyId = 'company', projectId = 'project', conversationId = 'room'
let resolve!: (value: { id: string; title: string }) => void
let reject!: (reason: Error) => void
let surface: { kind: 'design'; artifactId: string; title: string } | null = null
const opened: string[] = []
mock.module('@/stores/auth', { namedExports: { useAuth: { getState: () => ({ user: { id: userId }, activeCompanyId: companyId }) } } })
mock.module('@/stores/app', { namedExports: { useApp: { getState: () => ({ selectedConversationId: conversationId }) } } })
mock.module('@/features/knowledge/workspace', { namedExports: { useWorkspace: { getState: () => ({ selectedId: projectId }) } } })
mock.module('@/stores/surface', { namedExports: { useSurface: { getState: () => ({
  surface,
  openDesign: (artifactId: string, title: string) => { opened.push(artifactId); surface = { kind: 'design', artifactId, title } },
  closeDesign: () => { surface = null },
}) } } })
mock.module('@/features/artifacts/api', { namedExports: { artifactsApi: { ensureConversationDesign: () => new Promise<{ id: string; title: string }>((done, fail) => { resolve = done; reject = fail }) } } })
const { openConversationDesign } = await import('./open-design')
const { PENDING_DESIGN_ID } = await import('./pending')
const reset = () => { userId = 'user'; companyId = 'company'; projectId = 'project'; conversationId = 'room'; surface = null; opened.length = 0 }

test('late Canvas requests cannot open a private board after scope changes', async () => {
  for (const change of [() => { userId = 'other-user' }, () => { companyId = 'other-company' }, () => { projectId = 'other-project' }, () => { conversationId = 'other-room' }]) {
    reset()
    const pending = openConversationDesign('room')
    change()
    resolve({ id: 'private-board', title: '私有画板' })
    await pending
    assert.deepEqual(opened, [PENDING_DESIGN_ID])
    assert.equal(surface, null)
  }
})

test('the canvas expands on the click, then shows the ensured board once', async () => {
  reset()
  const pending = openConversationDesign('room')
  assert.deepEqual(surface, { kind: 'design', artifactId: PENDING_DESIGN_ID, title: '设计' })
  resolve({ id: 'current-board', title: '当前画板' })
  await pending
  assert.deepEqual(opened, [PENDING_DESIGN_ID, 'current-board'])
  assert.deepEqual(surface, { kind: 'design', artifactId: 'current-board', title: '当前画板' })
})

test('closing the placeholder or a failed ensure leaves the canvas closed', async () => {
  reset()
  const closed = openConversationDesign('room')
  surface = null
  resolve({ id: 'late-board', title: '迟到的画板' })
  await closed
  assert.equal(surface, null)

  reset()
  const failed = openConversationDesign('room')
  reject(new Error('offline'))
  await assert.rejects(failed, /offline/)
  assert.equal(surface, null)
})

test('an old scope response cannot close a newer canvas placeholder', async () => {
  for (const fails of [false, true]) {
    reset()
    const old = openConversationDesign('room')
    const oldResolve = resolve, oldReject = reject
    conversationId = 'next-room'
    surface = null
    const current = openConversationDesign('next-room')
    const currentResolve = resolve
    if (fails) { oldReject(new Error('old offline')); await assert.rejects(old) }
    else { oldResolve({ id: 'old-board', title: '旧画板' }); await old }
    assert.deepEqual(surface, { kind: 'design', artifactId: PENDING_DESIGN_ID, title: '设计' })
    currentResolve({ id: 'new-board', title: '新画板' })
    await current
    assert.deepEqual(surface, { kind: 'design', artifactId: 'new-board', title: '新画板' })
  }
})
