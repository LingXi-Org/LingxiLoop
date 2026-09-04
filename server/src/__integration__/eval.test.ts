import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { createEvalRun } from '../eval/service.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const COMPANY = 'co-eval-integration'
const AGENT = 'agent-eval-integration'
const RUN = 'run-eval-integration'

before(ensureSchemaOnce)
beforeEach(async () => {
  await resetAllTables()
  await pool.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES($1,'Eval Integration','eval-integration','EDUCATION','plan-personal-free')`, [COMPANY])
  await pool.query(
    `INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
     VALUES($1,$2,'agent','Eval Agent','tester','E','#0078c8','avail')`,
    [AGENT, COMPANY],
  )
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,result_text,lease_started_at,finished_at)
     VALUES($1,$2,$3,'channel-eval','message-eval','message','completed','[Grounded answer](#cite-S1)',NOW()-INTERVAL '1 second',NOW())`,
    [RUN, COMPANY, AGENT],
  )
  await pool.query(
    `INSERT INTO agent_runs(id,agent_id,company_id,status,input_tokens,output_tokens,model,finished_at)
     VALUES($1,$2,$3,'completed',80,40,'fixture-model',NOW())`,
    [RUN, AGENT, COMPANY],
  )
})
after(async () => teardownAll())

test('[integration] Eval hydrates dynamic RAG hits but never copies source excerpts', async () => {
  await pool.query(
    `INSERT INTO agent_host_actions
       (idempotency_key,work_id,run_id,cell_id,call_index,action,args,status,result,created_at,updated_at)
     VALUES('eval-action-search',$1,$1,'cell-1',0,'knowledge.search',$2::jsonb,'succeeded',$3::jsonb,NOW()-INTERVAL '100 milliseconds',NOW())`,
    [RUN, JSON.stringify({ query: 'grounding' }), JSON.stringify({
      __hostActionResult: true,
      value: [{
        sourceId: 'dynamic-source', sourceTitle: 'Private Handbook', chunkId: 'dynamic-chunk',
        marker: 'S1', excerpt: 'DO NOT COPY THIS PRIVATE SOURCE PASSAGE', sourceUrl: 'https://example.com/private',
      }],
    })],
  )
  const created = await createEvalRun({
    suiteKey: 'dynamic-rag',
    version: 'integration',
    cases: [{
      caseId: 'dynamic-search',
      sourceAgentRunId: RUN,
      expectations: {
        answer: { requiredKeywords: ['Grounded'] },
        rag: { requiredSourceIds: ['dynamic-source'], requireCitations: true },
        tools: { calls: [{ name: 'knowledge.search' }], requireSuccess: true },
      },
    }],
  }, 'integration-admin')
  assert.equal(created.report.status, 'pass')
  assert.deepEqual(created.report.cases[0].observation.retrievedSourceIds, ['dynamic-source'])
  assert.deepEqual(created.report.cases[0].observation.citations, [{
    sourceId: 'dynamic-source', title: 'Private Handbook', chunkId: 'dynamic-chunk', marker: 'S1',
  }])
  const persisted = await pool.query<{ observation: unknown }>(
    `SELECT observation FROM eval_cases WHERE eval_run_id=$1`, [created.id],
  )
  const serialized = JSON.stringify(persisted.rows[0]?.observation)
  assert.equal(serialized.includes('DO NOT COPY THIS PRIVATE SOURCE PASSAGE'), false)
  assert.equal(serialized.includes('excerpt'), false)
})
