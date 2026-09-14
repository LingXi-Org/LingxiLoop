import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import type { Pool, PoolClient } from 'pg'
import { packageResources, releaseVersions } from '@lyyzka/lingxios'
import { ensureEducationPlan } from '../modules/entitlements/public.js'
import { pool } from './pool.js'

const MIGRATIONS_URL = new URL('./migrations/', import.meta.url)
const MIGRATION_FILE = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/
const LOCK_KEY = 1_282_006_534
const NATIVE_INSTALL_VERSION = 10
const RUNTIME_UPGRADE_VERSION = 12
const retiredTables = ['approvals','agent_events','agent_runs','agent_host_actions','agent_os_session_leases',
  'agent_os_session_routes','agent_os_workers','agent_os_sessions','agent_work_items','agent_workspace',
  'agent_memory_evidence','agent_autonomy_rules','agent_action_executions','agent_tasks','agent_triages','tool_calls',
  'agent_handoffs','agent_routine_runs']

async function assertRetiredRuntimeEmpty(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ schemaname: string; tablename: string }>(
    `SELECT schemaname,tablename FROM pg_tables WHERE (schemaname='public' AND tablename=ANY($1::text[]))
      OR (schemaname='lingxios' AND tablename<>'schema_version') ORDER BY schemaname,tablename`, [retiredTables],
  )
  for (const row of rows) {
    const name = [row.schemaname,row.tablename].map(part => `"${part.replaceAll('"','""')}"`).join('.')
    await client.query(`LOCK TABLE ${name} IN ACCESS EXCLUSIVE MODE`)
    const result = await client.query(`SELECT 1 FROM ${name} LIMIT 1`)
    if (result.rows.length) throw new Error('native LingxiOS installation requires an empty retired runtime; rebuild a fresh database after stopping old workers')
  }
}

async function runtimeSchema() {
  const sql = await readFile(packageResources().schema, 'utf8')
  return { sql, hash: createHash('sha256').update(sql).digest('hex') }
}

async function applyRuntimeUpgrade(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ version: number }>(
    'SELECT version FROM lingxios.schema_version WHERE singleton',
  )
  const current = rows[0]?.version
  if (current !== releaseVersions.schema) {
    if (current !== 9 || releaseVersions.schema !== 10) {
      throw new Error(`unsupported LingxiOS schema upgrade from ${current} to ${releaseVersions.schema}`)
    }
    const packaged = await readFile(packageResources().migration010, 'utf8')
    const body = /^--[^\n]*\nBEGIN;\s*\n([\s\S]*?)\nCOMMIT;\s*$/.exec(packaged)?.[1]
    if (!body) throw new Error('invalid packaged LingxiOS migration 010')
    await client.query(body)
  }
  const schema = await runtimeSchema()
  await client.query(`UPDATE public.lingxios_installation
    SET runtime_version=$1,schema_version=$2,protocol_version=$3,schema_sha256=$4,installed_at=NOW()
    WHERE singleton`, [releaseVersions.runtime,releaseVersions.schema,releaseVersions.controlPlane,schema.hash])
}

async function assertRuntimeCurrent(client: PoolClient): Promise<void> {
  const schema = await runtimeSchema()
  const { rows } = await client.query(`SELECT runtime_version,schema_version,protocol_version,schema_sha256,
    (SELECT version FROM lingxios.schema_version WHERE singleton) AS actual_schema FROM public.lingxios_installation WHERE singleton`)
  const row = rows[0]
  if (!row || row.runtime_version !== releaseVersions.runtime || row.schema_version !== releaseVersions.schema
    || row.actual_schema !== releaseVersions.schema || row.protocol_version !== releaseVersions.controlPlane
    || row.schema_sha256 !== schema.hash) throw new Error('installed LingxiOS package/schema mismatch; install a matching package and run the explicit database installation')
  const tables = [...schema.sql.matchAll(/^CREATE TABLE (lingxios\.[a-z_]+)\s*\(/gm)].map(match => match[1])
  if (!tables.length) throw new Error('published LingxiOS schema contains no tables')
  const missing = await client.query('SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NULL', [tables])
  if (missing.rows.length) throw new Error('installed LingxiOS schema is missing required tables')
}

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
    const installsRuntime = migrations.some(migration => migration.version === NATIVE_INSTALL_VERSION && migration.name === 'lingxios_native_runtime')
    const cutover = installsRuntime && applied.length < NATIVE_INSTALL_VERSION
    if (cutover) {
      await client.query('BEGIN')
      try {
        await client.query("SET LOCAL lock_timeout='5s'")
        await assertRetiredRuntimeEmpty(client)
      } catch (error) { await client.query('ROLLBACK'); throw error }
    }
    for (const migration of migrations.slice(applied.length)) {
      if (!cutover) await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        if (installsRuntime && migration.version === NATIVE_INSTALL_VERSION) {
          const schema = await runtimeSchema()
          await client.query(schema.sql)
          await client.query(`INSERT INTO public.lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256)
            VALUES($1,$2,$3,$4)`, [releaseVersions.runtime,releaseVersions.schema,releaseVersions.controlPlane,schema.hash])
        }
        if (migration.version === RUNTIME_UPGRADE_VERSION && migration.name === 'lingxios_3_2') {
          await applyRuntimeUpgrade(client)
        }
        await client.query('SET search_path TO public')
        await client.query(
          'INSERT INTO public.schema_migrations(version,name,checksum) VALUES($1,$2,$3)',
          [migration.version, migration.name, migration.checksum],
        )
        if (!cutover) await client.query('COMMIT')
        appliedNow.push(`${String(migration.version).padStart(4, '0')}_${migration.name}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`migration ${migration.version}_${migration.name} failed`, { cause: error })
      }
    }
    if (cutover) await client.query('COMMIT')
    if (installsRuntime) await assertRuntimeCurrent(client)
    await client.query('BEGIN')
    try {
      await client.query('SET search_path TO public')
      await ensureEducationPlan(client)
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
    if (migrations.some(migration => migration.version === NATIVE_INSTALL_VERSION && migration.name === 'lingxios_native_runtime')) {
      await assertRuntimeCurrent(client)
    }
  } finally {
    client.release()
  }
}
