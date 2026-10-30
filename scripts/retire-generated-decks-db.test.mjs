import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { test } from 'node:test'
import { Pool } from 'pg'
import { databaseInventory, productReferences, runtimeReferences } from './retire-generated-decks.mjs'

test('inventory evaluates source content in PostgreSQL and returns only counts and object metadata', async () => {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL ?? '')
  assert.ok(['127.0.0.1','localhost','postgres'].includes(source.hostname) && /(?:^|[_-])test(?:$|[_-])/i.test(source.pathname.slice(1)) && !source.search)
  const name = `retirement_metadata_${randomUUID().replaceAll('-', '')}_test`
  const admin = new Pool({ connectionString: source.toString(), max: 1 })
  let db
  try {
    await admin.query(`CREATE DATABASE ${name}`)
    source.pathname = '/' + name; db = new Pool({ connectionString: source.toString(), max: 1 })
    await db.query(`CREATE SCHEMA lingxios; CREATE TABLE public.presentations(id text); CREATE TABLE public.presentation_jobs(id text);
      CREATE TABLE public.presentation_evidence(id text); CREATE TABLE public.presentation_pages(id text); CREATE TABLE public.presentation_versions(id text);
      CREATE TABLE public.im_send_acceptances(payload jsonb,echo jsonb); CREATE TABLE public.uploaded_files(storage_key text,body text);
      CREATE TABLE lingxios.agent_results(work_id text,message jsonb); CREATE TABLE lingxios.agent_steps(work_id text,artifacts jsonb);
      CREATE TABLE lingxios.agent_work_items(id text,tenant_id text,agent_id text); CREATE TABLE lingxios.agent_action_intents(idempotency_key text,intent jsonb);
      CREATE TABLE lingxios.agent_action_ledger(idempotency_key text,result jsonb); CREATE TABLE lingxios.agent_run_events(run_id text,data jsonb);
      INSERT INTO lingxios.agent_work_items VALUES ('run','tenant','agent');
      INSERT INTO public.presentations VALUES ('synthetic'); INSERT INTO public.uploaded_files VALUES ('presentation-artifacts/shared','PRIVATE USER TEXT');`)
    const a = { path: 'presentations/a.html', sha256: 'a'.repeat(64), source: { ref: 'presentation:deck' } }
    await db.query('INSERT INTO lingxios.agent_results VALUES ($1,$2)', ['run', { body: 'PRIVATE MESSAGE TEXT', artifacts: [a] }])
    await db.query('INSERT INTO public.im_send_acceptances VALUES ($1,$2)', [{ content: [{ type:'data',name:'presentation-artifact' },{type:'text',text:'PRIVATE MESSAGE TEXT'}] }, null])
    const intercepted = { query: async (...args) => { const value = await db.query(...args); assert.doesNotMatch(JSON.stringify(value.rows), /PRIVATE (?:USER|MESSAGE) TEXT/); return value } }
    const inventory = await databaseInventory(intercepted)
    assert.deepEqual(inventory.tables['public.presentations'], { exists: true, rows:'1' })
    assert.deepEqual(inventory.tables['lingxios.lecture_decks'], { exists: false, rows:'0' })
    assert.deepEqual(inventory.rewrites, { im_payload:'1', im_echo:'0', agent_result_message:'1', agent_step_artifacts:'0' })
    const key = `artifacts/${createHash('sha256').update(JSON.stringify(['tenant','agent','run'])).digest('hex')}/${a.sha256}`
    assert.deepEqual(await runtimeReferences(intercepted), [{key,generated:true,shared:false}])
    assert.deepEqual([...await productReferences(intercepted,['presentation-artifacts/shared','presentation-artifacts/unreferenced'])], ['presentation-artifacts/shared'])
    await db.query('INSERT INTO lingxios.agent_steps VALUES ($1,$2)', ['run', JSON.stringify([{ ...a,source:{ref:'document:user'} }])])
    assert.deepEqual(await runtimeReferences(intercepted), [{key,generated:true,shared:true}])
    await db.query('UPDATE lingxios.agent_results SET message=$1', [{body:'PRIVATE MESSAGE TEXT'}])
    assert.deepEqual(await runtimeReferences(intercepted), [])
    assert.deepEqual(await runtimeReferences(intercepted,[key]), [{key,generated:false,shared:true}])
  } finally {
    if (db) { await db.end(); await admin.query(`DROP DATABASE ${name}`) }
    await admin.end()
  }
})
