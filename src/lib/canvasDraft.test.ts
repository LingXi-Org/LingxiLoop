import assert from 'node:assert/strict'
import test from 'node:test'
import { createCanvasDraftSaveQueue, shouldSyncCanvasDraft, type CanvasDraftPatch } from './canvasDraft'

test('Canvas Inspector preserves a focused human draft across remote revisions', () => {
  assert.equal(shouldSyncCanvasDraft({
    currentFrameId: 'frame-1',
    nextFrameId: 'frame-1',
    focused: true,
    dirty: true,
  }), false)

  assert.equal(shouldSyncCanvasDraft({
    currentFrameId: 'frame-1',
    nextFrameId: 'frame-1',
    focused: true,
    dirty: false,
  }), false)
})

test('Canvas Inspector waits for a blurred dirty draft to save before syncing', () => {
  assert.equal(shouldSyncCanvasDraft({
    currentFrameId: 'frame-1',
    nextFrameId: 'frame-1',
    focused: false,
    dirty: true,
  }), false)

  assert.equal(shouldSyncCanvasDraft({
    currentFrameId: 'frame-1',
    nextFrameId: 'frame-1',
    focused: false,
    dirty: false,
  }), true)
})

test('Canvas Inspector always loads a newly selected frame', () => {
  assert.equal(shouldSyncCanvasDraft({
    currentFrameId: 'frame-1',
    nextFrameId: 'frame-2',
    focused: true,
    dirty: true,
  }), true)
})

function fakeTimers() {
  let nextId = 0
  const callbacks = new Map<number, () => void>()
  return {
    callbacks,
    setTimer(callback: () => void) {
      const id = ++nextId
      callbacks.set(id, callback)
      return id
    },
    clearTimer(timer: unknown) {
      callbacks.delete(timer as number)
    },
    runAll() {
      for (const [id, callback] of [...callbacks]) {
        callbacks.delete(id)
        callback()
      }
    },
  }
}

test('Canvas Inspector only saves fields edited by the human', () => {
  const timers = fakeTimers()
  const saves: Array<{ frameId: string; patch: CanvasDraftPatch }> = []
  const queue = createCanvasDraftSaveQueue({
    save: (frameId, patch) => { saves.push({ frameId, patch }) },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  queue.schedule('frame-1', { title: 'Human title' })
  timers.runAll()

  assert.deepEqual(saves, [{ frameId: 'frame-1', patch: { title: 'Human title' } }])
})

test('selecting frame B does not cancel frame A pending save', () => {
  const timers = fakeTimers()
  const saves: Array<{ frameId: string; patch: CanvasDraftPatch }> = []
  const queue = createCanvasDraftSaveQueue({
    save: (frameId, patch) => { saves.push({ frameId, patch }) },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  queue.schedule('frame-A', { content: 'A draft' })
  queue.schedule('frame-B', { title: 'B title' })
  assert.equal(timers.callbacks.size, 2)
  timers.runAll()

  assert.deepEqual(saves, [
    { frameId: 'frame-A', patch: { content: 'A draft' } },
    { frameId: 'frame-B', patch: { title: 'B title' } },
  ])
})

test('edits to both fields on one frame merge into one pending patch', () => {
  const timers = fakeTimers()
  const saves: Array<{ frameId: string; patch: CanvasDraftPatch }> = []
  const queue = createCanvasDraftSaveQueue({
    save: (frameId, patch) => { saves.push({ frameId, patch }) },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  queue.schedule('frame-1', { title: 'Title' })
  queue.schedule('frame-1', { content: 'Content' })
  assert.equal(timers.callbacks.size, 1)
  timers.runAll()

  assert.deepEqual(saves, [{
    frameId: 'frame-1',
    patch: { title: 'Title', content: 'Content' },
  }])
})
