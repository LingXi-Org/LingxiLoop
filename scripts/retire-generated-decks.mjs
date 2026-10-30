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
const generated = value => typeof value?.source?.ref === 'string' && value.source.ref.startsWith('presentation:')

// Include committed and staged manifests, receipts and events. Unknown/shared
// references to the same content hash win over any generation-owned reference.
export function runtimeObjectCandidates(rows) {
  const candidates = new Set(), retained = new Set()
  function visit(value, scope) {
    if (!value || typeof value !== 'object') return
    if (!Array.isArray(value) && typeof value.path === 'string' && /^[a-f0-9]{64}$/i.test(value.sha256 ?? '')) {
      const key = `artifacts/${scope}/${value.sha256.toLowerCase()}`
      ;(generated(value) ? candidates : retained).add(key)
    }
    for (const child of Object.values(value)) visit(child, scope)
  }
  for (const row of rows) visit(row.payload, hash(JSON.stringify([row.tenant_id, row.agent_id, row.work_id])))
  return { candidates: [...candidates].filter(key => !retained.has(key)).sort(), retained: [...retained].sort() }
}

async function runtimeReferences(db) {
  return (await db.query(`SELECT w.tenant_id,w.agent_id,w.id AS work_id,r.message AS payload
      FROM lingxios.agent_results r JOIN lingxios.agent_work_items w ON w.id=r.work_id
    UNION ALL SELECT w.tenant_id,w.agent_id,w.id,s.artifacts FROM lingxios.agent_steps s JOIN lingxios.agent_work_items w ON w.id=s.work_id
    UNION ALL SELECT w.tenant_id,w.agent_id,w.id,l.result FROM lingxios.agent_action_ledger l
      JOIN lingxios.agent_action_intents i USING(idempotency_key) JOIN lingxios.agent_work_items w ON w.id=i.intent->>'workId'
    UNION ALL SELECT w.tenant_id,w.agent_id,w.id,e.data FROM lingxios.agent_run_events e JOIN lingxios.agent_work_items w ON w.id=e.run_id`)).rows
}

// Conservative retention: any literal product-key reference outside dedicated
// generation tables preserves that object. Never expose the referencing row.
async function productReferences(db, keys) {
  const retained = new Set()
  const tables = (await db.query(`SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','lingxios')`)).rows
  for (const { schemaname, tablename } of tables) {
    if (schemaname === 'public' && dedicated.has(tablename)) continue
    const rows = await db.query(`SELECT row_to_json(t)::text AS value FROM ${quoted(schemaname)}.${quoted(tablename)} t WHERE row_to_json(t)::text LIKE '%presentation-artifacts/%'`)
    for (const row of rows.rows) for (const key of keys) if (row.value.includes(key)) retained.add(key)
  }
  return retained
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
    const runtimeRefs = runtimeObjectCandidates(await runtimeReferences(db))
    if (mode === '--plan') {
      const objects = await listProductObjects(c.product, c.productBucket)
      const protectedKeys = await productReferences(db, objects.map(item => item.key))
      const candidates = objects.filter(item => !protectedKeys.has(item.key))
      for (const key of runtimeRefs.candidates) {
        const object = await head(c.runtime, c.runtimeBucket, key)
        if (object) candidates.push(object)
      }
      const manifest = { version: 1, issue: 583, generatedAt: new Date().toISOString(), candidates,
        retained: { product: [...protectedKeys].sort(), runtime: runtimeRefs.retained },
        database: (await db.query('SELECT current_database() AS name')).rows[0].name }
      const bytes = JSON.stringify(manifest, null, 2) + '\n'
      await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 })
      console.log(JSON.stringify({ mode, candidates: candidates.length, retained: protectedKeys.size + runtimeRefs.retained.length, sha256: hash(bytes) }))
    } else {
      const bytes = await readFile(filename, 'utf8')
      if (hash(bytes) !== confirmation) throw new Error('manifest does not match the specifically approved digest')
      const manifest = JSON.parse(bytes)
      if (manifest.version !== 1 || manifest.issue !== 583 || !Array.isArray(manifest.candidates)) throw new Error('unsupported manifest')
      if ((await db.query('SELECT current_database() AS name')).rows[0].name !== manifest.database) throw new Error('database differs from the approved inventory')
      const migrated = await db.query("SELECT 1 FROM schema_migrations WHERE version=59 AND name='retire_presentation_generation'")
      if (!migrated.rowCount) throw new Error('apply requires migration0059 and drained old writers')
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
