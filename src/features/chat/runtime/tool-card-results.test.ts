import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { harnessParts, harnessToolParts } from './harness'
import { toolCardResult } from '@/lib/agentToolCards'
import { publicRunEvent } from '../../../../server/src/agent-runtime/public-events'
// The unrelated Canvas editor imports browser-only CSS; retain real card renderers below.
mock.module(new URL('../../canvas/components/CanvasArtifactCard.tsx',import.meta.url).href,{namedExports:{CanvasArtifactCard:()=>null}})
const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null}})
after(()=>{if(storage)Object.defineProperty(globalThis,'localStorage',storage);else Reflect.deleteProperty(globalThis,'localStorage')})
const { ViewCalendarEventTool, ScoreBreakdownTool } = await import('../components/ToolRenderers')

const event = { id: 'event', title: '复习', startAt: '2026-09-26T10:00:00Z', endAt: null, allDay: false }
test('calendar tools retain only authorized display fields through live and replayed cards', () => {
  const started = { runId: 'run', seq: 1, kind: 'tool.started', stage: 'started' as const, visibility: 'user' as const,
    data: { toolCallId: 'host:calendar', name: 'calendar.list' } }
  const completed = { ...started, seq: 2, kind: 'tool.completed', stage: 'completed' as const,
    data: { toolCallId: 'host:calendar', result: { status: 'completed', value: { events: [{ ...event, privateNotes: 'secret' }], truncated: false, secret: 'secret' } } } }
  const projected=[completed, started].map(item=>publicRunEvent(item,'calendar.list'))
  const tools = harnessToolParts('run', projected)
  assert.deepEqual(tools[0].result, { status: 'completed', value: { events: [event], truncated: false } })
  const html=renderToStaticMarkup(createElement(ViewCalendarEventTool,tools[0] as ToolCallMessagePartProps))
  assert.match(html,/复习/)
  assert.doesNotMatch(html,/secret|privateNotes/)
  assert.deepEqual(harnessToolParts('run', [started, completed], tools), tools)
  const view = { ...createRunView('run'), lifecycle: 'leased' as const, draft: '正在解释。' }
  assert.deepEqual(harnessParts(view, tools), [{ type: 'text', text: '正在解释。' }, ...tools])
  const pending=harnessToolParts('run',[started])
  assert.deepEqual(harnessParts({...createRunView('run'),lifecycle:'cancelled'},pending)[0],{...pending[0],result:{status:'cancelled'},isError:false})
  assert.deepEqual(harnessParts({...createRunView('run'),lifecycle:'failed'},pending)[0],{...pending[0],result:{status:'failed'},isError:true})
  for(const [result,isError,label] of [[undefined,false,'正在读取日历'],[{status:'cancelled'},false,'日历读取已取消'],[{status:'failed'},true,'日历读取失败']] as const){
    assert.match(renderToStaticMarkup(createElement(ViewCalendarEventTool,{...pending[0],result,isError} as ToolCallMessagePartProps)),new RegExp(label))
  }
  assert.equal(toolCardResult('email.show', { body: 'private email' }), undefined)
  assert.equal(toolCardResult('calendar.get', { ...event, startAt: 'invalid' }), undefined)
})
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
