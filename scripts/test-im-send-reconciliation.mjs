import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const args = process.argv.slice(2)
assert.ok(args.every(arg => ['--real-wukong', '--browser', '--regression'].includes(arg)), 'Unknown verification option')
const browser = args.includes('--browser'), real = browser || args.includes('--real-wukong')
const output = resolve('.e2e/issue-154'); await mkdir(output, { recursive: true })
const log = resolve(output, 'integration.log'); await writeFile(log, '')
// Ambient credentials, databases, workers and providers never enter this isolated run.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|HOME|TMP|TEMP|XDG_CACHE_HOME|XDG_CONFIG_HOME|E2E_CDP_URL|E2E_BROWSER_EXECUTABLE_PATH)$/i.test(name)))
Object.assign(env, { NODE_ENV: 'test', DOTENV_CONFIG_PATH: resolve(output, '__no_dotenv__'),
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_im_reconciliation_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_im_reconciliation_test',
  REDIS_URL: 'redis://127.0.0.1:56379/3', LINGXIOS_TEST_REDIS_URL: 'redis://127.0.0.1:56379/3',
  OPENAI_API_KEY: 'synthetic-disabled', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', OPENAI_EMBEDDING_MODEL: 'disabled',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', RESEND_API_KEY: '',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5180', LINGXILOOP_GATEWAY_HMAC_SECRET: 'synthetic-reconciliation-gateway',
  WUKONG_USER_TOKEN_SECRET: 'synthetic-reconciliation-user-token', WUKONG_API_URL: 'http://127.0.0.1:55001',
  WUKONG_WS_URL: 'ws://127.0.0.1:55200', WUKONG_API_TOKEN: 'e2e-local-token', WUKONG_WEBHOOK_SECRET: 'synthetic-reconciliation-webhook',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1', AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1',
  LINGXIOS_REAL_WUKONG: real ? '1' : '0', IM_RECONCILIATION_BROWSER: browser ? '1' : '0', E2E_TELEMETRY_DISABLED: '1' })
const admin = new pg.Client({ connectionString: env.DATABASE_URL.replace('/lingxiloop_im_reconciliation_test', '/postgres') })
await admin.connect()
try {
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='lingxiloop_im_reconciliation_test'")).rowCount) {
    await admin.query('CREATE DATABASE lingxiloop_im_reconciliation_test')
  }
} finally { await admin.end() }
async function run(commandArgs) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, commandArgs, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { void appendFile(log, chunk); process.stdout.write(chunk) })
    child.once('error', reject); child.once('exit', code => code === 0 ? done() : reject(new Error(`verification exited ${code}`)))
  })
}
let passed = false
try {
  await run(['--import', 'tsx', 'server/src/migrate-bin.ts'])
  await run(['server/run-integration-tests.mjs', '--file', 'im-send-reconciliation.test.ts',
    ...(real ? ['--file', 'im-send-wukong.test.ts', '--file', 'im-send-runtime-recovery.test.ts'] : []),
    ...(args.includes('--regression') ? ['--file', 'native-message-flow.test.ts', '--file', 'messages-vertical-slice.test.ts',
      '--file', 'interactive-ui-disabled.test.ts', '--file', 'native-collaboration.test.ts', '--file', 'im-conversation-style.test.ts'] : [])])
  passed = true
} finally {
  const content = await readFile(log, 'utf8')
  await writeFile(resolve(output, 'validation.json'), JSON.stringify({ passed,
    command: ['node scripts/test-im-send-reconciliation.mjs', ...args].join(' '),
    runtimeDependency: JSON.parse(await readFile('node_modules/@lyyzka/lingxios/package.json', 'utf8')).version,
    realWuKong: real, officialBrowser: browser, counts: Object.fromEntries(['tests', 'pass', 'fail', 'skipped'].map(key =>
      [key, Number(content.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? 0)])),
    limitations: ['no 24h soak', 'no real model provider', 'browser uses isolated authentication and tests HTTP contract; #160 owns production recovery UI'],
  }, null, 2))
}
