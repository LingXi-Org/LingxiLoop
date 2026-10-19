import { spawnSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const cwd = fileURLToPath(new URL('../../../../', import.meta.url))
const phase = process.argv[2] || 'live'
if (!['live', 'owning'].includes(phase)) throw new Error('Expected live or owning')
const files = process.argv.slice(3)
const env = { PATH: process.env.PATH, HOME: process.env.HOME,
  DOTENV_CONFIG_PATH: '/tmp/__no_review_dotenv__', NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_review_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_cases_review_test',
  REDIS_URL: 'redis://127.0.0.1:56379/15', LINGXIOS_TEST_REDIS_URL: 'redis://127.0.0.1:56379/15',
  OPENAI_API_KEY: 'review-synthetic', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'review-synthetic',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180', WUKONG_USER_TOKEN_SECRET: 'review-synthetic',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'review-synthetic', LINGXILOOP_DISABLE_EMBEDDINGS: '1',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1', AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1',
  RESEND_LIVE_TEST: '0', LINGXIOS_LIVE_PROTOCOL: '0', ALERT_WEBHOOK_URL: '',
}
const log = new URL(`./cases-${phase}.log`, import.meta.url)
writeFileSync(log, '')
if (phase === 'live') {
  const address = spawnSync('docker', ['inspect', 'lingxiloop-review-knowledge-20261019-open-notebook-1', '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'], {encoding:'utf8'})
  if (address.status !== 0 || !/^172\.[0-9.]+$/.test(address.stdout.trim())) throw new Error('Local isolated Notebook unavailable')
  env.OPEN_NOTEBOOK_URL = `http://${address.stdout.trim()}:5055`
  env.OPEN_NOTEBOOK_PASSWORD = 'lingxiloop-e2e-notebook-local'
  env.OPEN_NOTEBOOK_ENABLED = 'true'
}
for (const args of [ ['--import', 'tsx', 'server/src/migrate-bin.ts'],
  phase === 'live' ? ['--import', 'tsx', '--experimental-test-module-mocks', '--test', '--test-force-exit', fileURLToPath(new URL('./cases-live.test.ts', import.meta.url))]
    : ['server/run-integration-tests.mjs', ...(files.length ? files : ['organization-cases.test.ts']).flatMap(file => ['--file',file])] ]) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding:'utf8', timeout:300_000, maxBuffer:10_000_000 })
  appendFileSync(log, (result.stdout||'')+(result.stderr||'')+(result.error?.message||''))
  if (result.status !== 0) { console.log(`Failed (${result.status}); ${log.pathname}`); process.exit(result.status||1) }
}
console.log(`Passed; ${log.pathname}`)
