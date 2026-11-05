import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { Pool } from 'pg'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { pool } from '../db/pool.js'
import { ensureEducationPlan } from '../modules/entitlements/public.js'

after(() => pool.end())

test('product63 preserves legacy bytes and runtime provenance, rolls back failures, and repeats safely', async () => {
  const url = new URL(process.env.INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.search, '')
  const template = url.pathname.slice(1)
  assert.match(template, /^[a-zA-Z0-9_]*_test$/)
  const name = `native_documents_${randomUUID().replaceAll('-', '')}_test`
  url.pathname = '/postgres'
  const admin = new Pool({ connectionString: url.toString(), max: 1 })
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`)
  url.pathname = `/${name}`
  const db = new Pool({ connectionString: url.toString(), max: 1 })
  try {
    await db.query('DROP TABLE IF EXISTS artifact_operations,artifact_document_state,artifact_editor_contexts; DELETE FROM schema_migrations WHERE version=63')
    const originalRuntime = (await db.query('SELECT * FROM lingxios_installation')).rows
    assert.equal(originalRuntime[0]?.runtime_version, '4.0.0')
    const plan = await ensureEducationPlan(db)
    await db.query("INSERT INTO users(id,email,display_name) VALUES('native63-user','native63@example.invalid','Native63')")
    await db.query("INSERT INTO companies(id,name,slug,type,plan_id) VALUES('native63-company','Native63','native63-company','EDUCATION',$1)", [plan])
    await db.query("INSERT INTO projects(id,company_id,kind,name,created_by) VALUES('native63-project','native63-company','TEACHING','Native63','native63-user')")
    await db.query("INSERT INTO artifacts(id,company_id,project_id,kind,title,created_by,origin) VALUES('native63-artifact','native63-company','native63-project','slides','Original','native63-user','user')")
    const bytes = Buffer.from('{"v":4,"title":"Original 原稿","order":[]}\n')
    const sha = createHash('sha256').update(bytes).digest('hex')
    await db.query("INSERT INTO artifact_files(artifact_id,path,sha256,size,content_type,body,updated_by) VALUES('native63-artifact','project/deck.json',$1,$2,'application/json',$3,'native63-user')", [sha, bytes.length, bytes])
    await db.query("INSERT INTO slide_editor_contexts(artifact_id,user_id,context) VALUES('native63-artifact','native63-user','{\"slideId\":\"cover\"}')")
    const files = (await db.query("SELECT * FROM artifact_files WHERE artifact_id='native63-artifact'")).rows
    await db.query("UPDATE lingxios_installation SET runtime_version='3.8.25'")
    await assert.rejects(migrateDatabase(db), /installed LingxiOS package\/schema mismatch/)
    assert.equal((await db.query('SELECT max(version) AS v FROM schema_migrations')).rows[0].v, 62)
    await db.query("UPDATE lingxios_installation SET runtime_version='4.0.0'; CREATE TABLE artifact_operations(collision integer)")
    await assert.rejects(migrateDatabase(db), /63_native_artifact_documents failed/)
    assert.equal((await db.query("SELECT to_regclass('artifact_document_state') AS name")).rows[0].name, null)
    assert.equal((await db.query('SELECT max(version) AS v FROM schema_migrations')).rows[0].v, 62)
    await db.query('DROP TABLE artifact_operations')
    assert.deepEqual(await migrateDatabase(db), ['0063_native_artifact_documents'])
    assert.deepEqual(await migrateDatabase(db), [])
    await assertMigrationsCurrent(db)
    assert.deepEqual((await db.query('SELECT * FROM lingxios_installation')).rows, originalRuntime)
    assert.deepEqual((await db.query("SELECT * FROM artifact_files WHERE artifact_id='native63-artifact'")).rows, files)
    assert.deepEqual((await db.query("SELECT context FROM artifact_editor_contexts WHERE artifact_id='native63-artifact'")).rows, [{ context: { slideId: 'cover' } }])
    assert.equal((await db.query('SELECT count(*)::int AS n FROM artifact_document_state')).rows[0].n, 0, 'DDL never converts documents')
  } finally {
    await db.end()
    await admin.query(`DROP DATABASE "${name}"`)
    await admin.end()
  }
})
