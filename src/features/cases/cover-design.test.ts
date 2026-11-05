import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverDesign } from './cover-design'

test('legacy cases and empty labels get a bounded title cover; explicit text and color survive', () => {
  assert.deepEqual(coverDesign({ title: '😀'.repeat(20) }), { text: '😀'.repeat(12), color: 'blue' })
  assert.deepEqual(coverDesign({ title: 'KV 缓存', coverText: ' KV ', coverColor: 'green' }), { text: 'KV', color: 'green' })
  assert.deepEqual(coverDesign({ title: '', coverText: ' ' }), { text: '案例', color: 'blue' })
})
