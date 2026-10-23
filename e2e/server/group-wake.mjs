// Disposable local qualification only. Never loads product/provider credentials.
import assert from 'node:assert/strict'
import { networkInterfaces } from 'node:os'
import { isIP } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdir, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'

assert.ok(process.argv.slice(2).every(arg => ['--browser', '--related-only', '--roster-only'].includes(arg)))
const cwd = resolve(import.meta.dirname, '../..')
const browser = process.argv.includes('--browser')
const env = Object.fromEntries(['PATH', 'HOME', 'PLAYWRIGHT_BROWSERS_PATH'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]))
const callbackHost = process.env.GROUP_WAKE_CALLBACK_HOST ?? Object.values(networkInterfaces()).flat().find(row => row?.family === 'IPv4' && !row.internal)?.address ?? 'host.docker.internal'
assert.ok(callbackHost === 'host.docker.internal' || isIP(callbackHost) === 4
  && /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(callbackHost), 'Callback must stay on the local network')
Object.assign(env, {
  NODE_ENV: 'test', DOTENV_CONFIG_PATH: '/tmp/issue347-no-dotenv',
  DATABASE_URL: 'postgresql://postgres:synthetic347-local@127.0.0.1:18546/issue347_group_wake_test',
  INTEGRATION_DATABASE_URL: 'postgresql://postgres:synthetic347-local@127.0.0.1:18546/issue347_group_wake_test',
  REDIS_URL: 'redis://127.0.0.1:18549/0', OPENAI_API_KEY: 'synthetic347-local', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  WUKONG_API_URL: 'http://127.0.0.1:18551', WUKONG_WS_URL: 'ws://127.0.0.1:18552', WUKONG_API_TOKEN: 'synthetic347-local',
  WUKONG_WEBHOOK_SECRET: 'synthetic347-webhook', WUKONG_USER_TOKEN_SECRET: 'synthetic347-user',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'synthetic347-gateway', LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:18547', LINGXILOOP_PUBLIC_ORIGIN: 'http://127.0.0.1:18547',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', OPEN_NOTEBOOK_ENABLED: 'false', AGENT_OS_RESPONSE_POLICY: 'deep',
  LINGXIOS_REAL_WUKONG: '1', GROUP_WAKE_BROWSER: browser ? '1' : '0', E2E_TELEMETRY_DISABLED: '1', GROUP_WAKE_CALLBACK_HOST: callbackHost,
  ...(process.env.E2E_WUKONG_IMAGE ? { E2E_WUKONG_IMAGE: process.env.E2E_WUKONG_IMAGE } : {}),
})
const output = resolve(cwd, '.e2e/issue347'); await mkdir(output, { recursive: true })
const run = (command, args) => new Promise((done, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { process.stdout.write(chunk); void appendFile(`${output}/qualification.log`, chunk) })
  child.once('error', reject); child.once('exit', code => code === 0 ? done() : reject(new Error(`Local qualification exited ${code}`)))
})
const compose = ['compose', '-f', 'e2e/group-wake/compose.yaml']
try {
  await run('docker', [...compose, 'up', '-d', '--wait'])
  await run(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'])
  if (process.argv.includes('--related-only')) await run(process.execPath, ['server/run-integration-tests.mjs',
    ...['native-message-flow.test.ts', 'runtime-retirement.test.ts', 'im-send-reconciliation.test.ts', 'group-mentions.test.ts', 'questionnaire-wait.test.ts', 'group-wake.test.ts']
      .flatMap(file => ['--file', file])])
  else await run(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit',
    ...process.argv.includes('--roster-only') ? ['--test-name-pattern', 'departed default'] : [], 'server/src/__integration__/group-wake.test.ts'])
} finally { await run('docker', [...compose, 'down']) }
