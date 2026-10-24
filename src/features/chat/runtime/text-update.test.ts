import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '@/lib/nativeMessage'
import { appendedContent } from './text-update'
import { convertEnvelope } from './converter'
import { applyRunSnapshot } from './run-updates'
import { EMPTY_CONVERSATION_CHAT_STATE, mergeCanonicalMessages } from './store'
import { getLingxiMessageMetadata as metadata } from './model'
import { createThreadProjector } from './thread-projection'
import type { Participant } from '@/types'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'

const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
function stream(text: string, seq = 0): AgentRunSnapshot {
  return { message: createNativeMessage({ id: 'run-run', role: 'assistant', createdAt: '2026-01-01T00:01:00Z', content: [
    { type: 'text', text }, { type: 'tool-call', toolCallId: 't', toolName: 'read', args: {}, argsText: '{}', result: { status: 'ok' } },
  ], status: { type: 'running' }, custom: { runId: 'run', harness: { ...createRunView('run'), lifecycle: 'leased', lastSeq: seq, artifacts: [] } } }) }
}
function user(id: string, sequence: number, reply?: string) {
  return convertEnvelope({ channelId: 'room', channelType: 2, fromUid: 'human', messageId: id, clientMsgNo: id, messageSeq: sequence, timestamp: 0,
    payload: createNativeMessage({ id, role: 'user', createdAt: '2026-01-01T00:00:00Z', content: [{ type: 'text', text: id }], custom: reply ? { replyToClientMsgNo: reply } : {} }),
  }, { participants: {}, meId: 'human' })
}

test('append updates retain all unrelated history and parts; replacement/fence/receipt keeps full semantics', () => {
  let state = applyRunSnapshot({ ...EMPTY_CONVERSATION_CHAT_STATE, messages: mergeCanonicalMessages([], [user('user', 1)]) }, target, stream('A'))
  const history = state.messages[0], tool = state.messages[1].content[1]
  state = applyRunSnapshot(state, target, stream('AB', 1))
  assert.equal(state.messages[0], history)
  assert.equal(state.messages[1].content[1], tool)
  assert.equal(metadata(state.messages[1]).positionAfter, 'user')
  assert.equal(metadata(state.messages[1]).harness?.lastSeq, 1)
  state = applyRunSnapshot(state, target, stream('CD', 2))
  assert.equal(state.messages[1].content[0].type === 'text' && state.messages[1].content[0].text, 'CD')
  const next = stream('', 3)
  const run = next.message.metadata.custom.harness as Record<string, unknown>
  run.requestVersion = 2; run.fence = 2
  state = applyRunSnapshot(state, target, next)
  assert.equal(state.messages[1].content[0].type === 'text' && state.messages[1].content[0].text, '')
  assert.equal(metadata(state.messages[1]).harness?.requestVersion, 2)
  const stale = applyRunSnapshot(state, target, stream('stale', 9))
  assert.equal(stale, state)
})

test('an unresolved quote is populated when its streamed original gains text', () => {
  let state = applyRunSnapshot(EMPTY_CONVERSATION_CHAT_STATE, target, stream(''))
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [user('quote', 2, 'run-run')]) }
  state = applyRunSnapshot(state, target, stream('original', 1))
  assert.equal(metadata(state.messages.find(message => message.id === 'quote')!).quote?.text, 'original')
})

test('answer segment growth retains identity; same length replacements and annotation changes are not append', () => {
  const part = (text: string) => ({ type: 'text' as const, text, providerMetadata: { lingxiloop: { answerSegment: {
    version: 3, messageId: 'm', segmentId: 's', partId: 'p', start: 0, end: text.length,
  } } } })
  assert.ok(appendedContent([part('A')], [part('AB')]))
  assert.equal(appendedContent([part('A')], [part('B')]), undefined)
  const changed = part('AB'); changed.providerMetadata.lingxiloop.answerSegment.partId = 'other'
  assert.equal(appendedContent([part('A')], [changed]), undefined)
})

test('Provider/page share derivation, participant refresh invalidates it and unchanged rows keep identity', () => {
  let filters = 0
  const project = createThreadProjector(messages => { filters++; return [...messages] })
  const history = mergeCanonicalMessages([], [user('one', 1), user('two', 2)])
  const participant: Participant = { id: 'human', name: 'New Name', kind: 'human', initial: 'N', avatarBg: '', status: 'avail' }
  const participants = { human: participant }, selections = {}
  const first = project(history, participants, selections, null)
  assert.equal(project(history, participants, selections, null), first)
  assert.equal(filters, 1)
  const changed = [...history, user('three', 3)]
  const next = project(changed, participants, selections, null)
  assert.equal(next[0], first[0])
  assert.equal(metadata(next[0]).senderName, 'New Name')
  const renamed = project(changed, { human: { ...participant, name: 'Renamed' } }, selections, null)
  assert.equal(metadata(renamed[0]).senderName, 'Renamed')
  assert.notEqual(renamed, next)
  assert.notEqual(project(changed, participants, { branch: { latestId: 'two', messageId: 'one' } }, null), next)
})
