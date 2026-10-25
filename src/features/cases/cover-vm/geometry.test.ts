import assert from 'node:assert/strict'
import test from 'node:test'
import { coverPointerAt } from './geometry'

test('pointer follows the same centered cover crop at card and detail aspect ratios', () => {
  for (const width of [608, 553.6]) {
    const box = { left: 10, top: 20, width, height: 320 }
    const center = coverPointerAt(10 + width / 2, 180, box)
    assert.deepEqual(center, { x: 200, y: 160, pointerType: 'mouse' })
    const top = coverPointerAt(10 + width / 2, 20, box)
    assert.ok(top.y > 40 && top.y < 60)
    assert.equal(coverPointerAt(10, 180, box).x, 0)
    assert.equal(coverPointerAt(10 + width, 180, box).x, 400)
  }
})
