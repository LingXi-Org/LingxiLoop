import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

// No developer dotenv or real provider credentials enter the disposable acceptance stack.
const output = resolve('.e2e/directory-audience')
await mkdir(output, { recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMP|TEMP|XDG_CACHE_HOME|E2E_CDP_URL)$/.test(name)))
Object.assign(env, { NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_directory_test',
  REDIS_URL: 'redis://127.0.0.1:56379/8', OPENAI_API_KEY: 'directory-scripted-fixture', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  OPENAI_EMBEDDING_MODEL: 'disabled', LINGXILOOP_DISABLE_EMBEDDINGS: '1', RESEND_API_KEY: '', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:53158',
  WUKONG_USER_TOKEN_SECRET: 'directory-test-secret', LINGXILOOP_GATEWAY_HMAC_SECRET: 'directory-test-gateway',
  E2E_TELEMETRY_DISABLED: '1', AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1', AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1' })
const results = []
async function run(command, args) {
  let log = ''
  const exitCode = await new Promise((done, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore','pipe','pipe'] })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk; process.stdout.write(chunk) })
    child.on('error', reject); child.on('exit', done)
  })
  results.push({ command: [command,...args], exitCode })
  await writeFile(resolve(output, `step-${results.length}.log`), log)
  assert.equal(exitCode, 0)
}
let fixture
try {
  await run('docker', ['compose','-f','e2e/server/compose.yaml','up','-d','--wait'])
  const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_directory_test','/postgres') })
  await admin.connect()
  try { if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_directory_test'")).rowCount) await admin.query('CREATE DATABASE lingxiloop_directory_test') }
  finally { await admin.end() }
  await run(process.execPath, ['--import','tsx','server/src/migrate-bin.ts'])
  fixture = spawn(process.execPath, ['--import','tsx','e2e/directory-audience/api.ts'], { env, stdio: ['ignore','pipe','pipe'] })
  let fixtureLog = ''
  for (const stream of [fixture.stdout, fixture.stderr]) stream.on('data', chunk => { fixtureLog += chunk; process.stdout.write(chunk) })
  const deadline = Date.now() + 60000
  while (!await fetch('http://127.0.0.1:53158').then(r => r.ok).catch(() => false)) {
    assert.equal(fixture.exitCode, null, fixtureLog)
    assert.ok(Date.now() < deadline, 'Fixture startup timed out')
    await new Promise(done => setTimeout(done, 250))
  }
  const metadata = JSON.parse(await readFile('node_modules/e2e/package.json','utf8'))
  await run(process.execPath, [resolve('node_modules/e2e',metadata.bin.e2e),'run','--config','e2e/directory-audience/config.ts'])
} finally {
  fixture?.kill()
  await writeFile(resolve(output,'runner-results.json'), JSON.stringify({ results,
    limitations: ['Synthetic identities and scripted model, recorded IM, contract browser harness. Real provider, real WuKong, full SPA journey and 24-hour soak unverified.'] }, null, 2))
}
