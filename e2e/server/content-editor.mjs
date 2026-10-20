import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const cwd = resolve(import.meta.dirname, '../..')
assert.ok(process.argv.slice(2).every(arg => ['--browser-only','--integration-only'].includes(arg)), 'Unknown native content validation option')
const output = resolve(cwd, 'artifacts/issue-219/validation')
await mkdir(output, { recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(XDG_CACHE_HOME|PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE)$/i.test(name)))
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_content219_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_content219_test',
  REDIS_URL: 'redis://127.0.0.1:56379/5', OPENAI_API_KEY: 'isolated-cases-test',
  OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'disabled',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '',
  WUKONG_USER_TOKEN_SECRET: 'isolated-cases-test-secret', LINGXILOOP_GATEWAY_HMAC_SECRET: 'isolated-cases-test-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53109', E2E_TELEMETRY_DISABLED: '1',
})
assert.equal(new URL(env.DATABASE_URL).pathname, '/lingxiloop_content219_test')
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
  assert.equal(code, 0, `Native content validation failed; see ${log}`)
}
let passed = false
try {
  const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_content219_test', '/postgres') })
  await admin.connect()
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_content219_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_content219_test')
  } finally { await admin.end() }
  await run(['--import','tsx','server/src/migrate-bin.ts'])
  await run(['--import','tsx','server/src/migrate-bin.ts'])
  if (!process.argv.includes('--browser-only')) await run(['server/run-integration-tests.mjs','--file','organization-cases.test.ts','--file','course-forum.test.ts','--file','homework.test.ts'])
  if (!process.argv.includes('--integration-only')) {
    const web = start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','53109','--strictPort'],'web')
    await ready('http://127.0.0.1:53109',web)
    const metadata = JSON.parse(await readFile(resolve(cwd,'node_modules/e2e/package.json'),'utf8'))
    await run([resolve(cwd,'node_modules/e2e',metadata.bin.e2e),'run','--config','e2e.native-content.config.ts'])
  }
  passed = true
} finally {
  for (const child of services) child.kill()
  await writeFile(resolve(output, process.argv.includes('--browser-only') ? 'browser-results.json' : 'results.json'), JSON.stringify({ passed, reproduce: ['XDG_CACHE_HOME=/workspace/.cache node e2e/server/content-editor.mjs',...process.argv.slice(2)].join(' '), database: 'lingxiloop_content219_test', results,
    limitations: ['Native browser fixture isolates the actual product editor with synthetic localStorage persistence. Business API and authorization coverage is in the cases and forum suites; integration checks use the existing three owning suites on dedicated PostgreSQL. No live model/provider validation.'] }, null, 2))
}
