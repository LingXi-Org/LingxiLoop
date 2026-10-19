import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Requires existing local disposable services from e2e/server/compose.yaml.
// Both checkouts must contain the same test fixture; product code stays intact.
const candidate = fileURLToPath(new URL('../../', import.meta.url))
const baseline = resolve(process.argv[2] ?? '')
assert.ok(process.argv[2] && baseline !== candidate, 'pass a separate baseline worktree')
const pairs = Number(process.argv[3] ?? 10)
assert.ok(Number.isInteger(pairs) && pairs > 0 && pairs <= 20)
const fixture = 'server/src/__integration__/presentation-latency.test.ts'
assert.equal(readFileSync(resolve(baseline, fixture), 'utf8'), readFileSync(resolve(candidate, fixture), 'utf8'), 'fixtures must be identical')
const require = createRequire(resolve(candidate, 'package.json'))
const { Client } = require('pg')
const database = 'lingxiloop_presentation_test'
const connectionString = `postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${database}`
const admin = new Client({ connectionString: connectionString.replace(database, 'postgres') })
await admin.connect()
try {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount) await admin.query(`CREATE DATABASE ${database}`)
} finally { await admin.end() }

const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|HOME|TMP|TEMP)$/i.test(name)))
Object.assign(env, {
  PATH: `${dirname(process.execPath)}:${env.PATH ?? ''}`,
  DOTENV_CONFIG_PATH: resolve(candidate, 'artifacts/memory-latency/__no_dotenv__'), NODE_ENV: 'test',
  DATABASE_URL: connectionString, INTEGRATION_DATABASE_URL: connectionString,
  REDIS_URL: 'redis://127.0.0.1:56379/15', LINGXIOS_TEST_REDIS_URL: 'redis://127.0.0.1:56379/15',
  OPENAI_API_KEY: 'integration-test-key', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret', WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1', AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', RESEND_LIVE_TEST: '0', LINGXIOS_LIVE_PROTOCOL: '0',
})
const artifacts = resolve(candidate, 'artifacts/memory-latency')
mkdirSync(artifacts, { recursive: true })
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const hash = value => createHash('sha256').update(value).digest('hex')
const versions = [baseline, candidate].map(cwd => JSON.parse(readFileSync(resolve(cwd, 'node_modules/@lyyzka/lingxios/package.json'), 'utf8')).version)
assert.equal(versions[0], versions[1], 'runtime versions must match')
const report = {
  generatedAt: new Date().toISOString(), runtime: versions[0], pairs,
  baselineCommit: git(baseline, ['rev-parse', 'HEAD']), candidateBase: git(candidate, ['rev-parse', 'HEAD']),
  candidateDiffSha256: hash(git(candidate, ['diff', '--', 'server/src/agent-runtime', 'server/src/db/pool.ts', 'server/src/im/router.ts'])),
  fixtureSha256: hash(readFileSync(resolve(candidate, fixture))),
  environment: 'Dedicated local PostgreSQL test DB, Redis DB 15, deterministic worker, recording WuKong, no live provider',
  order: 'A baseline then B candidate, repeated serially on the same services',
  runs: [], summary: {},
}
const save = () => writeFileSync(resolve(artifacts, 'presentation-paired.json'), JSON.stringify(report, null, 2) + '\n')
async function command(cwd, args, label, log) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: { ...env, PRESENTATION_LATENCY_LABEL: label }, stdio: ['ignore', 'pipe', 'pipe'] })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => appendFileSync(log, chunk))
    child.on('error', reject); child.on('close', code => done(code ?? 1))
  })
}
for (let pair = 1; pair <= pairs; pair++) {
  for (const [label, cwd] of [['baseline', baseline], ['candidate', candidate]]) {
    const log = resolve(artifacts, `presentation-pair-${pair}-${label}.log`)
    writeFileSync(log, '')
    if (pair === 1) assert.equal(await command(cwd, ['--import', 'tsx', 'server/src/migrate-bin.ts'], label, log), 0, 'migration failed')
    const code = await command(cwd, ['server/run-integration-tests.mjs', '--file', 'presentation-latency.test.ts'], label, log)
    const output = readFileSync(log, 'utf8')
    const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map(key => [key, Number(output.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0)]))
    const evidence = JSON.parse(readFileSync(resolve(cwd, `artifacts/memory-latency/presentation-${label}.json`), 'utf8'))
    assert.equal(evidence.runtime, report.runtime)
    report.runs.push({ pair, label, exitCode: code, counts, ...evidence })
    save()
    console.log(`pair ${pair}/${pairs} ${label}: ${counts.pass}/${counts.tests} passed; exit ${code}`)
    assert.equal(counts.tests, 11, 'unexpected fixture count')
    assert.equal(counts.pass, label === 'baseline' ? 4 : 11, 'unexpected fixture failures')
    assert.equal(code, label === 'baseline' ? 1 : 0)
  }
}
for (const scenario of report.runs[0].evidence.map(item => item.scenario)) {
  report.summary[scenario] = {}
  for (const label of ['baseline', 'candidate']) {
    const values = report.runs.filter(run => run.label === label).flatMap(run => run.evidence.filter(item => item.scenario === scenario).map(item => item.elapsedMs)).sort((a, b) => a - b)
    report.summary[scenario][label] = Object.fromEntries([50, 75, 95].map(percentile => [`p${percentile}`, values[Math.ceil(values.length * percentile / 100) - 1]]))
  }
}
save()
console.log(JSON.stringify(report.summary, null, 2))
