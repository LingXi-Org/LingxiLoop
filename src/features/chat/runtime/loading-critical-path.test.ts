import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '../../../lib/nativeMessage'

// Failure model: diagnostics block history, refresh storms duplicate HTTP,
// cancelled A→B→A reads revive stale content, caches cross identities, retries
// remain stuck loading, or hydration replaces a newer delivery.
test('readable history precedes slow recovery, reads coalesce and cancellation fences stale responses', async () => {
  let projectId = 'project', calls = 0
  let finishRecovery!: (value: never[]) => void
  let finishHistory: ((value: unknown[]) => void) | undefined
  let signal: AbortSignal | undefined
  const recovery = new Promise<never[]>(resolve => { finishRecovery = resolve })
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {}, on: () => () => {} } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: {} }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [] }) } } })
  mock.module('@/lib/actionToast', { namedExports: { toastAction() {} } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId }) } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => 'company' } })
  const envelope = { channelId: 'a', channelType: 2, fromUid: 'human', messageId: 'first', clientMsgNo: 'first', messageSeq: 1, timestamp: 1,
    payload: createNativeMessage({ id: 'first', role: 'user', content: [{ type: 'text', text: 'readable' }] }) }
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { setWorkspaceChannels() {}, disconnect() {},
    history: (_id: string, _limit: number, _before: number, abort: AbortSignal) => {
      calls++; signal = abort
      return calls === 1 ? Promise.resolve([envelope]) : new Promise(resolve => { finishHistory = resolve })
    },
  } } })
  mock.module('./outbox', { namedExports: { readChatOutbox: () => [], forgetChatOutbox() {}, rememberChatOutbox() {} } })
  mock.module('./harness-api', { namedExports: { harnessApi: { list: () => recovery, history: async () => [] } } })
  const { ChatTransport } = await import('./transport')
  const { useChatThreadStore } = await import('./store')
  const transport = new ChatTransport()
  transport.setWorkspaceChannels(['a', 'b'])
  const started = performance.now()
  const initial = transport.loadConversation('a')
  await setImmediate()
  assert.equal(useChatThreadStore.getState().conversations.a.isLoading, false, 'history is readable while recovery is unresolved')
  assert.equal(useChatThreadStore.getState().conversations.a.messages[0].id, 'first')
  console.log(JSON.stringify({ historyVisibleMs: performance.now() - started, recoveryStillPending: true }))
  const duplicate = transport.loadConversation('a')
  assert.equal(calls, 1)
  finishRecovery([]); await initial; await duplicate
  await transport.loadConversation('a'); assert.equal(calls, 1, 'warm switch reuses scoped history')
  // A revocation while another room is recovering must resume its enrichment.
  // Reconnect invalidations that arrive after HTTP must not be swallowed.
  let release!: (value: never[]) => void
  const slowRecovery = new Promise<never[]>(resolve => { release = resolve })
  const { harnessApi } = await import('./harness-api')
  harnessApi.list = () => slowRecovery
  const refreshing = transport.reloadConversation('a')
  finishHistory!([envelope]); await setImmediate()
  const trailing = transport.reloadConversation('a')
  const alsoTrailing = transport.reloadConversation('a')
  const priorCalls = calls
  release([]); await refreshing; await setImmediate()
  assert.equal(calls, priorCalls + 1, 'one trailing reload preserves invalidation during recovery')
  finishHistory!([envelope]); await trailing; await alsoTrailing
  let releaseRevoked!: (value: never[]) => void
  harnessApi.list = () => new Promise(resolve => { releaseRevoked = resolve })
  const revokedRecovery = transport.reloadConversation('a')
  finishHistory!([envelope]); await setImmediate()
  transport.setWorkspaceChannels(['a'])
  assert.equal(calls, priorCalls + 3, 'retained room resumes pending recovery after another channel is removed')
  releaseRevoked([]); await revokedRecovery
  harnessApi.list = async () => []
  finishHistory!([envelope]); await setImmediate()
  transport.setWorkspaceChannels(['a', 'b'])
  // Do not reanimate stale running rows while stopped snapshots are unresolved.
  let finishStopped!: (value: Awaited<ReturnType<typeof harnessApi.read>>) => void
  const stoppedView = { ...createRunView('stopped'), lifecycle: 'leased' as const, requestVersion: 1, fence: 1 }
  const stalePayload = createNativeMessage({ id: 'run-stopped', role: 'assistant', status: { type: 'running' },
    content: [{ type: 'text', text: 'stale running' }], custom: { runId: 'stopped', refs: { agentId: 'agent' }, harness: stoppedView } })
  harnessApi.list = async () => [{ conversationId: 'a', agentId: 'agent', runId: 'stopped', status: 'cancelled', requestVersion: 1, fence: 1 }]
  harnessApi.read = () => new Promise(resolve => { finishStopped = resolve })
  const stopped = transport.reloadConversation('a')
  finishHistory!([{ ...envelope, fromUid: 'agent', messageId: 'run-stopped', clientMsgNo: 'run-stopped', payload: stalePayload }])
  await setImmediate()
  const readable = useChatThreadStore.getState().conversations.a.messages.find(message => message.id === 'run-stopped')
  assert.equal(readable?.content[0].type === 'text' && readable.content[0].text, 'stale running')
  assert.equal(readable?.status?.type, 'requires-action', 'saved prose is readable without claiming the old run is active')
  assert.equal(useChatThreadStore.getState().conversations.a.isRecovering, true)
  finishStopped({ message: { ...stalePayload, status: { type: 'incomplete', reason: 'cancelled' }, metadata: { ...stalePayload.metadata,
    custom: { ...stalePayload.metadata.custom, harness: { ...stoppedView, lifecycle: 'cancelled' } } } } } as Awaited<ReturnType<typeof harnessApi.read>>)
  await stopped
  assert.equal(useChatThreadStore.getState().conversations.a.messages.find(message => message.id === 'run-stopped')?.status?.type, 'incomplete')
  assert.equal(useChatThreadStore.getState().conversations.a.isRecovering, false)
  harnessApi.list = async () => []
  const cancelled = transport.loadConversation('b')
  const oldFinish = finishHistory!
  transport.cancelConversationLoad('b')
  assert.equal(signal?.aborted, true, 'switch cancellation reaches HTTP')
  const replacement = transport.loadConversation('b')
  oldFinish([envelope]); await cancelled
  assert.equal(useChatThreadStore.getState().conversations.b.messages.length, 0)
  finishHistory!([]); await replacement
  projectId = 'other'; transport.setWorkspaceChannels(['a'])
  assert.deepEqual(useChatThreadStore.getState().conversations, {})
})
