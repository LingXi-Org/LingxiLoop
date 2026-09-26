import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { mock, test } from 'node:test'
import type { ImEnvelope } from '@/lib/im/wukong'
import type { AgentRunResponse } from './harness-api'
import type { RunStreamEvent } from '@lyyzka/lingxios/ui'

// Failure cases: slow diagnostics block readable history; duplicate recovery reads;
// stale success/error after reconnect or project change; hydration erases a newer IM delivery.
// Revoking another channel must restart retained initial/older reads without accepting their obsolete results.
test('history paints independently of diagnostics and obsolete requests cannot mutate the current session', async () => {
  let projectId = 'project', reads = 0, historyReads = 0
  const historyCalls: Array<[string, number | undefined]> = []
  const streams: Array<{ readyState: number; close(): void; receive(item: RunStreamEvent): void }> = []
  let history: () => Promise<ImEnvelope[]> = async () => [envelope('history', 1)]
  let finishRun!: (response: AgentRunResponse) => void
  const run = new Promise<AgentRunResponse>(resolve => { finishRun = resolve })
  const target = { conversationId: 'room', agentId: 'agent', runId: 'run', status: 'leased', requestVersion: 1, fence: 1 }
  function envelope(id: string, sequence: number): ImEnvelope {
    return { channelId: 'room', channelType: 2, fromUid: 'human', clientMsgNo: id, messageId: id,
      messageSeq: sequence, timestamp: sequence, payload: { version: 1, kind: 'text', clientMsgNo: id, body: id } }
  }
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {}, on: () => () => {} } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [] }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction: () => {} } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId }) } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: {
    connect: async () => {}, disconnect: () => {}, subscribe: () => () => {}, setWorkspaceChannels: () => {},
    history: (id: string, _limit: number, before?: number) => { historyReads++; historyCalls.push([id, before]); return history() },
  } } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox: () => {}, rememberChatOutbox: () => {} } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    list: async () => [target], read: async () => { reads++; return run },
    subscribe: (_target: unknown, receive: (item: RunStreamEvent) => void) => {
      const stream = { readyState: 1, close() { this.readyState = 2 }, receive }
      streams.push(stream); return stream
    },
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setInterval: () => 1, clearInterval() {}, clearTimeout() {} } })
  Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: { CLOSED: 2 } })
  const { ChatTransport } = await import('./transport')
  const { setConversationMessages, updateConversation, useChatThreadStore } = await import('./store')
  const { convertEnvelope } = await import('./converter')
  const transport = new ChatTransport()
  transport.boot()
  transport.setWorkspaceChannels(['room'])
  try {
    let loaded = false
    const first = transport.loadConversation('room').then(() => { loaded = true })
    await transport.loadConversation('room')
    await setImmediate()
    assert.equal(loaded, true, 'history completion must not wait for a run read')
    assert.equal(historyReads, 1)
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages.map(message => message.id), ['history'])
    assert.equal(useChatThreadStore.getState().conversations.room.isLoading, false)
    const refresh = transport.refreshRun(target)
    await setImmediate()
    assert.equal(reads, 1, 'discovery and explicit refresh share the pending run read')
    setConversationMessages('room', [convertEnvelope(envelope('live', 2), { participants: {}, meId: 'human' })])
    finishRun({ run: { id: 'run', status: 'leased', requestVersion: 1, fence: 1, createdAt: new Date(3000).toISOString() },
      message: null, delivery: null, events: [], nextSeq: 0, diagnostics: {}, canControl: true } as unknown as AgentRunResponse)
    await first; await refresh; await setImmediate()
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages.slice(0, 2).map(message => message.id), ['history', 'live'])
    assert.equal(useChatThreadStore.getState().conversations.room.messages.filter(message => message.id === 'preview-run').length, 1)

    for (const fail of [false, true]) {
      let resolve!: (value: ImEnvelope[]) => void, reject!: (error: Error) => void
      history = () => new Promise((yes, no) => { resolve = yes; reject = no })
      const stale = transport.reloadConversation('room')
      transport.disconnect(); transport.boot()
      updateConversation('room', state => ({ ...state, loaded: true }))
      if (fail) reject(new Error('old request failed'))
      else resolve([envelope('obsolete', 3)])
      await stale; await setImmediate()
      assert.deepEqual(useChatThreadStore.getState().conversations.room.messages, [])
      assert.equal(useChatThreadStore.getState().conversations.room.error, null)
    }

    let finishHistory!: (value: ImEnvelope[]) => void
    history = () => new Promise(resolve => { finishHistory = resolve })
    updateConversation('room', state => ({ ...state, loaded: false }))
    const previousProject = transport.loadConversation('room')
    projectId = 'other-project'
    finishHistory([envelope('old-project', 4)])
    await previousProject; await setImmediate()
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages, [])
    projectId = 'project'
    history = async () => [envelope('returned', 5)]
    await transport.loadConversation('room')
    assert.equal(useChatThreadStore.getState().conversations.room.isLoading, false)
    assert.equal(useChatThreadStore.getState().conversations.room.messages[0].id, 'returned')

    await setImmediate()
    const previousStream = streams.at(-1)!
    history = () => new Promise(resolve => { finishHistory = resolve })
    const roundTrip = transport.reloadConversation('room')
    projectId = 'other-project'; transport.setWorkspaceChannels([])
    assert.equal(previousStream.readyState, 2, 'project changes close the old run stream')
    projectId = 'project'; transport.setWorkspaceChannels(['room'])
    finishHistory([envelope('revived-old-project', 6)])
    await roundTrip; await setImmediate()
    previousStream.receive({ type: 'preview', preview: { runId: 'run', fence: 1, requestVersion: 1,
      attemptId: 'old', seq: 1, kind: 'snapshot', draft: 'revived-old-stream' } })
    assert.deepEqual(useChatThreadStore.getState().conversations, {}, 'returning to the same identity cannot revive old work')
    history = async () => [envelope('fresh-return', 7)]
    await transport.loadConversation('room'); await setImmediate()
    assert.notEqual(streams.at(-1), previousStream)
    assert.equal(streams.at(-1)?.readyState, 1)
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages.map(message => message.id), ['preview-run', 'fresh-return'])

    for (const older of [false, true]) {
      transport.setWorkspaceChannels(['room', 'revoked'])
      const retained = older ? [convertEnvelope(envelope('current', 80), { participants: {}, meId: 'human' })] : []
      updateConversation('room', state => ({ ...state, messages: retained, loaded: older,
        isLoading: false, isLoadingOlder: false, hasMoreOlder: true }))
      updateConversation('revoked', state => ({ ...state, isLoading: true }))
      let finishOld!: (value: ImEnvelope[]) => void, finishReplacement!: (value: ImEnvelope[]) => void
      let attempts = 0
      history = () => new Promise(resolve => { if (++attempts === 1) finishOld = resolve; else finishReplacement = resolve })
      const obsolete = older ? transport.loadOlder('room') : transport.loadConversation('room')
      transport.setWorkspaceChannels(['room'])
      assert.equal(attempts, 2, `${older ? 'older' : 'initial'} history must restart for a retained channel`)
      assert.deepEqual(historyCalls.slice(-2), [['room', older ? 80 : undefined], ['room', older ? 80 : undefined]])
      assert.equal(useChatThreadStore.getState().conversations.revoked, undefined)
      finishOld([envelope('obsolete-channel-generation', 79)])
      await obsolete; await setImmediate()
      assert.deepEqual(useChatThreadStore.getState().conversations.room.messages, retained)
      assert.equal(useChatThreadStore.getState().conversations.room[older ? 'isLoadingOlder' : 'isLoading'], true,
        'an obsolete completion must not clear the replacement loading state')
      finishReplacement([envelope('replacement', older ? 79 : 80)])
      await setImmediate()
      const restored = useChatThreadStore.getState().conversations.room
      assert.equal(restored.isLoading, false)
      assert.equal(restored.isLoadingOlder, false)
      assert.deepEqual(restored.messages.filter(message => message.id !== 'preview-run').map(message => message.id),
        older ? ['replacement', 'current'] : ['replacement'])
    }
  } finally {
    transport.disconnect()
    Reflect.deleteProperty(globalThis, 'window'); Reflect.deleteProperty(globalThis, 'EventSource')
  }
})
