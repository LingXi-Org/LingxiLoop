import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeMessage, userMessageSchema } from '@/lib/nativeMessage'
import { convertEnvelope } from './converter'
import { getLingxiMessageMetadata as metadata } from './model'
import { projectReplyBranches } from './reply-branches'

// Failure cases: ordinary quotes become branches; retries target the wrong agent;
// variants erase later messages; nested regenerations split groups; replay resets
// a chosen version; snapshots arriving before their request break the timeline.
const participants = { agent: { id: 'agent', kind: 'agent' as const, name: '助手', initial: '助', avatarBg: '', status: 'avail' as const } }
function message(id: string, role: 'user' | 'assistant', sequence: number, custom: Record<string, unknown> = {}) {
  return convertEnvelope({ channelId: 'room', channelType: 2, fromUid: role === 'user' ? 'me' : 'agent', messageId: id,
    clientMsgNo: id, messageSeq: sequence, timestamp: sequence, payload: createNativeMessage({ id, role, createdAt: new Date(sequence * 1000).toISOString(),
      content: [{ type: 'text', text: id }], custom }) }, { participants, meId: 'me' })
}
const regenerate = (id: string, target: string, sequence: number) => message(id, 'user', sequence,
  { regenerateOfClientMsgNo: target, replyToClientMsgNo: target, mentionedIds: ['agent'] })

test('only explicitly marked regeneration produces persistent sibling versions and preserves later turns', () => {
  const original = message('original', 'assistant', 2), followup = message('followup', 'user', 3)
  const request = regenerate('request', 'original', 4), next = message('next', 'assistant', 5, { sourceRef: 'request', replyToClientMsgNo: 'request' })
  const messages = [message('question', 'user', 1), original, followup, request, next]
  const latest = projectReplyBranches(messages, {})
  assert.deepEqual(latest.map(item => item.id), ['question', 'next', 'followup'])
  const branch = metadata(latest[1]).replyBranches!
  assert.deepEqual({ ids: branch.ids, index: branch.index }, { ids: ['original', 'next'], index: 1 })
  assert.deepEqual(projectReplyBranches(messages, { [branch.key]: { messageId: 'original', latestId: 'next' } }).map(item => item.id),
    ['question', 'original', 'followup'])
  if (request.role !== 'user') throw new Error('Expected regeneration request')
  const plain = { ...request, metadata: { ...request.metadata, custom: { ...request.metadata.custom, regenerateOfClientMsgNo: undefined } } }
  assert.deepEqual(projectReplyBranches([original, plain, next], {}).map(item => item.id), ['original', 'request', 'next'])
  assert.equal(metadata(original).replyBranches, undefined)
})

test('regenerating any version extends the same group and selects a newly arrived version', () => {
  const original = message('original', 'assistant', 1), one = regenerate('request-one', 'original', 2)
  const next = message('next', 'assistant', 3, { replyToClientMsgNo: 'request-one' }), two = regenerate('request-two', 'next', 4)
  const last = message('last', 'assistant', 5, { sourceRef: 'request-two' })
  const earlier = projectReplyBranches([original, one, next], {})[0]
  const branch = metadata(earlier).replyBranches!
  const selection = { [branch.key]: { messageId: 'original', latestId: 'next' } }
  const result = projectReplyBranches([original, one, next, two, last], selection)
  assert.equal(result[0].id, 'last')
  assert.deepEqual(metadata(result[0]).replyBranches!.ids, ['original', 'next', 'last'])
  assert.equal(projectReplyBranches([original, one, next], selection)[0].id, 'original')
  assert.deepEqual(projectReplyBranches([next], {}).map(item => item.id), ['next'])
})

test('regeneration markers require the same quoted message and exactly one target agent', () => {
  const payload = createNativeMessage({ id: 'request', role: 'user', content: [{ type: 'text', text: '重新生成' }],
    custom: { regenerateOfClientMsgNo: 'original', replyToClientMsgNo: 'original', mentionedIds: ['agent'] } })
  assert.deepEqual(userMessageSchema.parse(payload), payload)
  for (const custom of [ { ...payload.metadata.custom, replyToClientMsgNo: 'foreign' },
    { ...payload.metadata.custom, mentionedIds: ['agent', 'other'] }, { ...payload.metadata.custom, mentionedIds: [] } ]) {
    assert.equal(userMessageSchema.safeParse({ ...payload, metadata: { custom } }).success, false)
  }
})
