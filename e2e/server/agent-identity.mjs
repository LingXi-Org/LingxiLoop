import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import pg from 'pg'

const live = process.argv.includes('--live')
assert.deepEqual(process.argv.slice(2), live ? ['--live'] : [])
const root = resolve(import.meta.dirname, '../..')
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|TMP|TEMP|SYSTEMROOT|NODE_EXTRA_CA_CERTS|HTTPS?_PROXY|NO_PROXY)$/i.test(key)))
// Preserve the environment's approved egress route; never fall back to another provider.
if (environment.HTTPS_PROXY || environment.https_proxy || environment.HTTP_PROXY || environment.http_proxy) environment.NODE_USE_ENV_PROXY = '1'
if (live) {
  assert.ok(process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL && process.env.OPENAI_MODEL, 'Existing explicit provider configuration is required')
}
Object.assign(environment, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: '/dev/null',
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_identity_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_identity_test',
  REDIS_URL: 'redis://127.0.0.1:56379/5',
  OPENAI_API_KEY: live ? process.env.OPENAI_API_KEY : 'integration-test-key',
  OPENAI_BASE_URL: live ? process.env.OPENAI_BASE_URL : 'http://127.0.0.1:1/v1',
  OPENAI_MODEL: live ? process.env.OPENAI_MODEL : 'identity-fixture',
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false',
  WUKONG_USER_TOKEN_SECRET: 'identity-isolated-user-token',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180',
  LINGXIOS_IDENTITY_LIVE: live ? '1' : '0',
  AGENT_OS_MAX_MODEL_CALLS: '3', AGENT_OS_MAX_MODEL_TOKENS: '100000', AGENT_OS_MAX_MODEL_COST_MICROS: '2000000', AGENT_OS_MAX_WORK_MS: '90000',
  SILICONFLOW_USD_CNY_RATE: '7', AGENT_OS_HOMES_ROOT: resolve(root, '.e2e/identity-homes'),
})
if (!live) Object.assign(environment, { AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1', AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1' })
async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Identity fixture command failed (${code})`)))
  })
}
// Only the reviewed loopback fixture is started; no developer .env is loaded.
await run('docker', ['compose', '-f', 'e2e/server/compose.yaml', 'up', '-d', '--wait'])
const admin = new pg.Client({ connectionString: environment.DATABASE_URL.replace('/lingxiloop_identity_test', '/postgres') })
await admin.connect()
try {
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_identity_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_identity_test')
} finally { await admin.end() }
await run(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'])
await run(process.execPath, ['server/run-integration-tests.mjs', '--file', 'runtime-agent-identity.test.ts'])
