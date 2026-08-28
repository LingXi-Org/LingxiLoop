import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptsCanvasEventTimestamp, upsertCanvasFrame } from './realtime.js'
import type { CanvasFrame } from '@/features/canvas/contracts'

function frame(revision: number, title = `v${revision}`): CanvasFrame {
  return { id: 'f', canvasId: 'c', type: 'markdown', title, x: 0, y: 0, width: 420, height: 300,
    content: '', data: {}, revision, createdBy: 'a', updatedBy: 'a', createdAt: '', updatedAt: '' }
}

test('Canvas realtime frame reducer ignores out-of-order revisions', () => {
  assert.equal(upsertCanvasFrame([frame(3)], frame(2))[0].revision, 3)
  assert.equal(upsertCanvasFrame([frame(3)], frame(4))[0].revision, 4)
})

test('Canvas realtime entity clocks reject stale workspace, deletion and presence events', () => {
  assert.equal(acceptsCanvasEventTimestamp(undefined, '2026-08-24T10:00:00.000Z'), true)
  assert.equal(acceptsCanvasEventTimestamp('2026-08-24T10:00:01.000Z', '2026-08-24T10:00:00.000Z'), false)
  assert.equal(acceptsCanvasEventTimestamp('2026-08-24T10:00:01.000Z', '2026-08-24T10:00:01.000Z'), true)
})
