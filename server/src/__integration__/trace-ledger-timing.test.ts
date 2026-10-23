import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import test from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import { Pool } from 'pg'
import { createNativeMessage } from '../../../src/lib/nativeMessage.js'
import { buildNativeRunTrace,buildRunTrace } from '../agent-runtime/run-trace.js'
import { readPublicLlmTrace } from '../agent-runtime/trace-activity.js'
import { env } from '../env.js'
import { __setLlmClientOverrideForTesting,createEmbedding } from '../llm.js'
import { createOpenAIClient } from '../llm-client.js'
import { __setLlmLedgerOverrideForTesting,recordLlmCall } from '../llm-ledger.js'

// Complete local HTTP provider -> captured invocation -> real PostgreSQL ledger
// -> scoped public trace. Temporary tables and synthetic inputs only.
test('new Pro embedding records exact invocation endpoints and its captured currency/rate through SQL',async () => {
  const url = new URL(process.env.DATABASE_URL!)
  assert.ok(['127.0.0.1','localhost','postgres'].includes(url.hostname));assert.match(url.pathname,/test/i)
  const pool = new Pool({ connectionString: url.toString() }),db = await pool.connect()
  const server = createServer(async (req,res)=>{
    let body = '';for await (const chunk of req) body += chunk
    assert.equal(JSON.parse(body).model,'Pro/BAAI/bge-m3')
    res.writeHead(200,{ 'content-type': 'application/json' })
    res.end(JSON.stringify({ object: 'list',model: 'Pro/BAAI/bge-m3',data: [{ object: 'embedding',index: 0,embedding: [1,2] }],usage: { prompt_tokens: 10,total_tokens: 10 } }))
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address = server.address();assert.ok(address && typeof address === 'object')
  const previousBase = env.OPENAI_BASE_URL,previousRate = process.env.SILICONFLOW_USD_CNY_RATE
  env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1';process.env.SILICONFLOW_USD_CNY_RATE = '7'
  let record: Parameters<typeof recordLlmCall>[0]|undefined
  __setLlmLedgerOverrideForTesting(async value=>{ record=value })
  __setLlmClientOverrideForTesting(()=>createOpenAIClient({ apiKey: 'synthetic-test-key',baseURL: `http://127.0.0.1:${address.port}/v1` }))
  try {
    await db.query('BEGIN')
    await db.query(`CREATE TEMP TABLE agent_run_bindings(company_id text,run_id text,agent_id text,principal_id text,session_id text,internal boolean) ON COMMIT DROP;
      CREATE TEMP TABLE llm_calls(id text PRIMARY KEY,company_id text,agent_id text,run_id text,conversation_id text,purpose text,source text,model text,
        input_tokens integer,cached_input_tokens integer,output_tokens integer,cost_usd numeric,cost_estimated boolean,measured boolean,latency_ms integer,
        status text,error text,extras jsonb,created_at timestamptz DEFAULT clock_timestamp()) ON COMMIT DROP`)
    const identity = { tenantId: 'synthetic',runId: 'run',agentId: 'agent',sessionId: 'session',principalId: 'human' }
    await db.query('INSERT INTO agent_run_bindings VALUES($1,$2,$3,$4,$5,false)',[identity.tenantId,identity.runId,identity.agentId,identity.principalId,identity.sessionId])
    const began = Date.now()
    await createEmbedding({ companyId: identity.tenantId,runId: identity.runId,agentId: identity.agentId,purpose: 'lingxios.embedding',source: 'agent-os' },
      { model: 'Pro/BAAI/bge-m3',input: 'PRIVATE_SYNTHETIC_INPUT' })
    const finished = Date.now();assert.ok(record)
    __setLlmLedgerOverrideForTesting(null)
    await recordLlmCall(record,db,'new-pro-embedding')
    const row = (await readPublicLlmTrace(identity,db))[0]!
    assert.equal(row.apiKind,'embedding');assert.equal(row.model,'Pro/BAAI/bge-m3')
    assert.ok(row.startedAt! >= began && row.completedAt! <= finished && row.completedAt! >= row.startedAt!)
    assert.equal(row.tokensIn,10);assert.equal(row.tokensOut,0)
    assert.ok(Math.abs(row.cost!-0.0000001)<1e-15)
    assert.equal(row.costEstimated,true)
    assert.ok(row.costBreakdown)
    assert.equal(row.costBreakdown.length,1)
    assert.equal(row.costBreakdown[0].currency,'CNY')
    assert.ok(Math.abs(row.costBreakdown[0].amount-0.0000007)<1e-18)
    assert.equal(row.costBreakdown[0].estimated,true)
    assert.equal(row.costPricing?.inputPerMillion,0.07)
    assert.equal(row.costPricing?.version,'siliconflow-cn-2026-10-22')
    const pricing = record.context.extras?.providerPricing as { billingItem: string }|undefined
    assert.ok(pricing)
    assert.equal(pricing.billingItem,'pro/baai/bge-m3.online.input-tokens')
    assert.doesNotMatch(JSON.stringify(row),/PRIVATE_SYNTHETIC_INPUT/)
    await recordLlmCall({ ...record,model: 'BAAI/bge-m3',costUsd: 0,latencyMs: 134,
      context: { ...record.context,extras: { callId: 'historical' } } },db,'historical-bge')
    const old = (await readPublicLlmTrace(identity,db)).find(call=>call.model === 'BAAI/bge-m3')!
    assert.equal(old.cost,null);assert.equal(old.startedAt,null);assert.equal(old.completedAt,null)
    assert.equal(old.costBreakdown,undefined)
    const ledgerBefore = (await db.query('SELECT id,model,cost_usd,extras FROM llm_calls ORDER BY id')).rows
    const calls = await readPublicLlmTrace(identity,db)
    const trace = buildRunTrace({ runId: 'run',createdAt: new Date(began).toISOString(),lifecycle: 'succeeded',tools: [],llm: calls })
    assert.deepEqual(trace.root.costBreakdown,row.costBreakdown)
    assert.equal(trace.root.cost,null)
    const native = buildNativeRunTrace({ version: 1,runId: 'run',rootSpanId: 'root',requestVersion: 1,fence: 1,seq: 2,
      revision: 'synthetic-cny',queuedAt: began,origin: began,truncated: false,spans: [
        { spanId: 'root',parentSpanId: null,runId: 'run',kind: 'agent',state: 'complete',startedAt: began,completedAt: finished,
          timingBasis: 'run-execution',seq: 2,revision: 'root',requestVersion: 1,fence: 1,attemptId: null },
        { spanId: 'embedding',parentSpanId: 'root',runId: 'run',kind: 'llm',state: 'complete',startedAt: row.startedAt!,completedAt: row.completedAt!,
          timingBasis: 'model-invocation',seq: 2,revision: 'call',requestVersion: 1,fence: 1,attemptId: 'attempt',callId: row.callId,
          model: row.model,usageAvailable: true,inputTokens: row.tokensIn!,outputTokens: 0,costMicros: 0 },
      ] },[],calls)
    assert.equal(native.root.children.length,1)
    assert.deepEqual(native.root.costBreakdown,row.costBreakdown)
    assert.equal(native.root.cost,row.cost)
    assert.deepEqual((await db.query('SELECT id,model,cost_usd,extras FROM llm_calls ORDER BY id')).rows,ledgerBefore,'presentation never rewrites historical model or settlement data')
    if (process.env.ISSUE297_CNY_SNAPSHOTS) {
      const snapshot = (runTrace: typeof trace) => ({ message: createNativeMessage({ id: 'run-run',role: 'assistant',createdAt: new Date(began).toISOString(),
        content: [{ type: 'text',text: '合成计价验证完成。' }],status: { type: 'complete',reason: 'stop' },custom: { runId: 'run',runTrace,
          activityPresentation: { version: 1 },harness: { ...createRunView('run'),requestVersion: 1,fence: 1,lifecycle: 'succeeded',delivery: 'delivered',artifacts: [] } } }) })
      const destination = process.env.ISSUE297_CNY_SNAPSHOTS
      mkdirSync(dirname(destination),{ recursive: true })
      writeFileSync(destination,JSON.stringify({ live: snapshot(native),history: snapshot(trace),replay: snapshot(JSON.parse(JSON.stringify(trace))) }))
    }
    assert.deepEqual(await readPublicLlmTrace({ ...identity,principalId: 'other' },db),[])
  } finally {
    __setLlmClientOverrideForTesting(null);__setLlmLedgerOverrideForTesting(null)
    env.OPENAI_BASE_URL=previousBase
    if(previousRate === undefined)delete process.env.SILICONFLOW_USD_CNY_RATE;else process.env.SILICONFLOW_USD_CNY_RATE=previousRate
    await db.query('ROLLBACK');db.release();await pool.end()
    await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()))
  }
})
