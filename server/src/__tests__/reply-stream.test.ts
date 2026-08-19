import assert from 'node:assert/strict'
import test from 'node:test'
import { replayReplyStream, splitReplyChunks } from '../messages/stream-reply.js'

test('chunks by Unicode code point without splitting emoji or Chinese text', () => {
  const body = '中文🙂🚀abcdef'
  const chunks = splitReplyChunks(body, 3, 20, 2_000)
  assert.equal(chunks.join(''), body)
  assert.deepEqual(chunks, ['中文🙂', '🚀ab', 'cde', 'f'])
})

test('dynamically grows chunks to keep playback under two seconds', () => {
  const body = 'x'.repeat(10_000)
  const chunks = splitReplyChunks(body)
  assert.ok(chunks.length <= 100)
  assert.equal(chunks.join(''), body)
})

test('publishes an empty placeholder before Markdown deltas', async () => {
  const events: Array<{ delta: string; done: boolean }> = []
  const ok = await replayReplyStream(
    { conversationId: 'c1', messageId: 'm1', authorId: 'agent', sequence: 7, companyId: 'co' },
    '**hello** 世界',
    async (_channel, event) => { events.push({ delta: event.delta, done: event.done }) },
  )
  assert.equal(ok, true)
  assert.deepEqual(events[0], { delta: '', done: false })
  assert.equal(events.slice(1).map((event) => event.delta).join(''), '**hello** 世界')
  assert.ok(events.every((event) => event.done === false))
})

test('returns false after a delta failure so the caller can publish the final message', async () => {
  let calls = 0
  const ok = await replayReplyStream(
    { conversationId: 'c1', messageId: 'm1', authorId: 'agent', sequence: 7 },
    'hello',
    async () => {
      calls += 1
      if (calls === 2) throw new Error('transport down')
    },
  )
  assert.equal(ok, false)
  assert.equal(calls, 2)
})
