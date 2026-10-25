import assert from 'node:assert/strict'
import test from 'node:test'
import { readWebDestination, safeAuthReturnPath, writeWebDestination } from './webNavigation'

function withLocation(path: string, run: (writes: Array<{ mode: string; path: string }>) => void) {
  const writes: Array<{ mode: string; path: string }> = []
  let location = new URL(path, 'https://learning.example')
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    get location() { return location },
    history: {
      state: null,
      pushState(_state: unknown, _unused: string, next: string) { writes.push({ mode: 'push', path: next }); location = new URL(next, location) },
      replaceState(_state: unknown, _unused: string, next: string) { writes.push({ mode: 'replace', path: next }); location = new URL(next, location) },
    },
  } })
  try { run(writes) } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

test('course materials deep links round-trip with project context and drop conversation state', () => {
  withLocation('/?project=course-a&view=course-materials&conversation=old-chat', (writes) => {
    assert.deepEqual(readWebDestination(), { projectId: 'course-a', view: 'course-materials', conversationId: null, explicit: true, invalidView: false })
    assert.equal(safeAuthReturnPath(new URLSearchParams(window.location.search)), '/?project=course-a&view=course-materials')
    writeWebDestination({ projectId: 'course-a', view: 'course-materials', conversationId: 'old-chat' }, 'replace')
    writeWebDestination({ projectId: 'course-b', view: 'course-materials', conversationId: null }, 'push')
    assert.deepEqual(writes, [
      { mode: 'replace', path: '/?project=course-a&view=course-materials' },
      { mode: 'push', path: '/?project=course-b&view=course-materials' },
    ])
  })
})

test('legacy library deep links canonicalize to the single course materials page', () => {
  withLocation('/?project=course-a&view=library&conversation=old-chat', (writes) => {
    const destination = readWebDestination()
    assert.equal(destination.view, 'course-materials')
    assert.equal(destination.invalidView, false)
    assert.equal(destination.conversationId, null)
    assert.equal(safeAuthReturnPath(new URLSearchParams(window.location.search)), '/?project=course-a&view=course-materials')
    writeWebDestination(destination, 'replace')
    assert.deepEqual(writes, [{ mode: 'replace', path: '/?project=course-a&view=course-materials' }])
  })
})

test('unknown pages still fall back to conversations and forum remains independent', () => {
  withLocation('/?project=course-a&view=missing&conversation=old-chat', () => {
    assert.deepEqual(readWebDestination(), { projectId: 'course-a', view: 'conversations', conversationId: null, explicit: true, invalidView: true })
  })
  withLocation('/?project=course-a&view=forum&post=post-a&type=discussion', () => {
    writeWebDestination({ projectId: 'course-a', view: 'forum', conversationId: null }, 'replace')
    assert.equal(window.location.search, '?project=course-a&view=forum&post=post-a&type=discussion')
  })
})
