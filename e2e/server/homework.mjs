import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import pg from 'pg'

// Failure inventory: e2e/homework/acceptance.md. Validate before opening a socket or starting a service.
assert.equal(process.argv[2], '--live-homework', 'Explicit --live-homework is required (metered synthetic evaluation).')
assert.ok(process.argv.slice(3).every(option => ['--check-config', '--documents-only'].includes(option)), 'Unknown live homework validation option.')
const documentsOnly = process.argv.includes('--documents-only')
const publicInput = process.env.E2E_HOMEWORK_PUBLIC_URL || 'https://www.mathsisfun.com/algebra/trig-area-triangle-without-right-angle.html'
let publicURL
try { publicURL = new URL(publicInput) } catch { assert.fail('Invalid E2E_HOMEWORK_PUBLIC_URL; use one credential-free HTTP(S) URL.') }
assert.ok(['http:', 'https:'].includes(publicURL.protocol) && !publicURL.username && !publicURL.password
  && publicInput === publicInput.trim() && !/[\r\n]/.test(publicInput), 'Invalid E2E_HOMEWORK_PUBLIC_URL; use one credential-free HTTP(S) URL.')
const cwd = resolve(import.meta.dirname, '../..')
const credentials = process.env.E2E_EVAL_CREDENTIALS === 'env' ? process.env
  : parse(await readFile(process.env.EVAL_ENV_FILE || process.env.E2E_EVAL_CREDENTIALS || resolve(cwd, 'eval/.env.local')))
for (const role of ['CANDIDATE', 'JUDGE']) for (const key of ['BASE_URL', 'MODEL', 'API_KEY', 'INPUT_CNY_PER_MILLION', 'OUTPUT_CNY_PER_MILLION']) {
  assert.ok(credentials[`EVAL_${role}_${key}`]?.trim(), `Missing EVAL_${role}_${key}; missing credentials never count as a pass.`)
  if (key.endsWith('CNY_PER_MILLION')) assert.ok(Number.isFinite(Number(credentials[`EVAL_${role}_${key}`]))
    && Number(credentials[`EVAL_${role}_${key}`]) >= 0, `Invalid EVAL_${role}_${key}; an explicit finite non-negative price is required.`)
}
assert.notEqual(credentials.EVAL_CANDIDATE_MODEL, credentials.EVAL_JUDGE_MODEL, 'Use an independent judge model.')
for (const role of ['CANDIDATE', 'JUDGE']) {
  const url = new URL(credentials[`EVAL_${role}_BASE_URL`])
  assert.ok(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, `Invalid EVAL_${role}_BASE_URL`)
}
if (process.argv.includes('--check-config')) {
  console.log('Live homework credential, independent-judge and explicit-price guards passed; no services or model calls started.')
  process.exit(0)
}
const git = (...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, 'Source revision must be recorded before live acceptance')
  return result.stdout.trim()
}
const commit = git('rev-parse', 'HEAD'), runId = new Date().toISOString().replace(/[:.]/g, '-')
const output = resolve(cwd, 'artifacts/homework', commit.slice(0, 12), runId)
await mkdir(output, { recursive: true })
async function sourceSnapshot() {
  const files = []
  for (const name of [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0'))].sort()) {
    if (!name || /^(?:artifacts|\.e2e|node_modules|eval\/results)\//.test(name)
      || /(?:^|\/)(?:runtime-homes|\.wrangler|__pycache__)(?:\/|$)/.test(name)
      || /(?:^|\/)(?:\.env(?:\..*)?|\.pnp\..*|.*\.tsbuildinfo)$/.test(name)) continue
    try { files.push({ path: name, sha256: createHash('sha256').update(await readFile(resolve(cwd, name))).digest('hex') }) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return { hash: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files }
}
const source = await sourceSnapshot()
await writeFile(resolve(output, 'source-manifest.json'), JSON.stringify(source, null, 2))
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE|E2E_WUKONG_IMAGE)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'), PORT: '53196',
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_homework_model_test',
  DATABASE_POOL_MAX: '8',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_homework_model_test',
  REDIS_URL: 'redis://127.0.0.1:56379/5', OPENAI_API_KEY: credentials.EVAL_CANDIDATE_API_KEY,
  OPENAI_BASE_URL: credentials.EVAL_CANDIDATE_BASE_URL, OPENAI_MODEL: credentials.EVAL_CANDIDATE_MODEL,
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false',
  RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '', LINGXIOS_LIVE_HOMEWORK: '1', LINGXIOS_REAL_WUKONG: '1',
  E2E_HOMEWORK_DOCUMENTS_ONLY: documentsOnly ? '1' : '0',
  E2E_HOMEWORK_PUBLIC_URL: publicURL.href,
  LINGXIOS_LIVE_PROTOCOL: '0', LINGXIOS_LIVE_UI: '0', RESEND_LIVE_TEST: '0',
  LINGXIOS_SERVICE_TOKEN: 'homework-live-isolated-service-token', LINGXIOS_CONTROL_HOST: '127.0.0.1',
  LINGXIOS_CONTROL_PORT: '53197', LINGXIOS_CONTROL_URL: 'http://127.0.0.1:53197',
  AGENT_OS_WORKER_PORT: '53195', AGENT_OS_MAX_CONCURRENT_RUNS: '1', AGENT_OS_RESERVED_INTERACTIVE_RUNS: '0', AGENT_OS_MODEL_CONCURRENCY: '1',
  AGENT_OS_MAX_MODEL_CALLS: '16', AGENT_OS_MAX_MODEL_TOKENS: '200000', AGENT_OS_MAX_MODEL_COST_MICROS: '500000', AGENT_OS_MAX_WORK_MS: '240000',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_INPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: String(Math.ceil(Number(credentials.EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION) / 7 * 1e6)),
  AGENT_OS_HOMES_ROOT: resolve(output, 'runtime-homes'), HOMEWORK_ARTIFACT_DIR: output,
  WUKONG_API_URL: 'http://127.0.0.1:55021', WUKONG_WS_URL: 'ws://127.0.0.1:55220', WUKONG_API_TOKEN: 'e2e-local-token',
  WUKONG_WEBHOOK_SECRET: 'lingxiloop-homework-live-webhook', WUKONG_USER_TOKEN_SECRET: 'lingxiloop-homework-live-user-token-secret',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'lingxiloop-homework-live-gateway-secret', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53198',
  R2_ENDPOINT: 'http://127.0.0.1:59020', R2_BUCKET: 'lingxiloop-homework-e2e', R2_ACCESS_KEY_ID: 'homework-e2e',
  R2_SECRET_ACCESS_KEY: 'homework-e2e-local-storage', R2_PUBLIC_BASE: 'http://127.0.0.1:59020/lingxiloop-homework-e2e', R2_URL_SIGNING_SECRET: 'homework-local-url-secret',
  OPENUI_TELEMETRY_DISABLED: '1', E2E_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1',
  ...Object.fromEntries(Object.entries(credentials).filter(([name]) => /^EVAL_(CANDIDATE|JUDGE)_/.test(name))),
})
const dbUrl = new URL(env.DATABASE_URL)
assert.ok(dbUrl.hostname === '127.0.0.1' && dbUrl.port === '55432' && dbUrl.pathname === '/lingxiloop_homework_model_test' && !dbUrl.search)
const results = [], log = resolve(output, 'run.log'), startedAt = new Date().toISOString()
const secrets = [credentials.EVAL_CANDIDATE_API_KEY, credentials.EVAL_JUDGE_API_KEY]
const sanitize = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), value)
async function run(command, args) {
  const started = new Date().toISOString()
  const code = await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { const text = sanitize(String(chunk)); void appendFile(log, text); process.stdout.write(text) })
    child.once('error', reject); child.once('exit', done)
  })
  results.push({ command: [command, ...args], startedAt: started, finishedAt: new Date().toISOString(), exitCode: code })
  assert.equal(code, 0, 'Live homework command failed; inspect sanitized run evidence')
}
let passed = false
try {
  await run('docker', ['compose', '-f', 'e2e/server/compose.yaml', 'up', '-d', '--wait'])
  await run('docker', ['compose', '-f', 'e2e/homework/compose.yaml', 'up', '-d', '--wait'])
  const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_homework_model_test', '/postgres') })
  await admin.connect()
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_homework_model_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_homework_model_test')
  } finally { await admin.end() }
  await run(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'])
  await run(process.execPath, ['server/run-integration-tests.mjs', '--file', 'homework-live.test.ts'])
  const report = JSON.parse(await readFile(resolve(output, 'results.json'), 'utf8'))
  assert.equal(report.passed, true, 'Skipped or incomplete live homework evidence cannot pass')
  assert.ok(report.counts.passed > 0 && report.counts.failed === 0 && report.counts.skipped === 0)
  passed = true
} finally {
  const finalSource = await sourceSnapshot(), sourceChanged = finalSource.hash !== source.hash
  await writeFile(resolve(output, 'run-metadata.json'), JSON.stringify({ commit, sourceHash: source.hash, finalSourceHash: finalSource.hash, sourceChanged, dirty: Boolean(git('status', '--porcelain')),
    startedAt, finishedAt: new Date().toISOString(), passed: passed && !sourceChanged, scope: documentsOnly ? 'documents-only' : 'full',
    releaseReady: passed && !sourceChanged && !documentsOnly, requiredUnverified: documentsOnly ? ['public-webpage'] : [],
    publicMaterialUrl: documentsOnly ? null : publicURL.href,
    results, reproduce: `EVAL_ENV_FILE=<existing credential file> node e2e/server/homework.mjs --live-homework${documentsOnly ? ' --documents-only' : ''}`,
    candidate: credentials.EVAL_CANDIDATE_MODEL, judge: credentials.EVAL_JUDGE_MODEL, database: dbUrl.pathname.slice(1),
    maxRunCostUSD: 0.5, maxTotalCostUSD: 5, maxTotalCostCNY: 5 * Number(env.SILICONFLOW_USD_CNY_RATE || 7),
    conversion: 'SILICONFLOW_USD_CNY_RATE or established runtime fallback 7 CNY/USD; configured prices are estimates, not verified invoices',
    maxModelCallsPerRun: 16, maxModelTokensPerRun: 200000, modelConcurrency: 1,
  }, null, 2))
  assert.equal(sourceChanged, false, 'Source content changed during live acceptance; rerun against the final source snapshot')
}
