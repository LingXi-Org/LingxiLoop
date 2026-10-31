import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import type { Pool, PoolClient } from 'pg'
import { packageResources, releaseVersions } from '@lyyzka/lingxios'
import { ensureEducationPlan } from '../modules/entitlements/public.js'
import { pool } from './pool.js'
import { assertMigrationRuntime, assertCurrentRuntimeProfile, assertFull54InstallBoundary, assertRetirementRuntimeVersion, loadLockedRuntimePackage } from './runtime-profile.js'
import { assertDevelopmentQualification, type DevelopmentRuntimeQualification } from './development-runtime-qualification.js'

const MIGRATIONS_URL = new URL('./migrations/', import.meta.url)
const MIGRATION_FILE = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/
const LOCK_KEY = 1_282_006_534
const NATIVE_INSTALL_VERSION = 10
const RUNTIME_UPGRADE_VERSION = 12
const RUNTIME_SCHEMA_RELEASE = '3.3.0'
const RELIABILITY_UPGRADE_VERSION = 43
const LEGACY_RUNTIME_SCHEMA = 11
const LEGACY_RUNTIME_RELEASE = '3.4.7'
// Historical schema gates precede the explicit runtime-only patch migrations.
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

async function runtimeSchema(version: number = releaseVersions.schema) {
  const resources = packageResources()
  const sql = await readFile(version === LEGACY_RUNTIME_SCHEMA ? resources.schema011 : version===12 ? resources.schema012 : version===13 ? resources.schema013 : resources.schema, 'utf8')
  return { sql, hash: createHash('sha256').update(sql).digest('hex') }
}

function packagedTransactionBody(sql: string): string {
  const body = /^(?:--[^\n]*\n|\s)*BEGIN;[ \t]*\n([\s\S]*?)\nCOMMIT;\s*$/.exec(sql)?.[1]
  if (!body) throw new Error('invalid packaged LingxiOS transaction')
  return body
}

async function applyRuntimeUpgrade(client: PoolClient, runtimeVersion = RUNTIME_SCHEMA_RELEASE, targetSchema: number = LEGACY_RUNTIME_SCHEMA): Promise<void> {
  const { rows } = await client.query<{ version: number }>(
    'SELECT version FROM lingxios.schema_version WHERE singleton',
  )
  let current = rows[0]?.version
  if (current !== targetSchema && targetSchema >= 12) {
    if (targetSchema>=13 && process.env.NODE_ENV==='production' && process.env.LINGXIOS_SCHEMA_UPGRADE_DRAINED!=='true') {
      throw new Error(`schema ${targetSchema} requires verified drain of old Web background capture/schedulers and Workers; set LINGXIOS_SCHEMA_UPGRADE_DRAINED only after that drain`)
    }
    await client.query("SET LOCAL lock_timeout='5s'")
    await client.query('LOCK TABLE lingxios.agent_work_items IN SHARE ROW EXCLUSIVE MODE')
    const active = await client.query("SELECT 1 FROM lingxios.agent_work_items WHERE status='leased' AND lease_expires_at>NOW() LIMIT 1")
    if (targetSchema>=13) {
      await client.query('LOCK TABLE lingxios.agent_memory_capture IN SHARE ROW EXCLUSIVE MODE')
      const captures=await client.query('SELECT 1 FROM lingxios.agent_memory_capture WHERE completed_at IS NULL AND claim_until>NOW() LIMIT 1')
      if(captures.rows.length) throw new Error('LingxiOS memory capture is still active; drain old Web background work')
    }
    if (active.rows.length) throw new Error('LingxiOS schema migration requires drained Web background work and Workers')
  }
  while (current !== targetSchema) {
    const resources = packageResources()
    const migrations = current === 9 ? [resources.migration010]
      : current === 10 ? [resources.migration011, resources.migration012, resources.migration013]
      : current === 11 ? [resources.migration014] : current === 12 ? [resources.migration015] : current === 13 ? [resources.migration016] : []
    if (!migrations.length || current! > targetSchema) {
      throw new Error(`unsupported LingxiOS schema upgrade from ${current} to ${targetSchema}`)
    }
    for (const migration of migrations) {
      const packaged = await readFile(migration, 'utf8')
      await client.query(packagedTransactionBody(packaged))
    }
    current = (await client.query<{ version: number }>('SELECT version FROM lingxios.schema_version WHERE singleton')).rows[0]?.version
  }
  const schema = await runtimeSchema(targetSchema)
  await client.query(`UPDATE public.lingxios_installation
    SET runtime_version=$1,schema_version=$2,protocol_version=$3,schema_sha256=$4,installed_at=NOW()
    WHERE singleton AND (runtime_version IS DISTINCT FROM $1 OR schema_version IS DISTINCT FROM $2
      OR protocol_version IS DISTINCT FROM $3 OR schema_sha256 IS DISTINCT FROM $4)`,
  [runtimeVersion,targetSchema,releaseVersions.controlPlane,schema.hash])
}

async function assertRuntimeCurrent(client: PoolClient, targetSchema: number = releaseVersions.schema,
  runtimeVersion: string = releaseVersions.runtime): Promise<void> {
  const schema = await runtimeSchema(targetSchema)
  const { rows } = await client.query(`SELECT runtime_version,schema_version,protocol_version,schema_sha256,
    (SELECT version FROM lingxios.schema_version WHERE singleton) AS actual_schema FROM public.lingxios_installation WHERE singleton`)
  const row = rows[0]
  if (!row || row.runtime_version !== runtimeVersion || row.schema_version !== targetSchema
    || row.actual_schema !== targetSchema || row.protocol_version !== releaseVersions.controlPlane
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
  developmentQualification?: DevelopmentRuntimeQualification,
): Promise<readonly string[]> {
  const migrations = await loadMigrations(migrationsUrl)
  const hasDeliveryUpgrade = migrations.some(migration => migration.version===50 && migration.name==='skill_delivery')
  const hasPurposeReader = migrations.some(migration => migration.version===51 && migration.name==='public_text_reader')
  const hasRunTrace = migrations.some(migration => migration.version===52 && migration.name==='run_trace_provenance')
  const hasConversationRepair = migrations.some(migration => migration.version===53 && migration.name==='conversation_repair_provenance')
  // Product55/56/57/58/59/60 change product state only, on the same formally locked runtime.
  const full61=migrations.length===61&&migrations[60]?.name==='slides_workspaces'
  if(full61&&!['3.8.20','3.8.21'].includes(String(releaseVersions.runtime)))throw new Error('product61 requires exact formal20 or reviewed formal21 runtime')
  const runtimeOnly61=full61&&String(releaseVersions.runtime)==='3.8.21'
  const full60=(migrations.length===60||full61)&&migrations[59]?.name==='native_artifacts'
  const full59=(migrations.length===59||full60)&&migrations[58]?.name==='retire_presentation_generation'
  const runtimeOnly60=full60&&['3.8.19','3.8.20'].includes(String(releaseVersions.runtime))
  if (full59&&!runtimeOnly60&&!runtimeOnly61) assertRetirementRuntimeVersion(releaseVersions.runtime)
  const full58=(migrations.length===58||full59)&&migrations[57]?.name==='homework_validation_findings'
  const full57=(migrations.length===57||full58)&&migrations[56]?.name==='case_soft_delete'
  const full56=(migrations.length===56||full57)&&migrations[55]?.name==='homework_validation_status'
  const full55=(migrations.length===55||full56)&&migrations[54]?.name==='case_covers'
  const full54=(migrations.length===54||full55)&&migrations[53]?.name==='run_presentation_contract'
  const qualifiedRuntime=developmentQualification===undefined ? undefined : assertDevelopmentQualification(developmentQualification,database,migrationsUrl,full54)
  if(full54)assertCurrentRuntimeProfile(releaseVersions,(await runtimeSchema(14)).hash,qualifiedRuntime??(await loadLockedRuntimePackage()).runtime)
  else assertMigrationRuntime(hasDeliveryUpgrade,hasPurposeReader,releaseVersions,hasPurposeReader ? (await runtimeSchema(14)).hash : undefined,hasRunTrace,hasConversationRepair)
  const client = await database.connect()
  const appliedNow: string[] = []
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    const tracked = await migrationTableExists(client)
    if (runtimeOnly61&&!tracked) throw new Error('runtime3.8.21 requires already installed product61; it cannot run product migrations')
    if (runtimeOnly60&&!tracked) throw new Error(`runtime${releaseVersions.runtime} requires already installed product60; it cannot run product migrations`)
    if (!tracked) {
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
    if(runtimeOnly61){
      if(applied.length!==61)throw new Error('runtime3.8.21 requires already installed product61; it cannot run product migrations')
      await assertRuntimeCurrent(client,14,releaseVersions.runtime)
      return appliedNow
    }
    if(runtimeOnly60){
      if(applied.length!==60&&!(full61&&applied.length===61))throw new Error(`runtime${releaseVersions.runtime} requires already installed product60; it cannot run product migrations`)
      // The explicit provenance CAS must already have succeeded. Startup may
      // verify this exact installed state, never adopt it or execute59/60.
      await assertRuntimeCurrent(client,14,releaseVersions.runtime)
      if(!full61||applied.length===61)return appliedNow
    }
    if(full54)assertFull54InstallBoundary(applied.length,releaseVersions.runtime,full61?61:full60?60:full59?59:full58?58:full57?57:full56?56:full55?55:54)
    const installsRuntime = migrations.some(migration => migration.version === NATIVE_INSTALL_VERSION && migration.name === 'lingxios_native_runtime')
    const hasReliabilityUpgrade = migrations.some(migration => migration.version === RELIABILITY_UPGRADE_VERSION && migration.name === 'lingxios_3_5_0')
    const hasContinuityUpgrade = migrations.some(migration=>migration.version===47 && migration.name==='memory_continuity')
    const targetSchema = hasDeliveryUpgrade ? 14 : hasContinuityUpgrade ? 13 : hasReliabilityUpgrade ? 12 : LEGACY_RUNTIME_SCHEMA
    const targetRuntime = full54 ? releaseVersions.runtime : hasConversationRepair ? '3.8.2' : hasRunTrace ? '3.8.0' : hasPurposeReader ? '3.7.0' : hasDeliveryUpgrade ? '3.6.0' : hasContinuityUpgrade ? '3.5.8' : hasReliabilityUpgrade ? '3.5.6' : LEGACY_RUNTIME_RELEASE
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
        if (migration.version===51 && migration.name==='public_text_reader') {
          await assertRuntimeCurrent(client,14,'3.6.0')
        }
        if (migration.version===52 && migration.name==='run_trace_provenance') {
          await assertRuntimeCurrent(client,14,'3.7.0')
        }
        if (migration.version===53 && migration.name==='conversation_repair_provenance') {
          await assertRuntimeCurrent(client,14,'3.8.0')
        }
        if (migration.version===54 && migration.name==='run_presentation_contract') {
          await assertRuntimeCurrent(client,14,'3.8.2')
        }
        if (migration.version===59 && migration.name==='retire_presentation_generation') assertRetirementRuntimeVersion(releaseVersions.runtime)
        if (migration.version===55 && migration.name==='case_covers'
          || migration.version===56 && migration.name==='homework_validation_status'
          || migration.version===57 && migration.name==='case_soft_delete'
          || migration.version===58 && migration.name==='homework_validation_findings'
          || migration.version===59 && migration.name==='retire_presentation_generation'
          || migration.version===60 && migration.name==='native_artifacts'
          || migration.version===61 && migration.name==='slides_workspaces') {
          await assertRuntimeCurrent(client,14,releaseVersions.runtime)
        }
        // Production retirement is an explicit maintenance operation, never an automatic deploy side effect.
        if (migration.version===59 && migration.name==='retire_presentation_generation'
          && process.env.NODE_ENV==='production' && process.env.LINGXILOOP_RETIREMENT_0059_APPROVED!=='true') {
          throw new Error('migration0059 requires explicit retirement approval and stopped application writers')
        }
        await client.query(migration.sql)
        // Only the atomic empty-database cutover may stamp the current package.
        // Partial existing history was rejected above, before executing SQL.
        // Existing full54 databases require the separate provenance-only CAS.
        if(migration.version===54&&full54&&String(releaseVersions.runtime)!=='3.8.2'){
          if(!cutover)throw new Error('current package initialization requires an empty native cutover')
          const updated=await client.query(`UPDATE public.lingxios_installation SET runtime_version=$1,installed_at=NOW()
            WHERE singleton AND runtime_version='3.8.2' AND schema_version=14 AND protocol_version=$2 AND schema_sha256=$3`,
          [releaseVersions.runtime,releaseVersions.controlPlane,(await runtimeSchema(14)).hash])
          if(updated.rowCount!==1)throw new Error('fresh full54 package provenance source changed')
        }
        if (installsRuntime && migration.version === NATIVE_INSTALL_VERSION) {
          const schema = await runtimeSchema(LEGACY_RUNTIME_SCHEMA)
          await client.query(packagedTransactionBody(schema.sql))
          await client.query(`INSERT INTO public.lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256)
            VALUES($1,$2,$3,$4)`, [RUNTIME_SCHEMA_RELEASE,LEGACY_RUNTIME_SCHEMA,releaseVersions.controlPlane,schema.hash])
        }
        if (migration.version === RUNTIME_UPGRADE_VERSION && migration.name === 'lingxios_3_2'
          || migration.version === 24 && migration.name === 'lingxios_3_3_0') {
          await applyRuntimeUpgrade(client)
        }
        if (migration.version === RELIABILITY_UPGRADE_VERSION && migration.name === 'lingxios_3_5_0') {
          await applyRuntimeUpgrade(client,'3.5.6',12)
        }
        if (migration.version === 47 && migration.name === 'memory_continuity') {
          await applyRuntimeUpgrade(client,'3.5.8',13)
        }
        if (migration.version === 50 && migration.name === 'skill_delivery') {
          // 0049 is the immutable source boundary; never adopt an unknown native
          // schema or commit native14 outside the product 0050 transaction.
          await assertRuntimeCurrent(client,13,'3.5.8')
          await applyRuntimeUpgrade(client,'3.6.0',14)
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
    if (installsRuntime) {
      //0051/0052/0053 own their provenance writes in the ledger transaction. Repeats must
      // reject a mismatched target instead of silently repairing/stamping it.
      if (!hasPurposeReader) {
        await client.query('BEGIN')
        try { await applyRuntimeUpgrade(client,targetRuntime,targetSchema); await client.query('COMMIT') } catch (error) { await client.query('ROLLBACK'); throw error }
      }
      await assertRuntimeCurrent(client,targetSchema,targetRuntime)
    }
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
  developmentQualification?: DevelopmentRuntimeQualification,
): Promise<void> {
  const migrations = await loadMigrations(migrationsUrl)
  const hasPurposeReader = migrations.some(migration => migration.version===51 && migration.name==='public_text_reader')
  const hasRunTrace = migrations.some(migration => migration.version===52 && migration.name==='run_trace_provenance')
  const hasConversationRepair = migrations.some(migration => migration.version===53 && migration.name==='conversation_repair_provenance')
  // Product55/56/57/58/59/60 change product state only, on the same formally locked runtime.
  const full61=migrations.length===61&&migrations[60]?.name==='slides_workspaces'
  if(full61&&!['3.8.20','3.8.21'].includes(String(releaseVersions.runtime)))throw new Error('product61 requires exact formal20 or reviewed formal21 runtime')
  const runtimeOnly61=full61&&String(releaseVersions.runtime)==='3.8.21'
  const full60=(migrations.length===60||full61)&&migrations[59]?.name==='native_artifacts'
  const full59=(migrations.length===59||full60)&&migrations[58]?.name==='retire_presentation_generation'
  const runtimeOnly60=full60&&['3.8.19','3.8.20'].includes(String(releaseVersions.runtime))
  if (full59&&!runtimeOnly60&&!runtimeOnly61) assertRetirementRuntimeVersion(releaseVersions.runtime)
  const full58=(migrations.length===58||full59)&&migrations[57]?.name==='homework_validation_findings'
  const full57=(migrations.length===57||full58)&&migrations[56]?.name==='case_soft_delete'
  const full56=(migrations.length===56||full57)&&migrations[55]?.name==='homework_validation_status'
  const full55=(migrations.length===55||full56)&&migrations[54]?.name==='case_covers'
  const full54=(migrations.length===54||full55)&&migrations[53]?.name==='run_presentation_contract'
  const qualifiedRuntime=developmentQualification===undefined ? undefined : assertDevelopmentQualification(developmentQualification,database,migrationsUrl,full54)
  if(full54)assertCurrentRuntimeProfile(releaseVersions,(await runtimeSchema(14)).hash,qualifiedRuntime??(await loadLockedRuntimePackage()).runtime)
  else assertMigrationRuntime(migrations.some(migration => migration.version===50 && migration.name==='skill_delivery'),
    hasPurposeReader,releaseVersions,hasPurposeReader ? (await runtimeSchema(14)).hash : undefined,hasRunTrace,hasConversationRepair)
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
      const hasDelivery = migrations.some(migration => migration.version===50 && migration.name==='skill_delivery')
      const hasContinuity = migrations.some(migration => migration.version===47 && migration.name==='memory_continuity')
      const hasReliability = migrations.some(migration => migration.version===RELIABILITY_UPGRADE_VERSION && migration.name==='lingxios_3_5_0')
      await assertRuntimeCurrent(client,hasDelivery ? 14 : hasContinuity ? 13 : hasReliability ? 12 : LEGACY_RUNTIME_SCHEMA,
        full54 ? releaseVersions.runtime : hasConversationRepair ? '3.8.2' : hasRunTrace ? '3.8.0' : hasPurposeReader ? '3.7.0' : hasDelivery ? '3.6.0' : hasContinuity ? '3.5.8' : hasReliability ? '3.5.6' : LEGACY_RUNTIME_RELEASE)
    }
  } finally {
    client.release()
  }
}
