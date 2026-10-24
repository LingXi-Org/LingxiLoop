import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { after, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { pool } from '../db/pool.js'

after(() => pool.end())

// Every destructive fixture action targets only a fresh local database whose
// CREATE succeeded here. No pre-existing test or product database is reset.
test('424 product55 to56 preserves drafts and runtime provenance; status constraint and ledger commit together', { timeout: 120000 }, async () => {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname), 'local fixture only')
  assert.match(source.pathname, /(?:^|_)test(?:_|$)/)
  assert.equal(source.searchParams.has('host'), false)
  const name = `homework_validation_${randomUUID().replaceAll('-', '')}_test`
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres'
  const target = new URL(source); target.pathname = `/${name}`
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  const directory = await mkdtemp(join(tmpdir(), 'homework-validation55-'))
  let owned = false, database: Pool | undefined
  try {
    await admin.query(`CREATE DATABASE ${name}`); owned = true
    database = new Pool({ connectionString: target.toString(), max: 4 })
    const migrations = new URL('../db/migrations/', import.meta.url)
    for (const file of await readdir(migrations)) if (Number(file.slice(0, 4)) <= 55) await copyFile(new URL(file, migrations), join(directory, file))
    assert.equal((await migrateDatabase(database, pathToFileURL(`${directory}${sep}`))).length, 55)
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('validation-teacher','validation@example.test','Teacher');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('validation-school','School','validation-school','EDUCATION','plan-education');
      INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
        VALUES('validation-project','validation-school','TEACHING','plan-education','Course','ACTIVE','validation-teacher');
      INSERT INTO courses(id,company_id,project_id,created_by) VALUES('validation-course','validation-school','validation-project','validation-teacher');
      INSERT INTO homeworks(id,company_id,project_id,course_id,created_by,title,instructions,criteria,visible_hash,validation_status)
        SELECT status,'validation-school','validation-project','validation-course','validation-teacher','Saved title','Saved requirements','["Explain independently"]',repeat('a',64),status
        FROM unnest(ARRAY['PENDING','READY','INVALID']) AS status`)
    const original = (await database.query('SELECT * FROM homeworks ORDER BY id')).rows
    const provenance = (await database.query('SELECT * FROM lingxios_installation')).rows
    const history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    const constraint = async () => (await database!.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='homeworks'::regclass AND conname='homeworks_validation_status_check'")).rows[0].definition as string
    const originalConstraint = await constraint()
    await database.query(`CREATE FUNCTION reject_validation56() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.version=56 THEN RAISE EXCEPTION 'synthetic ledger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_validation56 BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_validation56()`)
    await assert.rejects(migrateDatabase(database), /migration 56_homework_validation_status failed/)
    assert.equal(await constraint(), originalConstraint)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows, history)
    await database.query('DROP TRIGGER reject_validation56 ON schema_migrations; DROP FUNCTION reject_validation56()')
    await database.query("UPDATE lingxios_installation SET runtime_version='3.8.2'")
    await assert.rejects(migrateDatabase(database), /migration 56_homework_validation_status failed/)
    assert.equal(await constraint(), originalConstraint)
    await database.query('UPDATE lingxios_installation SET runtime_version=$1', [provenance[0].runtime_version])
    assert.deepEqual(await migrateDatabase(database), ['0056_homework_validation_status'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    assert.deepEqual((await database.query('SELECT * FROM homeworks ORDER BY id')).rows, original)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows, provenance)
    for (const status of ['ERROR', 'MATERIAL_ERROR']) await database.query("UPDATE homeworks SET validation_status=$1 WHERE id='INVALID'", [status])
    await assert.rejects(database.query("UPDATE homeworks SET validation_status='UNREVIEWED' WHERE id='INVALID'"), /homeworks_validation_status_check/)
  } finally {
    if (database) await database.end()
    if (owned) await admin.query(`DROP DATABASE ${name}`)
    await admin.end()
    await rm(directory, { recursive: true, force: true })
  }
})
