import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFileSync } from 'node:fs'
import { createRunView, type RunView } from '@lyyzka/lingxios/ui'
import { harnessToolParts, runMessageParts } from '../agent-runtime/message-projection.js'
import { RunStreamProjection } from '../agent-runtime/assistant-transport.js'
import { createNativeMessage, deserializeMessage } from '../../../src/lib/nativeMessage.js'

// Failure model: docs/evidence/issue-295/FAILURE-MODEL.md (written first).
const view: RunView = { ...createRunView('run'),requestVersion: 1,fence: 1,lifecycle: 'leased' }
const text = (state: RunView,tools = harnessToolParts('run',[])) => runMessageParts(state,tools).filter(part => part.type === 'text')
const state = { run: { id: 'run',status: 'leased' as const,fence: 1,requestVersion: 1,resultId: null,resultFence: null,
  kind: 'turn',attempts: 1,createdAt: '2026-10-22T00:00:00Z',availableAt: '',heartbeatAt: null,lastProgressAt: null,goalOutcome: null,error: null },message: null,delivery: null }
const annotation = (id: string,kind = 'commentary') => ({ lingxiloop: { activity: { version: 1,id,kind,label: '任务状态' } } })

test('waiting, tool receipts and terminal states never synthesize diagnostic prose', () => {
  for (const lifecycle of ['queued','leased','succeeded','failed','cancelled'] as const) {
    assert.deepEqual(text({ ...view,lifecycle }),[])
    for (const status of ['completed','failed']) {
      const tools = harnessToolParts('run',[
        {runId: 'run',seq: 1,kind: 'tool.started',stage: 'started',visibility: 'user',data: {toolCallId: 'host:save',name: 'visualize.save',requestVersion: 1,fence: 1,attemptId: 'a'}},
        {runId: 'run',seq: 2,kind: 'tool.completed',stage: 'completed',visibility: 'user',data: {toolCallId: 'host:save',result: {status},isError: status === 'failed'}},
      ])
      assert.deepEqual(text({ ...view,lifecycle },tools),[])
      assert.ok(runMessageParts({ ...view,lifecycle },tools).some(part => part.type === 'tool-call' && part.toolCallId === 'host:save'))
    }
  }
})
test('real public text remains available without a synthetic explanation', () => {
  const next: RunView = { ...view,publicTextParts: [{version: 1,runId: 'run',partId: 'p',attemptId: 'a',requestVersion: 1,fence: 1,partIndex: 0,text: '先核对题目条件。',firstSeq: 1,lastSeq: 1,endedSeq: null,chunkCount: 1,acceptedResultId: null,status: 'running',reason: null}] }
  assert.deepEqual(text(next).map(part => part.text),['先核对题目条件。'])
})
test('actual projection waits silently, streams an answer and preserves empty terminal errors', () => {
  const projection = new RunStreamProjection('run',true)
  const waiting = projection.apply({type: 'state',state})
  assert.deepEqual(waiting.message.content,[])
  assert.deepEqual(waiting.message.status,{type: 'running'})
  const answer = projection.apply({type: 'preview',preview: {kind: 'snapshot',runId: 'run',fence: 1,requestVersion: 1,attemptId: 'a',seq: 1,draft: '真实答案正在流式输出。'}})
  assert.equal(answer.message.content[0]?.type === 'text' && answer.message.content[0].text,'真实答案正在流式输出。')
  assert.deepEqual(projection.apply({type: 'reset',runId: 'run',reason: 'superseded'}).message.content,[])
  const failed = projection.apply({type: 'state',state: {...state,run: {...state.run,status: 'failed',error: 'synthetic raw diagnostic'}}})
  assert.deepEqual(failed.message.content,[])
  assert.deepEqual(failed.message.status,{type: 'incomplete',reason: 'error'})
  assert.doesNotMatch(JSON.stringify(failed),/synthetic raw diagnostic/)
  const base = waiting.message
  const message = (content: typeof base.content,status = base.status,custom = {}) => ({message: createNativeMessage({id: base.id,role: 'assistant',content,status,
    createdAt: base.createdAt,custom: {...base.metadata.custom,...custom}})})
  const legacy = message([
    {type: 'text',text: '任务已开始，尚未收到模型可显示的正文。',providerMetadata: annotation('observed-progress:1:1')},
    {type: 'text',text: 'The task has started; no displayable model text has arrived.',providerMetadata: annotation('observed-progress:1:2')},
    {type: 'text',text: '已核对题目条件。',providerMetadata: annotation('public-report:real')},
    {type: 'text',text: '真实答案正在流式输出。',providerMetadata: annotation('answer:1:0','answer')},
  ])
  assert.equal(deserializeMessage(legacy.message).content.length,2)
  if (process.env.ISSUE295_SNAPSHOTS) writeFileSync(process.env.ISSUE295_SNAPSHOTS,JSON.stringify({waiting,answer,legacy,failed,
    partial: message([],{type: 'incomplete',reason: 'other'},{harness: {...base.metadata.custom.harness as object,lifecycle: 'succeeded',goalOutcome: {status: 'partial',requestVersion: 1}}}),
  },null,2))
})
