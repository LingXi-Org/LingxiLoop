import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { Pool } from 'pg'
import { packageResources, releaseVersions } from '@lingxi-org/lingxios'
import { inspectHarnessCutover } from '../db/harness-cutover.js'
import { PUBLIC_PURPOSE_SCHEMA_HASH } from '../db/runtime-profile.js'

test('same-SDK harness barrier refuses queued/waiting/expired work without changing its pinned state', async () => {
  assert.equal(releaseVersions.runtime, '4.0.0', 'run only with the real locked package')
  const url = new URL(process.env.INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '')
  assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname))
  assert.match(url.pathname, /test$/)
  const name = `harness_cutover_${randomUUID().replaceAll('-', '')}_test`
  const admin = new Pool({ connectionString: url.toString(), max: 1 })
  await admin.query(`CREATE DATABASE "${name}"`)
  url.pathname = `/${name}`
  const db = new Pool({ connectionString: url.toString(), max: 1 })
  try {
    await db.query(await readFile(packageResources().schema, 'utf8'))
    await db.query(`CREATE TABLE public.schema_migrations(version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL);
      CREATE TABLE public.lingxios_installation(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),runtime_version text NOT NULL,schema_version integer NOT NULL,protocol_version integer NOT NULL,schema_sha256 text NOT NULL)`)
    await db.query('INSERT INTO public.lingxios_installation(runtime_version,schema_version,protocol_version,schema_sha256) VALUES($1,14,11,$2)', [releaseVersions.runtime, PUBLIC_PURPOSE_SCHEMA_HASH])
    const root = new URL('../db/migrations/', import.meta.url), files = (await readdir(root)).sort()
    assert.equal(files.length, 63)
    for (const [index, file] of files.slice(0, 62).entries()) await db.query('INSERT INTO public.schema_migrations VALUES($1,$2,$3)',
      [index + 1, file.slice(5, -4), createHash('sha256').update(await readFile(new URL(file, root))).digest('hex')])
    assert.equal((await inspectHarnessCutover(db, true)).product, 62)
    for (const status of ['queued', 'waiting', 'leased']) for (const kind of ['turn', 'routine', 'memory_index']) {
      await db.query(`INSERT INTO lingxios.agent_work_items(id,tenant_id,agent_id,session_id,kind,lane,trigger_ref,status,available_at,lease_expires_at,cancel_requested_at,meta)
        VALUES('pinned-work','tenant','agent','session',$1,'interactive','private-trigger',$2,NOW()+INTERVAL '1 day',NOW()-INTERVAL '1 day',NOW(),'{"harnessHash":"old-hash","private":"preserve"}')`, [kind, status])
      const before = (await db.query('SELECT * FROM lingxios.agent_work_items')).rows
      for (const exclusive of [false, true]) await assert.rejects(inspectHarnessCutover(db, exclusive), /all nonterminal work/)
      assert.deepEqual((await db.query('SELECT * FROM lingxios.agent_work_items')).rows, before)
      assert.equal((await db.query('SELECT runtime_version FROM public.lingxios_installation')).rows[0].runtime_version, '4.0.0')
      await db.query("DELETE FROM lingxios.agent_work_items WHERE id='pinned-work'")
    }
    const other = new Pool({ connectionString: url.toString(), max: 1 })
    try {
      await other.query('SELECT 1')
      await assert.rejects(inspectHarnessCutover(db, true), /no other database clients/)
      assert.equal((await inspectHarnessCutover(db, false)).observationOnly, true)
    } finally { await other.end() }
    assert.equal((await inspectHarnessCutover(db, true)).counts.incompatibleRuns, 0)
  } finally {
    await db.end()
    await admin.query(`DROP DATABASE "${name}"`)
    await admin.end()
  }
})
