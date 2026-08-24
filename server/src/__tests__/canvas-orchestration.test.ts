import assert from 'node:assert/strict'
import test from 'node:test'
import { assertCanvasDependencyDAG, canvasAgentColor, canvasWorkArea } from '../canvas/orchestration.js'

test('Canvas dependency validation accepts mixed parallel/sequential work and rejects cycles', () => {
  assert.doesNotThrow(() => assertCanvasDependencyDAG([
    { agentId: 'research', assignment: 'research' },
    { agentId: 'examples', assignment: 'examples' },
    { agentId: 'editor', assignment: 'synthesize', dependsOnAgentIds: ['research', 'examples'] },
  ]))
  assert.throws(() => assertCanvasDependencyDAG([
    { agentId: 'a', assignment: 'a', dependsOnAgentIds: ['b'] },
    { agentId: 'b', assignment: 'b', dependsOnAgentIds: ['a'] },
  ]), /DAG/)
  assert.throws(() => assertCanvasDependencyDAG([{ agentId: 'a', assignment: 'a', dependsOnAgentIds: ['missing'] }]), /unknown dependency/)
})

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
