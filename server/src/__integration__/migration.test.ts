import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import test from 'node:test'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'

const baselineUrl = new URL('../db/migrations/0001_v1_baseline.sql', import.meta.url)

async function withDatabase(run: (database: Pool, connectionString: string) => Promise<void>): Promise<void> {
  const source = new URL(process.env.INTEGRATION_DATABASE_URL!)
  const databaseName = `lingxiloop_migration_${randomUUID().replaceAll('-', '')}`
  const adminUrl = new URL(source)
  adminUrl.pathname = '/postgres'
  const targetUrl = new URL(source)
  targetUrl.pathname = `/${databaseName}`
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  await admin.query(`CREATE DATABASE ${databaseName}`)
  const database = new Pool({ connectionString: targetUrl.toString(), max: 4 })
  try {
    await run(database, targetUrl.toString())
  } finally {
    await database.end()
    await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`)
    await admin.end()
  }
}

async function withMigrations(run: (url: URL, directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'lingxiloop-migrations-'))
  await copyFile(baselineUrl, join(directory, '0001_v1_baseline.sql'))
  try {
    await run(pathToFileURL(`${directory}${sep}`), directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('an empty database reaches v1 once and repeated migration is a no-op', async () => {
  await withDatabase(async (database) => {
    assert.deepEqual(await migrateDatabase(database), ['0001_v1_baseline'])
    assert.deepEqual(await migrateDatabase(database), [])
    await assertMigrationsCurrent(database)
    const { rows } = await database.query('SELECT version,name FROM schema_migrations ORDER BY version')
    assert.deepEqual(rows, [{ version: 1, name: 'v1_baseline' }])
  })
})

test('a non-empty database without migration history is rejected without mutation', async () => {
  await withDatabase(async (database) => {
    await database.query('CREATE TABLE legacy_data(id integer PRIMARY KEY)')
    await assert.rejects(migrateDatabase(database), /require an empty untracked public schema/)
    const { rows } = await database.query(`SELECT to_regclass('public.schema_migrations') AS migrations`)
    assert.deepEqual(rows, [{ migrations: null }])
  })
})

test('editing an applied migration is rejected by checksum', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await writeFile(join(directory, '0001_v1_baseline.sql'), '-- changed after application\n')
      await assert.rejects(migrateDatabase(database, migrationsUrl), /checksum mismatch/)
    })
  })
})

test('a failed migration rolls back its DDL and history row', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await writeFile(
        join(directory, '0002_failed_change.sql'),
        'CREATE TABLE should_rollback(id integer); SELECT missing_function();\n',
      )
      await assert.rejects(migrateDatabase(database, migrationsUrl), /migration 2_failed_change failed/)
      const { rows } = await database.query(
        `SELECT to_regclass('public.should_rollback') AS failed_table, COUNT(*)::int AS applied FROM schema_migrations`,
      )
      assert.deepEqual(rows, [{ failed_table: null, applied: 1 }])
    })
  })
})

test('concurrent migrators serialize and apply each migration once', async () => {
  await withDatabase(async (database, connectionString) => {
    const second = new Pool({ connectionString, max: 1 })
    try {
      const results = await Promise.all([migrateDatabase(database), migrateDatabase(second)])
      assert.deepEqual(results.map((result) => [...result]).sort((a, b) => b.length - a.length), [
        ['0001_v1_baseline'],
        [],
      ])
      const { rows } = await database.query('SELECT COUNT(*)::int AS count FROM schema_migrations')
      assert.deepEqual(rows, [{ count: 1 }])
    } finally {
      await second.end()
    }
  })
})

test('runtime readiness rejects pending migrations', async () => {
  await withMigrations(async (migrationsUrl, directory) => {
    await withDatabase(async (database) => {
      await migrateDatabase(database, migrationsUrl)
      await writeFile(join(directory, '0002_pending.sql'), 'SELECT 1;\n')
      await assert.rejects(assertMigrationsCurrent(database, migrationsUrl), /run `npm run db:migrate`/)
    })
  })
})
