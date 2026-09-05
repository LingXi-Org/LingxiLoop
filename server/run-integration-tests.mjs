#!/usr/bin/env node
/**
 * Integration test runner.
 *
 * The integration suite needs a REAL Postgres (we test SKIP LOCKED + jsonb
 * + indexes that pg-mem doesn't reproduce faithfully) and a REAL Redis
 * (persistEmailMessage publishes the wake event; we don't want to monkey-
 * patch that path because it's prod-critical).
 *
 * To run:
 *   1. Create a DEDICATED test DB (the suite TRUNCATEs everything, so
 *      pointing at your dev DB will eat its data):
 *        createdb lingxiloop_test
 *   2. Have Redis listening on REDIS_URL (default localhost:6379).
 *   3. Export INTEGRATION_DATABASE_URL pointing at the test DB:
 *        export INTEGRATION_DATABASE_URL=postgres://$USER@localhost:5432/lingxiloop_test
 *   4. npm run test:integration
 *
 * Run one or more owning files without enumerating the full suite:
 *   npm run test:integration -- --file trust-bff.test.ts
 *
 * If INTEGRATION_DATABASE_URL is unset we print a one-line "skipped" and
 * exit 0 — so this script slots into CI / pre-commit hooks without
 * forcing every developer to maintain a test DB.
 */
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// Load the developer's .env so RESEND_API_KEY / EMAIL_DOMAIN /
// INTEGRATION_DATABASE_URL set there are visible to our gating checks
// before we spawn the test child. The test child also imports
// dotenv/config via env.ts, so this is mostly belt-and-braces — the
// gating checks below need them present in THIS process.
import 'dotenv/config'

function integrationFileArgs(argv) {
  const files = []
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--file') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--file requires an integration test filename')
      files.push(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return [...new Set(files)]
}

let requestedFiles
try {
  requestedFiles = integrationFileArgs(process.argv.slice(2))
} catch (error) {
  console.error(`[integration] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const integrationDir = join(here, 'src/__integration__')
const availableFiles = readdirSync(integrationDir)
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
if (requestedFiles.some((name) => name.includes('/') || name.includes('\\') || !name.endsWith('.test.ts'))) {
  console.error('[integration] --file accepts basenames ending in .test.ts from server/src/__integration__ only')
  process.exit(2)
}
const missingFiles = requestedFiles.filter((name) => !availableFiles.includes(name))
if (missingFiles.length > 0) {
  console.error(`[integration] unknown test file(s): ${missingFiles.join(', ')}`)
  process.exit(2)
}
const LIVE_RESEND = process.env.RESEND_LIVE_TEST === '1'
const defaultFiles = availableFiles.filter((name) => name !== 'resend-live.test.ts' || LIVE_RESEND)
const selectedFiles = requestedFiles.length > 0 ? requestedFiles : defaultFiles
const testFiles = selectedFiles.map((name) => join(integrationDir, name))
if (testFiles.length === 0) {
  console.error(`[integration] no test files found under ${integrationDir}`)
  process.exit(2)
}

const INTEGRATION_URL = process.env.INTEGRATION_DATABASE_URL
if (!INTEGRATION_URL) {
  console.log('[integration] skipped — set INTEGRATION_DATABASE_URL to enable.')
  console.log('             example: INTEGRATION_DATABASE_URL=postgres://$USER@localhost:5432/lingxiloop_test \\\\')
  console.log('                      npm run test:integration')
  process.exit(0)
}

// Belt-and-braces safety: refuse to run when INTEGRATION_DATABASE_URL
// looks like a production-ish DB name. The suite TRUNCATEs every table,
// so a mis-set var would silently nuke real data.
const SUSPICIOUS = /\b(prod|production|main|live)\b/i
if (SUSPICIOUS.test(INTEGRATION_URL)) {
  console.error(`[integration] refusing to run — INTEGRATION_DATABASE_URL looks production-flavored: ${INTEGRATION_URL}`)
  console.error('              The suite TRUNCATEs every table. Point at a dedicated test DB (e.g. lingxiloop_test).')
  process.exit(2)
}

// Swap DATABASE_URL so the env module (server/src/env.ts) picks up the
// test target when it's imported by the test harness.
process.env.DATABASE_URL = INTEGRATION_URL

// Agent OS protocol tests inject their own Responses and Kernel doubles;
// integration tests must never contact a real model endpoint by accident.
// Integration specs provide explicit embedding overrides where vector values
// are under test. Every other spec must remain hermetic and never contact the
// real embeddings API with the runner's placeholder key.
if (!process.env.LINGXILOOP_DISABLE_EMBEDDINGS) process.env.LINGXILOOP_DISABLE_EMBEDDINGS = '1'

// By default we force-empty RESEND_API_KEY so the suite never hits live
// Resend — a developer's real key in .env would otherwise reject because
// the test EMAIL_DOMAIN isn't verified. RESEND_LIVE_TEST=1 OPTS IN to
// the live path: keep the real key + real EMAIL_DOMAIN, and the
// resend-live.test.ts spec runs against Resend's magic test addresses
// (delivered@resend.dev / bounced@resend.dev — these consume no quota).
if (!LIVE_RESEND) {
  process.env.RESEND_API_KEY = ''
  if (!process.env.EMAIL_DOMAIN) process.env.EMAIL_DOMAIN = 'lingxiloop.local'
} else {
  // Live mode: refuse to run if the key OR a verified domain isn't set.
  if (!process.env.RESEND_API_KEY) {
    console.error('[integration] RESEND_LIVE_TEST=1 but RESEND_API_KEY is empty.')
    process.exit(2)
  }
  if (!process.env.EMAIL_DOMAIN) {
    console.error('[integration] RESEND_LIVE_TEST=1 but EMAIL_DOMAIN is empty — Resend will reject the From line.')
    process.exit(2)
  }
  console.log(`[integration] LIVE RESEND mode · domain=${process.env.EMAIL_DOMAIN}`)
}

if (!process.env.EMAIL_INBOUND_HMAC_SECRET) process.env.EMAIL_INBOUND_HMAC_SECRET = 'integration-test-secret'

// Forward to node --import tsx --test against the integration suite.
// tsx handles TypeScript; node:test handles the test runner.
console.log(`[integration] running ${selectedFiles.length}/${availableFiles.length} file(s): ${selectedFiles.join(', ')}`)
// --test-concurrency=1 serializes test FILES. Default is N-cpu which
// causes deadlocks here: every file's beforeEach TRUNCATEs the same
// tables on the shared test DB; two TRUNCATE CASCADE statements running
// concurrently against overlapping tables deadlock at the catalog-lock
// level. --test-force-exit prevents a failed spec with a leaked socket or
// timer from hiding the actual assertion behind the workflow timeout.
// We're not trying to optimize wall-time for this suite, so serializing is
// the right trade.
const child = spawn(
  'node',
  ['--import', 'tsx', '--test', '--test-concurrency=1', '--test-force-exit', ...testFiles],
  { stdio: 'inherit', env: process.env },
)
child.on('exit', (code) => process.exit(code ?? 1))
