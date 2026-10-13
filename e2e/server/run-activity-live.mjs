import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

assert.equal(process.argv[2], '--live-public-activity', 'Explicit --live-public-activity is required for metered synthetic validation.')
assert.equal(process.argv.length, 3)
const credentials = parse(await readFile(process.env.EVAL_ENV_FILE ?? 'eval/.env.local'))
for (const key of ['BASE_URL', 'MODEL', 'API_KEY', 'INPUT_CNY_PER_MILLION', 'OUTPUT_CNY_PER_MILLION']) assert.ok(credentials[`EVAL_CANDIDATE_${key}`]?.trim(), `Missing EVAL_CANDIDATE_${key}`)
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve('artifacts/run-activity/live/__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_activity_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_activity_test',
  REDIS_URL: 'redis://127.0.0.1:56379/6', LINGXIOS_TEST_REDIS_URL: 'redis://127.0.0.1:56379/6',
  OPENAI_API_KEY: credentials.EVAL_CANDIDATE_API_KEY, OPENAI_BASE_URL: credentials.EVAL_CANDIDATE_BASE_URL, OPENAI_MODEL: credentials.EVAL_CANDIDATE_MODEL,
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '',
  LINGXIOS_LIVE_ACTIVITY: '1', LINGXIOS_LIVE_PROTOCOL: '0', LINGXIOS_LIVE_UI: '0', RESEND_LIVE_TEST: '0',
  LINGXIOS_SERVICE_TOKEN: 'public-activity-isolated-service-token', AGENT_OS_WORKER_PORT: '53017',
  AGENT_OS_MAX_CONCURRENT_RUNS: '1', AGENT_OS_RESERVED_INTERACTIVE_RUNS: '0', AGENT_OS_MODEL_CONCURRENCY: '1',
  AGENT_OS_MAX_MODEL_CALLS: '10', AGENT_OS_MAX_MODEL_TOKENS: '200000', AGENT_OS_MAX_MODEL_COST_MICROS: '250000', AGENT_OS_MAX_WORK_MS: '280000',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_INPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_HOMES_ROOT: resolve('artifacts/run-activity/live/runtime-homes'),
  WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret', LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53016', OPENUI_TELEMETRY_DISABLED: '1', E2E_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1',
})
const startedAt = new Date().toISOString()
await mkdir('artifacts/run-activity/live', { recursive: true })
const code = await new Promise((done, reject) => {
  const child = spawn(process.execPath, ['server/run-integration-tests.mjs', '--file', 'public-run-activity-live.test.ts'], { env, stdio: 'inherit', windowsHide: true })
  child.once('error', reject); child.once('exit', value => done(value ?? 1))
})
await writeFile('artifacts/run-activity/live/run-metadata.json', JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), passed: code === 0,
  model: credentials.EVAL_CANDIDATE_MODEL, maxRunCostUSD: 0.25, maxTotalCostUSD: 1, modelConcurrency: 1, syntheticIdentity: true,
  database: 'lingxiloop_activity_test', redisDatabase: 6, realModel: true, realWuKong: false,
  reproduce: 'node e2e/server/run-activity-live.mjs --live-public-activity',
}, null, 2))
process.exitCode = code
