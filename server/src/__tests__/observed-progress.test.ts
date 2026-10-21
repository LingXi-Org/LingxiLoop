import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView, type RunView } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { toolDisplay } from '../../../src/lib/runActivity.js'

// Failure model: docs/evidence/feedback-261/FAILURE-MODEL.md (written first).
const view: RunView={...createRunView('run'),requestVersion:1,fence:1,lifecycle:'leased'}
function tool(name:string,status:string,requestVersion=1){return harnessToolParts('run',[
  {runId:'run',seq:1,kind:'tool.started',stage:'started',visibility:'user',data:{toolCallId:'host:call',name,requestVersion,fence:1,attemptId:'call'}},
  {runId:'run',seq:2,kind:'tool.completed',stage:'completed',visibility:'user',data:{toolCallId:'host:call',result:{status},isError:status==='failed'}},
])}
const text=(state=view,tools=tool('visualize.save','completed'))=>runMessageParts(state,tools).flatMap(p=>p.type==='text'?[p.text]:[]).join('\n')

test('initial silence has factual lifecycle text, replaced by real public explanation as soon as it arrives',()=>{
  assert.match(text(view,[]),/尚未收到.*正文/)
  const next:RunView={...view,publicTextParts:[{version:1,runId:'run',partId:'p',attemptId:'a',requestVersion:1,fence:1,partIndex:0,text:'先核对保存结果。',firstSeq:1,lastSeq:1,endedSeq:null,chunkCount:1,acceptedResultId:null,status:'running',reason:null}]}
  assert.equal(text(next,[]),'先核对保存结果。')
})
test('failed, saved awaiting delivery and terminal missing reference are distinct observed states',()=>{
  assert.match(text(view,tool('visualize.save','failed')),/保存可视化.*未完成/)
  assert.doesNotMatch(text(view,tool('visualize.save','failed')),/已保存/)
  assert.match(text(),/已保存.*尚未交付/)
  assert.match(text({...view,lifecycle:'failed'}),/已保存.*本次.*未交付/)
  assert.doesNotMatch(text(view,tool('visualize.save','completed',2)),/已保存/)
})
test('closed public tool labels describe actual work without leaking runtime names or guessing results',()=>{
  for(const name of ['ipython','skills__load','skills.activate','observations.read','visualize.chart','visualize.diagram']) assert.notEqual(toolDisplay(name).title,'处理任务',name)
  assert.match(toolDisplay('visualize.save','completed').summary!,/已保存/)
  assert.match(toolDisplay('visualize.read','failed').summary!,/读取.*未完成/)
})
