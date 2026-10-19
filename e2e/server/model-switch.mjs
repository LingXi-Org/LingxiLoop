// Real provider acceptance: fail if credentials, exact model, streaming/tools,
// durable delivery, measured billing, or an actual executed test are missing.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

assert.deepEqual(process.argv.slice(2), ['--live'], 'Explicit --live is required for paid provider calls')
const cwd = resolve(import.meta.dirname, '../..')
const output = resolve(cwd, 'artifacts/issue-186/live', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
const model = 'zai-org/GLM-5.3-Flash', baseUrl = 'https://api.siliconflow.cn/v1'
assert.ok(process.env.OPENAI_API_KEY?.trim(), 'Existing SiliconFlow OPENAI_API_KEY is required')
assert.equal(new URL(process.env.OPENAI_BASE_URL || baseUrl).origin, new URL(baseUrl).origin)
await mkdir(output, { recursive: true })
const started = Date.now()
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|HOME|TMP|TEMP|SYSTEMROOT|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE)$/i.test(name)))
const databaseName = 'lingxiloop_streaming_test'
Object.assign(env, {
  NODE_ENV: 'test', NODE_USE_ENV_PROXY: '1', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_BASE_URL: baseUrl, OPENAI_MODEL: model,
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false',
  DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  INTEGRATION_DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  REDIS_URL: 'redis://127.0.0.1:56379/12',
  SILICONFLOW_USD_CNY_RATE: '7', AGENT_OS_MAX_CONCURRENT_RUNS: '1', AGENT_OS_MODEL_CONCURRENCY: '1',
  AGENT_OS_MAX_MODEL_CALLS: '8', AGENT_OS_MAX_MODEL_TOKENS: '100000', AGENT_OS_MAX_MODEL_COST_MICROS: '250000',
  AGENT_OS_MAX_WORK_MS: '480000', AGENT_OS_WORKER_PORT: '52993', AGENT_OS_HOMES_ROOT: resolve(output, 'homes'),
  LINGXIOS_SERVICE_TOKEN: 'isolated-model-switch-test-service-token',
  WUKONG_USER_TOKEN_SECRET: 'isolated-model-switch-user-token',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'isolated-model-switch-gateway', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:52993',
  LINGXIOS_LIVE_STREAMING: '1', LINGXIOS_STREAMING_OUTPUT: output, RESEND_LIVE_TEST: '0',
})
const stages = []
async function run(command, args) {
  const code = await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    child.once('error', reject); child.once('exit', code => done(code ?? 1))
  })
  stages.push({ command: [command, ...args].join(' '), exitCode: code })
  assert.equal(code, 0, 'Acceptance stage failed')
}
let passed = false
try {
  const response = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(20000) })
  assert.equal(response.status, 200)
  assert.ok((await response.json()).data.some(item => item.id === model), 'Exact model must be available to the existing account')
  await run('docker', ['compose', '-f', 'e2e/server/compose.yaml', 'up', '-d', '--wait'])
  const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace(`/${databaseName}`, '/postgres') })
  await admin.connect()
  try {
    if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName])).rowCount) await admin.query(`CREATE DATABASE ${databaseName}`)
  } finally { await admin.end() }
  await run(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'])
  await run(process.execPath, ['server/run-integration-tests.mjs', '--file', 'runtime-streaming-live.test.ts'])
  const result = JSON.parse(await readFile(resolve(output, 'result.json'), 'utf8'))
  assert.equal(result.passed, true); assert.equal(result.model, model)
  assert.ok(Date.parse(result.timestamp) >= started, 'A historical result cannot satisfy this run')
  passed = true
} finally {
  await writeFile(resolve(output, 'acceptance.json'), JSON.stringify({ startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), passed, model, baseUrl, stages, reproduce: 'node --use-env-proxy e2e/server/model-switch.mjs --live', isolatedDatabase: databaseName, productionChanged: false }, null, 2) + '\n')
}
