import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeRunEvent, consumeRunState, consumeRunStreamEvent, type ResponseEnvelope } from '@lyyzka/lingxios/ui'
import type { ImEnvelope } from '@/lib/im/wukong'
import type { Participant } from '@/types'
import { convertEnvelope } from './converter'
import { harnessParts, harnessStatus, harnessToolParts, readHarness } from './harness'
import { getLingxiMessageMetadata } from './model'
import { mergeCanonicalMessages } from './store'

const participants = { agent: { id: 'agent', kind: 'agent', name: '助手' } as Participant }

test('public native tool events project into bounded assistant-ui history and survive committed IM replay', () => {
  const started = { runId: 'run',seq: 1,kind: 'tool.started',stage: 'started' as const,visibility: 'user' as const,
    data: { toolCallId: 'host:call',name: 'documents.read' } }
  const completed = { ...started,seq: 2,kind: 'tool.completed',stage: 'completed' as const,
    data: { toolCallId: 'host:call',result: { status: 'completed',value: { body: 'Do not duplicate this payload' } },isError: false } }
  const tools = harnessToolParts('run',[started,completed,{ ...started,visibility: 'internal',data: { toolCallId: 'host:private',name: 'internal' } }])
  assert.deepEqual(tools,[{ type: 'tool-call',toolCallId: 'host:call',toolName: 'documents.read',args: {},argsText: '{}',result: { status: 'completed' },isError: false }])
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
  assert.deepEqual(message.content,[{ type: 'text', text: '查看原文' }])
  assert.deepEqual(meta.harness?.message?.envelope,native.payload.data?.harness)
  assert.equal(meta.harness?.delivery,'delivered')
  for (const status of ['awaiting_input','awaiting_approval','delegated'] as const) {
    assert.deepEqual(harnessStatus(readHarness(envelope(1,1,status))!),{ type: 'requires-action', reason: 'tool-calls' })
  }
  assert.throws(() => readHarness({ ...native, payload: { ...native.payload, refs: { runId: 'run', agentId: 'other' } } }),/身份/)
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
