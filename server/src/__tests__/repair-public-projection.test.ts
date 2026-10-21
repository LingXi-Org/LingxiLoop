import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView, consumeRunEvent, type PublicTextPart, type RunView } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'

// Failure model: docs/evidence/feedback-262/FAILURE-MODEL.md (written first).
const part = (attemptId: string, seq: number, reason: PublicTextPart['reason'], text: string): PublicTextPart => ({
  version: 1,runId: 'run',partId: `p-${attemptId}`,requestVersion: 1,fence: 1,attemptId,partIndex: 0,text,
  firstSeq: seq,lastSeq: seq,endedSeq: reason ? seq : null,chunkCount: 1,acceptedResultId: null,status: reason === 'tool' || reason === 'completed' ? 'complete' : reason ? 'incomplete' : 'running',reason,
})
const texts = (view: RunView, tools = harnessToolParts('run',[]), history = false) => runMessageParts(view,tools,{ includeAcceptedPublicText: history }).flatMap(p=>p.type==='text'?[p.text]:[])

test('repair archives an abandoned candidate by identity and preserves new text immediately and exact history', () => {
  const old = part('first',1,'superseded','An entire superseded explanation.'), next = part('repair',4,null,'I will read the saved result.')
  const view: RunView = { ...createRunView('run'),lifecycle: 'leased',requestVersion: 1,fence: 1,publicTextParts: [old,next] }
  assert.deepEqual(texts(view),[old.text,next.text],'old process stays available inside RunActivity')
  assert.deepEqual(runMessageParts(view).filter(p => activityAnnotation(p)?.kind === 'answer').map(p => p.type === 'text' && p.text),[next.text])
  assert.deepEqual(texts(view,[],true),[old.text,next.text])
  assert.equal(view.publicTextParts![0].text,old.text,'immutable archive is not rewritten')
})

test('distinct tool preambles with identical text survive; replayed native events do not duplicate them', () => {
  let view: RunView = { ...createRunView('run'),lifecycle: 'leased',requestVersion: 1,fence: 1 }
  for (const [index,attemptId] of ['one','two'].entries()) {
    const identity={version:1,requestVersion:1,fence:1,attemptId,partId:`p-${attemptId}`,partIndex:0}
    const delta={runId:'run',seq:index*3+1,kind:'public.text.delta',stage:'delta' as const,visibility:'user' as const,data:{...identity,chunkIndex:0,text:'Checking this result.'}}
    view=consumeRunEvent(consumeRunEvent(view,delta),delta)
    view=consumeRunEvent(view,{...delta,seq:index*3+2,kind:'public.text.ended',stage:'completed',data:{...identity,chunkCount:1,reason:'tool'}})
  }
  assert.deepEqual(texts(view),['Checking this result.','Checking this result.'])
})

test('interrupted pre-tool public text stays visible and final model.delta is not a second foreground answer', () => {
  const preamble=part('tool',1,'interrupted','Checking a saved result.'), candidate=part('final',4,'completed','The final explanation.')
  const tools=harnessToolParts('run',[{runId:'run',seq:2,kind:'tool.started',stage:'started',visibility:'user',data:{toolCallId:'host:read',name:'visualize.read',requestVersion:1,fence:1,attemptId:'tool'}}])
  const view: RunView={...createRunView('run'),lifecycle:'leased',requestVersion:1,fence:1,draft:candidate.text,publicTextParts:[preamble,candidate]}
  assert.deepEqual(texts(view,tools),[preamble.text,candidate.text])
  assert.deepEqual(texts({...view,publicTextParts:[]},tools),[candidate.text],'non-streaming provider still uses the native final preview')
})
