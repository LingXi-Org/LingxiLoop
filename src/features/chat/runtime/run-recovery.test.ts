import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '@/lib/nativeMessage'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'

// Failure cases are recorded before implementation in docs/evidence/run-recovery/FAILURE-MODEL.md.
test('partial discovery and terminal hydration preserve readable replies without re-admission', async () => {
  const target = { conversationId: 'room', agentId: 'agent', runId: 'run', status: 'succeeded', requestVersion: 1, fence: 1 }
  const snapshot = (lifecycle = 'leased', runId = 'run', version = 1): AgentRunSnapshot => ({ message: createNativeMessage({ id: `run-${runId}`, role: 'assistant',
    content: [{ type: 'text', text: '已保存的正文' }], status: lifecycle === 'leased' ? { type: 'running' } : { type: 'complete', reason: 'stop' },
    custom: { runId, refs: { agentId: 'agent' }, harnessControl: true, harness: { ...createRunView(runId), lifecycle, requestVersion: version, fence: version, artifacts: [] } },
  }) })
  let listFails = false, historyFails = false, readFails = false, streams = 0, reads = 0
  let read: ((target: { runId: string }) => Promise<AgentRunSnapshot>) | undefined
  let includeHistory = true, extra = false, omitRun = false, extraTerminal = false
  const callbacks = new Map<string, (snapshot: AgentRunSnapshot) => void>()
  mock.module('@/api/core/realtime', { namedExports: { ws: {} } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [] }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction() {} } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { disconnect() {}, setWorkspaceChannels() {}, history: async () => includeHistory ? [{
    channelId: 'room', channelType: 2, fromUid: 'agent', clientMsgNo: 'run-run', messageId: 'im', messageSeq: 1,
    timestamp: 1, payload: snapshot().message,
  }] : [] } } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox() {}, rememberChatOutbox() {} } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    list: async () => { if (listFails) throw new Error('offline'); return omitRun ? [] : [target, ...(extra ? [{ ...target, runId: 'other', status: extraTerminal ? 'succeeded' : 'leased' }] : [])] },
    history: async () => { if (historyFails) throw new Error('offline'); return [target] },
    read: async (target: { runId: string }) => { reads++; if (read) return read(target); if (readFails) throw new Error('offline'); return snapshot('succeeded') },
    subscribe: (target: { runId: string }, receive: (snapshot: AgentRunSnapshot) => void) => { streams++; callbacks.set(target.runId, receive); throw new Error('offline') },
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { clearTimeout() {}, setTimeout: () => 1 } })
  const { ChatTransport } = await import('./transport')
  const { resetChatThreadStore, updateConversation, useChatThreadStore } = await import('./store')
  const transport = new ChatTransport()
  try {
    for (const failedSource of ['recent', 'history', 'read'] as const) {
      resetChatThreadStore()
      listFails = failedSource === 'recent'; historyFails = failedSource === 'history'; readFails = failedSource === 'read'
      await transport.loadConversation('room'); await setImmediate()
      const state = useChatThreadStore.getState().conversations.room
      assert.equal(state.loaded, true)
      assert.equal(state.isLoading, false)
      assert.equal(state.isRecovering, false)
      assert.equal(state.messages.length, 1, `${failedSource} failure must retain the IM body`)
      assert.equal(state.messages[0].content[0].type === 'text' && state.messages[0].content[0].text, '已保存的正文')
      assert.equal(state.messages[0].status?.type, readFails ? 'requires-action' : 'complete')
    }
    assert.equal(reads, 3, 'both discovery sources survive independently and terminal success is read once')
    assert.equal(streams, 1, 'only a transiently unavailable snapshot opens a read-only observation stream')
    const cached = useChatThreadStore.getState().conversations.room.messages[0]
    transport.disconnect()
    const paged = new ChatTransport()
    updateConversation('room', state => ({ ...state, loaded: true, hasMoreOlder: true, messages: [{
      ...cached, id: 'user', role: 'user', metadata: { custom: { ...cached.metadata.custom, runId: null, harness: undefined, sequence: 100 } },
    }] as typeof state.messages }))
    await paged.loadOlder('room'); await setImmediate()
    assert.equal(useChatThreadStore.getState().conversations.room.messages.find(message => message.id === 'run-run')?.status?.type, 'requires-action', 'older history cannot remain running after failed reconciliation')
    assert.equal(streams, 2, 'older history gets the same bounded read-only recovery')
    let rejectOld!: (error: Error) => void
    readFails = false; read = () => new Promise((_, reject) => { rejectOld = reject })
    const obsolete = paged.reloadConversation('room'); await setImmediate()
    paged.setWorkspaceChannels([]); paged.setWorkspaceChannels(['room'])
    rejectOld(new Error('403')); await obsolete
    read = undefined; target.status = 'leased'
    await paged.loadConversation('room'); await setImmediate()
    assert.equal(streams, 3, 'late old permission errors cannot block a fresh generation')
    paged.disconnect()
    const multi = new ChatTransport()
    extra = true; includeHistory = false; target.status = 'failed'; readFails = true
    await multi.loadConversation('room'); await setImmediate()
    assert.ok(useChatThreadStore.getState().conversations.room.error)
    callbacks.get('other')!({ message: createNativeMessage({ id: 'run-other', role: 'assistant', content: [], status: { type: 'running' },
      custom: { runId: 'other', harness: { ...createRunView('other'), lifecycle: 'leased', requestVersion: 1, fence: 1, artifacts: [] } },
    }) })
    assert.ok(useChatThreadStore.getState().conversations.room.error, 'one run cannot hide another unavailable reply')
    omitRun = true
    updateConversation('room', state => ({ ...state, hasMoreOlder: true, messages: [...state.messages, {
      ...cached, id: 'user', role: 'user', metadata: { custom: { ...cached.metadata.custom, runId: null, harness: undefined, sequence: 100 } },
    }] as typeof state.messages }))
    await multi.loadOlder('room')
    assert.ok(useChatThreadStore.getState().conversations.room.error, 'successful pagination cannot hide an unavailable run outside the recent window')
    callbacks.get('run')!(snapshot('succeeded'))
    assert.equal(useChatThreadStore.getState().conversations.room.error, null, 'the missing run itself clears its recovery error')
    multi.disconnect()
    const slow = new ChatTransport()
    includeHistory = true; omitRun = false; extra = false; target.status = 'succeeded'
    let finish!: (snapshot: AgentRunSnapshot) => void
    read = () => new Promise(resolve => { finish = resolve })
    const loading = slow.loadConversation('room'); await setImmediate()
    const visible = useChatThreadStore.getState().conversations.room
    assert.equal(visible.isLoading, false)
    assert.equal(visible.messages[0]?.content[0].type === 'text' && visible.messages[0].content[0].text, '已保存的正文', 'saved prose paints before optional recovery')
    assert.equal(visible.messages[0]?.status?.type, 'requires-action')
    finish(snapshot('succeeded')); await loading
    slow.disconnect()
    const race = new ChatTransport()
    includeHistory = false; extra = true; extraTerminal = true
    read = async target => {
      if (target.runId === 'run') throw new Error('503')
      return new Promise(resolve => { finish = resolve })
    }
    const racing = race.loadConversation('room'); await setImmediate()
    await race.refreshRun(target); await setImmediate()
    callbacks.get('run')!(snapshot('leased', 'run', 2))
    finish(snapshot('succeeded', 'other')); await racing
    const fresh = useChatThreadStore.getState().conversations.room
    assert.equal(fresh.messages.find(message => message.id === 'run-run')?.status?.type, 'running', 'late history failure cannot downgrade a newer stream confirmation')
    assert.ok(Object.values(fresh.activeRuns).some(run => run.id === 'run'))
    assert.equal(fresh.error, null)
    race.disconnect()
    const warm = new ChatTransport()
    includeHistory = true; extra = false; target.status = 'leased'; read = undefined; readFails = false
    await warm.refreshRun(target); await setImmediate()
    const preview = snapshot()
    callbacks.get('run')!({ message: createNativeMessage({ ...preview.message, id: 'run-run', role: 'assistant',
      content: [{ type: 'text', text: '较新的实时正文' }], custom: preview.message.metadata.custom }) })
    await warm.reloadConversation('room')
    const retained = useChatThreadStore.getState().conversations.room.messages.find(message => message.id === 'run-run')!
    assert.equal(retained.content[0].type === 'text' && retained.content[0].text, '较新的实时正文', 'same-fence history cannot overwrite a newer preview')
    assert.equal(retained.status?.type, 'running')
    warm.disconnect()
  } finally {
    transport.disconnect(); await setImmediate(); Reflect.deleteProperty(globalThis, 'window')
  }
})
