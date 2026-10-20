// Failure model is recorded in FAILURE-MODEL.md before this harness.
// Real runner/SQL against a new loopback-only database; never truncate or adopt one.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir, mkdtemp, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'

const target = new URL(process.env.INTEGRATION_DATABASE_URL ?? '')
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol))
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname))
assert.match(target.pathname, /^\/lingxiloop_219_migration_\d+_test$/)
process.env.DATABASE_URL = target.href
process.env.NODE_ENV = 'test'
const output = process.env.ISSUE219_MIGRATION_OUTPUT
assert.ok(output, 'Set a unique ISSUE219_MIGRATION_OUTPUT directory')
await mkdir(output, { recursive: true })
const source = resolve('server/src/db/migrations')
const stage = await mkdtemp(resolve(tmpdir(), 'issue219-migrations-'))
const hash = data => createHash('sha256').update(data).digest('hex')
const sql47 = await readFile(resolve(source, '0047_memory_continuity.sql'))
assert.equal(hash(sql47), '3d0c372c6fee6c61b3cea64d02cdfd463468b68fb097efe2cbc47d0e8fe263a5')
for (const name of await readdir(source)) {
  if (/^\d{4}_/.test(name) && Number(name.slice(0, 4)) <= 47) await copyFile(resolve(source, name), resolve(stage, name))
}
const migrationUrl = pathToFileURL(stage + '/')
const adminUrl = new URL(target); adminUrl.pathname = '/postgres'
const admin = new pg.Client({ connectionString: adminUrl.href })
await admin.connect()
try {
  const name = target.pathname.slice(1)
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0,
    'Choose a fresh database; this harness never drops an existing database')
  await admin.query(`CREATE DATABASE "${name}"`)
} finally { await admin.end() }
const db = new pg.Pool({ connectionString: target.href })
const { migrateDatabase, assertMigrationsCurrent } = await import('../../../server/src/db/migrate.ts')
const { closeDatabasePools } = await import('../../../server/src/db/pool.ts')
try {
  const initial = await migrateDatabase(db, migrationUrl)
  assert.equal(initial.length, 47)
  assert.equal((await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='homeworks' AND column_name='criteria_document'")).rowCount, 0)
  await db.query("INSERT INTO companies(id,name,slug,type,status,plan_id) VALUES ('migration-school','Migration school','migration-school','EDUCATION','ACTIVE','plan-education')")
  await db.query("INSERT INTO users(id,email,display_name) VALUES ('migration-user','migration@example.invalid','Migration user')")
  await db.query("INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by) VALUES ('migration-project','migration-school','TEACHING','plan-education','Migration project','ACTIVE','migration-user')")
  await db.query("INSERT INTO courses(id,company_id,project_id,created_by) VALUES ('migration-course','migration-school','migration-project','migration-user')")
  await db.query("INSERT INTO course_forum_posts(id,company_id,project_id,author_user_id,kind,title,body) VALUES ('legacy-post','migration-school','migration-project','migration-user','share','Legacy post',$1)", ['Old body **literal**\nSecond line'])
  await db.query("INSERT INTO homeworks(id,company_id,project_id,course_id,created_by,title,instructions,criteria,visible_hash) VALUES ('legacy-homework','migration-school','migration-project','migration-course','migration-user','Legacy homework','Old instructions',$1::jsonb,'old-hash')", [JSON.stringify(['First **literal** criterion\nwith a second line', 'Second criterion'])])
  const snapshot = async () => ({
    post: (await db.query("SELECT to_jsonb(p) AS value FROM course_forum_posts p WHERE id='legacy-post'")).rows[0].value,
    homework: (await db.query("SELECT to_jsonb(h) AS value FROM homeworks h WHERE id='legacy-homework'")).rows[0].value,
  })
  const before = await snapshot()
  const name48 = '0048_native_content_documents.sql'
  const sql48 = await readFile(resolve(source, name48), 'utf8')
  await copyFile(resolve(source, name48), resolve(stage, name48))
  const upgrade = await migrateDatabase(db, migrationUrl)
  assert.deepEqual(upgrade, ['0048_native_content_documents'])
  const after = await snapshot()
  for (const table of Object.keys(before))
    assert.deepEqual(Object.fromEntries(Object.keys(before[table]).map(key => [key, after[table][key]])), before[table])
  assert.equal(after.post.editor_document, null)
  assert.equal(after.homework.editor_document, null)
  assert.equal(after.homework.criteria_document, null)
  const expected = [
    ['course_forum_posts','editor_document'], ['course_forum_comments','editor_document'],
    ['course_forum_submissions','editor_document'], ['course_forum_feedback','editor_document'],
    ['course_forum_feedback','attachments'], ['course_forum_feedback','links'],
    ['homeworks','editor_document'], ['homeworks','criteria_document'],
    ['homework_teacher_decisions','editor_document'], ['homework_teacher_decisions','attachments'], ['homework_teacher_decisions','links'],
  ]
  for (const [table, column] of expected) {
    const value = (await db.query("SELECT is_nullable,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2", [table,column])).rows[0]
    assert.deepEqual(value, { is_nullable: 'YES', data_type: 'jsonb' })
  }
  const noOp = await migrateDatabase(db, migrationUrl)
  assert.deepEqual(noOp, [])
  await assertMigrationsCurrent(db, migrationUrl)
  // Also prove SQL IF NOT EXISTS idempotence without modifying the ledger.
  const connection = await db.connect()
  try {
    await connection.query('BEGIN')
    await connection.query(sql48)
    await connection.query('COMMIT')
  } catch (error) { await connection.query('ROLLBACK'); throw error }
  finally { connection.release() }
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM schema_migrations')).rows[0].count, 48)
  const ledger = (await db.query('SELECT version,name,checksum FROM schema_migrations WHERE version>=47 ORDER BY version')).rows
  assert.equal(ledger[0].checksum, hash(sql47))
  assert.equal(ledger[1].checksum, hash(sql48))
  const runtime = (await db.query('SELECT runtime_version,schema_version,protocol_version FROM lingxios_installation')).rows[0]
  const receipt = { passed: true, database: target.pathname.slice(1),
    repair: 'f80924de67dd8bd8734c1af62b1f442bae2ce8a6',
    migration47Source: 'LingXi-Org/LingxiLoop@cef2349c71f576ca53e76a1b12eacfdec5f75eba',
    initialCount: initial.length, upgrade, noOp, nullableJsonbColumns: expected.length,
    oldRowsPreserved: true, directSqlReplayPassed: true, ledger, runtime,
    limitation: 'Real product 47→48 on this repair/runtime3.5.6; does not validate #216 migration-runner/runtime schema13 combination. Borrowed 0047 is not part of this branch.' }
  await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  await writeFile(resolve(output, 'old-rows.json'), JSON.stringify({ before, after }, null, 2) + '\n')
  console.log(JSON.stringify(receipt, null, 2))
} finally { await db.end(); await closeDatabasePools() }
