import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkAuthoringCoverHttp } from './authoring-cover-http-check.mjs'

const cwd = resolve(import.meta.dirname, '../..')
const output = resolve(cwd, 'artifacts/issue-449')
const mode = process.argv[2]
assert.ok(['--http-only', '--browser'].includes(mode), 'Choose --http-only or --browser')
if (mode === '--browser') assert.ok(process.env.E2E_AUTHORING_COVER_CDP_URL, 'A separately verified normal-sandbox browser CDP endpoint is required; this runner never launches or downloads browsers')
await mkdir(output, { recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|HOME|TMPDIR|TMP|TEMP)$/.test(key)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_449_browser_test',
  REDIS_URL: 'redis://127.0.0.1:56379/9', OPENAI_API_KEY: 'isolated-cases-449-test', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '',
  WUKONG_USER_TOKEN_SECRET: 'isolated-cases-449-test-secret', LINGXILOOP_GATEWAY_HMAC_SECRET: 'isolated-cases-449-test-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53108', E2E_TELEMETRY_DISABLED: '1', CASES_AUTHORING_COVER_FIXTURE: '1',
  LINGXILOOP_DEV_API_TARGET: 'http://127.0.0.1:53107', LINGXILOOP_VITE_CACHE_DIR: resolve(cwd, 'node_modules/.vite-issue-449'),
  ...(mode === '--browser' ? { E2E_AUTHORING_COVER_CDP_URL: process.env.E2E_AUTHORING_COVER_CDP_URL,
    E2E_CASE_COVER_CDP_URL: process.env.E2E_AUTHORING_COVER_CDP_URL } : {}),
})
const children = []
const results = []
function start(args, name) {
  const log = resolve(output, `${name}.log`)
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => appendFileSync(log, data))
  return child
}
async function run(args, name) {
  const child = start(args, name)
  const exitCode = await new Promise((done, reject) => { child.once('exit', done); child.once('error', reject) })
  results.push({ name, exitCode })
  assert.equal(exitCode, 0, `${name} failed; see artifacts/issue-449/${name}.log`)
}
async function ready(url, child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    assert.ok(child.exitCode === null && child.signalCode === null, `Fixture exited before ${url}`)
    if (await fetch(url).then(r => r.ok).catch(() => false)) return
    await new Promise(done => setTimeout(done, 200))
  }
  throw Error(`Fixture startup timed out: ${url}`)
}
let passed = false, receipt = null
try {
  await run(['--import', 'tsx', 'server/src/migrate-bin.ts'], 'fixture-migrate')
  const api = start(['--import', 'tsx', 'e2e/cases/api.ts'], 'fixture-api')
  await ready('http://127.0.0.1:53107/api/session', api)
  if (mode === '--http-only') receipt = await checkAuthoringCoverHttp('http://127.0.0.1:53107')
  else {
    const web = start(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '53108', '--strictPort'], 'fixture-web')
    await ready('http://127.0.0.1:53108', web)
    const metadata = JSON.parse(await readFile(resolve(cwd, 'node_modules/e2e/package.json'), 'utf8'))
    await run([resolve(cwd, 'node_modules/e2e', metadata.bin.e2e), 'run', '--config', 'e2e.case-authoring-covers.config.ts'], 'browser-driver')
  }
  passed = true
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill()
  await Promise.all(children.filter(child => child.exitCode === null && child.signalCode === null).map(child => new Promise(done => {
    child.once('exit', done); setTimeout(done, 3000)
  })))
  await writeFile(resolve(output, mode === '--http-only' ? 'http-results.json' : 'browser-wrapper-results.json'), JSON.stringify({
    mode, passed, results, receipt, browserAssertions: mode === '--http-only' ? 0 : undefined,
    reproduce: `node e2e/cases/run-authoring-covers.mjs ${mode}`, finishedAt: new Date().toISOString(),
  }, null, 2) + '\n')
}
