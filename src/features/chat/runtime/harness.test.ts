import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeRunEvent, consumeRunState, consumeRunStreamEvent, type ResponseEnvelope } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'
import type { Participant } from '@/types'
import { convertEnvelope } from './converter'
import { harnessParts, harnessStatus, harnessToolParts, readHarness } from './harness'
import { getLingxiMessageMetadata } from './model'
import { mergeCanonicalMessages } from './store'
import type { MarkdownConfidenceClaim } from '@/components/assistant-ui/markdown-text'

const participants = { agent: { id: 'agent', kind: 'agent', name: '助手' } as Participant }

test('native response text and presentation cards retain segment order and stable identities', () => {
  const view = readHarness(envelope(1, 1))!
  const first = { type: 'card', version: '1', reference: 'first', fields: { title: '第一张' }, sources: [], hash: 'first' }
  const second = { ...first, reference: 'second', fields: { title: '第二张' }, hash: 'second' }
  view.message!.envelope.presentations = [first, second]
  const parts = harnessParts(view)
  assert.deepEqual(parts.slice(0, -1), [{ type: 'text', text: '查看[原文](#cite-S1)' }, ...[first, second].map(component => ({
    type: 'tool-call', toolCallId: `presentation:${component.hash}`, toolName: 'card',
    args: component.fields, argsText: JSON.stringify(component.fields), result: component,
  }))])
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
  const current = { ...message,metadata: { ...message.metadata,custom: { ...getLingxiMessageMetadata(message),harnessTools: tools } } }
  assert.deepEqual(getLingxiMessageMetadata(mergeCanonicalMessages([current],[message])[0]).harnessTools,tools)
  assert.equal(harnessToolParts('run',Array.from({length: 300},(_,index)=>({ ...started,seq: index+1,data: { toolCallId: `host:${index}`,name: 'read' } }))).length,256)
})
function envelope(version: number, fence: number, outcome: ResponseEnvelope['goalOutcome']['status'] = 'partial'): ImEnvelope {
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
  return { channelId: 'room', channelType: 2, fromUid: 'agent', messageId: `result-${fence}`, clientMsgNo: `result-${fence}`,
    messageSeq: fence, timestamp: 1_767_225_600 + fence,
    payload: { version: 1, kind: 'text', clientMsgNo: `result-${fence}`, body, replyToClientMsgNo: 'thread',
      refs: { runId: 'run', agentId: 'agent' }, data: { harness, harnessSessionId: 'native-session', harnessCommit: { resultId: `result-${fence}`, fence } } } }
}

test('native committed partial answers retain artifact hashes and provenance without appearing complete', () => {
  const native = envelope(1,1), message = convertEnvelope(native,{ participants, meId: 'human' })
  const meta = getLingxiMessageMetadata(message)
  assert.deepEqual(message.status,{ type: 'incomplete', reason: 'other' })
  assert.deepEqual(message.content, [
    { type: 'text', text: '查看[原文](#cite-S1)' },
    { type: 'tool-call', toolCallId: 'cite-claims:run:result-1', toolName: 'cite_claims', args: {}, argsText: '{}',
      result: { claims: [{ id: 'run:result-1:2', text: '原文', confidence: 'grounded', markers: ['S1'], start: 2, end: 16,
        basis: 'doc · 版本 revision-7' }] } },
  ])
  assert.deepEqual(meta.harness?.message?.envelope,native.payload.data?.harness)
  assert.equal(meta.harness?.delivery,'delivered')
  for (const status of ['awaiting_input','awaiting_approval','delegated'] as const) {
    assert.deepEqual(harnessStatus(readHarness(envelope(1,1,status))!),{ type: 'requires-action', reason: 'tool-calls' })
  }
  assert.throws(() => readHarness({ ...native, payload: { ...native.payload, refs: { runId: 'run', agentId: 'other' } } }),/身份/)
})

test('native citations keep occurrence identities, all source versions and truncation, without grading support', () => {
  const view = readHarness(envelope(1, 1))!
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
  const part = parts.at(-1)!
  assert.equal(part.type, 'tool-call')
  if (part.type !== 'tool-call') return
  const claims = (part.result as { claims: MarkdownConfidenceClaim[] }).claims
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
  const modern = harnessParts(view).at(-1)!
  assert.ok(modern.type === 'tool-call')
  assert.deepEqual(modern.result, { claims: claims.map((claim, index) => ({ ...claim,
    basis: '', evidence: view.message!.envelope.citationEvidence!.slice(0, index === 2 ? 2 : 1) })) })
  const legacyChunk = { ...view.message!.envelope.citationEvidence[0], chunkId: 'a2', excerpt: '同一编号的历史片段。' }
  view.message!.envelope.citationEvidence.push(legacyChunk)
  sources[0].chunkIds.push('a2')
  const legacy = harnessParts(view).at(-1)!
  assert.ok(legacy.type === 'tool-call')
  assert.deepEqual((legacy.result as { claims: MarkdownConfidenceClaim[] }).claims[0].evidence,
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
  const view = readHarness(envelope(1, 1))!
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
  const result = harnessParts(view).at(-1)!
  assert.ok(result.type === 'tool-call')
  const claims = (result.result as { claims: MarkdownConfidenceClaim[] }).claims
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
  const meta = getLingxiMessageMetadata(committed), result = meta.harness!
  assert.ok(committed.role === 'assistant')
  let view = consumeRunState(result,{ run: { id: 'run', fence: 2, resultId: result.resultId, resultFence: 2,
    requestVersion: 3, status: 'queued', kind: 'turn', attempts: 2, createdAt: '', availableAt: '', heartbeatAt: null,
    lastProgressAt: null, goalOutcome: null, error: null }, message: result.message, delivery: 'delivered' })
  const updated = { ...committed, status: harnessStatus(view), metadata: { ...committed.metadata, custom: { ...meta, harness: view, harnessControl: true } } }
  const merged = mergeCanonicalMessages([updated],[waiting,committed])
  assert.equal(getLingxiMessageMetadata(merged[0]).harness?.requestVersion,3)
  assert.equal(merged[0].status?.type,'running')
  assert.equal(getLingxiMessageMetadata(merged[0]).harnessControl,true)
  const event = { runId: 'run', seq: 200_001, kind: 'run.started', stage: 'started' as const, visibility: 'user' as const, data: {} }
  view = consumeRunEvent(view,event)
  view = consumeRunStreamEvent(view,{ type: 'preview', preview: { kind: 'snapshot', runId: 'run', fence: 3,
    requestVersion: 3, attemptId: 'attempt', seq: 1, draft: '新版内容' } })
  assert.equal(consumeRunEvent(view,event),view)
  assert.deepEqual(harnessParts(view),[{ type: 'text', text: '新版内容' }])
  assert.equal(view.message?.envelope.artifacts[0].source?.version,'7')
  view = consumeRunStreamEvent(view,{ type: 'reset', runId: 'run', reason: 'superseded' })
  assert.equal(view.draft,'')
})
