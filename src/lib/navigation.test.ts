import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

test('retired Agent routes authorize the workspace, retain empty states, and replace history without a loop', async () => {
  const events: string[] = []
  const app: Record<string, unknown> = {}
  const conversations = { projectId: null as string | null, loaded: false, error: null, list: [{ id: 'chat-a' }], reset() {} }
  const workspace = {
    companyId: 'company-a', loaded: false, error: null,
    selectedId: null as string | null,
    list: [] as Array<{ id: string; status: string; canManage: boolean }>,
    async load() { events.push('authorize'); this.loaded = true; this.list = [{ id: 'course-a', status: 'ACTIVE', canManage: false }] },
    async select(id: string) { events.push(`select:${id}`); this.selectedId = id; conversations.projectId = id; conversations.loaded = true },
    leave() { events.push('leave'); this.selectedId = null },
    reset() {},
  }
  mock.module('@/features/chat/runtime/latency', { namedExports: { chatLatency: { opened() {} } } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => conversations } } })
  mock.module('@/features/knowledge/workspace', { namedExports: { useWorkspace: { getState: () => workspace } } })
  mock.module('@/stores/app', { namedExports: { useApp: { getState: () => app, setState: (next: object) => Object.assign(app, next) } } })
  mock.module('@/stores/auth', { namedExports: { useAuth: { getState: () => ({ activeCompanyId: 'company-a', user: { id: 'user-a' }, companies: [{ id: 'company-a', role: 'learner' }] }) } } })
  mock.module('@/stores/surface', { namedExports: { useSurface: { getState: () => ({ closeSurface() {} }) } } })
  let location = new URL('https://learning.example/?project=course-a&view=agents&conversation=old-chat')
  const entries = [location.href]
  const writes: string[] = []
  let index = 0
  const listeners = new Set<() => void>()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    get location() { return location },
    history: {
      state: null,
      replaceState(_state: unknown, _unused: string, path: string) { writes.push('replace'); location = new URL(path, location); entries[index] = location.href },
      pushState(_state: unknown, _unused: string, path: string) { writes.push('push'); location = new URL(path, location); entries.splice(++index, entries.length, location.href) },
    },
    addEventListener(_event: string, callback: () => void) { listeners.add(callback) },
    removeEventListener(_event: string, callback: () => void) { listeners.delete(callback) },
  } })
  try {
    const { retryWebNavigation, startWebNavigation } = await import('./navigation')
    const { writeWebDestination } = await import('./webNavigation')
    await retryWebNavigation()
    assert.deepEqual(events, ['authorize', 'select:course-a'])
    assert.equal(app.view, 'conversations')
    assert.equal(app.selectedConversationId, null)
    assert.equal(location.search, '?project=course-a&view=conversations')
    assert.deepEqual(writes, ['replace'])

    const stop = startWebNavigation()
    await new Promise<void>(resolve => setImmediate(resolve))
    writeWebDestination({ projectId: 'course-a', view: 'forum', conversationId: null }, 'push')
    location = new URL(entries[--index])
    for (const restore of listeners) restore()
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(app.view, 'conversations')
    assert.equal(location.search, '?project=course-a&view=conversations')
    assert.deepEqual(writes, ['replace', 'push'])
    assert.equal(entries.length, 2)
    stop()

    location = new URL('https://learning.example/?view=agents')
    await retryWebNavigation()
    assert.equal(workspace.selectedId, 'course-a')
    assert.equal(app.selectedConversationId, null)
    assert.equal(location.search, '?project=course-a&view=conversations')

    for (const project of ['no-access', 'deleted', '']) {
      events.length = 0
      workspace.loaded = true
      workspace.list = [{ id: 'course-a', status: 'ACTIVE', canManage: false }, { id: 'deleted', status: 'DELETED', canManage: false }]
      workspace.selectedId = null
      location = new URL(`https://learning.example/?${project ? `project=${project}&` : ''}view=agents`)
      await retryWebNavigation()
      assert.equal(events.includes(`select:${project}`), false)
      assert.equal(events.at(-1), 'leave')
      assert.equal(app.view, 'conversations')
      assert.equal(app.navigationError, project ? '该工作区不存在或无权访问，请重新选择。' : null)
      assert.equal(location.search, '?view=conversations')
    }
  } finally {
    mock.restoreAll()
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
