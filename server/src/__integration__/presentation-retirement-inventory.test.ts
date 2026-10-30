import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// This child creates its own synthetic test database and verifies actual SQL
// projection, counts and preservation of shared object references.
test('retirement inventory exposes only metadata and protects shared keys', () => {
  const file = fileURLToPath(new URL('../../../scripts/retire-generated-decks-db.test.mjs', import.meta.url))
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', timeout: 30_000, env })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /inventory evaluates source content/)
})
