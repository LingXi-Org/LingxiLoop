import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { mock, test } from 'node:test'
import type { WsEvent } from '@/api/contracts'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'
import { RunStreamProjection } from '../../../../server/src/agent-runtime/assistant-transport'

test('run notifications and discovery subscribe before blocked history, deduplicate and recover closed streams', async () => {
  let receive!: (event: WsEvent) => void
  const opened: Array<{ runId: string; signal: AbortSignal; close(): void; receive(event: RunStreamEvent): void; snapshot(): AgentRunSnapshot; defer(snapshot: AgentRunSnapshot): void; flush(): void }> = []
  let settled = 0
  const timers = new Set<number>()
  let nextTimer = 0
  const listed: Array<{ conversationId: string; agentId: string; runId: string; status: string }> = []
  let reads = 0
  let durable: AgentRunSnapshot | undefined
  const retries: Array<() => void> = []
  const answer = (text: string) => [{ type: 'text', text, providerMetadata: { lingxiloop: {
    activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' },
  } } }]
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {},
    on: (listener: typeof receive) => { receive = listener; return () => {} } } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ byId: {} }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction: () => {} } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { connect: async () => {}, disconnect: () => {}, subscribe: () => () => {}, onConnected: () => () => {}, history: async () => [] } } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox: () => {}, rememberChatOutbox: () => {} } })
  mock.module('./converter', { namedExports: { convertEnvelope: () => {}, convertEnvelopeBatch: () => [],
    projectMessageGroups: (messages: unknown) => messages } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    history: async () => [],
    list: async () => listed,
    read: async () => {
      reads++
      if (durable) return durable
      throw new Error('Active streams must not read HTTP snapshots')
    },
    subscribe: (target: { runId: string }, listener: (snapshot: AgentRunSnapshot) => void, signal: AbortSignal, publication?: { flush?: () => void; observed?: () => void }) => new Promise<void>(resolve => {
      const projection = new RunStreamProjection(target.runId, true)
      let pending: AgentRunSnapshot | undefined
      const flush = () => { const value = pending; pending = undefined; if (value && !signal.aborted) listener(value) }
      if (publication) publication.flush = flush
      opened.push({ runId: target.runId, signal, close: resolve, receive: event => { publication?.observed?.(); listener(projection.apply(event)) },
        snapshot: () => projection.snapshot, defer: value => { publication?.observed?.(); pending = value }, flush })
      signal.addEventListener('abort', () => { if (publication?.flush === flush) delete publication.flush; resolve() }, { once: true })
    }).then(() => { settled++ }),
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (callback: () => void) => { const id = ++nextTimer; timers.add(id); retries.push(callback); return id },
    clearTimeout: (id: number) => { timers.delete(id) },
    addEventListener() {}, removeEventListener() {},
  } })
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
    assert.equal(reads, 0)
    // The server projects native events before the browser receives state operations.
    opened[0].receive({ type: 'state', state: { run: { id: 'run', status: 'leased', fence: 1,
      requestVersion: 1, createdAt: new Date(0).toISOString() }, message: null, delivery: null } as RunState })
    opened[0].receive({ type: 'preview', preview: { runId: 'run', fence: 1, requestVersion: 1,
      attemptId: 'attempt', seq: 1, kind: 'snapshot', draft: '你好' } })
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages[0].content, answer('你好'))
    const delta = { runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', kind: 'delta' as const }
    opened[0].receive({ type: 'preview', preview: { ...delta, seq: 2, fromSeq: 1, delta: '，' } })
    opened[0].receive({ type: 'preview', preview: { ...delta, seq: 3, fromSeq: 2, delta: '世界' } })
    assert.deepEqual(useChatThreadStore.getState().conversations.room.messages[0].content, answer('你好，世界'))
    const buffered = opened[0].snapshot()
    if (buffered.message.role !== 'assistant') throw new Error('assistant fixture required')
    durable = { message: { ...buffered.message, metadata: { ...buffered.message.metadata,
      custom: { ...buffered.message.metadata.custom, harnessControl: false } } } }
    opened[0].defer(buffered)
    retries[0]!() // the original durable polling timer
    await setImmediate()
    assert.equal(reads, 1)
    opened[0].flush() // an old scheduled callback after the durable read
    assert.equal(useChatThreadStore.getState().conversations.room.messages[0].metadata.custom.harnessControl, false,
      'same-seq durable permission refresh must follow earlier buffered text')
    durable = undefined

    opened[0].receive({ type: 'preview', preview: { ...delta, seq: 4, fromSeq: 3, delta: '已撤回' } })
    opened[0].receive({ type: 'reset', runId: 'run', reason: 'superseded' })
    assert.equal(useChatThreadStore.getState().conversations.room.messages[0].content.some(part => part.type === 'text' && part.text.includes('已撤回')), false)
    opened[0].close()
    await setImmediate()
    retries.at(-1)!()
    await setImmediate()
    assert.equal(opened.length, 2)
    receive(event)
    assert.equal(opened.length, 2)
    updateConversation('room', state => ({ ...state, loaded: true, isLoading: false }))
    listed.push({ conversationId: 'room', agentId: 'agent', runId: 'missed-notification', status: 'leased' })
    await setImmediate()
    receive({ type: 'hello', instanceId: 'reconnected', ts: Date.now() })
    await setImmediate()
    assert.deepEqual(opened.map(stream => stream.runId), ['run', 'run', 'missed-notification'])
    const stale = opened.at(-1)!
    stale.receive({ type: 'state', state: { run: { id: 'missed-notification', status: 'leased', fence: 1,
      requestVersion: 1, createdAt: new Date(0).toISOString() }, message: null, delivery: null } as RunState })
    transport.disconnect(); transport.boot()
    stale.receive({ type: 'preview', preview: { runId: 'missed-notification', fence: 1, requestVersion: 1,
      attemptId: 'old', seq: 1, kind: 'snapshot', draft: '旧会话' } })
    assert.deepEqual(useChatThreadStore.getState().conversations, {})
  } finally {
    const subscriptionCount = opened.length
    transport.disconnect()
    // Keep the browser fixture alive while both stream loops finish abort cleanup.
    await setImmediate()
    assert.ok(opened.every(stream => stream.signal.aborted))
    assert.equal(settled, opened.length, 'all cancelled subscriptions must finish before removing window')
    assert.equal(timers.size, 0, 'cancellation must release every recovery timer')
    assert.equal(opened.length, subscriptionCount, 'disconnect must not schedule another subscription')
    assert.deepEqual(useChatThreadStore.getState().conversations, {})
    assert.equal(reads, 1)
    Reflect.deleteProperty(globalThis, 'window')
  }
})
