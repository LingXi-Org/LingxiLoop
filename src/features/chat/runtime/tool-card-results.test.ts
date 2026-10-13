import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { harnessToolParts } from '../../../../server/src/agent-runtime/message-projection'
import { toolCardResult } from '@/lib/agentToolCards'
import { publicRunEvent } from '../../../../server/src/agent-runtime/public-events'
// The unrelated editors import browser-only CSS; retain real card renderers below.
mock.module(new URL('../../canvas/components/CanvasArtifactCard.tsx',import.meta.url).href,{namedExports:{CanvasArtifactCard:()=>null}})
mock.module(new URL('../../learning/forum/memos/MemoEditor.tsx',import.meta.url).href,{namedExports:{MemoEditor:()=>null}})
const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}})
after(()=>{if(storage)Object.defineProperty(globalThis,'localStorage',storage);else Reflect.deleteProperty(globalThis,'localStorage')})
const { ScoreBreakdownTool } = await import('../components/ToolRenderers')

test('evaluation cards use persisted result display, not model arguments or full evidence', () => {
  const value = { evaluationId: 'e', status: 'PENDING', display: { demonstratedLevel: 2, rubricResults: [{ label: '解释', score: 2, weight: 1 }] } }
  assert.deepEqual(toolCardResult('learning.propose_evaluation', { result: value, state: { privateEvidence: 'private' } }), value)
  const started={runId:'run',seq:1,kind:'tool.started',stage:'started' as const,visibility:'user' as const,data:{toolCallId:'host:score',name:'learning.propose_evaluation',args:{score:4}}}
  const completed={...started,seq:2,kind:'tool.completed',stage:'completed' as const,data:{toolCallId:'host:score',result:{status:'completed',value:{result:value,state:{privateEvidence:'private'}}}}}
  const cards=harnessToolParts('run',[started,completed].map(item=>publicRunEvent(item,'learning.propose_evaluation')))
  assert.deepEqual(cards[0].args,{})
  assert.deepEqual(cards[0].result,{status:'completed',value})
  const html=renderToStaticMarkup(createElement(ScoreBreakdownTool,cards[0] as ToolCallMessagePartProps))
  assert.match(html,/待教师复核/)
  assert.match(html,/解释/)
  assert.doesNotMatch(html,/privateEvidence/)
})

// Failure modes: either projection drops the card locator, invalid locators survive,
// or private provider state leaks through the public result.
test('homework draft card locators survive public event and native message projection without private state', () => {
  const value = { result: { homeworkId: 'homework-1', courseId: 'course-1', revision: 2, privateEvidence: 'private' }, state: { privateEvidence: 'private' } }
  const publicValue = { result: { homeworkId: 'homework-1', courseId: 'course-1', revision: 2 } }
  assert.deepEqual(toolCardResult('teacher.draft_homework', value), publicValue)
  const started = { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started' as const, visibility: 'user' as const, data: { toolCallId: 'host:homework', name: 'teacher.draft_homework', args: { instructions: 'private' } } }
  const completed = { ...started, seq: 2, kind: 'tool.completed', stage: 'completed' as const, data: { toolCallId: 'host:homework', result: { status: 'completed', value } } }
  const cards = harnessToolParts('run', [started, completed].map(item => publicRunEvent(item, 'teacher.draft_homework')))
  assert.deepEqual(cards[0].args, {})
  assert.deepEqual(cards[0].result, { status: 'completed', value: publicValue })
  for (const result of [undefined, { homeworkId: '', courseId: 'course-1', revision: 2 }, { homeworkId: 'homework-1', courseId: 'course-1', revision: 0 }]) {
    assert.equal(toolCardResult('teacher.draft_homework', { result }), undefined)
  }
})
