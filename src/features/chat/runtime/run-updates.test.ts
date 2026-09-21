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

function sent(id: string, sequence: number, runId = 'run'): ImEnvelope {
  return { channelId: 'room',channelType: 2,fromUid: 'agent',messageId: id,clientMsgNo: id,
    messageSeq: sequence,timestamp: (epoch + sequence * 1000) / 1000,
    payload: { version: 1,kind: 'text',clientMsgNo: id,body: id,refs: { runId,agentId: 'agent' } } }
}

test('sent bubbles, native final citations and interleaved users survive replay and reload in IM order', () => {
  const first = user('first',1,1000), followup = user('followup',4,4000)
  const bubbles = [sent('lead-in',2),sent('example',3)].map(envelope => convertEnvelope(envelope,{ participants,meId: 'human' }))
  let state = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,messages: [first] },target,
    { type: 'state',state: snapshot('run','leased') },participants.agent)
  state = { ...state,messages: mergeCanonicalMessages(state.messages,[...bubbles,followup]) }
  state = applyRunUpdate(state,target,event('最后一步'),participants.agent)
  assert.deepEqual(state.messages.map(message => message.id),['first','lead-in','example','preview-run','followup'])
  assert.equal(Object.keys(state.activeRuns).length,1)

  const completed = snapshot()
  const body = '最后的结论见[资料](#cite-S1)'
  completed.message!.body = body
  completed.message!.envelope.body = body
  completed.message!.envelope.citations = [{ start: 6,end: body.length,text: '资料',markers: ['S1'],support: 'not_assessed',
    sources: [{ sourceId: 'source',sourceVersion: 'v1',chunkIds: ['chunk'] }] }]
  state = applyRunUpdate(state,target,{ type: 'state',state: completed },participants.agent)
  const envelope = sent('result-run',5)
  envelope.payload.body = body
  envelope.payload.data = { harness: completed.message!.envelope,harnessSessionId: 'session',harnessCommit: { resultId: 'result-run',fence: 1 } }
  const result = convertEnvelope(envelope,{ participants,meId: 'human' })
  state = { ...state,messages: mergeCanonicalMessages(state.messages,[result,...bubbles,result]) }
  state = applyRunUpdate(state,target,event('旧草稿'),participants.agent)
  assert.deepEqual(state.messages.map(message => message.id),['first','lead-in','example','followup','result-run'])
  assert.deepEqual(state.messages.at(-1)!.content,result.content)
  assert.deepEqual(state.activeRuns,{})
  assert.deepEqual(state.messages.slice(1,3).map(message => message.content),bubbles.map(message => message.content))

  const reloaded = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,
    messages: mergeCanonicalMessages([],[result,followup,...bubbles,first]) },target,{ type: 'state',state: completed },participants.agent)
  assert.deepEqual(reloaded.messages.map(message => [message.id,message.content,metadata(message).sequence]),
    state.messages.map(message => [message.id,message.content,metadata(message).sequence]))
})

test('a run discovered after a sent bubble owns a separate preview and cannot erase sent text on cancellation or failure', () => {
  const bubble = convertEnvelope(sent('already-sent',1),{ participants,meId: 'human' })
  for (const kind of ['run.cancelled','run.failed'] as const) {
    let state = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,messages: [bubble] },target,
      { type: 'state',state: snapshot('run','leased') },participants.agent)
    state = applyRunUpdate(state,target,event('尚未发送的部分'),participants.agent)
    state = applyRunUpdate(state,target,{ type: 'event',event: { runId: 'run',seq: 3,kind,
      stage: kind === 'run.failed' ? 'failed' : 'completed',visibility: 'user',data: { error: 'fixture failure' } } },participants.agent)
    assert.deepEqual(state.messages.map(message => message.id),['already-sent','preview-run'])
    assert.deepEqual(state.messages[0].content,bubble.content)
    assert.equal(metadata(state.messages[0]).harness,undefined)
    assert.equal(state.messages[0].status?.type,'complete')
    assert.deepEqual(state.activeRuns,{})
    assert.equal(state.messages[1].status?.type,'incomplete')
  }
})

test('a failure clears uncommitted previews and active state while preserving the specific error', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE,target,{ type: 'state',state: snapshot('run','leased') },participants.agent)
  state = applyRunUpdate(state,target,event('尚未验收的草稿'),participants.agent)
  state = applyRunUpdate(state,target,{ type: 'event',event: { runId: 'run',seq: 8,kind: 'run.failed',stage: 'failed',visibility: 'user',
    data: { error: 'Final assessment protocol correction exhausted' } } },participants.agent)
  assert.deepEqual(state.activeRuns,{})
  assert.deepEqual(state.messages[0].content,[])
  assert.deepEqual(state.messages[0].status,{ type: 'incomplete',reason: 'error' })
  assert.equal(metadata(state.messages[0]).harnessError,'Final assessment protocol correction exhausted')
})

test('a live reply keeps its anchor until canonical delivery establishes IM order', () => {
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
  assert.deepEqual(state.messages.map(message => message.id), ['first', 'followup', 'result-run'])
  assert.deepEqual(state.messages[2]!.content, [{ type: 'text', text: 'run 的完整历史回复' }])
  assert.deepEqual(state.messages.map(message => [metadata(message).groupStart, metadata(message).groupEnd]),
    [[true, false], [false, true], [true, true]])
})

test('snapshots preserve IM order after reload and older history does not move the reply', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot() }, participants.agent)
  const reply = state.messages[0]!
  const canonical = { ...reply, createdAt: new Date(epoch + 4000), metadata: { ...reply.metadata,
    custom: { ...metadata(reply), sequence: 3, positionAfter: undefined } } } as ThreadMessage
  state = { ...state, messages: mergeCanonicalMessages([], [user('first', 1, 1000), user('followup', 2, 3000), canonical]) }
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot() }, participants.agent)
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [user('older', 0, 0)]) }
  assert.deepEqual(state.messages.map(message => message.id), ['older', 'first', 'followup', 'preview-run'])
  assert.equal(state.messages[3]!.status?.type, 'complete')
  assert.equal(state.messages[3]!.createdAt.getTime(), epoch + 4000)
})

test('committed memory summaries belong to the main run reply and survive HTTP replay and IM merging', () => {
  const events = [
    { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started' as const, visibility: 'user' as const,
      data: { toolCallId: 'host:memory', name: 'memory.apply' } },
    { runId: 'run', seq: 2, kind: 'tool.completed', stage: 'completed' as const, visibility: 'user' as const,
      data: { toolCallId: 'host:memory', result: { status: 'completed', value: {
        documents: [{ id: 'memory', description: '喜欢中文', status: 'active', body: 'private' }], deleted: [],
      } } } },
  ]
  const response = { ...snapshot(), events, nextSeq: 2, diagnostics: null, canControl: true }
  const state = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,
    messages: [convertEnvelope(sent('lead-in', 1), { participants, meId: 'human' })] }, target,
  { type: 'state', state: response }, participants.agent, response)
  assert.equal(metadata(state.messages[0]).memory, undefined)
  const main = state.messages[1], memory = metadata(main).memory
  assert.deepEqual(memory?.chips, [{ id: 'memory', text: '喜欢中文' }])
  const committed = { ...main, id: 'canonical', metadata: { ...main.metadata,
    custom: { ...metadata(main), sequence: 2, clientMessageId: 'canonical', memory: undefined } } } as ThreadMessage
  const merged = mergeCanonicalMessages(state.messages, [committed])
  assert.deepEqual(metadata(merged[1]).memory, memory)
  assert.deepEqual(applyRunUpdate({ ...state, messages: merged }, target, { type: 'state', state: response }, participants.agent, response)
    .messages.map(message => metadata(message).memory), [undefined, memory])
  const stale = { ...response, memory: { chips: [{ id: 'memory', text: 'stale' }], calls: {}, revision: 1 } }
  assert.deepEqual(metadata(applyRunUpdate(state, target, { type: 'state', state: stale }, participants.agent, stale).messages[1]).memory, memory)
})

test('reload keeps interleaved user clusters when run start times disagree with committed message order', () => {
  const messages: ThreadMessage[] = []
  for (let turn = 1; turn <= 3; turn++) {
    messages.push(user(`user-${turn}`, turn * 2 - 1, turn * 1000))
    const completed = snapshot(`run-${turn}`)
    const envelope = sent(`reply-${turn}`, turn * 2, `run-${turn}`)
    envelope.payload.body = completed.message!.body
    envelope.payload.data = { harness: completed.message!.envelope, harnessSessionId: 'session',
      harnessCommit: { resultId: `result-run-${turn}`, fence: 1 } }
    messages.push(convertEnvelope(envelope, { participants, meId: 'human' }))
  }
  let state = { ...EMPTY_CONVERSATION_CHAT_STATE, messages: mergeCanonicalMessages([], messages) }
  for (const turn of [3, 1, 2, 1]) {
    state = applyRunUpdate(state, { ...target, runId: `run-${turn}` },
      { type: 'state', state: snapshot(`run-${turn}`) }, participants.agent)
  }
  assert.deepEqual(state.messages.map(message => [message.id, message.createdAt]),
    messages.map(message => [message.id, message.createdAt]))
  assert.deepEqual(state.messages.map(message => [metadata(message).groupStart, metadata(message).groupEnd]),
    messages.map(() => [true, true]))
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

test('citation projections agree across snapshots and IM replay and disappear before the next draft', () => {
  const completed = snapshot()
  const body = '建议[间隔复习](#cite-S1)'
  completed.message!.body = body
  completed.message!.envelope.body = body
  completed.message!.envelope.citations = [{ start: 2, end: body.length, text: '间隔复习', markers: ['S1'], support: 'not_assessed',
    sources: [{ sourceId: 'doc', sourceVersion: 'v1', chunkIds: ['chunk'] }] }]
  completed.message!.envelope.citationEvidence = [{ marker: 'S1', sourceId: 'doc', sourceVersion: 'v1', chunkId: 'chunk',
    title: '学习指南', excerpt: '间隔复习有助于记忆。' }]
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: completed }, participants.agent)
  const im: ImEnvelope = { channelId: 'room', channelType: 2, fromUid: 'agent', messageId: 'committed', clientMsgNo: 'committed', messageSeq: 1, timestamp: epoch,
    payload: { version: 1, kind: 'text', clientMsgNo: 'committed', body, refs: { runId: 'run', agentId: 'agent' },
      data: { harness: completed.message!.envelope, harnessSessionId: 'session', harnessCommit: { resultId: 'result-run', fence: 1 } } } }
  const replay = convertEnvelope(im, { participants, meId: 'human' })
  assert.deepEqual(state.messages[0].content, replay.content)
  const claims = state.messages[0].content.find(part => part.type === 'tool-call' && part.toolName === 'cite_claims')
  assert.ok(claims?.type === 'tool-call')
  assert.deepEqual(claims.result, { claims: [{ id: 'run:result-run:2', text: '间隔复习', confidence: 'grounded',
    markers: ['S1'], start: 2, end: body.length, basis: '', evidence: completed.message!.envelope.citationEvidence }] })
  state = applyRunUpdate(state, target, { type: 'state', state: structuredClone(completed) }, participants.agent)
  assert.deepEqual(state.messages[0].content, replay.content)
  state = applyRunUpdate(state, target, event('过期草稿'), participants.agent)
  assert.deepEqual(state.messages[0].content, replay.content)
  const next: RunState = { ...completed, run: { ...completed.run, status: 'queued', requestVersion: 2, fence: 2 } }
  state = applyRunUpdate(state, target, { type: 'state', state: next }, participants.agent)
  assert.deepEqual(state.messages[0].content, [])
  state = applyRunUpdate(state, target, { type: 'preview', preview: { kind: 'snapshot', runId: 'run', fence: 2,
    requestVersion: 2, attemptId: 'next', seq: 1, draft: '新的草稿' } }, participants.agent)
  assert.deepEqual(state.messages[0].content, [{ type: 'text', text: '新的草稿' }])
})

test('paragraph deltas are immediate, replay is idempotent and cancellation retains visible text', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot('run', 'leased') })
  state = applyRunUpdate(state, target, event('第一段'))
  const delta: RunStreamEvent = { type: 'preview', preview: { kind: 'delta', runId: 'run', fence: 1,
    requestVersion: 1, attemptId: 'attempt', fromSeq: 1, seq: 2, delta: '\n\n第二段 **正在' } }
  state = applyRunUpdate(state, target, delta)
  state = applyRunUpdate(state, target, delta)
  const content = [{ type: 'text', text: '第一段\n\n第二段 **正在' }]
  assert.deepEqual(state.messages[0]!.content, content)
  state = applyRunUpdate(state, target, { type: 'event', event: { runId: 'run', seq: 3,
    kind: 'run.cancelled', stage: 'completed', visibility: 'user', data: {} } })
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot('run', 'cancelled') })
  assert.deepEqual(state.messages[0]!.content, content)
  assert.deepEqual(state.messages[0]!.status, { type: 'incomplete', reason: 'cancelled' })
  assert.deepEqual(mergeCanonicalMessages(state.messages, state.messages)[0]!.content, content)
  assert.deepEqual(state.activeRuns, {})
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
  const cancelled: string[] = []
  let receiveIm!: (envelope: ImEnvelope) => void
  const imHistory: ImEnvelope[] = []
  let finishSecond!: (state: RunState) => void
  const second = new Promise<RunState>(resolve => { finishSecond = resolve })
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {},on: () => () => {} } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: participants }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => null } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { history: async () => imHistory,
    connect: async () => {},disconnect: () => {},subscribe: (receive: typeof receiveIm) => { receiveIm = receive; return () => {} } } } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    cancel: async ({ runId }: typeof target) => {
      cancelled.push(runId)
      if (runId === 'reject') throw new Error('unavailable')
      return { cancelled: true }
    },
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
  const originalWindow = globalThis.window
  globalThis.EventSource = { CLOSED: 2 } as typeof EventSource
  globalThis.window = { setInterval: () => 0,clearInterval: () => {},clearTimeout: () => {} } as unknown as Window & typeof globalThis
  const { ChatTransport, filterThreadMessages } = await import('./transport')
  const transport = new ChatTransport()
  transport.boot()
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
    const activeBefore = useChatThreadStore.getState().conversations.room!
    useChatThreadStore.setState({ conversations: { room: { ...activeBefore,typingAgentIds: ['agent'] } } })
    imHistory.push(sent('active-lead-in',10,'active'),sent('active-example',11,'active'))
    for (const envelope of [...imHistory,...imHistory]) receiveIm(envelope)
    const afterSend = useChatThreadStore.getState().conversations.room!
    assert.deepEqual(afterSend.activeRuns,activeBefore.activeRuns)
    assert.deepEqual(afterSend.typingAgentIds,['agent'])
    assert.deepEqual(afterSend.messages.slice(-3).map(message => message.id),['active-lead-in','active-example','preview-active'])
    callbacks.get('active')!({ type: 'preview',preview: { ...(event('新的末条回复') as Extract<RunStreamEvent,{ type: 'preview' }>).preview,
      runId: 'active',seq: 2 } })
    await transport.reloadConversation('room')
    const replayed = useChatThreadStore.getState().conversations.room!
    assert.equal(replayed.messages.length,5)
    assert.deepEqual(replayed.messages.filter(message => !metadata(message).harness).map(message => message.content),
      [[{ type: 'text',text: 'active-lead-in' }],[{ type: 'text',text: 'active-example' }]])
    let cancelState = EMPTY_CONVERSATION_CHAT_STATE
    for (const [runId, status, canControl] of [
      ['queued', 'queued', true], ['active', 'leased', true], ['waiting', 'waiting', true],
      ['forbidden', 'leased', false], ['reject', 'leased', true], ['done', 'succeeded', true],
    ] as const) {
      const response = { ...snapshot(runId, status), events: [], nextSeq: 0, canControl, diagnostics: {} as never }
      cancelState = applyRunUpdate(cancelState, { ...target, runId }, { type: 'state', state: response }, participants.agent, response)
    }
    useChatThreadStore.setState({ conversations: { room: cancelState } })
    const stopping = transport.cancel('room')
    assert.equal(transport.cancel('room'), stopping)
    await assert.rejects(stopping, /部分任务未能停止/)
    assert.deepEqual(cancelled, ['queued', 'active', 'waiting', 'reject'])
    assert.equal(metadata(useChatThreadStore.getState().conversations.room!.messages.find(message => metadata(message).runId === 'queued')!).harness?.lifecycle, 'succeeded')
  } finally {
    unsubscribe()
    transport.disconnect()
    globalThis.EventSource = originalEventSource
    globalThis.window = originalWindow
    mock.restoreAll()
  }
})
