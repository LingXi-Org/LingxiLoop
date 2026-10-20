import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import pg from 'pg'

const cwd = resolve(import.meta.dirname, '../..')
assert.ok(process.argv.slice(2).every(arg => ['--browser','--browser-only','--resources-only','--core-only','--states-only','--issue146','--issue163','--issue184','--issue187','--issue219'].includes(arg)), 'Unknown forum validation option')
const output = resolve(cwd, process.env.FORUM_ACCEPTANCE_OUTPUT ?? (process.argv.includes('--states-only')?'artifacts/forum/states':process.argv.includes('--core-only')?'artifacts/forum/core':process.argv.includes('--issue219')?'artifacts/forum/issue219':process.argv.includes('--issue187')?'artifacts/issue-187/forum':process.argv.includes('--issue184')?'artifacts/forum/issue184':process.argv.includes('--issue163')?'artifacts/forum/issue163':process.argv.includes('--issue146')?'artifacts/forum/issue146':'artifacts/forum'))
assert.ok(output.startsWith(resolve(cwd, 'artifacts') + sep), 'Forum output must be inside this repository artifacts directory')
await mkdir(output, { recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(XDG_CACHE_HOME|PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE|E2E_CDP_URL|E2E_NATIVE_REDUCED_MOTION|PLAYWRIGHT_BROWSERS_PATH)$/i.test(name)))
Object.assign(env, {
  FORUM_BROWSER_OUTPUT: resolve(output, 'browser'),
  LINGXILOOP_VITE_CACHE_DIR: resolve(cwd, 'node_modules/.vite-forum'),
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_forum_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_forum_test',
  REDIS_URL: 'redis://127.0.0.1:56379/4', OPENAI_API_KEY: 'isolated-forum-test',
  OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'disabled',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', RESEND_API_KEY: '', ALERT_WEBHOOK_URL: '',
  WUKONG_USER_TOKEN_SECRET: 'isolated-forum-test-secret', LINGXILOOP_GATEWAY_HMAC_SECRET: 'isolated-forum-test-gateway',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53098', E2E_TELEMETRY_DISABLED: '1',
})
assert.equal(new URL(env.DATABASE_URL).pathname, '/lingxiloop_forum_test')
if(process.argv.includes('--states-only')) env.FORUM_STATES='1'
if(process.argv.includes('--core-only')) env.FORUM_CORE='1'
if(process.argv.includes('--issue219')) env.FORUM_ISSUE219='1'
if(process.argv.includes('--issue146')) env.FORUM_ISSUE146='1'
if(process.argv.includes('--issue163')) env.FORUM_ISSUE163='1'
if(process.argv.includes('--issue187')) env.FORUM_ISSUE187='1'
if(process.argv.includes('--issue184')) env.FORUM_ISSUE184='1'
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
  assert.equal(code, 0, `Forum validation failed; see ${log}`)
}
let passed = false
try {
  const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_forum_test', '/postgres') })
  await admin.connect()
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_forum_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_forum_test')
  } finally { await admin.end() }
  await run(['--import','tsx','server/src/migrate-bin.ts'])
  await run(['--import','tsx','server/src/migrate-bin.ts'])
  if (!process.argv.includes('--browser-only')) await run(['server/run-integration-tests.mjs','--file','course-forum.test.ts'])
  if (process.argv.includes('--browser') || process.argv.includes('--browser-only')) {
    const api = start(['--import','tsx','e2e/forum/api.ts'],'api')
    await ready('http://127.0.0.1:53097/api/session',api)
    env.LINGXILOOP_DEV_API_TARGET = 'http://127.0.0.1:53097'
    const web = start(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','53098','--strictPort'],'web')
    await ready('http://127.0.0.1:53098',web)
    const metadata = JSON.parse(await readFile(resolve(cwd,'node_modules/e2e/package.json'),'utf8'))
    await run([resolve(cwd,'node_modules/e2e',metadata.bin.e2e),'run','--config','e2e.forum.config.ts', ...(process.argv.includes('--resources-only') ? ['e2e/forum/resources.e2e.ts'] : [])])
  }
  passed = true
} finally {
  for (const child of services) child.kill()
  await writeFile(resolve(output, process.argv.includes('--browser-only') ? 'browser-results.json' : 'results.json'), JSON.stringify({ passed, reproduce: ['node e2e/server/forum.mjs',...process.argv.slice(2)].join(' '), database: 'lingxiloop_forum_test', results,
    limitations: ['Synthetic identities, recorded WuKong messages and in-memory object storage; browser validation is reported separately.'] }, null, 2))
}
