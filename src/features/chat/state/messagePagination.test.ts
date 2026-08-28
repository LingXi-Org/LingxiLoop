import assert from 'node:assert/strict'
import test from 'node:test'
import type { Message } from '@/types'
import { oldestDurableSequence, selectOlderMessages } from './messagePagination'

function message(id: string, sequence?: number, pending = false): Message {
  return {
    id,
    conversationId: 'study',
    authorId: 'nova',
    kind: 'text',
    body: id,
    at: '10:00',
    createdAt: '2026-01-01T10:00:00.000Z',
    sequence,
    pending,
  }
}

test('WuKong history pagination derives the oldest durable sequence only', () => {
  assert.equal(oldestDurableSequence([
    message('pending', Number.MAX_SAFE_INTEGER, true),
    message('m-8', 8),
    message('m-4', 4),
    message('unsequenced'),
  ]), 4)
  assert.equal(oldestDurableSequence([message('unsequenced')]), null)
  assert.equal(oldestDurableSequence([message('pending', Number.MAX_SAFE_INTEGER, true)]), null)
})

test('older-page reconciliation prepends only unseen rows before the cursor', () => {
  const current = [message('m-4', 4), message('m-5', 5)]
  const incoming = [
    message('m-2', 2),
    message('m-3', 3),
    message('m-4', 4),
    message('m-5-duplicate-id', 5),
  ]
  assert.deepEqual(
    selectOlderMessages(current, incoming, 4).map((entry) => entry.id),
    ['m-2', 'm-3'],
  )
})

