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
