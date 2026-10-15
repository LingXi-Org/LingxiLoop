import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import pg from 'pg'

const live = process.argv.includes('--live-model-context')
assert.deepEqual(process.argv.slice(2), live ? ['--live-model-context'] : [])
const cwd = resolve(import.meta.dirname, '../..'), output = resolve(cwd, 'artifacts/reply-generation')
await mkdir(output, { recursive: true })
const credentials = live ? (process.env.EVAL_CANDIDATE_API_KEY ? process.env : parse(await readFile(resolve(cwd, 'eval/.env.local')))) : {}
if (live) assert.ok(credentials.EVAL_CANDIDATE_API_KEY?.trim(), 'Real provider credentials are required.')
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE)$/i.test(name)))
const databaseName = 'lingxiloop_model_context_test'
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  INTEGRATION_DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${databaseName}`,
  REDIS_URL: 'redis://127.0.0.1:56379/4', OPENAI_API_KEY: live ? credentials.EVAL_CANDIDATE_API_KEY : 'integration-test-key',
  OPENAI_BASE_URL: live ? 'https://api.siliconflow.cn/v1' : 'http://127.0.0.1:1/v1', OPENAI_MODEL: 'zai-org/GLM-5.2',
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false',
  LINGXIOS_LIVE_CONTEXT: live ? '1' : '0', RESEND_LIVE_TEST: '0', LINGXIOS_LIVE_PROTOCOL: '0',
  AGENT_OS_MAX_MODEL_CALLS: '8', AGENT_OS_MAX_MODEL_TOKENS: '1000000', AGENT_OS_MAX_MODEL_COST_MICROS: '1000000', AGENT_OS_MAX_WORK_MS: '180000',
  SILICONFLOW_USD_CNY_RATE: '7', AGENT_OS_HOMES_ROOT: resolve(output, 'runtime-homes'),
  WUKONG_USER_TOKEN_SECRET: 'model-context-isolated-user-token', LINGXILOOP_GATEWAY_HMAC_SECRET: 'model-context-isolated-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:52992',
})
const log = resolve(output, live ? 'live.log' : 'scripted.log')
await writeFile(log, '')
async function run(command, args) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { void appendFile(log, chunk); process.stdout.write(chunk) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? done() : reject(new Error(`Context regression failed (${code}).`)))
  })
}
await run('docker', ['compose', '-f', 'e2e/server/compose.yaml', 'up', '-d', '--wait'])
const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace(`/${databaseName}`, '/postgres') })
await admin.connect()
try {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName])).rowCount) await admin.query(`CREATE DATABASE ${databaseName}`)
} finally { await admin.end() }
await run(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'])
await run(process.execPath, ['server/run-integration-tests.mjs', '--file', 'runtime-model-context.test.ts'])
assert.equal(JSON.parse(await readFile(resolve(output, live ? 'live.json' : 'scripted.json'), 'utf8')).passed, true)
