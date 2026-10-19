import { spawn } from 'node:child_process'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
const cwd = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const dbName = `lingxiloop_provider_matrix_test_${Date.now()}`
const db = new pg.Pool({ host: '127.0.0.1', port: 55432, user: 'postgres', password: 'lingxiloop-e2e-local', database: 'postgres' })
await db.query(`CREATE DATABASE "${dbName}"`); await db.end()
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMP|TEMP)$/i.test(name)))
Object.assign(env, { NODE_ENV: 'test', DOTENV_CONFIG_PATH: '/tmp/lingxiloop-no-provider-matrix-dotenv',
  DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${dbName}`,
  INTEGRATION_DATABASE_URL: `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${dbName}`,
  REDIS_URL: 'redis://127.0.0.1:56379/12', LINGXIOS_TEST_REDIS_URL: 'redis://127.0.0.1:56379/12',
  OPENAI_API_KEY: 'integration-test-key', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180', LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret',
  WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret', AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1',
  AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1', LINGXILOOP_DISABLE_EMBEDDINGS: '1', RESEND_LIVE_TEST: '0', LINGXIOS_LIVE_PROTOCOL: '0' })
const log = `${cwd}/docs/evidence/provider-matrix-20261019/integration.log`
await mkdir(`${cwd}/docs/evidence/provider-matrix-20261019`, { recursive: true })
await writeFile(log, '')
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['runtime-provider-fault-matrix.test.ts',
  'runtime-reliability.test.ts', 'runtime-provider-timeout.test.ts', 'runtime-deadline-recovery.test.ts',
  'native-admission.test.ts', 'group-mentions.test.ts']
const commands = [['--import', 'tsx', 'server/src/migrate-bin.ts'], ['server/run-integration-tests.mjs', ...files.flatMap(file => ['--file', file])]]
const results = []
for (const args of commands) {
  const startedAt = new Date().toISOString()
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore','pipe','pipe'] })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { process.stdout.write(data); appendFileSync(log, data) })
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1))
  })
  results.push({ args, startedAt, endedAt: new Date().toISOString(), exitCode })
  if (exitCode) break
}
const content = await readFile(log, 'utf8')
const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map(key =>
  [key, Number(content.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0)]))
const passed = results.length === commands.length && results.every(result => result.exitCode === 0)
  && counts.pass > 0 && counts.fail === 0 && counts.skipped === 0 && counts.cancelled === 0
await writeFile(`${cwd}/docs/evidence/provider-matrix-20261019/execution.json`, JSON.stringify({ database: dbName, redisDatabase: 12,
  productionOperations: 0, paidCalls: 0, files, results, counts, passed }, null, 2))
process.exitCode = passed ? 0 : 1
