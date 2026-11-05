import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { Pool } from 'pg'
import { packageResources, releaseVersions } from '@lingxi-org/lingxios'
import { assertMigrationsCurrent, migrateDatabase } from '../db/migrate.js'
import { pool } from '../db/pool.js'
import { applyPublishedRuntimePatch, assertRuntimePatchDescriptors, loadRuntimePatchInventory,
  observePublishedRuntimePatch, preflightPublishedRuntimePatch } from '../db/runtime-patch.js'
import { loadLockedRuntimePackage, PUBLIC_PURPOSE_SCHEMA_HASH } from '../db/runtime-profile.js'

after(() => pool.end())

async function isolated(run: (db: Pool) => Promise<void>) {
  assert.equal(releaseVersions.runtime, '4.0.0', 'requires the actual official organization package; no substitute or skipped qualification')
  const url = new URL(process.env.DATABASE_URL ?? '')
  assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname))
  assert.match(url.pathname, /(?:^|_)test(?:_|$)/)
  assert.doesNotMatch(url.pathname, /(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i)
  assert.equal(url.search, '')
  const admin = new Pool({ connectionString: url.toString(), max: 1 })
  const name = `runtime_patch62_40_${randomUUID().replaceAll('-', '')}_test`
  await admin.query(`CREATE DATABASE "${name}"`)
  url.pathname = `/${name}`
  const db = new Pool({ connectionString: url.toString(), max: 1 })
  try { await run(db) } finally { await db.end(); await admin.query(`DROP DATABASE "${name}"`); await admin.end() }
}

async function setup(db: Pool) {
  const locked = await loadLockedRuntimePackage()
  assert.equal(locked.runtime, '4.0.0')
  assert.match(locked.tarball, /^https:\/\/npm\.pkg\.github\.com\/download\/@lingxi-org\/lingxios\/4\.0\.0\//)
  await db.query(await readFile(packageResources().schema, 'utf8'))
  await db.query(`CREATE TABLE public.schema_migrations(version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL);
    CREATE TABLE public.lingxios_installation(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),runtime_version text NOT NULL,schema_version integer NOT NULL,protocol_version integer NOT NULL,schema_sha256 text NOT NULL,installed_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.users(id text PRIMARY KEY);
    CREATE TABLE public.artifacts(id text PRIMARY KEY);
    CREATE TABLE public.artifact_files(artifact_id text NOT NULL,path text NOT NULL,body bytea NOT NULL);
    CREATE TABLE public.slide_editor_contexts(artifact_id text NOT NULL,user_id text NOT NULL,context jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.users VALUES('source-user'); INSERT INTO public.artifacts VALUES('source-artifact');
    INSERT INTO public.artifact_files VALUES('source-artifact','project/deck.json',decode('7b226f726967696e616c223a747275657d0a','hex'));
    INSERT INTO public.slide_editor_contexts(artifact_id,user_id,context) VALUES('source-artifact','source-user','{"slideId":"original"}');`)
  const migrations = await loadRuntimePatchInventory(62)
  for (const migration of migrations) await db.query('INSERT INTO public.schema_migrations VALUES($1,$2,$3)', [migration.version, migration.name, migration.checksum])
  const source = { runtime: '3.8.25', schema: 14, protocol: 11, schemaHash: PUBLIC_PURPOSE_SCHEMA_HASH, productVersion: 62, migrations }
  const target = { ...source, runtime: '4.0.0', integrity: locked.integrity, tarball: locked.tarball }
  await db.query('INSERT INTO public.lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256) VALUES($1,14,11,$2)', [source.runtime, source.schemaHash])
  return { source, target }
}

test('organization bridge refuses unreviewed source, registry and inventory before touching product bytes', async () => isolated(async db => {
  const { source, target } = await setup(db)
  const before = (await db.query('SELECT * FROM public.artifact_files')).rows
  assert.doesNotThrow(() => assertRuntimePatchDescriptors(source, target))
  for (const runtime of ['3.8.24', '4.0.0', '4.0.1']) assert.throws(() => assertRuntimePatchDescriptors({ ...source, runtime }, target))
  for (const runtime of ['3.8.26', '4.0.1', '4.0.0-slim.0']) assert.throws(() => assertRuntimePatchDescriptors(source, { ...target, runtime }))
  await assert.rejects(preflightPublishedRuntimePatch(db, source, { ...target, tarball: target.tarball.replace('@lingxi-org/', '@lyyzka/') }), /package\/locks/)
  const changed = target.migrations.map((row, index) => index === 61 ? { ...row, checksum: '0'.repeat(64) } : row)
  await assert.rejects(preflightPublishedRuntimePatch(db, { ...source, migrations: changed }, { ...target, migrations: changed }), /Committed inventory differs/)
  await assert.rejects(migrateDatabase(db), /installed LingxiOS package\/schema mismatch/)
  assert.equal((await db.query('SELECT runtime_version FROM public.lingxios_installation')).rows[0].runtime_version, source.runtime)
  assert.deepEqual((await db.query('SELECT * FROM public.artifact_files')).rows, before)
}))

test('organization bridge refuses every retained source work item without changing its checkpoint or bytes', async () => isolated(async db => {
  const { source, target } = await setup(db)
  for (const status of ['queued', 'waiting', 'leased']) {
    await db.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status,meta)
      VALUES('old-work','t','a','s','slides_workspace','interactive','fixture',$1,'{"harnessHash":"old-editor"}')`, [status])
    const work = (await db.query('SELECT * FROM lingxios.agent_work_items')).rows
    await assert.rejects(preflightPublishedRuntimePatch(db, source, target), /incompatible resumable work/)
    await assert.rejects(applyPublishedRuntimePatch(db, source, target), /incompatible resumable runs/)
    assert.deepEqual((await db.query('SELECT * FROM lingxios.agent_work_items')).rows, work)
    assert.equal((await db.query('SELECT runtime_version FROM public.lingxios_installation')).rows[0].runtime_version, source.runtime)
    await db.query("DELETE FROM lingxios.agent_work_items WHERE id='old-work'")
  }
}))

test('organization provenance CAS precedes product63 and repeat observation never replays or adopts source63', async () => isolated(async db => {
  const { source, target } = await setup(db)
  const ledger = (await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows
  const files = (await db.query('SELECT * FROM public.artifact_files')).rows
  const provenance = (await db.query('SELECT * FROM public.lingxios_installation')).rows[0]
  assert.equal((await preflightPublishedRuntimePatch(db, source, target)).state, 'source')
  await db.query(`CREATE FUNCTION forbid_org_bridge_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected bridge DDL'; END $$;
    CREATE EVENT TRIGGER forbid_org_bridge_ddl ON ddl_command_start EXECUTE FUNCTION forbid_org_bridge_ddl()`)
  assert.equal((await applyPublishedRuntimePatch(db, source, target)).updated, 1)
  await assert.rejects(applyPublishedRuntimePatch(db, source, target), /source provenance changed/)
  const installed = (await db.query('SELECT * FROM public.lingxios_installation')).rows[0]
  assert.deepEqual({ ...installed, runtime_version: provenance.runtime_version, installed_at: provenance.installed_at }, provenance)
  assert.deepEqual((await db.query('SELECT * FROM public.schema_migrations ORDER BY version')).rows, ledger)
  assert.deepEqual((await db.query('SELECT * FROM public.artifact_files')).rows, files)
  assert.equal((await observePublishedRuntimePatch(db, source, target)).state, 'target')
  await db.query('ALTER EVENT TRIGGER forbid_org_bridge_ddl DISABLE; DROP EVENT TRIGGER forbid_org_bridge_ddl; DROP FUNCTION forbid_org_bridge_ddl()')
  assert.deepEqual(await migrateDatabase(db), ['0063_native_artifact_documents'])
  assert.deepEqual(await migrateDatabase(db), [])
  await assertMigrationsCurrent(db)
  assert.equal((await preflightPublishedRuntimePatch(db, source, target)).state, 'target')
  assert.equal((await observePublishedRuntimePatch(db, source, target)).complete, true)
  await assert.rejects(applyPublishedRuntimePatch(db, source, target), /source provenance changed/)
  assert.deepEqual((await db.query('SELECT * FROM public.artifact_files')).rows, files)
  assert.deepEqual((await db.query('SELECT context FROM public.artifact_editor_contexts')).rows, [{ context: { slideId: 'original' } }])
  const checksum = (await db.query('SELECT checksum FROM public.schema_migrations WHERE version=63')).rows[0].checksum
  await db.query("UPDATE public.schema_migrations SET checksum=$1 WHERE version=63", ['0'.repeat(64)])
  await assert.rejects(observePublishedRuntimePatch(db, source, target), /native document migration changed/)
  await db.query('UPDATE public.schema_migrations SET checksum=$1 WHERE version=63', [checksum])
  await db.query("UPDATE public.lingxios_installation SET runtime_version='3.8.25'")
  await assert.rejects(preflightPublishedRuntimePatch(db, source, target), /completed organization runtime bridge/)
  await assert.rejects(applyPublishedRuntimePatch(db, source, target), /completed organization runtime bridge/)
  assert.deepEqual((await db.query('SELECT * FROM public.artifact_files')).rows, files)
}))
