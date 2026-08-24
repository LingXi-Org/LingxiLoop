import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasRectsOverlap, findCanvasPlacement } from './canvasLayout.js'

test('findCanvasPlacement keeps an available preferred position', () => {
  assert.deepEqual(findCanvasPlacement([], { width: 420, height: 300 }, { x: 120, y: 90 }), { x: 120, y: 90 })
})

test('findCanvasPlacement appends after the right-most frame when preferred is occupied', () => {
  const frames = [
    { x: 80, y: 80, width: 420, height: 300 },
    { x: 548, y: 80, width: 320, height: 240 },
  ]
  const placed = findCanvasPlacement(frames, { width: 420, height: 300 }, { x: 80, y: 80 })
  assert.deepEqual(placed, { x: 916, y: 80 })
  assert.equal(frames.some((frame) => canvasRectsOverlap({ ...placed, width: 420, height: 300 }, frame, 48)), false)
})

test('findCanvasPlacement finds a free lane on irregular imported boards', () => {
  const frames = [
    { x: 80, y: 80, width: 420, height: 300 },
    { x: 548, y: 80, width: 420, height: 300 },
    { x: 1016, y: 80, width: 420, height: 300 },
  ]
  const placed = findCanvasPlacement(frames, { width: 420, height: 300 }, { x: 90, y: 90 })
  assert.equal(frames.some((frame) => canvasRectsOverlap({ ...placed, width: 420, height: 300 }, frame, 48)), false)
})
