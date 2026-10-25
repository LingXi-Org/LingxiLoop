import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evidenceLineRange } from './segment-evidence'

test('parsed-text highlights verify UTF-16 excerpt offsets and map actual line endings', () => {
  const text = '前言😀\r\nAttention\ruses Q\u2028K and V.\u2029结尾'
  const excerpt = 'Attention\ruses Q\u2028K and V.'
  const start = text.indexOf(excerpt)
  assert.deepEqual(evidenceLineRange(text, { excerpt, anchor: { type: 'extracted_text', start, end: start + excerpt.length } }),
    { start: 2, end: 4 })
  assert.equal(evidenceLineRange(text, { excerpt: 'different snapshot', anchor: { type: 'extracted_text', start, end: start + excerpt.length } }), null)
  assert.equal(evidenceLineRange(text, { excerpt, anchor: null }), null)
  for (const [start, end] of [[-1, 3], [0, text.length + 1], [0.5, 4], [2, 2]]) {
    assert.equal(evidenceLineRange(text, { excerpt, anchor: { type: 'extracted_text', start, end } }), null)
  }
})

test('a trailing newline does not highlight the following paragraph', () => {
  assert.deepEqual(evidenceLineRange('first\nsecond\nthird', {
    excerpt: 'first\nsecond\n', anchor: { type: 'extracted_text', start: 0, end: 13 },
  }), { start: 1, end: 2 })
  assert.deepEqual(evidenceLineRange('first\r\nsecond\r\nthird', {
    excerpt: 'first\r\nsecond\r\n', anchor: { type: 'extracted_text', start: 0, end: 15 },
  }), { start: 1, end: 2 })
})
