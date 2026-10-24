import assert from 'node:assert/strict'
import test from 'node:test'
import { questionGeometry, type QuestionRect } from './question-geometry'

function reference(rects: QuestionRect[], bounds: QuestionRect, atBottom: boolean) {
  let active = -1
  const visible: number[] = []
  rects.forEach((rect, i) => {
    if (rect.top <= bounds.top + 24) active = i
    if (rect.bottom > bounds.top && rect.top < bounds.bottom) visible.push(i)
  })
  return { active: atBottom ? rects.length - 1 : active, visible }
}

test('question reading-line/visible/bottom choices match the original scan across scroll, reflow and prepend', () => {
  for (const count of [0, 1, 5, 1000]) {
    for (const scale of [1, 1.3, 2]) {
      const rects = Array.from({ length: count }, (_, i) => ({ top: i * 170 * scale, bottom: (i * 170 + 30 + i % 7) * scale }))
      for (const top of [-100, 0, 6, 30, 165, 170, 280, 117001, 200000]) {
        const bounds = { top, bottom: top + 500 }
        for (const bottom of [false, true]) assert.deepEqual(questionGeometry(count, i => rects[i]!, bounds, bottom), reference(rects, bounds, bottom))
      }
    }
  }
})

test('a long history tail resize reads logarithmic geometry instead of every historical question', () => {
  const count = 10000
  let reads = 0
  const result = questionGeometry(count, i => { reads++; return { top: i * 200, bottom: i * 200 + 40 } },
    { top: 1_999_000, bottom: 1_999_600 }, false)
  assert.deepEqual(result, { active: 9995, visible: [9995, 9996, 9997] })
  assert.ok(reads <= 40, `read ${reads} historical rectangles`)
})
