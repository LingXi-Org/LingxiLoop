import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMentions } from '../mentions.js'

const targets = [
  { id: 'ann', name: 'Ann' },
  { id: 'anna', name: 'Anna Smith' },
  { id: 'iris-01', name: '小灵' },
  { id: 'human-1', name: 'Alice' },
]

test('parses ids, unique names, unicode names, case and multiple mentions', () => {
  assert.deepEqual(parseMentions('@ANN @Anna Smith 请和@小灵、@iris-01处理', targets), {
    mentionedIds: ['ann', 'anna', 'iris-01'],
    mentionAll: false,
  })
})

test('recognizes standalone @all without prefix collisions', () => {
  assert.deepEqual(parseMentions('@all @alligator @anna', targets), {
    mentionedIds: ['anna'],
    mentionAll: true,
  })
})

test('ignores emails, URLs, inline code and fenced code', () => {
  const body = 'mail a@ann.com https://x.test/@anna `@iris-01`\n```ts\n@小灵\n```\nreal @human-1'
  assert.deepEqual(parseMentions(body, targets), {
    mentionedIds: ['human-1'],
    mentionAll: false,
  })
})

test('uses token boundaries for prefix-like member ids', () => {
  assert.deepEqual(parseMentions('@ann-x @ann and x@anna', targets), {
    mentionedIds: ['ann'],
    mentionAll: false,
  })
})
