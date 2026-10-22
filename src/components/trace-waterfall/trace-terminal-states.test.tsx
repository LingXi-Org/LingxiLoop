import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TraceWaterfall } from './trace-waterfall'
import type { RunTrace } from '@/lib/runTrace'

for (const [status,label] of [['partial','未完成'],['blocked','受阻']] as const) test(`ended ${status} is labelled honestly without restarting its clock`,()=>{
  const trace: RunTrace = { version: 1,startedAt: 1000,timingBasis: 'execution',truncated: false,limitations: [],
    root: { id: 'root',name: '运行',kind: 'agent',status,start: 0,end: 500,durationMs: 500,tokensIn: null,tokensOut: null,cost: null,costEstimated: false,children: [] } }
  const html = renderToStaticMarkup(<TraceWaterfall trace={trace} />)
  assert.match(html,new RegExp(`${label} · 500 ms`))
  assert.doesNotMatch(html,/已完成 ·|结果未知 ·|运行中 ·/)
})
