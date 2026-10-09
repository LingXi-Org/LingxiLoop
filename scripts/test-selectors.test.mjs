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

test('integration runner refuses unsafe database targets without exposing credentials', () => {
  // Failure modes: credentials/hosts/query strings impersonate a test DB,
  // production names pass a substring check, malformed URLs, and secret logs.
  for (const databaseUrl of [
    'postgres://tester:sentinel-secret@localhost:1/lingxiloop',
    'postgres://user:sentinel-test-secret@localhost:1/lingxiloop',
    'postgres://user:sentinel-secret@test.localhost:1/lingxiloop',
    'postgres://user:sentinel-secret@localhost:1/lingxiloop?application_name=test',
    'postgres://user:sentinel-secret@localhost:1/latest',
    'postgres://user:sentinel-secret@localhost:1/production_test',
    'postgres://user:sentinel-secret@localhost:1/%70rod_test',
    'postgres://user:sentinel-secret@localhost:1/%zz_test',
    'postgres://user:sentinel-secret@localhost:1/prod',
    'postgres://user:sentinel-secret@production.example.test:1/lingxiloop_test',
    'postgres://user:sentinel-secret@localhost:1/lingxiloop_test?host=production.example.test',
    'postgres://user:sentinel-secret@localhost:1/lingxiloop_test?host=localhost&host=production.example.test',
    'postgres://user:sentinel-secret@%70roduction.example.test:1/lingxiloop_test',
    'https://user:sentinel-secret@localhost:1/lingxiloop_test',
    'sentinel-secret',
  ]) {
    const result = spawnSync(process.execPath, [
      'server/run-integration-tests.mjs', '--file', 'agent-protocols-live.test.ts',
    ], {
      encoding: 'utf8', timeout: 15_000,
      env: {
        ...process.env, DOTENV_CONFIG_PATH: '__no_test_env__',
        INTEGRATION_DATABASE_URL: databaseUrl, LINGXIOS_LIVE_PROTOCOL: '0',
      },
    })
    assert.equal(result.status, 2, 'unsafe target must fail before spawning integration tests')
    assert.match(result.stderr, /dedicated test database/i)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sentinel-secret|sentinel-test-secret/)
  }
})
