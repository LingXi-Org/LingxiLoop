import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'

import { harnessToolParts } from '../../../../server/src/agent-runtime/message-projection'
import { toolCardResult } from '@/lib/agentToolCards'
import { publicRunEvent } from '../../../../server/src/agent-runtime/public-events'
// The unrelated Canvas editor imports browser-only CSS; retain real card renderers below.
mock.module(new URL('../../canvas/components/CanvasArtifactCard.tsx',import.meta.url).href,{namedExports:{CanvasArtifactCard:()=>null}})
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
