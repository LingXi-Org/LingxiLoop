import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BoundsIndex, ElementIndexes } from './compute-geometry'

test('visible boards follow viewport and incremental moves/removals without document payloads', () => {
  const index = new BoundsIndex()
  index.replace(Array.from({ length: 50 }, (_, i) => ({ id: `page-${i}`, x: i * 1100, y: 0, width: 1000, height: 700 })))
  assert.deepEqual(index.visible({ x: 0, y: 0, width: 1050, height: 900 }), ['page-0'])
  assert.deepEqual(index.visible({ x: 1100 * 49, y: 0, width: 1000, height: 700 }), ['page-49'])
  index.update([{ id: 'page-49', x: 20, y: 20, width: 1000, height: 700 }], ['page-0'])
  assert.deepEqual(index.visible({ x: 0, y: 0, width: 1050, height: 900 }), ['page-49'])
  index.replace([])
  assert.deepEqual(index.visible({ x: 0, y: 0, width: 1050, height: 900 }), [])
})

test('snap chooses nearest page edge/centre independently and leaves distant coordinates untouched', () => {
  const index = new BoundsIndex()
  index.replace([{ id: 'a', x: 100, y: 200, width: 500, height: 400 }])
  assert.deepEqual(index.snap({ x: 348, y: 599 }, 6), { x: 350, y: 600 })
  assert.deepEqual(index.snap({ x: 300, y: 500 }, 6), { x: 300, y: 500 })
})

test('element indexes keep only eight pages and reject stale geometry after edits', () => {
  const indexes = new ElementIndexes(), viewport = { x: 0, y: 0, width: 100, height: 100 }
  for (let page = 0; page < 8; page++) indexes.replace(`p${page}`, [{ id: 'node', ...viewport }], 1)
  assert.deepEqual(indexes.visible('p0', viewport, 1), ['node'])
  indexes.replace('p8', [{ id: 'node', ...viewport }], 1)
  assert.throws(() => indexes.visible('p1', viewport, 1), /missing_index/)
  indexes.update('p0', [{ id: 'node', x: 200, y: 200, width: 100, height: 100 }], [], 2)
  assert.throws(() => indexes.visible('p0', viewport, 1), /stale_index/)
  assert.deepEqual(indexes.visible('p0', viewport, 2), [])
  indexes.drop('p0')
  assert.throws(() => indexes.visible('p0', viewport, 2), /missing_index/)
})
