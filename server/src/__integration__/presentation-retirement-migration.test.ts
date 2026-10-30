import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { Pool } from 'pg'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { pool } from '../db/pool.js'

after(() => pool.end())

test('58 to59 removes generated tables and typed outputs while retaining shared rows and a second migration is a no-op', async () => {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname))
  assert.match(source.pathname, /(?:^|_)test(?:_|$)/)
  assert.equal(source.searchParams.has('host'), false)
  const name = `retirement_${randomUUID().replaceAll('-', '')}_test`
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres'
  const target = new URL(source); target.pathname = `/${name}`
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  const directory = await mkdtemp(join(tmpdir(), 'presentation-retirement58-'))
  let owned = false, database: Pool | undefined
  try {
    await admin.query(`CREATE DATABASE ${name}`); owned = true
    database = new Pool({ connectionString: target.toString(), max: 2 })
    const migrations = new URL('../db/migrations/', import.meta.url)
    for (const file of await readdir(migrations)) if (Number(file.slice(0, 4)) <= 58) await copyFile(new URL(file, migrations), join(directory, file))
    assert.equal((await migrateDatabase(database, pathToFileURL(`${directory}${sep}`))).length, 58)
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('teacher583','teacher583@example.test','Teacher');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('school583','School','school583','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
        VALUES('project583','school583','TEACHING','plan-education','Course','ACTIVE','teacher583');
      INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES('chat583','school583','project583','group','Class','[]');
      INSERT INTO presentations(id,company_id,project_id,conversation_id,authorization_user_id,visibility_scope,title,request_text,target_page_count)
        VALUES('deck583','school583','project583','chat583','teacher583','PROJECT','Synthetic deck','Synthetic request',3);
      INSERT INTO presentation_jobs(id,company_id,presentation_id,kind,status,stage,idempotency_key)
        VALUES('job583','school583','deck583','initial','queued','waitingForSources','synthetic583');
      INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref)
        VALUES('run583','school583','agent583','chat583','turn','interactive','trigger583');
      INSERT INTO llm_calls(id,company_id,purpose,source,model,status,input_tokens,output_tokens,cost_usd)
        VALUES('bill583','school583','presentation-generation','product','synthetic','succeeded',100,50,0.25);`)
    const artifact = { path: 'presentations/deck583.html', sha256: 'a'.repeat(64), source: { ref: 'presentation:deck583' } }
    const sharedArtifact = { path: 'uploads/lesson.pptx', sha256: 'b'.repeat(64), source: { ref: 'document:lesson583' } }
    const kept = { type: 'text', text: 'Learner text mentioning presentations and presentation:deck583 stays.' }
    const message = { envelope: { body: kept.text, presentations: [{ type: 'presentation-artifact', fields: { artifactId: 'deck583' } }, { type: 'memory-summary', fields: { id: 'memory583' } }], artifacts: [artifact, sharedArtifact] } }
    const payload = { content: [kept, { type: 'data', name: 'presentation-artifact', data: { artifactId: 'deck583' } }, { type: 'file', data: 'attachments/lesson.pptx' }], metadata: { custom: { refs: { presentationId: 'deck583', agentId: 'agent583' } } } }
    await database.query(`INSERT INTO im_send_acceptances(company_id,user_id,client_nonce,input_digest,channel_id,channel_type,payload,echo)
      VALUES('school583','teacher583','synthetic583','digest','chat583',2,$1,$1)`, [payload])
    await database.query(`INSERT INTO lingxios.agent_results(id,work_id,request_version,fence,home_epoch,message) VALUES('result583','run583',1,0,1,$1)`, [message])
    await database.query(`INSERT INTO lingxios.agent_steps(work_id,step_id,request_version,kind,input_hash,input,artifacts) VALUES('run583','step583',1,'ipython','hash','{}',$1)`, [JSON.stringify([artifact, sharedArtifact])])
    const shared = (await database.query('SELECT * FROM projects')).rows
    const ledger = (await database.query('SELECT * FROM llm_calls')).rows
    const provenance = (await database.query('SELECT * FROM lingxios_installation')).rows
    // An unexpected shared FK aborts instead of cascading into another owner.
    await database.query("CREATE TABLE public.synthetic_shared_refs(id text PRIMARY KEY,deck_id text REFERENCES public.presentations(id)); INSERT INTO synthetic_shared_refs VALUES('shared583','deck583')")
    await assert.rejects(migrateDatabase(database), (error: unknown) => error instanceof Error && error.cause instanceof Error && /depend/.test(error.cause.message))
    assert.equal((await database.query('SELECT COUNT(*) AS count FROM presentations')).rows[0].count, '1')
    assert.deepEqual((await database.query('SELECT message FROM lingxios.agent_results')).rows[0].message, message, 'rewritten mixed content rolls back with DDL')
    await database.query('DROP TABLE public.synthetic_shared_refs')
    assert.deepEqual(await migrateDatabase(database), ['0059_retire_presentation_generation'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    for (const table of ['public.presentations', 'public.presentation_jobs', 'public.presentation_evidence', 'public.presentation_pages', 'public.presentation_versions', 'lingxios.lecture_decks', 'lingxios.lecture_checkpoints']) {
      assert.equal((await database.query('SELECT to_regclass($1) AS name', [table])).rows[0].name, null)
    }
    const expected = { ...payload, content: [kept, payload.content[2]], metadata: { custom: { refs: { agentId: 'agent583' } } } }
    assert.deepEqual((await database.query('SELECT payload,echo FROM im_send_acceptances')).rows, [{ payload: expected, echo: expected }])
    assert.deepEqual((await database.query('SELECT message FROM lingxios.agent_results')).rows[0].message, { envelope: { ...message.envelope, presentations: [message.envelope.presentations[1]], artifacts: [sharedArtifact] } })
    assert.deepEqual((await database.query('SELECT artifacts FROM lingxios.agent_steps')).rows[0].artifacts, [sharedArtifact])
    assert.deepEqual((await database.query('SELECT * FROM projects')).rows, shared)
    assert.deepEqual((await database.query('SELECT * FROM llm_calls')).rows, ledger)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows, provenance)
  } finally {
    if (database) await database.end()
    if (owned) await admin.query(`DROP DATABASE ${name}`)
    await admin.end()
    await rm(directory, { recursive: true, force: true })
  }
})
