import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView, type RunEvent } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText, createNativeMessage } from '../../../src/lib/nativeMessage.js'

// Failure model: docs/evidence/issue-215-public/FAILURE-MODEL.md, cases 2/3/4.
test('public provider attempts stay distinct and ordered through failure and final answer projection', () => {
  const publicTextParts = [
    { version: 1 as const,runId: 'run',partId: 'p1',requestVersion: 1,fence: 1,attemptId: 'call-1',partIndex: 0,text: 'First published prefix.',firstSeq: 1,lastSeq: 2,endedSeq: 2,chunkCount: 1,status: 'incomplete' as const,reason: 'failed' as const },
    { version: 1 as const,runId: 'run',partId: 'p2',requestVersion: 1,fence: 1,attemptId: 'call-2',partIndex: 0,text: 'Second published prefix.',firstSeq: 5,lastSeq: 6,endedSeq: 6,chunkCount: 1,status: 'complete' as const,reason: 'tool' as const },
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
