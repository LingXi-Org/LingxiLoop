import assert from 'node:assert/strict'
import test from 'node:test'
import { readPublicLlmTrace } from '../agent-runtime/trace-activity.js'
import type { Queryable } from '../db/queryable.js'

test('LLM presentation read is scoped and zero-default costs remain unknown', async () => {
  let query = '',parameters: readonly unknown[] = []
  const row = { id: 'llm-id',model: 'model-a',status: 'succeeded',latency_ms: 1200,measured: true,input_tokens: 80,output_tokens: 16,cost_usd: '0',cost_estimated: true,priced: false }
  const db = { async query(sql: string,args: readonly unknown[] = []) { query=sql; parameters=args; return { rows: [row],rowCount: 1 } } } as Queryable
  const result = await readPublicLlmTrace({ tenantId: 'tenant',runId: 'run',agentId: 'agent',sessionId: 'session',principalId: 'principal' },db)
  for (const scope of ['company_id','run_id','agent_id','principal_id','session_id','NOT b.internal']) assert.ok(query.includes(scope))
  assert.deepEqual(parameters,['tenant','run','agent','principal','session'])
  assert.equal(result[0]!.cost,null); assert.equal(result[0]!.tokensIn,80)
  assert.equal(result[0]!.durationMs,1200)
  assert.doesNotMatch(query,/SELECT\s+\*|\.error\b|\.prompt\b|\.extras\s*[,\n]/i)
  row.priced=true; row.cost_usd='0.002'
  assert.equal((await readPublicLlmTrace({ tenantId: 'tenant',runId: 'run',agentId: 'agent',sessionId: 'session',principalId: 'principal' },db))[0]!.cost,0.002)
  row.measured=false
  const unknown = (await readPublicLlmTrace({ tenantId: 'tenant',runId: 'run',agentId: 'agent',sessionId: 'session',principalId: 'principal' },db))[0]!
  assert.equal(unknown.cost,null); assert.equal(unknown.tokensIn,null)
})
test('only captured timing, call identity and purpose cross the scoped presentation boundary', async () => {
  let query = ''
  const row = { id: 'lingxios-call',call_id: 'call',model: 'Pro/BAAI/bge-m3',purpose: 'lingxios.embedding',status: 'succeeded',
    latency_ms: 134,measured: true,input_tokens: 10,output_tokens: 0,cost_usd: '0.0000001',cost_estimated: true,priced: true,
    started_at: '1000',completed_at: '1134' }
  const db = { async query(sql: string) { query=sql; return { rows: [row],rowCount: 1 } } } as Queryable
  const result = (await readPublicLlmTrace({ tenantId: 't',runId: 'r',agentId: 'a',sessionId: 's',principalId: 'p' },db))[0]!
  assert.equal(result.apiKind,'embedding'); assert.equal(result.callId,'call')
  assert.equal(result.startedAt,1000); assert.equal(result.completedAt,1134)
  assert.equal(result.cost,0.0000001)
  assert.match(query,/providerPricing/)
  assert.doesNotMatch(query,/created_at\s+(?:AS\s+)?(?:started_at|completed_at)/i)
})
