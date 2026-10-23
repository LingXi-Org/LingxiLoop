import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TraceWaterfall } from './trace-waterfall'
import type { RunTrace,TraceSpan } from '@/lib/runTrace'

const child = { id: 'pro',name: '向量编码',kind: 'embedding',model: 'Pro/BAAI/bge-m3',status: 'complete',
  start: 0,end: 100,durationMs: 100,tokensIn: 1000,tokensOut: 0,cost: 0.00001,costEstimated: true,children: [],
  costBreakdown: [{ currency: 'CNY',amount: 0.00007,estimated: true }],costPricing: { currency: 'CNY',inputPerMillion: 0.07,
    cachedInputPerMillion: 0.07,outputPerMillion: 0,billingItem: 'pro/baai/bge-m3.online.input-tokens',version: 'siliconflow-cn-2026-10-22' } } as TraceSpan
const trace: RunTrace = { version: 1,startedAt: 1000,truncated: false,limitations: [],root: { ...child,id: 'root',kind: 'agent',
  model: undefined,name: '运行',costPricing: undefined,children: [child] } }

test('CNY embedding rows, totals and selected price are explicit RMB and preserve tiny nonzero amounts',() => {
  const html = renderToStaticMarkup(<TraceWaterfall trace={trace} selectedSpanId="pro" />)
  assert.match(html,/¥0\.00007/)
  assert.match(html,/CNY/)
  assert.match(html,/¥0\.000070.*千输入 tokens/)
  assert.doesNotMatch(html,/\$0\.00001/)
})
