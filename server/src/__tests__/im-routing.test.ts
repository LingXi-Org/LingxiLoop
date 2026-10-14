import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveLearningAgentRecipients, type RoutingParticipant } from '../im/routing.js'

const members: RoutingParticipant[] = [
  { id: 'student', kind: 'human' },
  { id: 'nova', kind: 'agent', presetKey: 'nova' },
  { id: 'forge', kind: 'agent', presetKey: 'forge' },
  { id: 'sage', kind: 'agent', presetKey: 'sage' },
]

test('human routing is deterministic for mentions, replies and the default leader', () => {
  const base = { authorId: 'student', channelType: 2, members }
  assert.deepEqual(resolveLearningAgentRecipients({ ...base, mentionedIds: ['sage'] }), ['sage'])
  assert.deepEqual(resolveLearningAgentRecipients({ ...base, mentionAll: true }), ['nova', 'forge', 'sage'])
  assert.deepEqual(resolveLearningAgentRecipients({ ...base, replyAuthorId: 'forge' }), ['forge'])
  assert.deepEqual(resolveLearningAgentRecipients(base), ['nova'])
  assert.deepEqual(resolveLearningAgentRecipients({ ...base, leaderAgentId: 'forge' }), ['forge'])
})

test('agent webhook echoes never create a second dispatch path', () => {
  assert.deepEqual(resolveLearningAgentRecipients({ authorId: 'nova', channelType: 2, members }), [])
  assert.deepEqual(resolveLearningAgentRecipients({ authorId: 'nova', channelType: 2, members, mentionedIds: ['sage'] }), [])
  assert.deepEqual(resolveLearningAgentRecipients({ authorId: 'nova', channelType: 2, members, mentionAll: true }), [])
})
