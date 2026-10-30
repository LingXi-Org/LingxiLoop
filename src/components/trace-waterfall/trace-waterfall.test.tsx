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

test('a task can select only a span already present in the authorized trace', () => {
  const selected = renderToStaticMarkup(<TraceWaterfall trace={trace} selectedSpanId="embedding" onSelectedSpanChange={() => {}} />)
  assert.match(selected,/aria-label="查看 向量检索 详情"[^>]*aria-pressed="true"/)
  assert.match(selected,/BAAI\/bge-m3/)
  assert.match(selected,/data-trace-span-id="embedding"/)
  const absent = renderToStaticMarkup(<TraceWaterfall trace={trace} selectedSpanId="private-unavailable" onSelectedSpanChange={() => {}} />)
  assert.doesNotMatch(absent,/aria-label="查看[^"]*详情"[^>]*aria-pressed="true"|private-unavailable/)
})

test('real work types have separate sections without a collapsible catch-all run or synthetic spans', () => {
  const item = (id: string,kind: TraceSpan['kind'],workKind?: TraceSpan['workKind']): TraceSpan => ({
    id,name: id,kind,workKind,status: 'complete',start: 100,end: 300,durationMs: 200,
    tokensIn: null,tokensOut: null,cost: null,costEstimated: false,children: [],
  })
  const child = { ...item('child','agent','subtask'),children: [{ ...item('nested-failed','tool','tool'),status: 'error' as const }] }
  const grouped = { ...trace,root: { ...root,end: 500,durationMs: 500,children: [
    item('model','llm'),item('skill','tool','skill'),item('read','tool','retrieval'),item('tool','tool','tool'),child,
    { ...item('unknown-clock','tool'),start: null,end: null,durationMs: 134 },item('other-agent','agent'),
  ] } }
  const original = JSON.stringify(grouped)
  const html = renderToStaticMarkup(<TraceWaterfall trace={grouped} />)
  for (const kind of ['model','skill','retrieval','tool','subtask','agent']) assert.match(html,new RegExp(`data-trace-group="${kind}"`))
  assert.doesNotMatch(html,/aria-label="(?:展开|收起) 运行"/)
  assert.match(html,/aria-label="查看 运行 详情"/)
  assert.match(html,/data-trace-span-id="nested-failed"[^>]*data-trace-parent-id="child"/)
  assert.match(html,/data-trace-span-id="nested-failed"[^>]*data-trace-status="error"/)
  for (const id of ['run','model','skill','read','tool','child','nested-failed','unknown-clock','other-agent']) {
    assert.equal(html.split(`data-trace-span-id="${id}"`).length-1,1,`${id} stays one real row`)
  }
  assert.match(html,/data-trace-start="" data-trace-end="" data-trace-duration-only=""/)
  assert.equal(JSON.stringify(grouped),original,'presentation never mutates trace facts or accounting')
})

// Search status is separate from model/embedding timing and citation proof.
test('trace renders recorded course search status without treating embeddings as search evidence',()=>{
  const html=renderToStaticMarkup(<TraceWaterfall trace={{...trace,knowledgeSearch:'not_run'}} />)
  assert.match(html,/未调用课程检索工具/);assert.match(html,/BAAI\/bge-m3/)
  assert.doesNotMatch(html,/课程检索已命中/)
  assert.match(renderToStaticMarkup(<TraceWaterfall trace={{...trace,knowledgeSearch:'failed'}} />),/课程检索未完成/)
})
