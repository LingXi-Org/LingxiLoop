import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldSyncCanvasDraft } from './canvasDraft'

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
