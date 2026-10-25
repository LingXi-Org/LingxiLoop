import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import type { ThreadMessage } from '@assistant-ui/react'
import { createNativeMessage } from '@/lib/nativeMessage'
import { convertEnvelope } from './converter'
import { getLingxiMessageMetadata as metadata } from './model'
import { mergeCanonicalMessages } from './store'
import { projectReplyBranches } from './reply-branches'

const participants = { agent: { id: 'agent', kind: 'agent' as const, name: 'Assistant', initial: 'A', avatarBg: '', status: 'avail' as const } }
function message(id: string, role: 'user' | 'assistant' | 'system', custom: Record<string, unknown> = {}, text = 'Synthetic feedback.'): ThreadMessage {
  return convertEnvelope({ channelId: 'room', channelType: 2, fromUid: role === 'user' ? 'human' : 'agent',
    clientMsgNo: id, messageId: id, messageSeq: 1, timestamp: 1,
    payload: createNativeMessage({ id, role, createdAt: '2026-01-01T00:00:00Z', content: [{ type: 'text', text }], custom }),
  }, { participants, meId: 'human' })
}
function run(id = 'one', version = 1, lifecycle = 'failed'): ThreadMessage {
  const value = message(`run-${id}`, 'assistant', { runId: id, sourceRef: `user-${id}`, refs: { agentId: 'agent' },
    harness: { ...createRunView(id), lifecycle, requestVersion: version, fence: version, artifacts: [] } }, 'Preserved answer.')
  return { ...value, metadata: { ...value.metadata, custom: { ...value.metadata.custom, sourceMessageId: undefined } },
    status: lifecycle === 'leased' ? { type: 'running' } : { type: 'incomplete', reason: lifecycle === 'cancelled' ? 'cancelled' : 'error' } } as ThreadMessage
}
function terminal(id = 'one', version = 1, status = 'failed') {
  return message(`terminal-feedback-${id}`, 'system', { runId: id, requestVersion: version,
    terminalFeedbackId: `feedback-${id}`, terminalStatus: status, terminalReason: status === 'cancelled' ? 'cancelled' : 'model_unavailable' })
}
const project = (messages: ThreadMessage[]) => projectReplyBranches(messages, {})

test('terminal IM and failed run present one outcome in either arrival order and after replay', () => {
  for (const inputs of [[run(), terminal()], [terminal(), run()]]) {
    const canonical = mergeCanonicalMessages([], inputs)
    const projected = project(canonical)
    assert.equal(projected.length, 1)
    assert.equal(projected[0].id, 'run-one')
    assert.equal(metadata(projected[0]).terminalNotice?.text, 'Synthetic feedback.')
    assert.equal(metadata(projected[0]).sourceRef, 'user-one')
    assert.deepEqual(projected[0].status, { type: 'incomplete', reason: 'error' })
    assert.equal(projected[0].content[0].type === 'text' && projected[0].content[0].text, 'Preserved answer.')
    assert.equal(canonical.length, 2, 'the presentation does not delete canonical history')
    assert.equal(metadata(canonical.find(value => value.id === 'run-one')!).terminalNotice, undefined)
    assert.deepEqual(project(mergeCanonicalMessages(canonical, inputs)), projected)
    assert.deepEqual(project(projected), projected)
  }
})

test('identical text from distinct user messages and distinct failed runs remains independent', () => {
  const messages = [message('user-one', 'user', {}, 'Explain 2 + 2.'), run(), terminal(),
    message('user-two', 'user', {}, 'Explain 2 + 2.'), run('two'), terminal('two')]
  assert.deepEqual(project(messages).map(value => value.id), ['user-one', 'run-one', 'user-two', 'run-two'])
})

test('only a reliable exact terminal identity collapses; unavailable or stale projections remain visible', () => {
  assert.deepEqual(project([terminal()]), [terminal()])
  for (const patch of [
    { conversationId: 'other' }, { senderId: 'other' }, { threadRootId: 'other' },
    { runId: 'other' }, { requestVersion: 2 }, { requestVersion: undefined },
    { terminalStatus: 'cancelled' }, { terminalFeedbackId: undefined }, { terminalFeedbackId: 'forged' },
  ]) {
    const original = terminal()
    const feedback = { ...original, metadata: { ...original.metadata, custom: { ...original.metadata.custom, ...patch } } } as ThreadMessage
    assert.equal(project([run(), feedback]).length, 2, JSON.stringify(patch))
  }
  const newer = run('one', 2, 'leased')
  const projected = project([terminal(), newer])
  assert.equal(projected.length, 2)
  assert.deepEqual(projected[1].status, { type: 'running' })
  assert.equal(metadata(projected[1]).terminalNotice, undefined)
})

test('cancelled projection retains cancellation and its public detail without another row', () => {
  const projected = project([run('one', 1, 'cancelled'), terminal('one', 1, 'cancelled')])
  assert.equal(projected.length, 1)
  assert.deepEqual(projected[0].status, { type: 'incomplete', reason: 'cancelled' })
  assert.equal(metadata(projected[0]).terminalNotice?.text, 'Synthetic feedback.')
})

test('authoritative feedback identity stays intact and conflicting receipts stay visible', () => {
  const original = run()
  const terminalFeedback = { id: 'feedback-one', requestVersion: 1, status: 'failed', reason: 'model_unavailable', delivery: 'delivered' }
  const authoritative = { ...original, metadata: { ...original.metadata, custom: { ...original.metadata.custom, terminalFeedback } } } as ThreadMessage
  const [projected] = project([authoritative, terminal()])
  assert.deepEqual(metadata(projected).terminalFeedback, terminalFeedback)
  assert.equal(metadata(projected).terminalNotice?.id, 'feedback-one')
  for (const change of [{ id: 'other' }, { requestVersion: 2 }, { status: 'cancelled' }]) {
    const different = { ...authoritative, metadata: { ...authoritative.metadata, custom: { ...authoritative.metadata.custom, terminalFeedback: { ...terminalFeedback, ...change } } } } as ThreadMessage
    assert.equal(project([different, terminal()]).length, 2)
  }
  const conflicting = message('terminal-conflict', 'system', { runId: 'one', requestVersion: 1, terminalFeedbackId: 'conflict', terminalStatus: 'failed' })
  assert.equal(project([run(), terminal(), conflicting]).length, 3, 'unconfirmed conflicting identities cannot be silently collapsed')
  const withConflict = project([authoritative, terminal(), conflicting])
  assert.deepEqual(withConflict.map(value => value.id), ['run-one', 'terminal-conflict'])
})

test('explicit regeneration removes an old branch terminal notice without merging user messages by text', () => {
  const original = run()
  const retry = message('retry', 'user', { regenerateOfClientMsgNo: 'run-one', replyToClientMsgNo: 'run-one', mentionedIds: ['agent'] })
  const next = run('two')
  const replacement = { ...next, metadata: { ...next.metadata, custom: { ...next.metadata.custom, sourceRef: 'retry' } } } as ThreadMessage
  const projected = project([original, terminal(), retry, replacement, terminal('two')])
  assert.equal(projected.length, 1)
  assert.equal(projected[0].id, 'run-two')
  assert.equal(metadata(projected[0]).terminalNotice?.id, 'feedback-two')
  assert.equal(metadata(projected[0]).replyBranches?.ids.length, 2)
})

test('terminal scope survives exact receipt folding and a newer request drops the derived notice', () => {
  const original = run()
  const feedback = terminal()
  const scoped = { ...feedback, metadata: { ...feedback.metadata, custom: { ...feedback.metadata.custom,
    terminalScopeVersion: 1, terminalScope: 'follow_up' } } } as ThreadMessage
  const [projected] = project([original, scoped])
  assert.equal(metadata(projected).terminalNotice?.scope, 'follow_up')
  assert.equal(metadata(projected).terminalNotice?.requestVersion, 1)
  const newer = { ...projected, status: { type: 'complete', reason: 'stop' }, metadata: { ...projected.metadata,
    custom: { ...projected.metadata.custom, harness: { ...metadata(projected).harness!, requestVersion: 2, fence: 2, lifecycle: 'succeeded' } } } } as ThreadMessage
  assert.equal(metadata(project([newer, scoped])[0]).terminalNotice, undefined)
})
