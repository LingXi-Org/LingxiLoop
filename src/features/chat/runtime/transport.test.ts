import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { mock, test } from 'node:test'
import type { WsEvent } from '@/api/contracts'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'

test('run notifications and discovery subscribe before blocked history, deduplicate and recover closed streams', async () => {
  let receive!: (event: WsEvent) => void, discover!: () => void
  const opened: Array<{ runId: string; readyState: number; close(): void; receive(event: RunStreamEvent): void }> = []
  const listed: Array<{ conversationId: string; agentId: string; runId: string; status: string }> = []
  let reads = 0
  let paint: (() => void) | undefined
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {},
    on: (listener: typeof receive) => { receive = listener; return () => {} } } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ byId: {} }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction: () => {} } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { connect: async () => {}, disconnect: () => {}, subscribe: () => () => {} } } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox: () => {}, rememberChatOutbox: () => {} } })
  mock.module('./converter', { namedExports: { convertEnvelope: () => {}, convertEnvelopeBatch: () => [],
    projectMessageGroups: (messages: unknown) => messages } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    list: async () => listed,
    read: async (_target: unknown, _seq: number, signal: AbortSignal) => {
      reads++
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    },
    subscribe: (target: { runId: string }, listener: (event: RunStreamEvent) => void) => {
      const stream = { runId: target.runId, readyState: 1, close() { this.readyState = 2 }, receive: listener }
      opened.push(stream)
      return stream
    },
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setInterval: (callback: () => void) => { discover = callback; return 1 }, clearInterval: () => {},
    requestAnimationFrame: (callback: () => void) => { paint = callback; return 1 }, cancelAnimationFrame: () => { paint = undefined },
  } })
  Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: { CLOSED: 2 } })
  const { ChatTransport } = await import('./transport')
  const { updateConversation, useChatThreadStore } = await import('./store')
  const transport = new ChatTransport()
  transport.boot()
  try {
    updateConversation('room', state => ({ ...state, isLoading: true }))
    const event = { type: 'agent.run.available' as const, companyId: 'company', conversationId: 'room', agentId: 'agent', runId: 'run' }
    receive({ ...event, companyId: 'outside' })
    assert.equal(opened.length, 0)
    receive(event); receive(event)
    assert.deepEqual(opened.map(stream => stream.runId), ['run'])
    assert.equal(reads, 1)
    // Native SSE sends the lifecycle snapshot before its first preview.
    opened[0].receive({ type: 'state', state: { run: { id: 'run', status: 'leased', fence: 1,
      requestVersion: 1, createdAt: new Date(0).toISOString() }, message: null, delivery: null } as RunState })
    opened[0].receive({ type: 'preview', preview: { runId: 'run', fence: 1, requestVersion: 1,
      attemptId: 'attempt', seq: 1, kind: 'snapshot', draft: '你好' } })
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages[0].content, [{ type: 'text', text: '你好' }])
    const delta = { runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', kind: 'delta' as const }
    opened[0].receive({ type: 'preview', preview: { ...delta, seq: 2, fromSeq: 1, delta: '，' } })
    opened[0].receive({ type: 'preview', preview: { ...delta, seq: 3, fromSeq: 2, delta: '世界' } })
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages[0].content, [{ type: 'text', text: '你好' }])
    paint!()
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages[0].content, [{ type: 'text', text: '你好，世界' }])
    opened[0].receive({ type: 'preview', preview: { ...delta, seq: 4, fromSeq: 3, delta: '已撤回' } })
    opened[0].receive({ type: 'reset', runId: 'run', reason: 'superseded' })
    paint!()
    assert.equal(useChatThreadStore.getState().conversations.room.messages[0].content.some(part => part.type === 'text' && part.text.includes('已撤回')), false)
    opened[0].close()
    receive(event)
    assert.equal(opened.length, 2)
    updateConversation('room', state => ({ ...state, loaded: true, isLoading: false }))
    listed.push({ conversationId: 'room', agentId: 'agent', runId: 'missed-notification', status: 'leased' })
    await setImmediate()
    discover()
    await setImmediate()
    assert.deepEqual(opened.map(stream => stream.runId), ['run', 'run', 'missed-notification'])
    const stale = opened.at(-1)!
    transport.disconnect(); transport.boot()
    stale.receive({ type: 'preview', preview: { runId: 'missed-notification', fence: 1, requestVersion: 1,
      attemptId: 'old', seq: 1, kind: 'snapshot', draft: '旧会话' } })
    assert.deepEqual(useChatThreadStore.getState().conversations, {})
  } finally {
    transport.disconnect()
    assert.ok(opened.every(stream => stream.readyState === 2))
    Reflect.deleteProperty(globalThis, 'window'); Reflect.deleteProperty(globalThis, 'EventSource')
  }
})
