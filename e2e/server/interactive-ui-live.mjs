import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import pg from 'pg'

// Fail closed: no ambient product DB, model credentials or outbound services are inherited.
assert.equal(process.argv[2], '--live-generative-ui', 'Explicit --live-generative-ui is required (metered synthetic evaluation).')
assert.ok(process.argv.length === 3 || process.argv.length === 4 && process.argv[3] === '--transport-only', 'Unknown live validation option.')
const transportOnly = process.argv[3] === '--transport-only'
const cwd = resolve(import.meta.dirname, '../..'), output = resolve(cwd, `artifacts/interactive-ui/${transportOnly ? 'wukong' : 'live'}`)
await mkdir(output, { recursive: true })
const credentials = parse(await readFile(resolve(cwd, 'eval/.env.local')))
for (const role of ['CANDIDATE', 'JUDGE']) for (const key of ['BASE_URL', 'MODEL', 'API_KEY', 'INPUT_CNY_PER_MILLION', 'OUTPUT_CNY_PER_MILLION']) {
  assert.ok(credentials[`EVAL_${role}_${key}`]?.trim(), `Missing EVAL_${role}_${key}; missing credentials never count as a pass.`)
}
assert.notEqual(credentials.EVAL_CANDIDATE_MODEL, credentials.EVAL_JUDGE_MODEL, 'Use an independent judge model.')
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE|E2E_WUKONG_IMAGE)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_ui_model_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_ui_model_test',
  REDIS_URL: 'redis://127.0.0.1:56379/2', OPENAI_API_KEY: credentials.EVAL_CANDIDATE_API_KEY,
  OPENAI_BASE_URL: credentials.EVAL_CANDIDATE_BASE_URL, OPENAI_MODEL: credentials.EVAL_CANDIDATE_MODEL,
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false',
  RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '', LINGXIOS_LIVE_UI: transportOnly ? '0' : '1', LINGXIOS_REAL_WUKONG: '1', LINGXIOS_LIVE_PROTOCOL: '0', RESEND_LIVE_TEST: '0',
  LINGXIOS_SERVICE_TOKEN: 'interactive-ui-live-isolated-service-token', AGENT_OS_WORKER_PORT: '52997',
  AGENT_OS_MAX_CONCURRENT_RUNS: '1', AGENT_OS_RESERVED_INTERACTIVE_RUNS: '0', AGENT_OS_MODEL_CONCURRENCY: '1',
  AGENT_OS_MAX_MODEL_CALLS: '8', AGENT_OS_MAX_MODEL_TOKENS: '120000', AGENT_OS_MAX_MODEL_COST_MICROS: '250000', AGENT_OS_MAX_WORK_MS: '240000',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_INPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_HOMES_ROOT: resolve(output, 'runtime-homes'),
  WUKONG_API_URL: 'http://127.0.0.1:55011', WUKONG_WS_URL: 'ws://127.0.0.1:55210', WUKONG_API_TOKEN: 'e2e-local-token',
  WUKONG_WEBHOOK_SECRET: 'lingxiloop-ui-live-webhook', WUKONG_USER_TOKEN_SECRET: 'lingxiloop-ui-live-user-token-secret',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'lingxiloop-ui-live-gateway-secret', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:52996',
  OPENUI_TELEMETRY_DISABLED: '1', E2E_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1',
  ...Object.fromEntries(Object.entries(credentials).filter(([name]) => name.startsWith('EVAL_JUDGE_'))),
})
assert.equal(new URL(env.DATABASE_URL).pathname, '/lingxiloop_ui_model_test')
const log = resolve(output, 'integration.log')
await writeFile(log, '')
async function run(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { void appendFile(log, chunk); process.stdout.write(chunk) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? done() : reject(new Error(`Live validation command failed (${code}); see the bounded report.`)))
  })
}
const startedAt = new Date().toISOString()
let passed = false
try {
  await run('docker', ['compose', '-f', 'e2e/server/compose.yaml', 'up', '-d', '--wait'])
  await run('docker', ['compose', '-f', 'e2e/interactive-ui-live.compose.yaml', 'up', '-d', '--wait'])
  const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_ui_model_test', '/postgres') })
  await admin.connect()
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_ui_model_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_ui_model_test')
  } finally { await admin.end() }
  await run(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'])
  await run(process.execPath, ['server/run-integration-tests.mjs', '--file', transportOnly ? 'interactive-ui-wukong.test.ts' : 'interactive-ui-live.test.ts'])
  const report = JSON.parse(await readFile(resolve(output, 'results.json'), 'utf8'))
  assert.equal(report.passed, true, 'A skipped or partial run cannot pass.')
  passed = true
} finally {
  await writeFile(resolve(output, 'run-metadata.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), passed,
    reproduce: `node e2e/server/interactive-ui-live.mjs --live-generative-ui${transportOnly ? ' --transport-only' : ''}`, runtime: '3.3.6', candidate: transportOnly ? null : credentials.EVAL_CANDIDATE_MODEL,
    judge: credentials.EVAL_JUDGE_MODEL, maxRunCostUSD: 0.25, maxTotalCostUSD: 5, modelConcurrency: 1,
    database: 'lingxiloop_ui_model_test', identity: 'synthetic test-owner', realWuKong: true, realModel: !transportOnly, authentication: 'isolated test middleware',
  }, null, 2))
}
