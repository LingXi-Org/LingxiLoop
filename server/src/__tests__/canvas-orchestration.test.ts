import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasAgentColor, canvasWorkArea } from '../canvas/orchestration.js'


test('Canvas agent colors are stable and collision-free while palette capacity remains', () => {
  assert.equal(canvasAgentColor('agent-a', new Set()), canvasAgentColor('agent-a', new Set()))
  const used = new Set<string>()
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) used.add(canvasAgentColor(id, used))
  assert.equal(used.size, 6)
})

test('Canvas work areas use a deterministic non-overlapping three-column layout', () => {
  assert.deepEqual(canvasWorkArea(0), { x: 100, y: 120, width: 680, height: 520 })
  assert.deepEqual(canvasWorkArea(3), { x: 100, y: 720, width: 680, height: 520 })
  const areas = Array.from({ length: 8 }, (_, index) => canvasWorkArea(index))
  assert.equal(new Set(areas.map((area) => `${area.x}:${area.y}`)).size, areas.length)
})
