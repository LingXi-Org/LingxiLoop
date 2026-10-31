import { createNativeMessage, deserializeMessage, serializeMessage } from '../../../lib/nativeMessage'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'
import { convertEnvelope } from './converter'
import { applyRunSnapshot, needsRunStream } from './run-updates'
import { RunStreamProjection } from '../../../../server/src/agent-runtime/assistant-transport'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'
import { getLingxiMessageMetadata as metadata } from './model'
import { EMPTY_CONVERSATION_CHAT_STATE, mergeCanonicalMessages, resetChatThreadStore, useChatThreadStore } from './store'

const projections = new Map<string, RunStreamProjection>()
beforeEach(() => projections.clear())
function project(item: RunStreamEvent, runId = 'run', canControl = true) {
  let projection = projections.get(runId)
  if (!projection) { projection = new RunStreamProjection(runId, canControl); projections.set(runId, projection) }
  return projection.apply(item)
}
function applyRunUpdate(state: typeof EMPTY_CONVERSATION_CHAT_STATE, target: { conversationId: string; agentId: string; runId: string; threadId?: string },
  item: RunStreamEvent, participant?: (typeof participants)['agent'], response?: { events: import('@lyyzka/lingxios/ui').RunEvent[]; canControl: boolean }) {
  if (response) {
    if (!projections.has(target.runId)) { const projection = new RunStreamProjection(target.runId, response.canControl); projection.apply(item); projections.set(target.runId, projection) }
    for (const event of response.events) project({ type: 'event', event }, target.runId)
  }
  return applyRunSnapshot(state, target, project(item, target.runId), participant)
}

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
    payload: createNativeMessage({ id: id, role: 'user', createdAt: new Date(epoch + offset).toISOString(), content: [{ type: 'text', text: id }] }) }
  const message = convertEnvelope(envelope, { participants, meId: 'human' })
  return { ...message, metadata: { ...message.metadata, custom: { ...metadata(message), sequence } } } as ThreadMessage
}
const event = (draft: string): RunStreamEvent => ({ type: 'preview', preview: {
  kind: 'snapshot', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', seq: 1, draft,
} })

test('delivery identities stay with their exact result across replay and revision', () => {
  const original = project({ type: 'state', state: snapshot() })
  if (original.message.role !== 'assistant') throw new Error('Expected assistant snapshot')
  const envelope = sent('accepted-original', 7)
  envelope.payload = { ...original.message, metadata: { ...original.message.metadata,
    custom: { ...original.message.metadata.custom, sourceMessageId: 'accepted-original' } } }
  const canonical = convertEnvelope(envelope, { participants, meId: 'human' })
  const history = { ...EMPTY_CONVERSATION_CHAT_STATE, messages: [canonical] }
  const replay = applyRunSnapshot(history, target, original)
  assert.equal(metadata(replay.messages[0]).sourceMessageId, 'accepted-original')
  assert.equal(metadata(replay.messages[0]).sequence, 7)

  const next = snapshot('run', 'leased')
  next.run.requestVersion = 2; next.run.fence = 2
  const revised = project({ type: 'state', state: next })
  const current = applyRunSnapshot(history, target, revised)
  const record = metadata(current.messages[0])
  assert.equal(record.sourceMessageId, undefined, 'the earlier visualization owner cannot authorize a later result')
  assert.equal(record.imMessageId, undefined)
  assert.equal(record.sequence, null)
  assert.equal(record.clientMessageId, revised.message.id)
  assert.equal(metadata(mergeCanonicalMessages([canonical], current.messages)[0]).sourceMessageId, undefined)
})

test('message updates require a recorded run timestamp and preserve it during previews', () => {
  assert.throws(() => project(event('preview')), /state must precede/)
  projections.clear()
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE,target,{ type: 'state', state: snapshot('run','leased') })
  state = applyRunUpdate(state,target,event('preview'))
  assert.equal(state.messages[0].createdAt.getTime(),epoch+2000)
})

test('snapshot presentation follows rich content and clears stale card styling when content becomes text', () => {
  const response = project({ type: 'state', state: snapshot('run', 'leased') })
  if (response.message.role !== 'assistant') throw new Error('Expected assistant snapshot')
  const card: AgentRunSnapshot = { ...response, message: { ...response.message, role: 'assistant', status: { type: 'running' }, content: [
    { type: 'generative-ui', spec: { root: { component: 'Text', props: { value: '可交互讲解' } } } },
  ] } }
  const rendered = applyRunSnapshot(EMPTY_CONVERSATION_CHAT_STATE, target, card)
  assert.equal(metadata(rendered.messages[0]).presentation, 'special-card')
  const text: AgentRunSnapshot = { ...response, message: { ...response.message, content: [{ type: 'text', text: '文字讲解' }] } }
  assert.equal(metadata(applyRunSnapshot(rendered, target, text).messages[0]).presentation, 'conversation')
})

function sent(id: string, sequence: number, runId = 'run'): ImEnvelope {
  return { channelId: 'room',channelType: 2,fromUid: 'agent',messageId: id,clientMsgNo: id,
    messageSeq: sequence,timestamp: (epoch + sequence * 1000) / 1000,
    payload: createNativeMessage({ id: id, role: 'assistant', createdAt: new Date(epoch + sequence * 1000).toISOString(), content: [{ type: 'text', text: id }], custom: { refs: { runId,agentId: 'agent' } } }) }
}

test('same-result snapshots preserve canonical IM fallback content while updating run controls', () => {
  const response = project({ type: 'state', state: snapshot() })
  if (response.message.role !== 'assistant') throw new Error('Expected assistant snapshot')
  const harness = response.message.metadata.custom.harness as unknown as import('@/lib/agentRunSnapshot').RunDisplayState
  const replay: AgentRunSnapshot = { message: { ...response.message, content: [
    { type: 'generative-ui', spec: { root: { component: 'Text', props: { value: '未提交的交互讲解' } } } },
  ], metadata: { ...response.message.metadata, custom: { ...response.message.metadata.custom,
    harnessControl: false, harness: { ...harness, delivery: 'pending', lastSeq: harness.lastSeq + 1 },
  } } } }
  const envelope = sent('result-run', 3)
  envelope.payload = { ...response.message, content: [{ type: 'text', text: '保留已送达的文字讲解' }] }
  const canonical = convertEnvelope(envelope, { participants, meId: 'human' })
  const history = { ...EMPTY_CONVERSATION_CHAT_STATE, messages: [canonical] }
  const replayed = applyRunSnapshot(history, target, replay)
  assert.deepEqual(replayed.messages[0].content, canonical.content)
  assert.deepEqual({ presentation: metadata(replayed.messages[0]).presentation, sequence: metadata(replayed.messages[0]).sequence,
    control: metadata(replayed.messages[0]).harnessControl, harness: metadata(replayed.messages[0]).harness },
  { presentation: 'conversation', sequence: 3, control: false, harness: { ...harness, delivery: 'delivered', lastSeq: harness.lastSeq + 1 } })

  if (replay.message.role !== 'assistant') throw new Error('Expected assistant replay')
  const next: AgentRunSnapshot = { message: { ...replay.message, metadata: { ...replay.message.metadata,
    custom: { ...replay.message.metadata.custom, harness: { ...harness, resultId: 'next-result', fence: harness.fence + 1,
      messageFence: harness.messageFence + 1, requestVersion: harness.requestVersion + 1, lastSeq: harness.lastSeq + 2 } } } } }
  assert.deepEqual(applyRunSnapshot(replayed, target, next).messages[0].content, replay.message.content)
})

test('sent messages, native final citations and interleaved users survive replay and reload in IM order', () => {
  const first = user('first',1,1000), followup = user('followup',4,4000)
  const bubbles = [sent('lead-in',2),sent('example',3)].map(envelope => convertEnvelope(envelope,{ participants,meId: 'human' }))
  let state = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,messages: [first] },target,
    { type: 'state',state: snapshot('run','leased') },participants.agent)
  state = { ...state,messages: mergeCanonicalMessages(state.messages,[...bubbles,followup]) }
  state = applyRunUpdate(state,target,event('最后一步'),participants.agent)
  assert.deepEqual(state.messages.map(message => message.id),['first','lead-in','example','run-run','followup'])
  assert.equal(Object.keys(state.activeRuns).length,1)

  const completed = snapshot()
  const body = '最后的结论见[资料](#cite-S1)'
  completed.message!.body = body
  completed.message!.envelope.body = body
  completed.message!.envelope.citations = [{ start: 6,end: body.length,text: '资料',markers: ['S1'],support: 'not_assessed',
    sources: [{ sourceId: 'source',sourceVersion: 'v1',chunkIds: ['chunk'] }] }]
  state = applyRunUpdate(state,target,{ type: 'state',state: completed },participants.agent)
  const envelope = sent('result-run',5)
  envelope.payload = project({ type: 'state', state: completed }).message
  const result = convertEnvelope(envelope,{ participants,meId: 'human' })
  state = { ...state,messages: mergeCanonicalMessages(state.messages,[result,...bubbles,result]) }
  state = applyRunUpdate(state,target,event('旧草稿'),participants.agent)
  assert.deepEqual(state.messages.map(message => message.id),['first','lead-in','example','followup','run-run'])
  assert.deepEqual(state.messages.at(-1)!.content,result.content)
  assert.deepEqual(state.activeRuns,{})
  assert.deepEqual(state.messages.slice(1,3).map(message => message.content),bubbles.map(message => message.content))

  const reloaded = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,
    messages: mergeCanonicalMessages([],[result,followup,...bubbles,first]) },target,{ type: 'state',state: completed },participants.agent)
  assert.deepEqual(reloaded.messages.map(message => [message.id,message.content,metadata(message).sequence]),
    state.messages.map(message => [message.id,message.content,metadata(message).sequence]))
})

test('a run discovered after a sent message owns a separate preview and cannot erase sent text on cancellation or failure', () => {
  const bubble = convertEnvelope(sent('already-sent',1),{ participants,meId: 'human' })
  for (const kind of ['run.cancelled','run.failed'] as const) {
    projections.clear()
    let state = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,messages: [bubble] },target,
      { type: 'state',state: snapshot('run','leased') },participants.agent)
    state = applyRunUpdate(state,target,event('尚未发送的部分'),participants.agent)
    state = applyRunUpdate(state,target,{ type: 'event',event: { runId: 'run',seq: 3,kind,
      stage: kind === 'run.failed' ? 'failed' : 'completed',visibility: 'user',data: { error: 'fixture failure' } } },participants.agent)
    assert.deepEqual(state.messages.map(message => message.id),['already-sent','run-run'])
    assert.deepEqual(state.messages[0].content,bubble.content)
    assert.equal(metadata(state.messages[0]).harness,undefined)
    assert.equal(state.messages[0].status?.type,'complete')
    assert.deepEqual(state.activeRuns,{})
    assert.equal(state.messages[1].status?.type,'incomplete')
  }
})

test('a durable failed snapshot replaces session-only drafts and matches fresh history', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE,target,{ type: 'state',state: snapshot('run','leased') },participants.agent)
  state = applyRunUpdate(state,target,event('完整段落\n\n尚未完成的尾段'),participants.agent)
  assert.match(JSON.stringify(state.messages[0].content),/完整段落/)
  state = applyRunUpdate(state,target,{ type: 'event',event: { runId: 'run',seq: 8,kind: 'run.failed',stage: 'failed',visibility: 'user',
    data: { error: 'The operation was aborted due to timeout' } } },participants.agent)
  assert.deepEqual(state.activeRuns,{})
  assert.deepEqual(state.messages[0].content,[])
  assert.deepEqual(state.messages[0].status,{ type: 'incomplete',reason: 'error' })
  assert.equal(metadata(state.messages[0]).harnessError,'这次任务未能完成，请稍后重试。')
  state = applyRunUpdate(state,target,{ type: 'state',state: { ...snapshot('run','failed'), run: {
    ...snapshot('run','failed').run, error: 'The operation was aborted due to timeout',
  } } },participants.agent)
  const freshProjection=new RunStreamProjection('run',true)
  const freshSnapshot=freshProjection.apply({type:'state',state:{...snapshot('run','failed'),run:{...snapshot('run','failed').run,error:'The operation was aborted due to timeout'}}})
  const fresh=applyRunSnapshot(EMPTY_CONVERSATION_CHAT_STATE,target,freshSnapshot,participants.agent)
  assert.deepEqual(state.messages[0].content,fresh.messages[0].content)
  assert.deepEqual(state.messages[0].content,[])
  assert.equal(metadata(state.messages[0]).harnessError,'这次任务未能完成，请稍后重试。')
  assert.deepEqual(mergeCanonicalMessages(state.messages,state.messages)[0].content,[])
  state = applyRunUpdate(state,target,{ type: 'state',state: { ...snapshot('run','leased'), run: {
    ...snapshot('run','leased').run, fence: 2, requestVersion: 2,
  } } },participants.agent)
  assert.deepEqual(state.messages[0].content,[])
  assert.equal(metadata(state.messages[0]).harnessError,undefined)
})

test('live replies follow the triggering user despite clock skew, late receipts and late source events', () => {
  let state = { ...EMPTY_CONVERSATION_CHAT_STATE, messages: [user('older',1,0),user('first',null,5000)] }
  state = applyRunUpdate(state,target,{ type: 'state',state: snapshot('run','leased') },participants.agent)
  assert.deepEqual(state.messages.map(message => message.id),['older','first','run-run'])
  state = applyRunUpdate(state,target,event('正在回答'),participants.agent)
  state = { ...state,messages: mergeCanonicalMessages(state.messages,[user('followup',3,6000)]) }
  state = applyRunUpdate(state,target,{ type: 'event',event: { runId: 'run',seq: 2,kind: 'run.started',stage: 'started',visibility: 'user',data: { sourceRef: 'first' } } },participants.agent)
  state = { ...state,messages: mergeCanonicalMessages(state.messages,[user('first',2,5000)]) }
  assert.deepEqual(state.messages.map(message => message.id),['older','first','run-run','followup'])

  projections.clear()
  state = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,messages: [user('older',1,0)] },target,
    { type: 'state',state: snapshot('run','leased') },participants.agent)
  state = applyRunUpdate(state,target,{ type: 'event',event: { runId: 'run',seq: 1,kind: 'run.started',stage: 'started',visibility: 'user',data: { sourceRef: 'first' } } },participants.agent)
  state = { ...state,messages: mergeCanonicalMessages(state.messages,[user('first',2,5000),user('followup',3,6000)]) }
  assert.deepEqual(state.messages.map(message => message.id),['older','first','run-run','followup'])
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
  assert.deepEqual(state.messages.map(message => message.id), ['first', 'run-run', 'followup'])
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot() }, participants.agent)
  const preview = state.messages[1]!
  const committed = { ...preview, metadata: { ...preview.metadata,
    custom: { ...metadata(preview), clientMessageId: 'result-run', sequence: 3, positionAfter: undefined } } } as ThreadMessage
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [committed]) }
  state = applyRunUpdate(state, target, delta, participants.agent)
  assert.deepEqual(state.messages.map(message => message.id), ['first', 'followup', 'run-run'])
  assert.deepEqual(state.messages[2]!.content, [{ type: 'text', text: 'run 的完整历史回复',
    providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }])
  assert.deepEqual(state.messages.map(message => [metadata(message).groupStart, metadata(message).groupEnd]),
    [[true, false], [false, true], [true, true]])
})

test('snapshots preserve IM order after reload and older history does not move the reply', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot() }, participants.agent)
  const reply = state.messages[0]!
  const canonical = { ...reply, metadata: { ...reply.metadata,
    custom: { ...metadata(reply), sequence: 3, positionAfter: undefined } } } as ThreadMessage
  state = { ...state, messages: mergeCanonicalMessages([], [user('first', 1, 1000), user('followup', 2, 3000), canonical]) }
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot() }, participants.agent)
  state = { ...state, messages: mergeCanonicalMessages(state.messages, [user('older', 0, 0)]) }
  assert.deepEqual(state.messages.map(message => message.id), ['older', 'first', 'followup', 'run-run'])
  assert.equal(state.messages[3]!.status?.type, 'complete')
  assert.equal(state.messages[3]!.createdAt.getTime(), epoch + 2000)
})

test('memory activity survives run replies, HTTP replay and IM merging', () => {
  const events = [
    { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started' as const, visibility: 'user' as const,
      data: { toolCallId: 'host:memory', name: 'memory.apply' } },
    { runId: 'run', seq: 2, kind: 'tool.completed', stage: 'completed' as const, visibility: 'user' as const,
      data: { toolCallId: 'host:memory', result: { status: 'completed', value: {
        documents: [{ id: 'memory', title: '偏好', description: '喜欢中文', version: 1, status: 'active', body: 'private' }], deleted: [],
      } } } },
  ]
  const response = { ...snapshot(), events, nextSeq: 2, diagnostics: null, canControl: true }
  const state = applyRunUpdate({ ...EMPTY_CONVERSATION_CHAT_STATE,
    messages: [convertEnvelope(sent('lead-in', 1), { participants, meId: 'human' })] }, target,
  { type: 'state', state: response }, participants.agent, response)
  assert.equal(metadata(state.messages[0]).memory, undefined)
  const main = state.messages[1], memory = metadata(main).memory
  assert.equal(memory, undefined)
  const call = main.content.find(part => part.type === 'tool-call' && part.toolName === 'memory.apply')
  assert.ok(call?.type === 'tool-call')
  assert.deepEqual((call.result as { memory: unknown }).memory, { chips: [{ id: 'memory', text: '喜欢中文', version: 1, change: 'added' }] })
  assert.doesNotMatch(JSON.stringify(main), /private/)
  const committed = { ...main, metadata: { ...main.metadata,
    custom: { ...metadata(main), sequence: 2, clientMessageId: 'canonical' } } } as ThreadMessage
  const merged = mergeCanonicalMessages(state.messages, [committed])
  assert.deepEqual(merged[1].content, main.content)
  assert.deepEqual(metadata(merged[1]).memory, memory)
  assert.deepEqual(applyRunUpdate({ ...state, messages: merged }, target, { type: 'state', state: response }, participants.agent, response)
    .messages.map(message => metadata(message).memory), [undefined, memory])
  const stale = { ...response, memory: { chips: [{ id: 'memory', text: 'stale' }], calls: {}, revision: 1 } }
  assert.deepEqual(metadata(applyRunUpdate(state, target, { type: 'state', state: stale }, participants.agent, stale).messages[1]).memory, memory)
  assert.deepEqual(applyRunUpdate(state, target, { type: 'state', state: stale }, participants.agent, stale).messages[1].content, main.content)
})

test('reload keeps interleaved user clusters when run start times disagree with committed message order', () => {
  const messages: ThreadMessage[] = []
  for (let turn = 1; turn <= 3; turn++) {
    messages.push(user(`user-${turn}`, turn * 2 - 1, turn * 1000))
    const completed = snapshot(`run-${turn}`)
    const envelope = sent(`reply-${turn}`, turn * 2, `run-${turn}`)
    envelope.payload = new RunStreamProjection(`run-${turn}`,true).apply({ type: 'state',state: completed }).message
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
  assert.deepEqual(state.messages[0]!.content, [{ type: 'text', text: 'run 的完整历史回复',
    providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }])
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
    payload: project({ type: 'state', state: completed }).message }
  const replay = convertEnvelope(im, { participants, meId: 'human' })
  assert.deepEqual(state.messages[0].content, replay.content)
  const claims = state.messages[0].content.find(part => part.type === 'data' && part.name === 'citation-claims')
  assert.ok(claims?.type === 'data')
  assert.deepEqual(claims.data, { claims: [{ id: 'run:result-run:2', text: '间隔复习', confidence: 'grounded',
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
  assert.deepEqual(state.messages[0].content, [])
})

test('different PDF ranges retain their exact markers and page text through refresh and IM persistence', () => {
  const completed = snapshot()
  const body = '[导读介绍 Q、K、V](#cite-S1)，[交叉注意力允许不同序列](#cite-S2)，[再次查看导读](#cite-S1)。'
  const evidence = [
    { marker: 'S1', sourceId: 'pdf', sourceVersion: 'v1', chunkId: 'pdf:0:6797', title: '注意力手册', excerpt: '[[PAGE:2]]\n导读：介绍 Q、K、V。', truncated: true },
    { marker: 'S2', sourceId: 'pdf', sourceVersion: 'v1', chunkId: 'pdf:6797:19204', title: '注意力手册', excerpt: '[[PAGE:15]]\n交叉注意力：Q、K、V 可以来自不同序列。', truncated: true },
  ]
  completed.message!.body = body
  completed.message!.envelope = { ...completed.message!.envelope, body, citationEvidence: evidence,
    citations: [...body.matchAll(/\[([^\]]+)\]\(#cite-(S\d+)\)/g)].map(match => ({
      start: match.index, end: match.index + match[0].length, text: match[1], markers: [match[2]], support: 'not_assessed' as const,
      sources: [{ sourceId: 'pdf', sourceVersion: 'v1', chunkIds: evidence.filter(item => item.marker === match[2]).map(item => item.chunkId), truncated: true as const }],
    })) }
  const live = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: completed }, participants.agent)
  const persisted = JSON.parse(JSON.stringify(serializeMessage(live.messages[0])))
  const restored = deserializeMessage(persisted)
  assert.deepEqual(restored.content, live.messages[0].content)
  const refreshed = new RunStreamProjection('run', true).apply({ type: 'state', state: JSON.parse(JSON.stringify(completed)) })
  assert.deepEqual(refreshed.message.content, restored.content)
  const replay = convertEnvelope({ channelId: 'room', channelType: 2, fromUid: 'agent', messageId: 'committed', clientMsgNo: 'committed',
    messageSeq: 1, timestamp: epoch, payload: persisted }, { participants, meId: 'human' })
  assert.deepEqual(replay.content, restored.content)
  const claims = restored.content.find(part => part.type === 'data' && part.name === 'citation-claims')
  assert.ok(claims?.type === 'data')
  assert.deepEqual((claims.data as { claims: { evidence: unknown[] }[] }).claims.map(claim => claim.evidence), [[evidence[0]], [evidence[1]], [evidence[0]]])
})

test('paragraph deltas display immediately, deduplicate, and cancellation clears uncommitted drafts', () => {
  let state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot('run', 'leased') })
  state = applyRunUpdate(state, target, event('第一段'))
  assert.deepEqual(state.messages[0]!.content, [{type:'text',text:'第一段',
    providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }])
  const delta: RunStreamEvent = { type: 'preview', preview: { kind: 'delta', runId: 'run', fence: 1,
    requestVersion: 1, attemptId: 'attempt', fromSeq: 1, seq: 2, delta: '\n\n第二段 **正在' } }
  state = applyRunUpdate(state, target, delta)
  state = applyRunUpdate(state, target, delta)
  const content = [{type:'text',text:'第一段\n\n第二段 **正在',
    providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }]
  assert.deepEqual(state.messages[0]!.content, content)
  state = applyRunUpdate(state, target, { type: 'event', event: { runId: 'run', seq: 3,
    kind: 'run.cancelled', stage: 'completed', visibility: 'user', data: {} } })
  state = applyRunUpdate(state, target, { type: 'state', state: snapshot('run', 'cancelled') })
  assert.deepEqual(state.messages[0]!.content, [])
  assert.deepEqual(state.messages[0]!.status, { type: 'incomplete', reason: 'cancelled' })
  assert.deepEqual(mergeCanonicalMessages(state.messages, state.messages)[0]!.content, [])
  assert.deepEqual(state.activeRuns, {})
})

test('a reply at the page boundary leaves room for subsequently loaded older history', () => {
  const state = applyRunUpdate(EMPTY_CONVERSATION_CHAT_STATE, target, { type: 'state', state: snapshot() }, participants.agent)
  const messages = mergeCanonicalMessages(state.messages, [user('older', 1, 1000), user('newer', 3, 3000)])
  assert.deepEqual(messages.map(message => message.id), ['older', 'run-run', 'newer'])
})

test('initial history is ready before slow run snapshots, which merge without duplicate replies', async () => {
  resetChatThreadStore()
  const subscribed: string[] = []
  const callbacks = new Map<string, (item: AgentRunSnapshot) => void>()
  const cancelled: string[] = []
  let receiveIm!: (envelope: ImEnvelope) => void
  const imHistory: ImEnvelope[] = []
  let deferReads = true
  mock.module('@/api/core/realtime', { namedExports: { ws: { connect: async () => {},on: () => () => {} } } })
  mock.module('@/features/agents/api', { namedExports: { agentsApi: {} } })
  mock.module('@/features/agents/state', { namedExports: { useParticipants: { getState: () => ({ byId: participants }) } } })
  mock.module('@/features/conversations/store', { namedExports: { useConversations: { getState: () => ({ list: [{ id: 'room', members: ['human', 'agent'] }] }) } } })
  mock.module('@/features/chat/api', { namedExports: { messagesApi: {} } })
  mock.module('@/api/questionnaires', { namedExports: { questionnairesApi: {} } })
  mock.module('@/stores/auth', { namedExports: { getMeId: () => 'human', getActiveCompanyId: () => null } })
  mock.module('@/lib/im/wukong', { namedExports: { lingxiIm: { history: async () => imHistory,
    onConnected: () => () => {},
    connect: async () => {},disconnect: () => {},subscribe: (receive: typeof receiveIm) => { receiveIm = receive; return () => {} } } } })
  mock.module('./harness-api', { namedExports: { harnessApi: {
    history: async () => [],
    cancel: async ({ runId }: typeof target) => {
      cancelled.push(runId)
      if (runId === 'reject') throw new Error('unavailable')
      return { cancelled: true }
    },
    list: async () => ['run', 'second', 'active'].map(runId => ({ ...target, runId, requestVersion: 1, fence: 1,
      status: runId === 'active' ? 'leased' : 'succeeded' })),
    read: (runTarget: typeof target) => deferReads ? new Promise<AgentRunSnapshot>(resolve => { callbacks.set(runTarget.runId, resolve) })
      : Promise.resolve(project({ type: 'state', state: snapshot(runTarget.runId) }, runTarget.runId)),
    subscribe: (runTarget: typeof target, receive: (item: AgentRunSnapshot) => void, signal: AbortSignal) => {
      subscribed.push(runTarget.runId); callbacks.set(runTarget.runId, receive)
      return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    },
  } } })
  const originalWindow = globalThis.window
  globalThis.window = { setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {}, clearTimeout: () => {},
    addEventListener: () => {}, removeEventListener: () => {} } as unknown as Window & typeof globalThis
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
    assert.equal(useChatThreadStore.getState().conversations.room?.isLoading, false)
    assert.deepEqual(batches, [[]])
    callbacks.get('run')!(project({ type: 'state', state: snapshot() }))
    callbacks.get('second')!(project({ type: 'state', state: snapshot('second') },'second'))
    deferReads = false
    await loading
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(batches.at(-1), ['run-run', 'run-second'])
    assert.deepEqual(subscribed, ['active'])
    const messages = useChatThreadStore.getState().conversations.room!.messages
    assert.deepEqual(messages.slice(0, 2).map(message => message.content), [
      [{ type: 'text', text: 'run 的完整历史回复',
        providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }],
      [{ type: 'text', text: 'second 的完整历史回复',
        providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }],
    ])
    callbacks.get('active')!(project({ type: 'state', state: snapshot('active', 'leased') }, 'active'))
    callbacks.get('active')!(project({ type: 'preview', preview: { ...(event('实时新内容') as Extract<RunStreamEvent, { type: 'preview' }>).preview, runId: 'active' } }, 'active'))
    assert.deepEqual(useChatThreadStore.getState().conversations.room!.messages.at(-1)!.content, [{type:'text',text:'实时新内容',
      providerMetadata: { lingxiloop: { activity: { version: 1, id: 'answer:1:0', kind: 'answer', label: '答复' } } } }])
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
    assert.deepEqual(afterSend.messages.slice(-3).map(message => message.id),['active-lead-in','active-example','run-active'])
    callbacks.get('active')!(project({ type: 'preview',preview: { ...(event('新的末条回复') as Extract<RunStreamEvent,{ type: 'preview' }>).preview,
      runId: 'active',seq: 2 } }, 'active'))
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
    assert.equal(metadata(useChatThreadStore.getState().conversations.room!.messages.find(message => metadata(message).runId === 'queued')!).harness?.lifecycle, 'queued')
  } finally {
    unsubscribe()
    transport.disconnect()
    await new Promise(resolve => setImmediate(resolve))
    globalThis.window = originalWindow
    mock.restoreAll()
  }
})

test('separate agents and child threads cannot overwrite each other', () => {
  const first = new RunStreamProjection('run-a', true).apply({ type: 'state', state: snapshot('run-a', 'leased') })
  const second = new RunStreamProjection('run-b', true).apply({ type: 'state', state: snapshot('run-b', 'leased') })
  let state = applyRunSnapshot(EMPTY_CONVERSATION_CHAT_STATE, { ...target, runId: 'run-a' }, first)
  state = applyRunSnapshot(state, { ...target, agentId: 'other-agent', runId: 'run-b', threadId: 'thread' }, second)
  assert.deepEqual(state.messages.map(message => [metadata(message).senderId, metadata(message).threadRootId]), [['agent', null], ['other-agent', 'thread']])
  assert.throws(() => applyRunSnapshot(state, target, second), /身份/)
})

// Exercise actual server projection watermarks, not an artificially metadata-free stream.
test('actual projected text deltas coalesce while preserving part revisions and final text', async () => {
  const { createSnapshotPublisher, decodeRunSnapshot } = await import('./snapshot-publication')
  for (const version of [2, 3] as const) {
  projections.clear()
  const output: AgentRunSnapshot[] = []
  const controller = new AbortController()
  const publisher = createSnapshotPublisher(value => output.push(value), controller.signal, error => { throw error }, () => () => {})
  publisher.push(decodeRunSnapshot(project({ type: 'state', state: snapshot('run', 'leased') }), target))
  const identity = { version, requestVersion: 1, fence: 1, attemptId: 'answer', partId: 'answer', partIndex: 0, purpose: 'answer',
    ...(version === 3 ? { messageId: 'answer:run:v1', segmentId: 'answer', operation: 'append', supersedes: [] } : {}) }
  if (version === 3) publisher.push(decodeRunSnapshot(project({ type: 'event', event: { runId: 'run', seq: 1, kind: 'public.text.operation', stage: 'started', visibility: 'user', data: identity } }), target))
  for (let index = 0; index < 25; index++) {
    const response = project({ type: 'event', event: { runId: 'run', seq: index + 2, kind: 'public.text.delta', stage: 'delta', visibility: 'user', data: {
      ...identity, chunkIndex: index, text: '正文',
    } } })
    publisher.push(decodeRunSnapshot(response, target))
  }
  assert.equal(output.length, version === 3 ? 3 : 2, 'initial snapshot and first body publish immediately; later text waits for one frame')
  publisher.flush(); publisher.dispose()
  assert.equal(output.length, version === 3 ? 4 : 3)
  const last = output.at(-1)!
  assert.equal(last.message.content[0].type === 'text' && last.message.content[0].text, '正文'.repeat(25))
  assert.equal(last.message.metadata.custom.harness && Reflect.get(last.message.metadata.custom.harness, 'lastSeq'), 26)
  }
})
