import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('../../', import.meta.url))
const artifacts = resolve(cwd, 'artifacts/e2e')
mkdirSync(artifacts, { recursive: true })
const localObjects = process.argv.includes('--local-objects')
const testArgs = process.argv.slice(2).filter((arg) => arg !== '--local-objects')
const artifactName = localObjects || testArgs.length ? 'server-targeted' : 'server'
const logName = `${artifactName}-integration.log`
const logPath = resolve(artifacts, logName)
writeFileSync(logPath, '')
// Only local disposable services and synthetic credentials enter this run.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|PROGRAMW6432|ALLUSERSPROFILE)$/i.test(name)))
Object.assign(env, {
  DOTENV_CONFIG_PATH: resolve(artifacts, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_integration_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_integration_test',
  REDIS_URL: 'redis://127.0.0.1:56379/0',
  LINGXIOS_TEST_REDIS_URL: 'redis://127.0.0.1:56379/0',
  OPENAI_API_KEY: 'integration-test-key',
  OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret',
  WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1',
  AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1',
  RESEND_LIVE_TEST: '0',
  LINGXIOS_LIVE_PROTOCOL: '0',
})
if (localObjects) Object.assign(env, {
  R2_ENDPOINT: 'http://127.0.0.1:59000', R2_BUCKET: 'lingxiloop-e2e',
  LINGXIOS_TEST_OBJECT_BUCKET: 'lingxiloop-e2e-runtime',
  LINGXIOS_R2_ACCESS_KEY_ID: 'lingxiloop-e2e',
  LINGXIOS_R2_SECRET_ACCESS_KEY: 'lingxiloop-e2e-storage-local',
})

const results = []
const commands = [
  ['docker', ['compose', '-f', 'e2e/server/compose.yaml', 'up', '-d', '--wait']],
  ...(localObjects ? [
    ['docker', ['compose', '-f', 'e2e/browser.compose.yaml', 'up', '-d', '--wait', 'storage']],
    [process.execPath, ['e2e/server/prepare-runtime-objects.mjs']],
  ] : []),
  [process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts']],
  [process.execPath, ['server/run-integration-tests.mjs', ...testArgs]],
]
for (const [command, args] of commands) {
  const startedAt = new Date().toISOString()
  const code = await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
      appendFileSync(logPath, chunk)
      process.stdout.write(chunk)
    })
    child.on('error', reject)
    child.on('close', (exitCode) => done(exitCode ?? 1))
  }).catch((error) => { appendFileSync(logPath, `${error.message}\n`); return 1 })
  results.push({ command: [command, ...args].join(' '), startedAt, finishedAt: new Date().toISOString(), exitCode: code })
  if (code !== 0) break
}
const log = readFileSync(logPath, 'utf8')
const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map((key) =>
  [key, Number(log.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0)]))
const passed = results.length === commands.length && results.every(({ exitCode }) => exitCode === 0) && counts.pass > 0
writeFileSync(resolve(artifacts, `${artifactName}-validation.json`), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  reproduce: ['node e2e/server/run.mjs', ...process.argv.slice(2)].join(' '),
  status: passed ? 'passed' : 'failed',
  counts, results, log: `artifacts/e2e/${logName}`,
  selectedFiles: (log.match(/selected \d+\/\d+ file\(s\): ([^\r\n]+)/)?.[1] ?? '').split(', ').filter(Boolean),
  availableIntegrationFiles: readdirSync(resolve(cwd, 'server/src/__integration__')).filter((name) => name.endsWith('.test.ts')).sort(),
  limitations: ['Live model provider and Resend delivery are unverified; this isolated runner disables both.',
    localObjects ? 'Runtime object-store coverage uses a separate private bucket in local MinIO; other integration providers are scripted fixtures.' : 'Integration fixtures simulate WuKongIM and object storage.'],
}, null, 2)}\n`)
process.exitCode = passed ? 0 : 1
