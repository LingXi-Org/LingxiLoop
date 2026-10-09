import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

// Failure cases: business/audit loss, replayable old deliveries, unfinished leases,
// old session context, a partial reset after failure, and a destructive second run.
before(async () => { await ensureSchemaOnce(); await resetAllTables() })
after(async () => { await teardownAll() })

test('message cutover rolls back rehearsal, preserves protected data, and is repeatable', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()
  await pool.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status)
    VALUES('cutover-work',$1,$2,'cutover-room','agent_reply','interactive','cutover-message','queued')`,[companyId,agentId])
  await pool.query(`INSERT INTO lingxios.agent_os_sessions(session_key,tenant_id,agent_id,session_id,history,summary)
    VALUES('cutover-session',$1,$2,'cutover-room','[{"role":"user","content":"old message"}]','old context')`,[companyId,agentId])
  await pool.query(`INSERT INTO lingxios.agent_inbox_events(event_id,work_input) VALUES('cutover-message','{}')`)
  await pool.query(`INSERT INTO agent_native_event_outbox(id,company_id,work_id,event) VALUES
    ('cutover-im',$1,'cutover-work','{"type":"im.system"}'),
    ('cutover-business',$1,'cutover-work','{"type":"document.updated"}')`,[companyId])
  const source = await readFile('scripts/native-message-cutover.mjs','utf8')
  const { resetMessageState } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  const client = await pool.connect()
  try {
    const rehearsal = await resetMessageState(client,false)
    assert.equal(rehearsal.applied,false)
    assert.equal((await client.query('SELECT status FROM lingxios.agent_work_items WHERE id=$1',['cutover-work'])).rows[0].status,'queued')
    assert.equal((await client.query('SELECT count(*)::int AS n FROM lingxios.agent_inbox_events')).rows[0].n,1)
    const result = await resetMessageState(client,true)
    assert.equal(result.applied,true)
    assert.deepEqual((await client.query('SELECT status,lease_token_hash FROM lingxios.agent_work_items WHERE id=$1',['cutover-work'])).rows,[{ status:'cancelled',lease_token_hash:null }])
    assert.deepEqual((await client.query('SELECT history,summary,request_snapshot FROM lingxios.agent_os_sessions')).rows,[{ history:[],summary:null,request_snapshot:null }])
    assert.deepEqual((await client.query('SELECT id FROM agent_native_event_outbox')).rows,[{ id:'cutover-business' }])
    const again = await resetMessageState(client,true)
    assert.ok(Object.values(again.deleted).every(count => count === 0))
    await mkdir('artifacts/native-message',{ recursive:true })
    await writeFile('artifacts/native-message/cutover-rehearsal.json',JSON.stringify({ passed:true,rehearsal,result,repeat:again },null,2))
  } finally { client.release() }
})
