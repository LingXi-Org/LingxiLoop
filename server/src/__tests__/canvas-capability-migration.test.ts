import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Canvas capability migration only upgrades participants that had Computer', async () => {
  const migration = await readFile(new URL('../db/migrate.ts', import.meta.url), 'utf8')
  const statement = migration.match(/UPDATE participants\s+SET capabilities = \(capabilities - 'computer'\) \|\| '\["canvas"\]'::jsonb\s+WHERE[^;]+;/)?.[0]

  assert.ok(statement, 'expected the Shared Computer capability migration')
  assert.match(statement, /WHERE capabilities \? 'computer';/)
  assert.doesNotMatch(statement, /NOT \(capabilities \? 'canvas'\)/)
})

test('fresh AgentOS schema never creates retired Computer or LingxiGraph storage', async () => {
  const migration = await readFile(new URL('../db/migrate.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS computers\b/)
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS lingxigraph_steering_receipts\b/)
  assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS (?:computer_id|engine|fast_model|pair_token)\b/)
  assert.match(migration, /DROP TABLE IF EXISTS computers;/)
  assert.match(migration, /DROP TABLE IF EXISTS lingxigraph_steering_receipts;/)
})
