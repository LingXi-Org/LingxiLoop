import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pool } from '../db/pool.js'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'

// Pin the owning boundary; later releases must not rewrite this migration proof.
let directory: string, product57: URL, product56: URL
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'case-delete-migration-'))
  await mkdir(join(directory, '56')); await mkdir(join(directory, '57'))
  product56 = pathToFileURL(`${join(directory, '56')}${sep}`)
  product57 = pathToFileURL(`${join(directory, '57')}${sep}`)
  const migrations = new URL('../db/migrations/', import.meta.url)
  for (const file of await readdir(migrations)) {
    const version = Number(file.slice(0, 4))
    if (version <= 56) await copyFile(new URL(file, migrations), join(directory, '56', file))
    if (version <= 57) await copyFile(new URL(file, migrations), join(directory, '57', file))
  }
})
after(async () => { await pool.end(); if (directory) await rm(directory, { recursive: true, force: true }) })

async function withDatabase(work: (database: Pool) => Promise<void>) {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname))
  assert.match(source.pathname, /(?:^|_)test(?:_|$)/)
  assert.equal(source.searchParams.has('host'), false)
  const name = `case_delete_${randomUUID().replaceAll('-', '')}_test`
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres'
  const target = new URL(source); target.pathname = `/${name}`
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  let owned = false, database: Pool | undefined
  try {
    await admin.query(`CREATE DATABASE ${name}`); owned = true
    database = new Pool({ connectionString: target.toString(), max: 4 })
    await work(database)
  } finally {
    if (database) await database.end()
    if (owned) await admin.query(`DROP DATABASE ${name}`)
    await admin.end()
  }
}

test('product57 fresh install and product56 upgrade retain cases and atomically add tombstones', { timeout: 120000 }, async () => {
  await withDatabase(async database => {
    assert.equal((await migrateDatabase(database, product57)).length, 57)
    assert.deepEqual(await migrateDatabase(database, product57), [])
    await assertMigrationsCurrent(database, product57)
  })
  await withDatabase(async database => {
    assert.equal((await migrateDatabase(database, product56)).length, 56)
    await database.query(`INSERT INTO users(id,email,display_name) VALUES('delete-teacher','delete@example.test','Teacher');
      INSERT INTO companies(id,name,slug,type,plan_id) VALUES('delete-school','School','delete-school','EDUCATION','plan-education');
      INSERT INTO organization_cases(id,company_id,created_by,draft) VALUES('delete-case','delete-school','delete-teacher',
      '{"title":"Preserved","body":"Original","summary":"","category":"","tags":[],"cover":null}');
      INSERT INTO organization_case_images(storage_key,case_id,company_id,created_by) VALUES('case-images/original','delete-case','delete-school','delete-teacher')`)
    const original = (await database.query('SELECT * FROM organization_cases')).rows[0]
    const images = (await database.query('SELECT * FROM organization_case_images')).rows
    const provenance = (await database.query('SELECT * FROM lingxios_installation')).rows
    const history = (await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows
    await database.query(`CREATE FUNCTION reject_delete57() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.version=57 THEN RAISE EXCEPTION 'synthetic ledger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_delete57 BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_delete57()`)
    await assert.rejects(migrateDatabase(database, product57), /migration 57_case_soft_delete failed/)
    assert.equal((await database.query("SELECT 1 FROM information_schema.columns WHERE table_name='organization_cases' AND column_name='deleted_at'")).rowCount, 0)
    assert.deepEqual((await database.query('SELECT * FROM schema_migrations ORDER BY version')).rows, history)
    await database.query('DROP TRIGGER reject_delete57 ON schema_migrations; DROP FUNCTION reject_delete57()')
    await database.query("UPDATE lingxios_installation SET runtime_version='3.8.2'")
    await assert.rejects(migrateDatabase(database, product57), /migration 57_case_soft_delete failed/)
    assert.equal((await database.query("SELECT 1 FROM information_schema.columns WHERE table_name='organization_cases' AND column_name='deleted_at'")).rowCount, 0)
    await database.query('UPDATE lingxios_installation SET runtime_version=$1', [provenance[0].runtime_version])
    assert.deepEqual(await migrateDatabase(database, product57), ['0057_case_soft_delete'])
    assert.deepEqual(await migrateDatabase(database, product57), [])
    await assertMigrationsCurrent(database, product57)
    assert.deepEqual((await database.query('SELECT * FROM organization_cases')).rows[0], { ...original, deleted_at: null })
    assert.deepEqual((await database.query('SELECT * FROM organization_case_images')).rows, images)
    assert.deepEqual((await database.query('SELECT * FROM lingxios_installation')).rows, provenance)
  })
})
