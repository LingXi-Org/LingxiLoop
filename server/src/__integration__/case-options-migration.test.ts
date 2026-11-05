import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Pool } from 'pg'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { ensureEducationPlan } from '../modules/entitlements/public.js'

test('formal24 product61 upgrades atomically to62, preserves data, and repeats as a no-op', async () => {
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(url.hostname, '127.0.0.1')
  const template = url.pathname.slice(1)
  assert.match(template, /^[a-zA-Z0-9_]*_test$/)
  const name = `cases_migration_${randomUUID().replaceAll('-', '')}_test`
  url.pathname = '/postgres'
  const admin = new Pool({ connectionString: url.toString(), max: 1 })
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`)
  url.pathname = `/${name}`
  const db = new Pool({ connectionString: url.toString(), max: 1 })
  try {
    // This cloned test fixture may originate from a product63/formal4 template.
    // The owning test runs with the actual formal24 package; construct its prior
    // provenance only inside the disposable clone before capturing preservation.
    await db.query("UPDATE lingxios_installation SET runtime_version='3.8.24'")
    // Derive the exact prior product fixture from the verified, dedicated test schema.
    await db.query(`
      DROP TABLE IF EXISTS artifact_operations, artifact_document_state, artifact_editor_contexts;
      DROP TABLE organization_case_options;
      DELETE FROM schema_migrations WHERE version >= 62;
    `)
    assert.deepEqual(
      (await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row => row.version),
      Array.from({ length: 61 }, (_, index) => index + 1),
    )
    const plan = await ensureEducationPlan(db)
    await db.query("INSERT INTO companies(id,name,slug,type,plan_id) VALUES('migration-school','School','migration-school','EDUCATION',$1)", [plan])
    await db.query("INSERT INTO users(id,email,display_name) VALUES('migration-teacher','migration@example.invalid','Teacher')")
    await db.query(`INSERT INTO organization_cases(id,company_id,created_by,draft,published) VALUES
      ('migration-public','migration-school','migration-teacher','{"category":"Draft only"}','{"category":"Public"}'),
      ('migration-draft','migration-school','migration-teacher','{"category":"Hidden"}',NULL)`)
    const articles = (await db.query("SELECT id,draft,published FROM organization_cases WHERE company_id='migration-school' ORDER BY id")).rows
    const original = (await db.query('SELECT * FROM lingxios_installation')).rows
    await db.query("CREATE TABLE case_preserve_fixture(value text); INSERT INTO case_preserve_fixture VALUES('keep')")
    await db.query("UPDATE lingxios_installation SET runtime_version='3.8.23'")
    await assert.rejects(migrateDatabase(db))
    assert.equal((await db.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version, 61)
    await db.query("UPDATE lingxios_installation SET runtime_version='3.8.24'; CREATE TABLE organization_case_options(collision integer)")
    await assert.rejects(migrateDatabase(db), /62_case_options failed/)
    assert.equal((await db.query('SELECT max(version) AS version FROM schema_migrations')).rows[0].version, 61)
    await db.query('DROP TABLE organization_case_options')
    assert.deepEqual(await migrateDatabase(db), ['0062_case_options'])
    assert.deepEqual(await migrateDatabase(db), [])
    await assertMigrationsCurrent(db)
    assert.deepEqual((await db.query("SELECT kind,name FROM organization_case_options WHERE company_id='migration-school'")).rows, [{ kind: 'category', name: 'Public' }])
    assert.deepEqual((await db.query("SELECT id,draft,published FROM organization_cases WHERE company_id='migration-school' ORDER BY id")).rows, articles)
    assert.deepEqual((await db.query('SELECT * FROM lingxios_installation')).rows, original)
    assert.deepEqual((await db.query('SELECT * FROM case_preserve_fixture')).rows, [{ value: 'keep' }])
    await assert.rejects(db.query("INSERT INTO organization_case_options VALUES('missing','college','Name',now())"), { code: '23503' })
  } finally {
    await db.end(); await admin.query(`DROP DATABASE "${name}"`); await admin.end()
  }
})
