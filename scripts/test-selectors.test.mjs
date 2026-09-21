import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('test selectors reject malformed and cross-scope paths before starting tests', () => {
  const run = (script, args, env) => spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', env: { ...process.env, DOTENV_CONFIG_PATH: '__no_test_env__', INTEGRATION_DATABASE_URL: '', ...env },
  })
  for (const files of ['{}', '["admin/src/record-presentation.test.ts"]', '["src/../admin/test.test.ts"]']) {
    const result = run('scripts/run-tests.mjs', ['web'], { CI_TEST_FILES: files })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /CI_TEST_FILES/)
  }
  for (const files of ['{}', '["../migration.test.ts"]', '["unknown.test.ts"]', 'invalid']) {
    assert.equal(run('server/run-integration-tests.mjs', [], { INTEGRATION_TEST_FILES: files }).status, 2)
  }
  const selected = run('server/run-integration-tests.mjs', [], { INTEGRATION_TEST_FILES: '["migration.test.ts"]' })
  assert.equal(selected.status, 0)
  assert.match(selected.stdout, /selected 1\/\d+ file\(s\): migration\.test\.ts/)
  assert.match(selected.stdout, /skipped/)
})
