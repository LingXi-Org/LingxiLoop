import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '@/lib/nativeMessage'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'
import { getLingxiMessageMetadata } from './model'

// Test the owning transport, not a second retry implementation. No mutation API is provided.
test('connection recovery is bounded, observes the same run, fences old streams and preserves real terminal states', async () => {
  let now = 0, next = 0, status = 'leased', failure: string | null = null, reads = 0
  const timers = new Map<number, { at: number; call(): void }>()
  const streams: { signal: AbortSignal; receive(snapshot: AgentRunSnapshot): void; reject(error: Error): void }[] = []
  const snapshot = (lifecycle = status, seq = 1): AgentRunSnapshot => ({ message: createNativeMessage({ id: 'run-run', role: 'assistant',
    content: [{ type: 'text', text: '保留正文' }],
    status: lifecycle === 'leased' ? { type: 'running' } : lifecycle === 'succeeded' ? { type: 'complete', reason: 'stop' }
      : { type: 'incomplete', reason: lifecycle === 'cancelled' ? 'cancelled' : 'error' },
    custom: { runId: 'run', harnessControl: true, harness: { ...createRunView('run'), lifecycle, requestVersion: 1, fence: 1, lastSeq: seq, artifacts: [] } },
  }) })
  mock.method(Date, 'now', () => now)
  mock.module('@/api/core/realtime', { namedExports: { ws: {} } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [] }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction() {} } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { disconnect() {}, setWorkspaceChannels() {} } } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox() {}, rememberChatOutbox() {} } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    read: async () => { reads++; if (failure) throw new Error(failure); return snapshot() },
    subscribe: (target: { runId: string }, receive: (snapshot: AgentRunSnapshot) => void, signal: AbortSignal) => {
      assert.equal(target.runId, 'run')
      return new Promise<void>((resolve, reject) => {
        streams.push({ signal, receive, reject })
        signal.addEventListener('abort', () => resolve(), { once: true })
        if (failure) reject(new Error(failure))
      })
    },
  } } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (call: () => void, ms: number) => { timers.set(++next, { at: now + ms, call }); return next },
    clearTimeout: (id: number) => timers.delete(id),
  } })
  const advance = async (ms: number) => {
    const end = now + ms
    for (let step = 0; step < 200; step++) {
      await setImmediate()
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      now = due[1].at; timers.delete(due[0]); due[1].call()
    }
    now = end; await setImmediate()
  }
  const { ChatTransport } = await import('./transport')
  const { updateConversation, useChatThreadStore } = await import('./store')
  const { applyRunSnapshot } = await import('./run-updates')
  const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
  const transport = new ChatTransport()
  const state = () => useChatThreadStore.getState().conversations.room
  const seed = () => updateConversation('room', state => applyRunSnapshot(state, target, snapshot('leased')))
  try {
    seed(); await transport.refreshRun(target)
    streams[0].receive(snapshot()); streams[0].reject(new Error('network lost'))
    await advance(2000)
    assert.equal(streams.length, 2)
    streams[1].receive(snapshot()); streams[1].receive(snapshot())
    assert.equal(state().messages.length, 1, 'replayed snapshots replace, never append')
    status = 'succeeded'; await advance(15_000)
    assert.equal(state().messages[0].status?.type, 'complete', 'durable poll ends a stalled SSE')
    assert.ok(streams[1].signal.aborted)
    streams[0].receive(snapshot('leased', 0))
    assert.equal(state().messages[0].status?.type, 'complete')
    for (const lifecycle of ['failed', 'cancelled']) {
      seed(); status = lifecycle; await transport.refreshRun(target)
      streams.at(-1)!.receive(snapshot())
      assert.equal(state().messages[0].status?.type, 'incomplete')
      assert.equal(getLingxiMessageMetadata(state().messages[0]).harness?.lifecycle, lifecycle)
    }
    for (const [http, expected] of [['403', 'inaccessible'], ['404', 'missing'], ['401', 'unauthenticated']] as const) {
      seed(); failure = http; await transport.refreshRun(target); await setImmediate()
      const count: number = streams.length
      await advance(120_000)
      assert.equal(streams.length, count, `${http} must stop retries`)
      assert.equal(state().messages[0].metadata.custom.runConnection, expected)
      assert.equal(state().messages[0].metadata.custom.harnessControl, false)
    }
    seed(); failure = 'offline'; await transport.refreshRun(target); await advance(61_000)
    assert.equal(state().messages[0].metadata.custom.runConnection, 'released')
    assert.equal(state().messages[0].status?.type, 'requires-action')
    assert.deepEqual(state().activeRuns, {})
    const count = streams.length, priorReads = reads
    await advance(120_000)
    assert.equal(streams.length, count, 'exhausted observation stops opening streams')
    assert.equal(reads, priorReads, 'exhausted observation stops polling')
    failure = null; await transport.refreshRun(target)
    streams.at(-1)!.receive(snapshot('succeeded', 2))
    assert.equal(state().messages[0].status?.type, 'complete')
    assert.equal(state().messages[0].metadata.custom.runConnection, undefined)
    seed(); status = 'leased'; await transport.refreshRun(target)
    const old = streams.at(-1)!
    transport.setWorkspaceChannels([])
    old.receive(snapshot('succeeded', 100))
    assert.equal(useChatThreadStore.getState().conversations.room, undefined, 'revoked channel cannot be revived')
  } finally {
    transport.disconnect(); await setImmediate()
    assert.equal(timers.size, 0)
    mock.restoreAll(); Reflect.deleteProperty(globalThis, 'window')
  }
})
