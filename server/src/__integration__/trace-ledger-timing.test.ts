import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { Pool } from 'pg'
import { env } from '../env.js'
import { createOpenAIClient } from '../llm-client.js'
import { __setLlmClientOverrideForTesting,createEmbedding } from '../llm.js'
import { __setLlmLedgerOverrideForTesting,recordLlmCall } from '../llm-ledger.js'
import { readPublicLlmTrace } from '../agent-runtime/trace-activity.js'

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
    const pricing = record.context.extras?.providerPricing as { billingItem: string }|undefined
    assert.ok(pricing)
    assert.equal(pricing.billingItem,'pro/baai/bge-m3.online.input-tokens')
    assert.doesNotMatch(JSON.stringify(row),/PRIVATE_SYNTHETIC_INPUT/)
    await recordLlmCall({ ...record,model: 'BAAI/bge-m3',costUsd: 0,latencyMs: 134,
      context: { ...record.context,extras: { callId: 'historical' } } },db,'historical-bge')
    const old = (await readPublicLlmTrace(identity,db)).find(call=>call.model === 'BAAI/bge-m3')!
    assert.equal(old.cost,null);assert.equal(old.startedAt,null);assert.equal(old.completedAt,null)
    assert.deepEqual(await readPublicLlmTrace({ ...identity,principalId: 'other' },db),[])
  } finally {
    __setLlmClientOverrideForTesting(null);__setLlmLedgerOverrideForTesting(null)
    env.OPENAI_BASE_URL=previousBase
    if(previousRate === undefined)delete process.env.SILICONFLOW_USD_CNY_RATE;else process.env.SILICONFLOW_USD_CNY_RATE=previousRate
    await db.query('ROLLBACK');db.release();await pool.end()
    await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()))
  }
})
