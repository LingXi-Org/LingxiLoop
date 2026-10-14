import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import pg from 'pg'

assert.deepEqual(process.argv.slice(2), ['--live-group-mentions'], 'Explicit metered evaluation opt-in is required.')
const cwd = resolve(import.meta.dirname, '../..'), output = resolve(cwd, 'artifacts/group-mentions/live')
await mkdir(output, { recursive: true })
const credentials = process.env.EVAL_CANDIDATE_API_KEY ? process.env : parse(await readFile(resolve(cwd, 'eval/.env.local')))
for (const key of ['BASE_URL', 'MODEL', 'API_KEY', 'INPUT_CNY_PER_MILLION', 'OUTPUT_CNY_PER_MILLION']) {
  assert.ok(credentials[`EVAL_CANDIDATE_${key}`]?.trim(), `Missing EVAL_CANDIDATE_${key}`)
}
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_release_mentions_model_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_release_mentions_model_test',
  REDIS_URL: 'redis://127.0.0.1:56379/3', OPENAI_API_KEY: credentials.EVAL_CANDIDATE_API_KEY,
  OPENAI_BASE_URL: credentials.EVAL_CANDIDATE_BASE_URL, OPENAI_MODEL: credentials.EVAL_CANDIDATE_MODEL,
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false',
  RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '', LINGXIOS_LIVE_GROUP_MENTIONS: '1', RESEND_LIVE_TEST: '0', LINGXIOS_LIVE_PROTOCOL: '0',
  // Each of the bounded eight turns can also require rewrite and acceptance calls.
  AGENT_OS_MAX_MODEL_CALLS: '24', AGENT_OS_MAX_MODEL_TOKENS: '200000', AGENT_OS_MAX_MODEL_COST_MICROS: '250000', AGENT_OS_MAX_WORK_MS: '180000',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_INPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_HOMES_ROOT: resolve(output, 'runtime-homes'), WUKONG_USER_TOKEN_SECRET: 'group-mentions-isolated-user-token',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'group-mentions-isolated-gateway', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:52996',
})
assert.equal(new URL(env.DATABASE_URL).pathname, '/lingxiloop_release_mentions_model_test')
const log = resolve(output, 'integration.log')
await writeFile(log, '')
async function run(command, args) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { void appendFile(log, chunk); process.stdout.write(chunk) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? done() : reject(new Error(`Live group validation failed (${code}).`)))
  })
}
await run('docker', ['compose', '-f', 'e2e/server/compose.yaml', 'up', '-d', '--wait'])
const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_release_mentions_model_test', '/postgres') })
await admin.connect()
try {
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_release_mentions_model_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_release_mentions_model_test')
} finally { await admin.end() }
await run(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'])
await run(process.execPath, ['server/run-integration-tests.mjs', '--file', 'group-mentions-live.test.ts'])
assert.equal(JSON.parse(await readFile(resolve(output, 'results.json'), 'utf8')).passed, true)
