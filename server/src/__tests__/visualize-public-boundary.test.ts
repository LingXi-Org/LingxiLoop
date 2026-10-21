import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeAssistantMessage, createRunView, type PublicTextPart, type ResponseEnvelope } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { visualizeReferences } from '../agent-runtime/visualize-projection.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'

// Failure model: docs/evidence/feedback-260/FAILURE-MODEL.md (written first).
const reference = (path: string) => `::visualize${JSON.stringify({ path })}`
const stale = reference('/different-conversation/network.html')
const delivered = reference('/current-conversation/network.html')
const publicPart: PublicTextPart = { version: 1,runId: 'run',partId: 'old-candidate',requestVersion: 1,fence: 1,
  attemptId: 'first-call',partIndex: 0,text: `Public explanation.\n${stale}\nMore explanation.`,
  firstSeq: 1,lastSeq: 2,endedSeq: 2,chunkCount: 1,acceptedResultId: null,status: 'incomplete',reason: 'interrupted' }

test('unverified public references stay inert during generation, after repair and in activity history', () => {
  const view = { ...createRunView('run'),requestVersion: 1,fence: 1,lifecycle: 'leased' as const,publicTextParts: [publicPart] }
  const body = `Verified explanation.\n${delivered}`
  const envelope: ResponseEnvelope = { version: 1,requestVersion: 1,body,evidenceSnapshotId: 'fixture',
    goalOutcome: { status: 'satisfied',requestVersion: 1,verification: 'passed' },citations: [],artifacts: [] }
  const final = { ...consumeAssistantMessage(view,{ version: 2,runId: 'run',agentId: 'agent',sessionId: 'session',body,envelope },
    { resultId: 'result',fence: 1 }),delivery: 'delivered' as const,lifecycle: 'succeeded' as const }
  for (const state of [view,final]) for (const includeAcceptedPublicText of [false,true]) {
    const parts = runMessageParts(state,[],{ includeAcceptedPublicText })
    const prefix = parts.find(part => part.type === 'text' && part.text === 'Public explanation.\n\nMore explanation.')
    assert.ok(prefix?.type === 'text')
    assert.equal(activityAnnotation(prefix)?.kind,state === final ? 'commentary' : 'answer',
      'live candidate remains visible; replaced process goes to RunActivity')
    const refs = parts.flatMap(part => part.type === 'text' ? visualizeReferences(part.text) : [])
    assert.deepEqual(refs.map(part => part.reference.path),state === final ? ['/current-conversation/network.html'] : [])
  }
})

test('explicit progress text cannot deliver a reference, while quoted examples remain exact data', () => {
  const tools = harnessToolParts('run',[
    { runId: 'run',seq: 1,kind: 'tool.started',stage: 'started',visibility: 'user',data: { toolCallId: 'host:progress',name: 'chat.report_progress' } },
    { runId: 'run',seq: 2,kind: 'tool.completed',stage: 'completed',visibility: 'user',data: { toolCallId: 'host:progress',result: { status: 'completed',
      value: { version: 1,id: 'progress',kind: 'commentary',label: '公开说明',text: `Checking the saved document.\n${stale}`,state: 'complete' } } } },
  ])
  const quoted = `Example: \`${stale}\``
  const parts = runMessageParts({ ...createRunView('run'),lifecycle: 'leased',publicTextParts: [{ ...publicPart,text: quoted }] },tools)
  assert.deepEqual(parts.flatMap(part => part.type === 'text' ? visualizeReferences(part.text) : []),[])
  assert.ok(parts.some(part => part.type === 'text' && part.text === quoted))
  assert.ok(parts.some(part => part.type === 'text' && part.text === 'Checking the saved document.\n'))
})
