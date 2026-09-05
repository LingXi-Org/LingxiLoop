import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import type { Pool, PoolClient } from 'pg'
import { ensurePersonalPlans } from '../modules/entitlements/public.js'
import { pool } from './pool.js'

const MIGRATIONS_URL = new URL('./migrations/', import.meta.url)
const MIGRATION_FILE = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/
const LOCK_KEY = 1_282_006_534

interface Migration {
  version: number
  name: string
  checksum: string
  sql: string
}

interface AppliedMigration {
  version: number
  name: string
  checksum: string
}

async function loadMigrations(migrationsUrl: URL): Promise<Migration[]> {
  const migrations = await Promise.all((await readdir(migrationsUrl)).sort().map(async (file) => {
    const match = MIGRATION_FILE.exec(file)
    if (!match) throw new Error(`invalid migration filename: ${file}`)
    const sql = await readFile(new URL(file, migrationsUrl), 'utf8')
    return {
      version: Number(match[1]),
      name: match[2],
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    }
  }))
  for (const [index, migration] of migrations.entries()) {
    const expected = index + 1
    if (migration.version !== expected) {
      throw new Error(`migration sequence must be contiguous from 0001; expected ${expected}, found ${migration.version}`)
    }
  }
  if (migrations.length === 0) throw new Error('no database migrations found')
  return migrations
}

async function migrationTableExists(client: PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
  )
  return rows[0]?.exists === true
}

async function publicRelationCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
     WHERE namespace.nspname='public'
       AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  `)
  return Number(rows[0]?.count ?? 0)
}

async function createMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE public.schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum text NOT NULL,
      applied_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT schema_migrations_version_check CHECK (version > 0),
      CONSTRAINT schema_migrations_checksum_check CHECK (checksum ~ '^[0-9a-f]{64}$')
    )
  `)
}

async function appliedMigrations(client: PoolClient): Promise<AppliedMigration[]> {
  const { rows } = await client.query<AppliedMigration>(
    'SELECT version,name,checksum FROM public.schema_migrations ORDER BY version',
  )
  return rows
}

function validateApplied(migrations: Migration[], applied: AppliedMigration[]): void {
  for (const [index, recorded] of applied.entries()) {
    const migration = migrations[index]
    if (!migration) throw new Error(`applied migration ${recorded.version} has no matching file`)
    if (recorded.version !== migration.version || recorded.name !== migration.name) {
      throw new Error(`applied migration ${recorded.version}_${recorded.name} does not match ${migration.version}_${migration.name}`)
    }
    if (recorded.checksum !== migration.checksum) {
      throw new Error(`checksum mismatch for applied migration ${migration.version}_${migration.name}`)
    }
  }
}

export async function migrateDatabase(
  database: Pool = pool,
  migrationsUrl: URL = MIGRATIONS_URL,
): Promise<readonly string[]> {
  const migrations = await loadMigrations(migrationsUrl)
  const client = await database.connect()
  const appliedNow: string[] = []
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    if (!(await migrationTableExists(client))) {
      const existingRelations = await publicRelationCount(client)
      if (existingRelations > 0) {
        throw new Error(
          `database migrations require an empty untracked public schema; found ${existingRelations} relation(s)`,
        )
      }
      await client.query('BEGIN')
      try {
        await createMigrationTable(client)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }

    const applied = await appliedMigrations(client)
    validateApplied(migrations, applied)
    for (const migration of migrations.slice(applied.length)) {
      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query('SET search_path TO public')
        await client.query(
          'INSERT INTO public.schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
          [migration.version, migration.name, migration.checksum],
        )
        await client.query('COMMIT')
        appliedNow.push(`${String(migration.version).padStart(4, '0')}_${migration.name}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`migration ${migration.version}_${migration.name} failed`, { cause: error })
      }
    }
    await client.query('BEGIN')
    try {
      await client.query('SET search_path TO public')
      await ensurePersonalPlans(client)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    return appliedNow
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY])
    } finally {
      client.release()
    }
  }
}

export async function assertMigrationsCurrent(
  database: Pool = pool,
  migrationsUrl: URL = MIGRATIONS_URL,
): Promise<void> {
  const migrations = await loadMigrations(migrationsUrl)
  const client = await database.connect()
  try {
    if (!(await migrationTableExists(client))) {
      throw new Error('database migrations are not initialized; run `npm run db:migrate` against an empty database')
    }
    const applied = await appliedMigrations(client)
    validateApplied(migrations, applied)
    if (applied.length !== migrations.length) {
      throw new Error(`database has ${applied.length} migration(s), but ${migrations.length} are required; run \`npm run db:migrate\``)
    }
  } finally {
    client.release()
  }
}
