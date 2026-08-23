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

test('same-frame saves are serialized and flush only the latest pending patch', async () => {
  const timers = fakeTimers()
  let resolveFirst!: () => void
  const firstSave = new Promise<void>((resolve) => { resolveFirst = resolve })
  const saves: Array<{ frameId: string; patch: CanvasDraftPatch }> = []
  const queue = createCanvasDraftSaveQueue({
    save: (frameId, patch) => {
      saves.push({ frameId, patch })
      return saves.length === 1 ? firstSave : Promise.resolve()
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  queue.schedule('frame-1', { title: 'A' })
  timers.runAll()
  assert.deepEqual(saves, [{ frameId: 'frame-1', patch: { title: 'A' } }])

  queue.schedule('frame-1', { title: 'B' })
  queue.schedule('frame-1', { content: 'latest content' })
  timers.runAll()
  assert.equal(saves.length, 1, 'the second save must wait for the first request')

  resolveFirst()
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(saves, [
    { frameId: 'frame-1', patch: { title: 'A' } },
    { frameId: 'frame-1', patch: { title: 'B', content: 'latest content' } },
  ])
})

test('different frames may save independently', () => {
  const timers = fakeTimers()
  const saves: string[] = []
  const never = new Promise<void>(() => undefined)
  const queue = createCanvasDraftSaveQueue({
    save: (frameId) => {
      saves.push(frameId)
      return never
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  queue.schedule('frame-A', { title: 'A' })
  queue.schedule('frame-B', { title: 'B' })
  timers.runAll()

  assert.deepEqual(saves, ['frame-A', 'frame-B'])
})

test('a failed save keeps its patch and can be retried explicitly', async () => {
  const timers = fakeTimers()
  const saves: CanvasDraftPatch[] = []
  const errors: string[] = []
  let attempt = 0
  const queue = createCanvasDraftSaveQueue({
    save: (_frameId, patch) => {
      saves.push(patch)
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve()
    },
    onError: (frameId) => errors.push(frameId),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  queue.schedule('frame-1', { title: 'Retained title' })
  timers.runAll()
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.deepEqual(errors, ['frame-1'])
  assert.equal(queue.retry('frame-1'), true)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.deepEqual(saves, [
    { title: 'Retained title' },
    { title: 'Retained title' },
  ])
  assert.equal(queue.retry('frame-1'), false)
})

test('newer edits merge over a failed in-flight patch before retry', async () => {
  const timers = fakeTimers()
  let rejectFirst!: (error: Error) => void
  const firstSave = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
  const saves: CanvasDraftPatch[] = []
  const queue = createCanvasDraftSaveQueue({
    save: (_frameId, patch) => {
      saves.push(patch)
      return saves.length === 1 ? firstSave : Promise.resolve()
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  queue.schedule('frame-1', { title: 'Old title' })
  timers.runAll()
  queue.schedule('frame-1', { title: 'Latest title', content: 'Latest content' })
  timers.runAll()
  rejectFirst(new Error('offline'))
  await new Promise<void>((resolve) => setImmediate(resolve))

  assert.deepEqual(saves, [
    { title: 'Old title' },
    { title: 'Latest title', content: 'Latest content' },
  ])
})
