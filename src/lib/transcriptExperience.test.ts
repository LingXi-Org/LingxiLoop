import assert from 'node:assert/strict'
import test from 'node:test'
import type { Message } from '@/types'
import { projectFindMatches, projectTranscriptAdjacency, searchableTextForMessage } from './transcriptExperience'

const base = (id: string, patch: Partial<Message> = {}): Message => ({
  id, conversationId: 'c1', authorId: 'a1', kind: 'text', body: id, at: '10:00', createdAt: `2026-08-25T10:0${id.slice(-1)}:00.000Z`, ...patch,
})

test('groups consecutive plain messages and breaks on special state', () => {
  const messages = [base('m1'), base('m2'), base('m3', { reactions: [{ emoji: '👍', count: 1 }] }), base('m4')]
  assert.deepEqual(projectTranscriptAdjacency(messages), [
    { isGroupStart: true, isGroupEnd: false, isContinuedFromPrevious: false, isContinuedToNext: true },
    { isGroupStart: false, isGroupEnd: true, isContinuedFromPrevious: true, isContinuedToNext: false },
    { isGroupStart: true, isGroupEnd: true, isContinuedFromPrevious: false, isContinuedToNext: false },
    { isGroupStart: true, isGroupEnd: true, isContinuedFromPrevious: false, isContinuedToNext: false },
  ])
})

test('breaks groups across authors and five minute boundary', () => {
  const messages = [base('m1'), base('m2', { authorId: 'a2' }), base('m3', { createdAt: '2026-08-25T10:20:00.000Z' })]
  assert.ok(projectTranscriptAdjacency(messages).every((item) => item.isGroupStart && item.isGroupEnd))
})

test('find matches count every occurrence and searchable primary metadata', () => {
  const messages = [base('m1', { body: 'alpha alpha', attachment: { name: 'alpha.txt', kind: 'file' } }), base('m2', { body: 'none' })]
  assert.equal(searchableTextForMessage(messages[0]).includes('alpha.txt'), true)
  assert.deepEqual(projectFindMatches(messages, 'alpha'), [
    { messageId: 'm1', occurrence: 0 }, { messageId: 'm1', occurrence: 1 }, { messageId: 'm1', occurrence: 2 },
  ])
})

