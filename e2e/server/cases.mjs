import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const cwd = resolve(import.meta.dirname, '../..')
assert.ok(process.argv.slice(2).every(arg => ['--browser','--browser-only'].includes(arg)), 'Unknown cases validation option')
const output = resolve(cwd, 'artifacts/cases')
await mkdir(output, { recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(XDG_CACHE_HOME|PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_browser_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_browser_test',
  REDIS_URL: 'redis://127.0.0.1:56379/5', OPENAI_API_KEY: 'isolated-cases-test',
  OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'disabled',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '',
  WUKONG_USER_TOKEN_SECRET: 'isolated-cases-test-secret', LINGXILOOP_GATEWAY_HMAC_SECRET: 'isolated-cases-test-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53108', E2E_TELEMETRY_DISABLED: '1',
})
assert.equal(new URL(env.DATABASE_URL).pathname, '/lingxiloop_cases_browser_test')
const log = resolve(output, process.argv.includes('--browser-only') ? 'browser-driver.log' : 'integration.log')
await writeFile(log, '')
const results = []
const services = []
function start(args, label) {
  writeFileSync(resolve(output,`${label}.log`),'')
  const child = spawn(process.execPath,args,{ cwd,env,windowsHide: true,stdio: ['ignore','pipe','pipe'] })
  services.push(child)
  for (const stream of [child.stdout,child.stderr]) stream.on('data',chunk => appendFileSync(resolve(output,`${label}.log`),chunk))
  return child
}
async function ready(url, child) {
  const deadline = Date.now()+180_000
  while (Date.now() < deadline) {
    assert.equal(child.exitCode,null,'Browser fixture exited early')
    if (await fetch(url).then(response => response.ok).catch(() => false)) return
    await new Promise(done => setTimeout(done,500))
  }
  throw new Error('Browser fixture startup timed out')
}
async function run(args) {
  const startedAt = new Date().toISOString()
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { appendFileSync(log, chunk); process.stdout.write(chunk) })
    child.once('error', reject)
    child.once('exit', done)
  })
  results.push({ command: ['node', ...args], startedAt, finishedAt: new Date().toISOString(), exitCode: code })
  assert.equal(code, 0, `Cases validation failed; see ${log}`)
}
let passed = false
try {
  const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_cases_browser_test', '/postgres') })
  await admin.connect()
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_cases_browser_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_cases_browser_test')
  } finally { await admin.end() }
  await run(['--import','tsx','server/src/migrate-bin.ts'])
  await run(['--import','tsx','server/src/migrate-bin.ts'])
  {
    const api = start(['--import','tsx','e2e/cases/api.ts'],'api')
    await ready('http://127.0.0.1:53107/api/session',api)
    env.LINGXILOOP_DEV_API_TARGET = 'http://127.0.0.1:53107'
    const web = start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','53108','--strictPort'],'web')
    await ready('http://127.0.0.1:53108',web)
    const metadata = JSON.parse(await readFile(resolve(cwd,'node_modules/e2e/package.json'),'utf8'))
    await run([resolve(cwd,'node_modules/e2e',metadata.bin.e2e),'run','--config','e2e.cases.config.ts'])
  }
  passed = true
} finally {
  for (const child of services) child.kill()
  await writeFile(resolve(output, process.argv.includes('--browser-only') ? 'browser-results.json' : 'results.json'), JSON.stringify({ passed, reproduce: ['XDG_CACHE_HOME=/workspace/.cache node e2e/server/cases.mjs',...process.argv.slice(2)].join(' '), database: 'lingxiloop_cases_browser_test', results,
    limitations: ['Synthetic identities and in-memory object storage; real HTTP API and isolated PostgreSQL. No live Open Notebook ingestion or vector retrieval is exercised.'] }, null, 2))
}
