import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../db/migrate.ts', import.meta.url), 'utf8')

test('knowledge migration does not grant existing agents a revoked capability', () => {
  assert.doesNotMatch(migration, /SET capabilities\s*=\s*capabilities\s*\|\|\s*'\["knowledge"\]'/)
  assert.doesNotMatch(migration, /DEFAULT\s+'\[[^']*"knowledge"[^']*\]'::jsonb/)
})

test('legacy canvases and their cascading frames are retained during migration', () => {
  assert.doesNotMatch(migration, /DELETE FROM canvases WHERE conversation_id IS NULL/)
  assert.match(migration, /ALTER TABLE canvases ALTER COLUMN conversation_id DROP NOT NULL/)
  assert.match(migration, /IF NEW\.conversation_id IS NOT NULL AND NOT EXISTS/)
})
