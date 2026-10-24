import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const cwd = resolve(import.meta.dirname, '../../..')
const output = resolve(cwd, 'artifacts/issue-389')
await mkdir(output, { recursive: true })
// Whitelist process infrastructure only; never inherit real app credentials.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMPDIR|TMP|TEMP)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_browser_test',
  REDIS_URL: 'redis://127.0.0.1:56379/5', OPENAI_API_KEY: 'isolated-cases-test',
  OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'disabled',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '',
  WUKONG_USER_TOKEN_SECRET: 'isolated-cases-test-secret', LINGXILOOP_GATEWAY_HMAC_SECRET: 'isolated-cases-test-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53108', E2E_TELEMETRY_DISABLED: '1',
  LINGXILOOP_DEV_API_TARGET: 'http://127.0.0.1:53107',
  LINGXILOOP_VITE_CACHE_DIR: resolve(cwd, 'node_modules/.vite-issue-389'),
})
const profile = await mkdtemp(resolve(tmpdir(), 'issue-389-chromium-'))
const children = []
const results = []
function start(executable, args, name) {
  const log = resolve(output, `${name}.log`)
  const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => appendFileSync(log, chunk))
  return child
}
async function ready(url, child) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    assert.ok(child.exitCode === null && child.signalCode === null, `Fixture exited before ${url}; see artifacts/issue-389/*.log`)
    if (await fetch(url).then(r => r.ok).catch(() => false)) return
    await new Promise(done => setTimeout(done, 300))
  }
  throw new Error(`Fixture timed out: ${url}`)
}
async function run(args, name) {
  const startedAt = new Date().toISOString()
  const child = start(process.execPath, args, name)
  const exitCode = await new Promise((done, reject) => { child.once('exit', done); child.once('error', reject) })
  results.push({ args, startedAt, finishedAt: new Date().toISOString(), exitCode })
  assert.equal(exitCode, 0, `${name} failed; see artifacts/issue-389/${name}.log`)
}
let passed = false
try {
  await run(['--import', 'tsx', 'server/src/migrate-bin.ts'], 'migrate')
  const api = start(process.execPath, ['--import', 'tsx', 'e2e/cases/api.ts'], 'api')
  await ready('http://127.0.0.1:53107/api/session', api)
  const web = start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '53108', '--strictPort'], 'web')
  await ready('http://127.0.0.1:53108', web)
  const chromium = start('/usr/bin/chromium', ['--headless', '--disable-dev-shm-usage', '--remote-debugging-port=9339', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], 'chromium')
  await ready('http://127.0.0.1:9339/json/version', chromium)
  const metadata = JSON.parse(await readFile(resolve(cwd, 'node_modules/e2e/package.json'), 'utf8'))
  await run([resolve(cwd, 'node_modules/e2e', metadata.bin.e2e), 'run', '--config', 'e2e.cases-draft-visibility.config.ts'], 'browser-driver')
  passed = true
} finally {
  for (const child of children) if (child.exitCode === null) child.kill()
  await Promise.all(children.filter(child => child.exitCode === null).map(child => new Promise(done => { child.once('exit', done); setTimeout(done, 3000) })))
  await rm(profile, { recursive: true, force: true }).catch(() => {})
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ passed, reproduce: 'node docs/evidence/issue-389/run-browser.mjs', results, database: 'lingxiloop_cases_browser_test', limitation: 'Synthetic identities and object storage; real HTTP API, PostgreSQL and official @e2e-dev/web engine. No model endpoint.' }, null, 2) + '\n')
}
