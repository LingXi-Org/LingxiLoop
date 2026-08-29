import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeCanvasActivities } from './events.js'
import type { CanvasActivity } from '@/features/canvas/contracts'

function event(id: string, action: CanvasActivity['action'], createdAt: string): CanvasActivity {
  return { id, canvasId: 'canvas', frameId: null, actorId: 'agent', actorKind: 'agent', action, detail: {}, createdAt }
}

test('Canvas REST history and WebSocket activity use one deduplicating ordered reducer', () => {
  const history = [event('old', 'frame_created', '2026-01-01T00:00:00.000Z')]
  const live = [event('new', 'frame_updated', '2026-01-01T00:00:02.000Z'), history[0]]
  assert.deepEqual(mergeCanvasActivities(live, history).map((item) => item.id), ['new', 'old'])
})
