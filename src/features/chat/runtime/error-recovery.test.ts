import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '../../../lib/nativeMessage'
import type { AgentRunSnapshot } from '../../../lib/agentRunSnapshot'
import type { ImEnvelope } from '../../../lib/im/wukong'

// Failure cases: first paint replays a failed run as running; cold reload loses
// errors absent from IM; re-entry subscribes a stopped run; stale recovery
// overwrites a newer attempt or leaks into another workspace; read failure
// hides ordinary history; active runs stop streaming.
test('history restores stopped runs before publishing messages, without replaying them', async () => {
  let projectId = 'project', reads = 0, streams = 0
  const target = { conversationId: 'room', agentId: 'agent', runId: 'run', status: 'failed', requestVersion: 1, fence: 1 }
  const snapshot = (status: 'failed' | 'leased', version = 1): AgentRunSnapshot => ({ message: createNativeMessage({
    id: 'run-run', role: 'assistant', createdAt: '2026-10-16T00:00:00Z', content: [],
    status: status === 'failed' ? { type: 'incomplete', reason: 'error' } : { type: 'running' },
    custom: { runId: 'run', refs: { agentId: 'agent' }, harnessError: status === 'failed' ? '保存的错误信息' : undefined,
      harness: { ...createRunView('run'), lifecycle: status, requestVersion: version, fence: version, lastSeq: version * 10, artifacts: [] } },
  }) })
  const stale: ImEnvelope = { channelId: 'room', channelType: 2, fromUid: 'agent', clientMsgNo: 'run-run', messageId: 'im-run',
    messageSeq: 2, timestamp: 1, payload: snapshot('leased').message }
  let history: ImEnvelope[] = [stale]
  let read: () => Promise<AgentRunSnapshot> = async () => snapshot('failed')
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {}, on: () => () => {} } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {
    agent: { id: 'agent', kind: 'agent', name: '助手' },
  } }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [] }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction: () => {} } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId }) } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: {
    connect: async () => {}, disconnect() {}, subscribe: () => () => {}, setWorkspaceChannels() {}, history: async () => history,
  } } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox() {}, rememberChatOutbox() {} } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    list: async () => [target], read: async () => { reads++; return read() },
    subscribe: (_target: unknown, _receive: unknown, signal: AbortSignal) => {
      streams++
      return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    },
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { clearTimeout() {}, setTimeout: () => 1 } })
  const { ChatTransport } = await import('./transport')
  const { resetChatThreadStore, updateConversation, useChatThreadStore } = await import('./store')
  const { applyRunSnapshot } = await import('./run-updates')
  const transport = new ChatTransport()
  const observed: string[] = []
  const unsubscribe = useChatThreadStore.subscribe(state => {
    const message = state.conversations.room?.messages.find(message => message.id === 'run-run')
    if (message) observed.push(message.status!.type)
  })
  try {
    for (const cached of [true, false]) {
      resetChatThreadStore(); observed.length = 0; history = cached ? [stale] : []
      await transport.loadConversation('room')
      await setImmediate()
      assert.ok(observed.length > 0)
      assert.ok(observed.every(status => status === 'incomplete'), `first paint must be terminal: ${observed}`)
      assert.equal(useChatThreadStore.getState().conversations.room.messages[0].metadata.custom.harnessError, '保存的错误信息')
      await transport.reloadConversation('room')
      assert.ok(observed.every(status => status === 'incomplete'))
      assert.equal(streams, 0, 'failed runs must not open a replay stream')
    }
    let finish!: (snapshot: AgentRunSnapshot) => void
    read = () => new Promise(resolve => { finish = resolve })
    const reload = transport.reloadConversation('room')
    await setImmediate()
    updateConversation('room', state => applyRunSnapshot(state, target, snapshot('leased', 2)))
    finish(snapshot('failed'))
    await reload
    assert.equal(useChatThreadStore.getState().conversations.room.messages[0].status?.type, 'running', 'new attempts beat old failures')
    const obsolete = transport.reloadConversation('room')
    await setImmediate()
    projectId = 'other-project'; resetChatThreadStore()
    finish(snapshot('failed')); await obsolete
    assert.deepEqual(useChatThreadStore.getState().conversations, {})
    projectId = 'project'; history = []; read = async () => { throw new Error('snapshot unavailable') }
    await transport.loadConversation('room')
    assert.equal(useChatThreadStore.getState().conversations.room.loaded, true)
    assert.ok(useChatThreadStore.getState().conversations.room.error)
    assert.ok(reads >= 7)
  } finally { unsubscribe(); transport.disconnect(); Reflect.deleteProperty(globalThis, 'window') }
})
