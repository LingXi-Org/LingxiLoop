import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'
import { convertEnvelope } from './converter'
import { applyRunUpdate, needsRunStream } from './run-updates'
import { getLingxiMessageMetadata as metadata } from './model'
import { EMPTY_CONVERSATION_CHAT_STATE, mergeCanonicalMessages, resetChatThreadStore, useChatThreadStore } from './store'

const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
const participants = { agent: { id: 'agent', kind: 'agent' as const, name: '助手', initial: '助', avatarBg: '', status: 'avail' as const } }
const epoch = Date.parse('2026-09-16T00:00:00Z')
function snapshot(id = 'run', status: RunState['run']['status'] = 'succeeded'): RunState {
  const goalOutcome = { status: 'satisfied' as const, verification: 'passed' as const, requestVersion: 1 }
  const body = `${id} 的完整历史回复`
  return {
    run: { id, status, fence: 1, requestVersion: 1, resultId: status === 'succeeded' ? `result-${id}` : null,
      resultFence: status === 'succeeded' ? 1 : null, kind: 'turn', attempts: 1, createdAt: new Date(epoch + 2000).toISOString(),
      availableAt: '', heartbeatAt: null, lastProgressAt: null, goalOutcome: status === 'succeeded' ? goalOutcome : null, error: null },
    message: status === 'succeeded' ? { version: 2, runId: id, agentId: 'agent', sessionId: 'session', body,
      envelope: { version: 1, requestVersion: 1, body, evidenceSnapshotId: 'evidence', goalOutcome, citations: [], artifacts: [] } } : null,
    delivery: status === 'succeeded' ? 'delivered' : null,
  }
}
function user(id: string, sequence: number | null, offset: number): ThreadMessage {
  const envelope: ImEnvelope = { channelId: 'room', channelType: 2, fromUid: 'human', messageId: id, clientMsgNo: id,
    messageSeq: sequence ?? 0, timestamp: (epoch + offset) / 1000,
    payload: { version: 1, kind: 'text', clientMsgNo: id, body: id } }
  const message = convertEnvelope(envelope, { participants, meId: 'human' })
  return { ...message, metadata: { ...message.metadata, custom: { ...metadata(message), sequence } } } as ThreadMessage
}
const event = (draft: string): RunStreamEvent => ({ type: 'preview', preview: {
  kind: 'snapshot', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', seq: 1, draft,
} })

test('a live reply stays between user turns through streaming, acknowledgements and canonical delivery', () => {
  let state = { ...EMPTY_CONVERSATION_CHAT_STATE, messages: [user('first', 1, 1000)] }
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot('run', 'leased') }, participants.agent)
  state = applyRunUpdate(state, target, event('正在回答'), participants.agent)
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [user('followup', null, 3000)]) }
  const delta: RunStreamEvent = { type: 'preview', preview: { kind: 'delta', runId: 'run', fence: 1,
    requestVersion: 1, attemptId: 'attempt', fromSeq: 1, seq: 2, delta: '，继续' } }
  state = applyRunUpdate(state, target, delta, participants.agent)
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [user('followup', 2, 3000)]) }
  assert.deepEqual(state.messages.map(message => message.id), ['first', 'preview-run', 'followup'])
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot() }, participants.agent)
  const preview = state.messages[1]!
  const committed = { ...preview, id: 'result-run', metadata: { ...preview.metadata,
    custom: { ...metadata(preview), clientMessageId: 'result-run', sequence: 3, positionAfter: undefined } } } as ThreadMessage
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [committed]) }
  state = applyRunUpdate(state, target, delta, participants.agent)
  assert.deepEqual(state.messages.map(message => message.id), ['first', 'result-run', 'followup'])
  assert.deepEqual(state.messages[1]!.content, [{ type: 'text', text: 'run 的完整历史回复' }])
  assert.deepEqual(state.messages.map(message => [metadata(message).groupStart, metadata(message).groupEnd]),
    [[true, true], [true, true], [true, true]])
})

test('snapshots restore turn order after reload and older history does not move the reply', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot() }, participants.agent)
  const reply = state.messages[0]!
  const canonical = { ...reply, createdAt: new Date(epoch + 4000), metadata: { ...reply.metadata,
    custom: { ...metadata(reply), sequence: 3, positionAfter: undefined } } } as ThreadMessage
  state = { ...state, messages: mergeCanonicalMessages([], [user('first', 1, 1000), user('followup', 2, 3000), canonical]) }
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot() }, participants.agent)
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [user('older', 0, 0)]) }
  assert.deepEqual(state.messages.map(message => message.id), ['older', 'first', 'preview-run', 'followup'])
  assert.equal(state.messages[2]!.status?.type, 'complete')
})

test('committed replies ignore duplicate snapshots and stale deltas without regressing content', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot() }, participants.agent)
  state = applyRunUpdate(state, target, event('旧草稿'), participants.agent)
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot() }, participants.agent)
  assert.equal(state.messages.length, 1)
  assert.deepEqual(state.messages[0]!.content, [{ type: 'text', text: 'run 的完整历史回复' }])
  assert.deepEqual(state.activeRuns, {})
  assert.equal(needsRunStream('succeeded', 'delivered'), false)
  assert.equal(needsRunStream('failed'), false)
  assert.equal(needsRunStream('waiting'), true)
  assert.equal(needsRunStream('leased'), true)
  assert.equal(needsRunStream('succeeded', 'pending'), true)
})

test('a reply at the page boundary leaves room for subsequently loaded older history', () => {
  const state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot() }, participants.agent)
  const messages = mergeCanonicalMessages(state.messages, [user('older', 1, 1000), user('newer', 3, 3000)])
  assert.deepEqual(messages.map(message => message.id), ['older', 'preview-run', 'newer'])
})

test('initial history publishes complete run snapshots together and subscribes only to active runs', async () => {
  resetChatThreadStore()
  const subscribed: string[] = []
  const callbacks = new Map<string, (item: RunStreamEvent) => void>()
  let finishSecond!: (state: RunState) => void
  const second = new Promise<RunState>(resolve => { finishSecond = resolve })
  mock.module('@/api/core/realtime', { namedExports: { ws: {} } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: participants }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => null } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { history: async () => [] } } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    list: async () => ['run', 'second', 'active'].map(runId => ({ ...target, runId, requestVersion: 1, fence: 1,
      status: runId === 'active' ? 'leased' : 'succeeded' })),
    read: async ({ runId }: typeof target) => ({ ...(runId === 'second' ? await second : snapshot(runId, runId === 'active' ? 'leased' : 'succeeded')),
      events: [], nextSeq: 0, canControl: true, diagnostics: { actions: [] } }),
    subscribe: (runTarget: typeof target, receive: (item: RunStreamEvent) => void) => {
      subscribed.push(runTarget.runId); callbacks.set(runTarget.runId, receive)
      return { readyState: 1, close() {} }
    },
  } } })
  const originalEventSource = globalThis.EventSource
  globalThis.EventSource = { CLOSED: 2 } as typeof EventSource
  const { ChatTransport, filterThreadMessages } = await import('./transport')
  const transport = new ChatTransport()
  const batches: string[][] = []
  const unsubscribe = useChatThreadStore.subscribe(state => {
    if (state.conversations.room?.loaded) batches.push(state.conversations.room.messages.map(message => message.id))
  })
  try {
    const loading = transport.loadConversation('room')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(useChatThreadStore.getState().conversations.room?.isLoading, true)
    assert.deepEqual(batches, [])
    finishSecond(snapshot('second'))
    await loading
    assert.equal(batches.length, 1)
    assert.deepEqual(subscribed, ['active'])
    const messages = useChatThreadStore.getState().conversations.room!.messages
    assert.deepEqual(messages.slice(0, 2).map(message => message.content), [
      [{ type: 'text', text: 'run 的完整历史回复' }], [{ type: 'text', text: 'second 的完整历史回复' }],
    ])
    callbacks.get('active')!({ type: 'preview', preview: { ...(event('实时新内容') as Extract<RunStreamEvent, { type: 'preview' }>).preview, runId: 'active' } })
    assert.deepEqual(useChatThreadStore.getState().conversations.room!.messages.at(-1)!.content, [{ type: 'text', text: '实时新内容' }])
    const tool = { ...messages[0]!, metadata: { ...messages[0]!.metadata, custom: { ...metadata(messages[0]!), messageKind: 'tool_activity' } } } as ThreadMessage
    assert.deepEqual(filterThreadMessages([tool, user('visible', 5, 5000)], null).map(message => message.id), ['visible'])
    assert.deepEqual(filterThreadMessages([tool, user('visible', 5, 5000)], 'visible').map(message => message.id), ['visible'])
    await transport.reloadConversation('room')
    assert.deepEqual(subscribed, ['active'])
    assert.equal(useChatThreadStore.getState().conversations.room!.messages.length, 3)
  } finally {
    unsubscribe()
    globalThis.EventSource = originalEventSource
    mock.restoreAll()
  }
})
