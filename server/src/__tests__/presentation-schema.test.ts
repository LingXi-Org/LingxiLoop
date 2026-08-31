import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
const bootstrap = readFileSync(new URL('../db/bootstrap.ts', import.meta.url), 'utf8')

test('canonical v1 owns the complete normalized presentation domain', () => {
  for (const relation of [
    'presentations',
    'presentation_jobs',
    'presentation_evidence',
    'presentation_pages',
    'presentation_versions',
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE public\\.${relation} \\(`))
    assert.match(bootstrap, new RegExp(`'${relation}'`))
  }
  assert.match(schema, /presentation_pages[\s\S]*?content_ir jsonb/)
  assert.match(schema, /presentation_versions_size_check CHECK \(size_bytes BETWEEN 1 AND 26214400\)/)
  assert.match(schema, /presentation_versions_sha256_check CHECK \(sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(schema, /presentation_jobs_attempts_check CHECK \(attempts BETWEEN 0 AND 6\)/)
  assert.match(schema, /presentation_jobs_lease_fence_check CHECK \(lease_fence >= 0\)/)
  assert.match(schema, /presentation_jobs_idempotency_key UNIQUE \(company_id, idempotency_key\)/)
  assert.match(schema, /presentation_evidence_pkey PRIMARY KEY \(id, company_id, presentation_id\)/)
  assert.match(schema, /presentation_pages_pkey PRIMARY KEY \(id, company_id, presentation_id\)/)
  assert.match(schema, /presentations_latest_version_fkey[\s\S]*?DEFERRABLE INITIALLY DEFERRED/)
})

test('presentation bootstrap completeness covers critical columns, constraints and indexes', () => {
  for (const column of [
    "['presentations', 'authorization_user_id']",
    "['presentation_jobs', 'lease_fence']",
    "['presentation_evidence', 'position']",
    "['presentation_pages', 'content_ir']",
    "['presentation_versions', 'sha256']",
  ]) assert.ok(bootstrap.includes(column), `missing bootstrap column ${column}`)

  for (const index of [
    'idx_presentations_project_status',
    'idx_presentation_jobs_claim',
    'idx_presentation_evidence_source',
    'idx_presentation_pages_order',
    'idx_presentation_versions_history',
  ]) assert.ok(bootstrap.includes(index), `missing bootstrap index ${index}`)
})

test('presentation storage keys are immutable tenant-scoped R2 keys', () => {
  assert.match(schema, /presentation_versions_storage_key_key UNIQUE \(storage_key\)/)
  assert.match(schema, /presentation_versions_number_key UNIQUE \(company_id, presentation_id, version_number\)/)
})
