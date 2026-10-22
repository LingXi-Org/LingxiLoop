import assert from 'node:assert/strict'
import test from 'node:test'
import { readRunTrace,type RunTrace,type TraceSpan } from './runTrace'

// Review follow-up failure: a persisted trace DTO bypasses new tool projection.
// Normalize only exact, previously generated system summaries without writes.
test('historical nested trace outputs remove known generated diagnostics while preserving stored and real outputs',()=>{
  const child: TraceSpan = { id: 'saved',name: '保存可视化',kind: 'tool',status: 'complete',start: 1,end: 2,durationMs: 1,
    tokensIn: null,tokensOut: null,cost: null,costEstimated: false,children: [],
    output: '可视化内容已保存；展示引用是否交付会在答复中确认。' }
  const trace: RunTrace = { version: 1,startedAt: 1000,truncated: false,limitations: [],root: { ...child,id: 'root',name: '运行',kind: 'agent',output: undefined,
    children: [{ ...child,id: 'nested',kind: 'agent',output: undefined,children: [child] },
      { ...child,id: 'real',output: '已保存绘制的三个数据系列。' },
      { ...child,id: 'failed',status: 'error',output: '保存可视化未完成；本次工具调用没有确认交付结果。' },
      { ...child,id: 'script',name: '执行脚本',status: 'error',output: '本次脚本执行未完成，请以已确认的工具结果为准。' },
      { ...child,id: 'legacy-embedding',name: '模型调用',kind: 'llm',model: 'BAAI/bge-m3',cost: 0.02,output: undefined }] } }
  const original = JSON.stringify(trace),projected = readRunTrace(trace)!
  assert.equal(projected.root.children[0]!.children[0]!.output,'可视化内容已保存。')
  assert.equal(projected.root.children[1]!.output,'已保存绘制的三个数据系列。')
  assert.equal(projected.root.children[2]!.output,'保存可视化未完成，请重试。')
  assert.equal(projected.root.children[3]!.output,'脚本执行未完成，请重试。')
  assert.equal(projected.root.children[4]!.kind,'embedding');assert.equal(projected.root.children[4]!.name,'向量编码')
  assert.equal(projected.root.children[4]!.model,'BAAI/bge-m3');assert.equal(projected.root.children[4]!.cost,0.02)
  assert.equal(JSON.stringify(trace),original)
})
test('legacy creation anchors never masquerade as the missing execution start',()=>{
  const trace = { version: 1,startedAt: 1000,truncated: false,limitations: ['terminal-time'],root: {
    id: 'run',name: '运行',kind: 'agent',status: 'complete',start: 0,end: null,durationMs: null,tokensIn: null,tokensOut: null,cost: null,costEstimated: false,children: [],
  } }
  assert.equal(readRunTrace(trace)!.root.start,null)
  assert.equal(trace.root.start,0)
})
