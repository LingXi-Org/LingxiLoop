import { createNativeMessage } from '../../../lib/nativeMessage'
import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeAssistantMessage, createRunView, consumeRunEvent, consumeRunState, consumeRunStreamEvent, type ResponseEnvelope } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'
import type { Participant } from '@/types'
import { convertEnvelope } from './converter'
import { runMessageParts as harnessParts, runMessageStatus as harnessStatus, harnessToolParts } from '../../../../server/src/agent-runtime/message-projection'
import { getLingxiMessageMetadata } from './model'
import { mergeCanonicalMessages } from './store'
import type { MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'

const participants = { agent: { id: 'agent', kind: 'agent', name: '助手' } as Participant }

test('native response text and presentation cards retain segment order and stable identities', () => {
  const view = runView(1, 1)
  const first = { type: 'Card', version: '1', reference: 'first', fields: { title: '第一张' }, sources: [], hash: 'first' }
  const second = { ...first, reference: 'second', fields: { title: '第二张' }, hash: 'second' }
  view.message!.envelope.presentations = [first, second]
  const parts = harnessParts(view)
  assert.deepEqual(parts.filter(part => part.type === 'generative-ui'), [first, second].map(component => ({
    type: 'generative-ui', id: component.hash, spec: { root: { component: component.type, props: component.fields } },
  })))
})

test('public native tool events project into bounded assistant-ui history and survive committed IM replay', () => {
  const started = { runId: 'run',seq: 1,kind: 'tool.started',stage: 'started' as const,visibility: 'user' as const,
    data: { toolCallId: 'host:call',name: 'documents.read' } }
  const completed = { ...started,seq: 2,kind: 'tool.completed',stage: 'completed' as const,
    data: { toolCallId: 'host:call',result: { status: 'completed',value: { body: 'Do not duplicate this payload' } },isError: false } }
  const tools = harnessToolParts('run',[started,completed,{ ...started,visibility: 'internal',data: { toolCallId: 'host:private',name: 'internal' } }])
  assert.deepEqual(tools,[{ type: 'tool-call',toolCallId: 'host:call',toolName: 'documents.read',args: {},argsText: '{}',result: { status: 'completed' },isError: false,eventSeq: 2 }])
  assert.deepEqual(harnessToolParts('run',[started,completed],tools),tools)
  assert.deepEqual(harnessToolParts('another-run',[started,completed]),[])
  const message = convertEnvelope(envelope(1,1),{ participants,meId: 'human' })
  assert.ok(message.role === 'assistant')
  const replay = { ...message, content: [...message.content, ...tools.map(({ eventSeq: _seq, ...part }) => part)] }
  assert.deepEqual(mergeCanonicalMessages([message],[replay])[0].content,replay.content)
  assert.equal(harnessToolParts('run',Array.from({length: 300},(_,index)=>({ ...started,seq: index+1,data: { toolCallId: `host:${index}`,name: 'read' } }))).length,256)
})
function runView(version: number, fence: number, outcome: ResponseEnvelope['goalOutcome']['status'] = 'partial') {
  const body = '查看[原文](#cite-S1)'
  const harness: ResponseEnvelope = { version: 1, requestVersion: version, body, evidenceSnapshotId: 'evidence',
    goalOutcome: outcome === 'awaiting_approval'
      ? { status: outcome, approvalId: 'approval', requestVersion: version, verification: 'not_run' }
      : outcome === 'delegated' ? { status: outcome, taskRef: 'child', requestVersion: version, verification: 'not_run' }
        : { status: outcome, requestVersion: version, verification: 'inconclusive' },
    citations: [{ start: 2, end: body.length, text: '原文', markers: ['S1'], support: 'not_assessed',
      sources: [{ sourceId: 'doc', sourceVersion: 'revision-7', chunkIds: ['chunk'] }] }],
    artifacts: [{ path: 'output/report.txt', mime: 'text/plain', size: 4, sha256: 'a'.repeat(64), source: { ref: 'document:doc', version: '7' } }],
  }
  return { ...consumeAssistantMessage({ ...createRunView('run'), requestVersion: version, fence, lifecycle: 'succeeded' },
    { version: 2, runId: 'run', agentId: 'agent', sessionId: 'session', body, envelope: harness }, { resultId: `result-${fence}`, fence }), delivery: 'delivered' as const }
}
function envelope(version: number, fence: number, outcome: ResponseEnvelope['goalOutcome']['status'] = 'partial'): ImEnvelope {
  const current = runView(version,fence,outcome)
  const { message, draft: _draft, preview: _preview, ...control } = current
  return { channelId: 'room', channelType: 2, fromUid: 'agent', messageId: `result-${fence}`, clientMsgNo: `result-${fence}`,
    messageSeq: fence, timestamp: 1_767_225_600 + fence,
    payload: createNativeMessage({ id: 'run-run', role: 'assistant', content: harnessParts(current), status: harnessStatus(current),
      custom: { runId: 'run', refs: { runId: 'run', agentId: 'agent' }, replyToClientMsgNo: 'thread', harness: { ...control, artifacts: message!.envelope.artifacts } } }) }
}

test('native committed partial answers retain artifact hashes and provenance without appearing complete', () => {
  const native = envelope(1,1), message = convertEnvelope(native,{ participants, meId: 'human' })
  const meta = getLingxiMessageMetadata(message)
  assert.deepEqual(message.status,{ type: 'incomplete', reason: 'other' })
  assert.deepEqual(message.content, harnessParts(runView(1,1)))
  assert.deepEqual(meta.harness?.artifacts, runView(1,1).message!.envelope.artifacts)
  assert.equal(meta.harness?.delivery,'delivered')
  for (const status of ['awaiting_input','awaiting_approval','delegated'] as const) {
    assert.deepEqual(harnessStatus(runView(1,1,status)),{ type: 'requires-action', reason: 'tool-calls' })
  }
  assert.throws(() => convertEnvelope({ ...native, fromUid: 'other' }, { participants, meId: 'human' }),/身份/)
})

test('native citations keep occurrence identities, all source versions and truncation, without grading support', () => {
  const view = runView(1, 1)
  const body = '[甲](#cite-S1)\n\n- [乙](#cite-S1)\n- [丙](#cite-S1,S2)'
  const sources = [
    { sourceId: 'source-a', sourceVersion: 'v1', chunkIds: ['a'] },
    { sourceId: 'source-b', sourceVersion: 'v2', chunkIds: ['b'], truncated: true as const },
  ]
  const annotations = [...body.matchAll(/\[([^\]]+)\]\(#cite-([^)]*)\)/g)].map(match => ({
    start: match.index, end: match.index + match[0].length, text: match[1], markers: match[2].split(','),
    sources: match[2].includes(',') ? sources : sources.slice(0, 1), support: 'not_assessed' as const,
  }))
  view.message!.envelope = { ...view.message!.envelope, body, citations: annotations }
  const parts = harnessParts(view)
  assert.deepEqual(parts[0], { type: 'text', text: body })
  const part = parts.find(part => part.type === 'data' && part.name === 'citation-claims')!
  assert.equal(part.type, 'data')
  if (part.type !== 'data') return
  const claims = (part.data as { claims: MarkdownConfidenceClaim[] }).claims
  assert.deepEqual(claims, annotations.map(annotation => ({
    id: `run:result-1:${annotation.start}`, text: annotation.text, confidence: 'grounded',
    markers: annotation.markers, start: annotation.start, end: annotation.end,
    basis: annotation.sources.length === 1 ? 'source-a · 版本 v1' : 'source-a · 版本 v1；source-b · 版本 v2 · 来源节选',
  })))
  assert.equal(new Set(claims.map(claim => claim.id)).size, 3)
  view.message!.envelope.citationEvidence = [
    { marker: 'S1', sourceId: 'source-a', sourceVersion: 'v1', chunkId: 'a', title: '甲资料', excerpt: '甲的原始段落。' },
    { marker: 'S2', sourceId: 'source-b', sourceVersion: 'v2', chunkId: 'b', title: '乙资料', excerpt: '乙的原始段落。', truncated: true },
  ]
  const modern = harnessParts(view).find(part => part.type === 'data' && part.name === 'citation-claims')!
  assert.ok(modern.type === 'data')
  assert.deepEqual(modern.data, { claims: claims.map((claim, index) => ({ ...claim,
    basis: '', evidence: view.message!.envelope.citationEvidence!.slice(0, index === 2 ? 2 : 1) })) })
  const legacyChunk = { ...view.message!.envelope.citationEvidence[0], chunkId: 'a2', excerpt: '同一编号的历史片段。' }
  view.message!.envelope.citationEvidence.push(legacyChunk)
  sources[0].chunkIds.push('a2')
  const legacy = harnessParts(view).find(part => part.type === 'data' && part.name === 'citation-claims')!
  assert.ok(legacy.type === 'data')
  assert.deepEqual((legacy.data as { claims: MarkdownConfidenceClaim[] }).claims[0].evidence,
    [view.message!.envelope.citationEvidence[0], legacyChunk])
  view.lifecycle = 'queued'
  assert.deepEqual(harnessParts(view), [])
  view.draft = '新的草稿'
  assert.deepEqual(harnessParts(view), [])
  view.lifecycle = 'leased'
  assert.deepEqual(harnessParts(view), [{ type: 'text', text: '新的草稿' }])
  view.lifecycle = 'succeeded'
  view.message!.envelope.citations[0].sources = []
  assert.throws(() => harnessParts(view), /recorded sources/)
  view.message!.envelope.citations = []
  view.message!.envelope.citationEvidence = []
  view.message!.envelope.body = '无引用'
  assert.deepEqual(harnessParts(view), [{ type: 'text', text: '无引用' }])
})

test('distinct chunks of one PDF remain specific across repeated and combined citations', () => {
  const view = runView(1, 1)
  const body = '[甲](#cite-S1) [乙](#cite-S2) [再次引用甲](#cite-S1) [综合](#cite-S1,S3)'
  const evidence = ['甲片段', '乙片段', '丙片段'].map((excerpt, index) => ({
    marker: `S${index + 1}`, sourceId: 'same-pdf', sourceVersion: 'v1', chunkId: `chunk-${index + 1}`,
    title: 'Understanding Attention', excerpt, truncated: true,
  }))
  const citations = [...body.matchAll(/\[([^\]]+)\]\(#cite-([^)]*)\)/g)].map(match => ({
    start: match.index, end: match.index + match[0].length, text: match[1], markers: match[2].split(','),
    support: 'not_assessed' as const,
    sources: match[2].split(',').map(marker => ({ sourceId: 'same-pdf', sourceVersion: 'v1',
      chunkIds: evidence.filter(item => item.marker === marker).map(item => item.chunkId), truncated: true as const })),
  }))
  view.message!.envelope = { ...view.message!.envelope, body, citations, citationEvidence: evidence }
  const result = harnessParts(view).find(part => part.type === 'data' && part.name === 'citation-claims')!
  assert.ok(result.type === 'data')
  const claims = (result.data as { claims: MarkdownConfidenceClaim[] }).claims
  assert.deepEqual(claims.map(claim => claim.evidence), [[evidence[0]], [evidence[1]], [evidence[0]], [evidence[0], evidence[2]]])
  assert.equal(new Set(claims.map(claim => claim.id)).size, 4)
})

test('history, API snapshots and later attempts converge to one current message without restoring an old wait', () => {
  const waiting = convertEnvelope(envelope(1,1,'awaiting_approval'),{ participants, meId: 'human' })
  const committed = convertEnvelope(envelope(2,2),{ participants, meId: 'human' })
  for (const rows of [[waiting,committed],[committed,waiting]]) {
    const messages = mergeCanonicalMessages([],rows)
    assert.equal(messages.length,1)
    assert.equal(messages[0].id,committed.id)
    assert.equal(getLingxiMessageMetadata(messages[0]).harness?.goalOutcome?.status,'partial')
  }
  const meta = getLingxiMessageMetadata(committed), result = runView(2,2)
  assert.ok(committed.role === 'assistant')
  let currentView = consumeRunState(result,{ run: { id: 'run', fence: 2, resultId: result.resultId, resultFence: 2,
    requestVersion: 3, status: 'queued', kind: 'turn', attempts: 2, createdAt: '', availableAt: '', heartbeatAt: null,
    lastProgressAt: null, goalOutcome: null, error: null }, message: result.message, delivery: 'delivered' })
  const updated = { ...committed, status: harnessStatus(currentView), metadata: { ...committed.metadata, custom: { ...meta, harness: { ...currentView, artifacts: currentView.message!.envelope.artifacts }, harnessControl: true } } }
  const merged = mergeCanonicalMessages([updated],[waiting,committed])
  assert.equal(getLingxiMessageMetadata(merged[0]).harness?.requestVersion,3)
  assert.equal(merged[0].status?.type,'running')
  assert.equal(getLingxiMessageMetadata(merged[0]).harnessControl,true)
  const event = { runId: 'run', seq: 200_001, kind: 'run.started', stage: 'started' as const, visibility: 'user' as const, data: {} }
  currentView = consumeRunEvent(currentView,event)
  currentView = consumeRunStreamEvent(currentView,{ type: 'preview', preview: { kind: 'snapshot', runId: 'run', fence: 3,
    requestVersion: 3, attemptId: 'attempt', seq: 1, draft: '新版内容' } })
  assert.equal(consumeRunEvent(currentView,event),currentView)
  assert.deepEqual(harnessParts(currentView),[{ type: 'text', text: '新版内容' }])
  assert.equal(currentView.message?.envelope.artifacts[0].source?.version,'7')
  currentView = consumeRunStreamEvent(currentView,{ type: 'reset', runId: 'run', reason: 'superseded' })
  assert.equal(currentView.draft,'')
})
