import assert from 'node:assert/strict'
import test from 'node:test'
import { extractLiveReplyPrefix } from '../agents/live-reply-preview.js'

test('extracts a reply body from incomplete function-call JSON', () => {
  assert.deepEqual(
    extractLiveReplyPrefix('{"command":"lingxiloop reply convo-1 \'hello wor'),
    { conversationId: 'convo-1', body: 'hello wor' },
  )
})

test('decodes JSON and shell escapes incrementally', () => {
  assert.deepEqual(
    extractLiveReplyPrefix('{"command":"lingxiloop reply c1 \'line one\\nBob\'\\\'\'s note\'"}'),
    { conversationId: 'c1', body: "line one\nBob's note" },
  )
})

test('ignores unrelated and unquoted commands', () => {
  assert.equal(extractLiveReplyPrefix('{"command":"ls -la"}'), null)
  assert.equal(extractLiveReplyPrefix('{"command":"lingxiloop react m1 👀"}'), null)
})
