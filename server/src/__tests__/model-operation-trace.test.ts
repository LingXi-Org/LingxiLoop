import assert from 'node:assert/strict'
import test from 'node:test'
import { readPublicLlmTrace } from '../agent-runtime/trace-activity.js'
import { buildRunTrace, buildNativeRunTrace } from '../agent-runtime/run-trace.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'
import type { Queryable } from '../db/queryable.js'
import type { RunTraceSnapshot } from '@lyyzka/lingxios'

// Failure model precedes code: docs/evidence/issue-334-performance/FAILURE-MODEL.md.
test('scoped usage propagates only safe invocation operations; labels preserve every real call', async () => {
  let query = ''
  const rows = ['generation', 'correction', 'content-review', 'PRIVATE_PROMPT', undefined].map((operation, index) => ({
    id: 'call-' + index, call_id: 'native-' + index, operation, model: 'fixture', purpose: 'lingxios.structured', status: 'succeeded',
    latency_ms: 100, measured: true, input_tokens: 10, output_tokens: 2, cost_usd: '0.01', priced: true, cost_estimated: true,
    started_at: '1000', completed_at: '1100' }))
  const db = { async query(sql: string) { query = sql; return { rows, rowCount: rows.length } } } as Queryable
  const calls = await readPublicLlmTrace({ tenantId: 't', runId: 'r', agentId: 'a', sessionId: 's', principalId: 'p' }, db)
  assert.match(query, /extras->>'operation'/)
  assert.deepEqual(calls.map(call => Reflect.get(call, 'operation')), [undefined, undefined, 'content-review', 'correction', 'generation'])
  assert.doesNotMatch(JSON.stringify(calls), /PRIVATE_PROMPT/)
  const trace = buildRunTrace({ runId: 'r', createdAt: new Date(1000).toISOString(), lifecycle: 'succeeded', tools: [], llm: calls })
  assert.equal(trace.root.children.length, 5)
  assert.deepEqual(trace.root.children.map(call => call.name).sort(), ['内容验收', '模型调用', '模型调用', '生成回复', '纠正回复'].sort())
  assert.equal(trace.root.tokensIn, 50)
  assert.equal(trace.root.tokensOut, 10)
  assert.equal(trace.root.cost, 0.05)
  assert.ok(runTraceSchema.safeParse(trace).success)
})

test('native operation metadata survives projection without guessing or changing state', () => {
  const root = { spanId: 'root', parentSpanId: null, runId: 'r', kind: 'agent', state: 'partial', startedAt: 1000,
    completedAt: 1200, timingBasis: 'run-execution', requestVersion: 1, fence: 1, attemptId: null, seq: 2, revision: 'root' }
  const snapshot = { version: 1, seq: 2, revision: 'trace', runId: 'r', requestVersion: 1, fence: 1, rootSpanId: 'root', queuedAt: 900,
    origin: 1000, truncated: false, spans: [root, ...['content-review', 'PRIVATE_REASONING'].map((operation, index) => ({ ...root,
      spanId: 'call-' + index, parentSpanId: 'root', kind: 'llm', state: 'complete', timingBasis: 'model-invocation',
      callId: 'native-' + index, model: 'fixture', operation, inputTokens: 5, outputTokens: 2, usageAvailable: true }))] } as RunTraceSnapshot
  const trace = buildNativeRunTrace(snapshot)
  assert.equal(trace.root.status, 'partial')
  assert.equal(trace.root.children.length, 2)
  assert.equal(trace.root.children[0]!.name, '内容验收')
  assert.equal(trace.root.children[1]!.name, '模型调用')
  assert.equal(Reflect.get(trace.root.children[0]!, 'operation'), 'content-review')
  assert.equal(Reflect.get(trace.root.children[1]!, 'operation'), undefined)
  assert.doesNotMatch(JSON.stringify(trace), /PRIVATE_REASONING/)
  assert.ok(runTraceSchema.safeParse(trace).success)
})
