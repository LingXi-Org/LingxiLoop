#!/usr/bin/env node
/** One-off retirement; never imported by startup, Worker, deploy or migration. */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'
import { S3Client, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const prefix = 'presentation-artifacts/'
const dedicated = new Set(['presentations', 'presentation_jobs', 'presentation_pages', 'presentation_versions', 'presentation_evidence'])
const hash = value => createHash('sha256').update(value).digest('hex')
const quoted = value => '"' + value.replaceAll('"', '""') + '"'

export async function runtimeReferences(db, keys = []) {
  // Only derived keys and source classification leave the database; never
  // transfer result, event, receipt, or conversation bodies to this process.
  return (await db.query(`WITH records AS (
      SELECT w.tenant_id,w.agent_id,w.id AS work_id,r.message AS payload FROM lingxios.agent_results r JOIN lingxios.agent_work_items w ON w.id=r.work_id
      UNION ALL SELECT w.tenant_id,w.agent_id,w.id,s.artifacts FROM lingxios.agent_steps s JOIN lingxios.agent_work_items w ON w.id=s.work_id
      UNION ALL SELECT w.tenant_id,w.agent_id,w.id,l.result FROM lingxios.agent_action_ledger l JOIN lingxios.agent_action_intents i USING(idempotency_key) JOIN lingxios.agent_work_items w ON w.id=i.intent->>'workId'
      UNION ALL SELECT w.tenant_id,w.agent_id,w.id,e.data FROM lingxios.agent_run_events e JOIN lingxios.agent_work_items w ON w.id=e.run_id
    ), artifacts AS (
      SELECT 'artifacts/'||encode(sha256(convert_to(array_to_json(ARRAY[tenant_id,agent_id,work_id])::text,'UTF8')),'hex')||'/'||lower(item->>'sha256') AS key,
        COALESCE(item#>>'{source,ref}' LIKE 'presentation:%',false) AS generated
      FROM records CROSS JOIN LATERAL jsonb_path_query(payload,'$.** ? (@.type() == "object" && exists(@.path) && exists(@.sha256))') item
      WHERE item->>'sha256' ~* '^[a-f0-9]{64}$' AND jsonb_typeof(item->'path')='string'
    ) SELECT key,bool_or(generated) AS generated,bool_or(NOT generated) AS shared FROM artifacts GROUP BY key HAVING bool_or(generated) OR key=ANY($1::text[])`, [keys])).rows
}

export async function productReferences(db, keys) {
  const retained = new Set()
  const tables = (await db.query(`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','lingxios')`)).rows
  for (const { schemaname, tablename } of tables) {
    if (schemaname === 'public' && dedicated.has(tablename)) continue
    const rows = await db.query(`SELECT candidate FROM unnest($1::text[]) candidate WHERE EXISTS (SELECT 1 FROM ${quoted(schemaname)}.${quoted(tablename)} t WHERE position(candidate IN row_to_json(t)::text)>0)`, [keys])
    for (const row of rows.rows) retained.add(row.candidate)
  }
  return retained
}

export async function databaseInventory(db) {
  const tables = ['public.presentations','public.presentation_jobs','public.presentation_evidence','public.presentation_pages','public.presentation_versions','lingxios.lecture_decks','lingxios.lecture_checkpoints']
  const counts = {}
  for (const name of tables) {
    const exists = (await db.query('SELECT to_regclass($1) IS NOT NULL AS present', [name])).rows[0].present
    const [schema, table] = name.split('.')
    counts[name] = { exists, rows: exists ? (await db.query(`SELECT count(*)::text AS count FROM ${quoted(schema)}.${quoted(table)}`)).rows[0].count : '0' }
  }
  // Count only rows whose recursive rewrite changes JSON; source content is
  // evaluated inside PostgreSQL and is never returned to the client.
  const changed = (column, guard) => `count(*) FILTER (WHERE (${guard}) AND EXISTS (
    SELECT 1 FROM jsonb_path_query(${column}, 'strict $.**') AS item
    WHERE jsonb_typeof(item)='object' AND (item->>'type'='presentation-artifact'
      OR (item->>'type'='data' AND item->>'name'='presentation-artifact')
      OR (item ? 'path' AND item ? 'sha256' AND item#>>'{source,ref}' LIKE 'presentation:%')
      OR (jsonb_typeof(item->'refs')='object' AND item->'refs' ? 'presentationId'))))::text`
  const im = (await db.query(`SELECT ${changed('payload', "payload::text LIKE '%presentation-artifact%' OR echo::text LIKE '%presentation-artifact%'")} AS payload, ${changed('echo', "payload::text LIKE '%presentation-artifact%' OR echo::text LIKE '%presentation-artifact%'")} AS echo FROM public.im_send_acceptances`)).rows[0]
  const result = (await db.query(`SELECT ${changed('message', "message::text LIKE '%presentation-artifact%' OR message::text LIKE '%presentation:%'")} AS message FROM lingxios.agent_results`)).rows[0]
  const steps = (await db.query(`SELECT ${changed('artifacts', "artifacts::text LIKE '%presentation:%'")} AS artifacts FROM lingxios.agent_steps`)).rows[0]
  return { tables: counts, rewrites: { im_payload: im.payload, im_echo: im.echo, agent_result_message: result.message, agent_step_artifacts: steps.artifacts } }
}

async function listProductObjects(client, bucket) {
  const result = []
  let cursor
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: cursor }))
    for (const item of page.Contents ?? []) if (item.Key?.startsWith(prefix)) result.push({ bucket, key: item.Key, etag: item.ETag, size: item.Size })
    cursor = page.NextContinuationToken
  } while (cursor)
  return result
}

function clients() {
  const required = name => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value }
  const productBucket = required('R2_BUCKET'), runtimeBucket = required('LINGXIOS_R2_BUCKET')
  if (productBucket === runtimeBucket) throw new Error('runtime bucket must be separate')
  const endpoint = required('R2_ENDPOINT')
  const product = new S3Client({ region: 'auto', endpoint, forcePathStyle: true, credentials: { accessKeyId: required('R2_ACCESS_KEY_ID'), secretAccessKey: required('R2_SECRET_ACCESS_KEY') } })
  const runtime = new S3Client({ region: 'auto', endpoint, forcePathStyle: true, credentials: { accessKeyId: required('LINGXIOS_R2_ACCESS_KEY_ID'), secretAccessKey: required('LINGXIOS_R2_SECRET_ACCESS_KEY') } })
  return { productBucket, runtimeBucket, product, runtime }
}

async function head(client, bucket, key) {
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    if (!result.ETag) throw new Error('object has no ETag')
    return { bucket, key, etag: result.ETag, size: result.ContentLength }
  } catch (error) { if (error?.$metadata?.httpStatusCode === 404) return null; throw error }
}

async function main() {
  const [mode, filename, confirmation] = process.argv.slice(2)
  if (!['--plan', '--apply'].includes(mode) || !filename || (mode === '--apply' && !/^[a-f0-9]{64}$/.test(confirmation ?? ''))) throw new Error('usage: node scripts/retire-generated-decks.mjs --plan manifest.json | --apply manifest.json APPROVED_SHA256')
  // The named connection belongs to the operator. This script never discovers
  // credentials, changes network policy or writes configuration.
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  const c = clients()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await db.query("SET LOCAL statement_timeout='30s'")
    if (mode === '--plan') {
      const runtimeRows = await runtimeReferences(db)
      const runtimeRefs = { candidates: runtimeRows.filter(row => row.generated && !row.shared).map(row => row.key), retained: runtimeRows.filter(row => row.shared).map(row => row.key) }
      const databaseImpact = await databaseInventory(db)
      const objects = await listProductObjects(c.product, c.productBucket)
      const protectedKeys = await productReferences(db, objects.map(item => item.key))
      const candidates = objects.filter(item => !protectedKeys.has(item.key))
      for (const key of runtimeRefs.candidates) {
        const object = await head(c.runtime, c.runtimeBucket, key)
        if (object) candidates.push(object)
      }
      candidates.sort((a, b) => a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
      const manifest = { version: 2, issue: 583, databaseImpact, candidates,
        retained: { product: [...protectedKeys].sort(), runtime: runtimeRefs.retained.sort() },
        database: (await db.query('SELECT current_database() AS name')).rows[0].name }
      const bytes = JSON.stringify(manifest, null, 2) + '\n'
      await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 })
      console.log(JSON.stringify({ mode, candidates: candidates.length, retained: protectedKeys.size + runtimeRefs.retained.length, sha256: hash(bytes) }))
    } else {
      const bytes = await readFile(filename, 'utf8')
      if (hash(bytes) !== confirmation) throw new Error('manifest does not match the specifically approved digest')
      const manifest = JSON.parse(bytes)
      if (manifest.version !== 2 || manifest.issue !== 583 || !Array.isArray(manifest.candidates)) throw new Error('unsupported manifest')
      if ((await db.query('SELECT current_database() AS name')).rows[0].name !== manifest.database) throw new Error('database differs from the approved inventory')
      const migrated = await db.query("SELECT 1 FROM schema_migrations WHERE version=59 AND name='retire_presentation_generation'")
      if (!migrated.rowCount) throw new Error('apply requires migration0059 and drained old writers')
      const runtimeRows = await runtimeReferences(db, manifest.candidates.filter(item => item.bucket === c.runtimeBucket).map(item => item.key))
      const runtimeRefs = { retained: runtimeRows.filter(row => row.shared).map(row => row.key) }
      const protectedKeys = await productReferences(db, manifest.candidates.filter(item => item.bucket === c.productBucket).map(item => item.key))
      const pending = []
      for (const object of manifest.candidates) {
        const product = object.bucket === c.productBucket && typeof object.key === 'string' && object.key.startsWith(prefix)
        const runtime = object.bucket === c.runtimeBucket && /^artifacts\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(object.key)
        if ((!product && !runtime) || !object.etag) throw new Error('object is outside the reviewed generation scope')
        if (product && protectedKeys.has(object.key) || runtime && runtimeRefs.retained.includes(object.key)) throw new Error('object is now shared; regenerate and review the inventory')
        const client = product ? c.product : c.runtime
        const actual = await head(client, object.bucket, object.key)
        if (!actual) continue
        if (actual.etag !== object.etag || actual.size !== object.size) throw new Error('object changed after inventory')
        pending.push(object)
      }
      // No prefix deletion, no bucket deletion, no workspace collection.
      for (const object of pending) {
        const client = object.bucket === c.productBucket ? c.product : c.runtime
        await client.send(new DeleteObjectCommand({ Bucket: object.bucket, Key: object.key, IfMatch: object.etag }))
        console.log(JSON.stringify({ deleted: object.key, bucket: object.bucket }))
      }
    }
    await db.query('COMMIT')
  } finally { await db.end(); c.product.destroy(); c.runtime.destroy() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({ name: error.name, code: error.code, status: error.$metadata?.httpStatusCode, ...(error.name === 'Error' && !error.code ? { reason: error.message } : {}) })); console.error('retirement failed; no additional objects will be deleted. Inspect the reviewed manifest, database state and prior per-object receipts.'); process.exitCode = 1 })
}
