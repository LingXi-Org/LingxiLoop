import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentRecipients, type GroupRouteInput } from '../agents/message-routing.js'

const base: GroupRouteInput = {
  conversationKind: 'group',
  authorId: 'human',
  authorKind: 'human',
  leaderId: 'leader',
  agents: [{ id: 'leader', muted: false }, { id: 'peer', muted: false }, { id: 'muted', muted: true }],
  mentionedIds: [],
  mentionAll: false,
}

test('ordinary human messages wake only the leader', () => {
  assert.deepEqual(resolveAgentRecipients(base), ['leader'])
})

test('exact mentions wake every named agent, bypass mute, without adding leader', () => {
  assert.deepEqual(resolveAgentRecipients({ ...base, mentionedIds: ['peer', 'muted'] }), ['peer', 'muted'])
})

test('@all broadcasts only to unmuted agents', () => {
  assert.deepEqual(resolveAgentRecipients({ ...base, mentionAll: true }), ['leader', 'peer'])
})

test('quote wakes quoted agent and bypasses mute', () => {
  assert.deepEqual(resolveAgentRecipients({ ...base, quotedAuthorId: 'muted' }), ['muted'])
})

test('agent-to-human mention and ordinary leader reply terminate the chain', () => {
  assert.deepEqual(resolveAgentRecipients({ ...base, authorId: 'peer', authorKind: 'agent', mentionedIds: ['human'] }), [])
  assert.deepEqual(resolveAgentRecipients({ ...base, authorId: 'leader', authorKind: 'agent' }), [])
})

test('non-leader agent may explicitly delegate to another agent', () => {
  assert.deepEqual(resolveAgentRecipients({ ...base, authorId: 'peer', authorKind: 'agent', mentionedIds: ['leader'] }), [])
  assert.deepEqual(resolveAgentRecipients({ ...base, authorId: 'peer', authorKind: 'agent', mentionedIds: ['leader'], activation: 'trigger' }), ['leader'])
})

test('direct conversations still wake the other agent', () => {
  assert.deepEqual(resolveAgentRecipients({ ...base, conversationKind: 'direct', authorId: 'leader' }), ['peer', 'muted'])
})
