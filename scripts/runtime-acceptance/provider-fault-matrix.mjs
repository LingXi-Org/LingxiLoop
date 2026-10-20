import { spawn } from 'node:child_process'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
const cwd = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`
const dbName = `lingxiloop_provider_matrix_test_${runId}`
const output = resolve(process.env.PROVIDER_MATRIX_OUTPUT_DIR || `${cwd}/.e2e/provider-matrix/${runId}`)
const port = (name, fallback) => {
  const value = Number(process.env[name] || fallback)
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) throw new Error(`Invalid ${name}`)
  return value
}
const pgPort = port('PROVIDER_MATRIX_PG_PORT', 55432)
const redisPort = port('PROVIDER_MATRIX_REDIS_PORT', 56379)
const password = process.env.PROVIDER_MATRIX_PG_PASSWORD || 'lingxiloop-e2e-local'
// Exclusive output creation preserves historical and failed receipts.
await mkdir(dirname(output), { recursive: true })
await mkdir(output, { recursive: false })
const db = new pg.Pool({ host: '127.0.0.1', port: pgPort, user: 'postgres', password, database: 'postgres' })
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMP|TEMP)$/i.test(name)))
Object.assign(env, { NODE_ENV: 'test', DOTENV_CONFIG_PATH: '/tmp/lingxiloop-no-provider-matrix-dotenv',
  DATABASE_URL: `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${pgPort}/${dbName}`,
  INTEGRATION_DATABASE_URL: `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${pgPort}/${dbName}`,
  REDIS_URL: `redis://127.0.0.1:${redisPort}/12`, LINGXIOS_TEST_REDIS_URL: `redis://127.0.0.1:${redisPort}/12`,
  OPENAI_API_KEY: 'integration-test-key', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180', LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret',
  WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret', AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1',
  AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1', LINGXILOOP_DISABLE_EMBEDDINGS: '1', RESEND_LIVE_TEST: '0', LINGXIOS_LIVE_PROTOCOL: '0',
  RUNTIME_ACCEPTANCE_OUTPUT_DIR: output,
  PROVIDER_MATRIX_RECEIPTS: `${output}/product-fault-results.json`, BASIC_ACCEPTANCE_RECEIPTS: `${output}/basic-results.json` })
const log = `${output}/integration.log`
await writeFile(log, '', { flag: 'wx' })
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['runtime-provider-fault-matrix.test.ts',
  'runtime-reliability.test.ts', 'runtime-provider-timeout.test.ts', 'runtime-deadline-recovery.test.ts',
  'native-admission.test.ts', 'group-mentions.test.ts', 'runtime-basic-acceptance.test.ts']
const commands = [['--import', 'tsx', 'server/src/migrate-bin.ts'], ['server/run-integration-tests.mjs', ...files.flatMap(file => ['--file', file])]]
const results = []
let created = false, databaseDropped = false, failure
try {
  await db.query(`CREATE DATABASE "${dbName}"`); created = true
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
} catch { failure = 'launch_or_database_failed' }
finally {
  try {
    if (created) { await db.query(`DROP DATABASE "${dbName}" WITH (FORCE)`); databaseDropped = true }
  } catch { failure = 'temporary_database_cleanup_failed' }
  await db.end()
}
const content = await readFile(log, 'utf8')
const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map(key =>
  [key, Number(content.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0)]))
const passed = !failure && databaseDropped && results.length === commands.length && results.every(result => result.exitCode === 0)
  && counts.pass > 0 && counts.fail === 0 && counts.skipped === 0 && counts.cancelled === 0
await writeFile(`${output}/execution.json`, JSON.stringify({ database: dbName, databaseDropped, redisDatabase: 12, pgPort, redisPort,
  productionOperations: 0, paidCalls: 0, files, results, counts, passed, ...(failure ? { failure } : {}) }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output, passed, counts, databaseDropped }))
process.exitCode = passed ? 0 : 1
