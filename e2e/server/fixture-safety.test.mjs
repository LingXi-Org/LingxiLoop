import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('browser seed refuses connection-string overrides before connecting', () => {
  // pg query parameters can override the hostname/port checked by URL.
  // The closed loopback port makes the before-fix reproduction harmless.
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'e2e/seed.ts'], {
    encoding: 'utf8', timeout: 60_000,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC)$/i.test(name))),
      DOTENV_CONFIG_PATH: '.e2e/no-product-env', NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:fixture-sentinel@127.0.0.1:55432/lingxiloop_browser_test?host=127.0.0.2&port=1',
      REDIS_URL: 'redis://127.0.0.1:1', OPENAI_API_KEY: 'fixture-test-key',
      OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', WUKONG_USER_TOKEN_SECRET: 'fixture-test-secret',
      OPENAI_EMBEDDING_MODEL: 'fixture-test-model', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180',
    },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Browser fixtures require the dedicated local/)
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /fixture-sentinel|ECONNREFUSED/)
})
