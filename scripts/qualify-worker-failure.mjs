#!/usr/bin/env node
/** One synthetic #439 diagnostic regression; never a production injection route. */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const testFile = 'runtime-worker-diagnostics.test.ts'
const loopbackHosts = new Set(['127.0.0.1', '[::1]'])

function parseLocalUrl(raw, protocols, name) {
  let url
  try { url = new URL(raw) } catch { throw new Error(`${name} is required and must be a valid URL`) }
  if (!protocols.includes(url.protocol) || !loopbackHosts.has(url.hostname) || url.search || url.hash) {
    throw new Error(`${name} must use 127.0.0.1 or [::1], with no query or fragment`)
  }
  return url
}

export function qualificationTargets(env) {
  // Do not load .env or fall back to DATABASE_URL. Reject every search option:
  // pg accepts host/port/dbname overrides there instead of the URL authority.
  const database = parseLocalUrl(env.INTEGRATION_DATABASE_URL, ['postgres:', 'postgresql:'], 'INTEGRATION_DATABASE_URL')
  if (!/^\/[a-z][a-z0-9_]*_test$/.test(database.pathname)
    || /(?:^|_)(?:prod|production|main|live)(?:_|$)/i.test(database.pathname.slice(1))) {
    throw new Error('INTEGRATION_DATABASE_URL must name a dedicated lowercase *_test database')
  }
  const redis = parseLocalUrl(env.REDIS_URL, ['redis:', 'rediss:'], 'REDIS_URL')
  if (!/^\/[1-9]\d*$/.test(redis.pathname)) {
    throw new Error('REDIS_URL must select a dedicated positive test database, for example /15')
  }
  return { database, redis }
}

export async function qualifyWorkerFailure(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help')) {
    if (argv.length !== 1) throw new Error('--help cannot be combined with other arguments')
    console.log('Usage: INTEGRATION_DATABASE_URL=postgresql://...@127.0.0.1/worker_439_test REDIS_URL=redis://127.0.0.1:6379/15 node scripts/qualify-worker-failure.mjs [--dry-run]')
    console.log('Runs only the synthetic Worker diagnostic regression against an already migrated, disposable local test database. The regression TRUNCATEs its product/runtime fixture tables. No provisioning, deployment, model provider, IM message or assignment submission.')
    return 0
  }
  if (argv.some(arg => arg !== '--dry-run') || argv.length > 1) throw new Error('only --dry-run or --help is accepted')
  qualificationTargets(env)
  if (argv[0] === '--dry-run') {
    console.log(`Validated loopback *_test PostgreSQL and explicit test Redis; would run only ${testFile}.`)
    console.log('Dry run: no connections or writes. The real run truncates fixture tables and requires installed schema plus formal LingxiOS 3.8.14. This proves the diagnostic chain, not the original #439 business root cause; historical failures cannot be backfilled.')
    return 0
  }
  // Do not silently execute against an older native runtime or a local package
  // build. The existing migration check also verifies the formal schema pin.
  const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'))
    .packages?.['node_modules/@lyyzka/lingxios']
  if (lock?.version !== '3.8.14'
    || !lock.resolved?.startsWith('https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.14/')
    || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(lock.integrity ?? '')) {
    throw new Error('install the exact formally published LingxiOS 3.8.14 lock before qualification')
  }
  const childEnv = { ...env,
    DATABASE_URL: env.INTEGRATION_DATABASE_URL,
    NODE_ENV: 'test',
    DOTENV_CONFIG_PATH: '/dev/null',
    INTEGRATION_TEST_MODE: 'selected',
    INTEGRATION_TEST_FILES: JSON.stringify([testFile]),
    LINGXILOOP_DISABLE_EMBEDDINGS: '1',
    LINGXIOS_TEST_REDIS_URL: env.REDIS_URL,
    LINGXIOS_REALTIME_REDIS_URL: '',
    LINGXIOS_R2_BUCKET: '',
    OPENAI_API_KEY: 'synthetic-worker-failure-no-provider',
    OPENAI_BASE_URL: 'http://127.0.0.1:9/v1',
    OPENAI_MODEL: 'synthetic-worker-failure-no-provider',
    WUKONG_API_URL: 'http://127.0.0.1:9',
    WUKONG_API_TOKEN: 'synthetic-worker-failure-no-im',
    WUKONG_WEBHOOK_SECRET: 'synthetic-worker-failure-no-im',
    WUKONG_USER_TOKEN_SECRET: 'synthetic-worker-failure-no-im',
    LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:9',
    RESEND_API_KEY: '',
    ALERT_WEBHOOK_URL: '',
    LINGXILOOP_COMMIT_SHA: 'unknown',
  }
  console.log(`Running only ${testFile}; fixture table truncation is restricted to the validated local *_test database.`)
  return new Promise(resolveExit => {
    const child = spawn(process.execPath, [resolve(root, 'server/run-integration-tests.mjs'), '--file', testFile],
      { cwd: root, env: childEnv, stdio: 'inherit', timeout: 180_000, killSignal: 'SIGKILL' })
    child.once('error', () => resolveExit(1))
    child.once('exit', code => resolveExit(code ?? 1))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await qualifyWorkerFailure() }
  catch (error) {
    // Messages are fixed strings; never echo a URL, userinfo or credentials.
    console.error(`[worker-failure qualification] ${error instanceof Error ? error.message : 'qualification failed'}`)
    process.exitCode = 2
  }
}
