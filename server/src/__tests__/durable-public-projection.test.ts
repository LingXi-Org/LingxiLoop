import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView, type RunEvent } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText, createNativeMessage } from '../../../src/lib/nativeMessage.js'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'

// Failure model: docs/evidence/issue-215-public/FAILURE-MODEL.md, cases 2/3/4.
test('public provider attempts stay distinct and ordered through failure and final answer projection', () => {
  const publicTextParts = [
    { version: 1 as const,runId: 'run',partId: 'p1',requestVersion: 1,fence: 1,attemptId: 'call-1',partIndex: 0,text: 'First published prefix.',firstSeq: 1,lastSeq: 2,endedSeq: 2,chunkCount: 1,acceptedResultId: null,status: 'incomplete' as const,reason: 'failed' as const },
    { version: 1 as const,runId: 'run',partId: 'p2',requestVersion: 1,fence: 1,attemptId: 'call-2',partIndex: 0,text: 'Second published prefix.',firstSeq: 5,lastSeq: 6,endedSeq: 6,chunkCount: 1,acceptedResultId: null,status: 'complete' as const,reason: 'tool' as const },
  ]
  const tools = harnessToolParts('run',[{ runId: 'run',seq: 3,kind: 'tool.started',visibility: 'user',stage: 'started',data: { toolCallId: 'host:tool',name: 'files.list' } }])
  const view = { ...createRunView('run'),requestVersion: 2,fence: 2,lifecycle: 'cancelled' as const,publicTextParts }
  const parts = runMessageParts(view,tools)
  assert.deepEqual(parts.map(part => part.type === 'text' ? part.text : part.type),['First published prefix.','tool-call','Second published prefix.'])
  assert.deepEqual(parts[0].type === 'text' && parts[0].status,{ type: 'incomplete',reason: 'error' })
  assert.deepEqual(parts[2].type === 'text' && parts[2].status,{ type: 'complete' })
  assert.equal(activityAnnotation(parts[0])?.kind,'commentary')
  assert.notEqual(activityAnnotation(parts[0])?.id,activityAnnotation(parts[2])?.id)
  assert.equal(nativeText(createNativeMessage({ id: 'run-run',role: 'assistant',content: parts })),'','commentary is not a committed answer')
})

for (const sameFence of [false,true]) test(`same progress id cannot replace or revive an old report (same fence: ${sameFence})`, () => {
  const events: RunEvent[] = []
  for (const [index,attemptId] of ['provider-1','provider-2'].entries()) {
    const identity = { requestVersion: sameFence ? 2 : index+1,fence: sameFence ? 2 : index+1,attemptId }
    const toolCallId = `host:report-${index}`
    events.push({ runId: 'run',seq: index*2+1,kind: 'tool.started',stage: 'started',visibility: 'user',data: { toolCallId,name: 'chat.report_progress',...identity } },
      { runId: 'run',seq: index*2+2,kind: 'tool.completed',stage: 'completed',visibility: 'user',data: { toolCallId,...identity,
        result: { status: 'completed',value: { version: 1,id: 'same',kind: 'commentary',label: '公开说明',text: `Attempt ${index+1}`,state: 'running' } } } })
  }
  const parts = runMessageParts({ ...createRunView('run'),requestVersion: 2,fence: 2,lifecycle: 'leased' },harnessToolParts('run',events))
  assert.equal(parts.length,2)
  assert.deepEqual(parts.map(part => part.type === 'text' && part.text),['Attempt 1','Attempt 2'])
  assert.deepEqual(parts[0].type === 'text' && parts[0].status,{ type: 'incomplete',reason: 'other' })
  assert.deepEqual(parts[1].type === 'text' && parts[1].status,{ type: 'running' })
  assert.notEqual(activityAnnotation(parts[0])?.id,activityAnnotation(parts[1])?.id)
})

test('the latest published explanation survives the 40-part snapshot window while all history stays pageable', () => {
  const projection = new RunStreamProjection('run',true)
  projection.advance({ type: 'state',state: { run: { id: 'run',status: 'leased',fence: 1,requestVersion: 1,resultId: null,resultFence: null,
    kind: 'turn',attempts: 1,createdAt: '2026-10-20T00:00:00Z',availableAt: '',heartbeatAt: null,lastProgressAt: null,goalOutcome: null,error: null },message: null,delivery: null } })
  const identity = { version: 1,requestVersion: 1,fence: 1,attemptId: 'attempt',partId: 'part',partIndex: 0 }
  projection.advance({ type: 'event',event: { runId: 'run',seq: 1,kind: 'public.text.delta',visibility: 'user',stage: 'delta',data: { ...identity,chunkIndex: 0,text: 'Latest explanation before many tools.' } } })
  projection.advance({ type: 'event',event: { runId: 'run',seq: 2,kind: 'public.text.ended',visibility: 'user',stage: 'completed',data: { ...identity,chunkCount: 1,reason: 'tool' } } })
  for (let index = 0; index < 85; index++) {
    const toolCallId = `host:many-${index}`
    projection.advance({ type: 'event',event: { runId: 'run',seq: 3+index*2,kind: 'tool.started',visibility: 'user',stage: 'started',data: { toolCallId,name: 'files.list' } } })
    projection.advance({ type: 'event',event: { runId: 'run',seq: 4+index*2,kind: 'tool.completed',visibility: 'user',stage: 'completed',data: { toolCallId,result: { status: 'completed' } } } })
  }
  const message = projection.snapshot.message
  assert.ok(message.content.some(part => part.type === 'text' && part.text === 'Latest explanation before many tools.'))
  assert.ok(message.content.length <= 80)
  const ids: string[] = []; let offset = 0
  do {
    const page = projection.activityPage(offset)
    ids.push(...page.message.content.map(part => activityAnnotation(part)!.id))
    if (page.nextOffset === null) break
    offset = page.nextOffset
  } while (offset < 86)
  assert.equal(ids.length,86); assert.equal(new Set(ids).size,86)
})

test('only explicit accepted-result identity archives a public prefix from the foreground, preserving every historical part', () => {
  const base = { version: 1 as const,runId: 'run',requestVersion: 1,fence: 1,partIndex: 0,lastSeq: 6,endedSeq: 6,chunkCount: 1,
    status: 'complete' as const,reason: 'completed' as const }
  const view = { ...createRunView('run'),requestVersion: 2,fence: 2,lifecycle: 'leased' as const,
    publicTextParts: [{ ...base,partId: 'tool-prefix',attemptId: 'call-1',firstSeq: 1,text: 'Settled answer.',acceptedResultId: null },
      { ...base,partId: 'final-prefix',attemptId: 'call-2',firstSeq: 5,text: 'Different prefix, accepted by identity.',acceptedResultId: 'prior-result' }] }
  const history = runMessageParts(view,[])
  const foreground = runMessageParts(view,[],{ includeAcceptedPublicText: false })
  assert.equal(history.length,2,'accepted text remains in its original history position')
  assert.equal(foreground.length,1,'completed alone is not acceptance, and old accepted parts cannot reappear on the next turn')
  assert.equal(foreground[0].type === 'text' && foreground[0].text,'Settled answer.')
  assert.equal(activityAnnotation(foreground[0])?.id,activityAnnotation(history[0])?.id)
})
