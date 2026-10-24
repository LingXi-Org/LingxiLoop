import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage, nativeText } from '@/lib/nativeMessage'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'
import type { WsEvent } from '@/api/contracts'
import type { RunStreamPublication } from './harness-api'

test('durable recovery orders earlier text and rejects snapshots overtaken by validated pending SSE', async () => {
  let notify!: (event: WsEvent) => void, connected!: () => void
  const reads: Array<(value: AgentRunSnapshot) => void> = []
  let target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
  let stream!: { receive(value: AgentRunSnapshot): void; defer(value: AgentRunSnapshot): void; flush(): void }
  const timers = new Map<number, () => void>(); let nextTimer = 0
  const source = (text: string, seq: number, failed = false): AgentRunSnapshot => ({ message: createNativeMessage({ id: `run-${target.runId}`,
    role: 'assistant', createdAt: '2026-01-01T00:01:00Z', content: [{ type: 'text', text }],
    status: failed ? { type: 'incomplete', reason: 'error' } : { type: 'running' }, custom: { runId: target.runId, harnessControl: !failed,
      harness: { ...createRunView(target.runId), requestVersion: 1, fence: 1, lastSeq: seq, lifecycle: failed ? 'failed' : 'leased', artifacts: [] } } }) })
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {}, on: (listener: typeof notify) => { notify = listener; return () => {} } } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ byId: {} }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction: () => {} } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { connect: async () => {}, disconnect: () => {}, subscribe: () => () => {},
    onConnected: (listener: () => void) => { connected = listener; return () => {} }, history: async () => [] } } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox: () => {}, rememberChatOutbox: () => {} } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    history: async () => [], list: async () => [{ ...target, requestVersion: 1, fence: 1, status: 'failed' }],
    read: () => new Promise<AgentRunSnapshot>(resolve => { reads.push(resolve) }),
    subscribe: (_target: unknown, receive: (snapshot: AgentRunSnapshot) => void, signal: AbortSignal, publication?: RunStreamPublication) => new Promise<void>(resolve => {
      let pending: AgentRunSnapshot | undefined
      const flush = () => { const value = pending; pending = undefined; if (value && !signal.aborted) receive(value) }
      if (publication) publication.flush = flush
      stream = { flush, receive: value => { publication?.observed?.(); receive(value) }, defer: value => { publication?.observed?.(); pending = value } }
      signal.addEventListener('abort', () => { pending = undefined; if (publication?.flush === flush) delete publication.flush; resolve() }, { once: true })
    }),
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout: (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id },
    clearTimeout: (id: number) => { timers.delete(id) }, addEventListener() {}, removeEventListener() {} } })
  const { ChatTransport } = await import('./transport')
  const { updateConversation, useChatThreadStore } = await import('./store')
  const { convertEnvelope } = await import('./converter')
  const transport = new ChatTransport()
  try {
    for (const route of ['reconnect', 'reload', 'older'] as const) for (const overtaken of [false, true]) {
      target = { ...target, runId: `${route}-${overtaken}` }; reads.length = 0
      transport.boot(); await setImmediate()
      const user = convertEnvelope({ channelId: 'room', channelType: 2, fromUid: 'human', messageId: 'user', clientMsgNo: 'user', messageSeq: 10, timestamp: 0,
        payload: createNativeMessage({ id: 'user', role: 'user', createdAt: '2026-01-01T00:00:00Z', content: [{ type: 'text', text: 'request' }] }) }, { participants: {}, meId: 'human' })
      updateConversation('room', state => ({ ...state, loaded: true, messages: [user] }))
      notify({ type: 'agent.run.available', companyId: 'company', ...target })
      stream.receive(source('A', 1)); stream.defer(source('AB', 2))
      if (route === 'reconnect') connected()
      const work = route === 'reload' ? transport.reloadConversation('room') : route === 'older' ? transport.loadOlder('room') : Promise.resolve()
      await setImmediate()
      const completeRead = reads.shift()
      assert.ok(completeRead, `${route} must request a stopped run snapshot`)
      assert.equal(nativeText(useChatThreadStore.getState().conversations.room.messages.at(-1)!), 'AB', 'pre-read text is ordered before freshness capture')
      if (overtaken) stream.defer(source('ABC', 3))
      completeRead(source('AB', 2, true))
      await work; await setImmediate()
      stream.flush() // delayed clock after the durable restore must not resurrect earlier text/state
      const message = useChatThreadStore.getState().conversations.room.messages.at(-1)!
      assert.equal(nativeText(message), overtaken ? 'ABC' : 'AB')
      assert.equal(message.status?.type, overtaken ? 'running' : 'incomplete')
      assert.equal(message.metadata.custom.harnessControl, overtaken)
      transport.disconnect(); await setImmediate()
      assert.equal(timers.size, 0)
    }
  } finally { transport.disconnect(); await setImmediate(); Reflect.deleteProperty(globalThis, 'window') }
})
