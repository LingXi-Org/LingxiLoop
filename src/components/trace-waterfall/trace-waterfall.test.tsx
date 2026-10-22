import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TraceWaterfall } from './trace-waterfall'
import type { RunTrace,TraceSpan } from '@/lib/runTrace'

const root: TraceSpan = { id: 'run',name: '运行',kind: 'agent',status: 'complete',start: 0,end: null,durationMs: null,
  tokensIn: 76137,tokensOut: 1105,cost: null,costEstimated: true,knownCost: 0.00850644,costIncomplete: true,children: [
    { id: 'embedding',name: '向量检索',kind: 'embedding',model: 'BAAI/bge-m3',status: 'complete',start: null,end: null,durationMs: 134,
      tokensIn: 10,tokensOut: 0,cost: null,costEstimated: false,children: [] },
    { id: 'chat',name: '模型调用',kind: 'llm',status: 'complete',start: null,end: null,durationMs: 33730,
      tokensIn: 76127,tokensOut: 1105,cost: 0.00850644,costEstimated: true,children: [] },
  ] }
const trace: RunTrace = { version: 1,startedAt: 1000,root,truncated: false,limitations: ['llm-offsets','terminal-time','child-discovery'] }
test('duration-only historical calls have no fabricated axis or positioned timeline bars', () => {
  const html = renderToStaticMarkup(<TraceWaterfall trace={trace} />)
  assert.doesNotMatch(html,/data-trace-axis(?:\s|=)|data-trace-bar(?:\s|=)|>0 ms<|>2 ms<|起点未知|时间未知/)
  assert.match(html,/33,730 ms/); assert.match(html,/134 ms/)
  assert.match(html,/已计约 \$0\.00850644/)
})
test('anchored intervals keep their timeline while duration-only calls remain unpositioned', () => {
  const anchored = { ...trace,root: { ...root,end: 40000,durationMs: 40000,
    children: root.children.map(item=>item.id === 'chat' ? { ...item,start: 500,end: 34230 } : item) } }
  const html = renderToStaticMarkup(<TraceWaterfall trace={anchored} />)
  assert.match(html,/data-trace-axis/); assert.match(html,/data-trace-bar/)
  assert.match(html,/data-trace-duration-only/)
  assert.match(html,/40,000 ms/)
})
