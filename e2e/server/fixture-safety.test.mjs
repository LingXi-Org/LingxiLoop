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

test('explicit live evaluation configuration rejects missing credentials, shared judges and invalid prices before starting services', () => {
  const system = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC)$/i.test(name)))
  const config = { E2E_EVAL_CREDENTIALS: 'env',
    ...Object.fromEntries(['CANDIDATE', 'JUDGE'].flatMap(role => Object.entries({
      BASE_URL: 'http://127.0.0.1:1/v1', MODEL: role.toLowerCase(), API_KEY: 'fixture-sentinel',
      INPUT_CNY_PER_MILLION: '1', OUTPUT_CNY_PER_MILLION: '1',
    }).map(([key, value]) => [`EVAL_${role}_${key}`, value]))) }
  for (const [overrides, expected] of [
    [{ EVAL_CANDIDATE_API_KEY: '' }, /Missing EVAL_CANDIDATE_API_KEY/],
    [{ EVAL_JUDGE_MODEL: 'candidate' }, /independent judge model/],
    [{ EVAL_JUDGE_INPUT_CNY_PER_MILLION: 'NaN' }, /Invalid EVAL_JUDGE_INPUT_CNY_PER_MILLION/],
  ]) {
    const result = spawnSync(process.execPath, ['e2e/server/interactive-ui-live.mjs', '--live-generative-ui'], {
      encoding: 'utf8', timeout: 15_000, windowsHide: true, env: { ...system, ...config, ...overrides },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, expected)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /fixture-sentinel|Container .*Starting|ECONNREFUSED/)
  }
})
