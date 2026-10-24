#!/usr/bin/env node
/** Explicit smoke (default), selected (--file), and full integration runs.
 * Requires a dedicated real Postgres test database and explicit Redis URL.
 * These tests TRUNCATE their database and remain serialized.
 */
import { partitionMigrationTests, runHistoricalMigrationTests, runTestChild } from './run-historical-migration-tests.mjs'
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { parseIntegrationArgs, selectIntegrationFiles } from './integration-suite.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// Load the developer's .env so RESEND_API_KEY / EMAIL_DOMAIN /
// INTEGRATION_DATABASE_URL set there are visible to our gating checks
// before we spawn the test child. The test child also imports
// dotenv/config via env.ts, so this is mostly belt-and-braces — the
// gating checks below need them present in THIS process.
import 'dotenv/config'

const here = dirname(fileURLToPath(import.meta.url))
const integrationDir = join(here, 'src/__integration__')
const availableFiles = readdirSync(integrationDir).filter(name => name.endsWith('.test.ts')).sort()
let mode, selectedFiles
try {
  const selection = parseIntegrationArgs(process.argv.slice(2))
  mode = selection.mode
  selectedFiles = selectIntegrationFiles({ ...selection, availableFiles })
} catch (error) {
  console.error(`[integration] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
console.log(`[integration ${mode}] selected ${selectedFiles.length}/${availableFiles.length} file(s): ${selectedFiles.join(', ')}`)

const INTEGRATION_URL = process.env.INTEGRATION_DATABASE_URL
if (!INTEGRATION_URL) {
  console.error('[integration] INTEGRATION_DATABASE_URL is required; use a dedicated test database.')
  process.exit(2)
}

// The suite TRUNCATEs every table. Only the database name can identify a
// dedicated test target; credentials, hostnames and query strings cannot.
const integrationTarget = URL.canParse(INTEGRATION_URL) ? new URL(INTEGRATION_URL) : null
let databaseName
let databaseHost
try {
  databaseName = decodeURI(integrationTarget?.pathname.slice(1) ?? '')
  databaseHost = decodeURIComponent(integrationTarget?.searchParams.getAll('host').at(-1) || integrationTarget?.hostname || '')
} catch {
  databaseName = ''
  databaseHost = ''
}
if (!integrationTarget || !['postgres:', 'postgresql:'].includes(integrationTarget.protocol)
  || !/(?:^|[_-])test(?:$|[_-])/i.test(databaseName)
  || /\b(prod|production|main|live)\b/i.test(databaseHost)
  || /(?:^|[_-])(prod|production|main|live)(?:$|[_-])/i.test(databaseName)) {
  console.error('[integration] refusing to run — INTEGRATION_DATABASE_URL must name a dedicated test database.')
  console.error('              The suite TRUNCATEs every table. Point at a dedicated test DB (e.g. lingxiloop_test).')
  process.exit(2)
}

if (!process.env.REDIS_URL) {
  console.error('[integration] REDIS_URL is required; use a dedicated test Redis.')
  process.exit(2)
}
// The required realtime smoke must run, not silently skip its Redis boundary.
process.env.LINGXIOS_TEST_REDIS_URL ||= process.env.REDIS_URL

// Swap DATABASE_URL so the env module (server/src/env.ts) picks up the
// test target when it's imported by the test harness.
process.env.DATABASE_URL = INTEGRATION_URL
// Co-located API/Worker fixtures are permitted only in the explicit test mode.
// Set this at the shared entrypoint so CI and local owning runs agree.
process.env.NODE_ENV = 'test'

// integration tests must never contact a real model endpoint by accident.
// Integration specs provide explicit embedding overrides where vector values
// are under test. Every other spec must remain hermetic and never contact the
// real embeddings API with the runner's placeholder key.
if (!process.env.LINGXILOOP_DISABLE_EMBEDDINGS) process.env.LINGXILOOP_DISABLE_EMBEDDINGS = '1'

// Transactional invitations use an explicit recording provider in integration tests.
process.env.RESEND_API_KEY = ''
if (!process.env.EMAIL_DOMAIN) process.env.EMAIL_DOMAIN = 'lingxiloop.local'

// Legacy scripted model fixtures exercise deep execution; the response-policy
// spec explicitly opts into auto and supplies both model profiles.
if (!process.env.AGENT_OS_RESPONSE_POLICY) process.env.AGENT_OS_RESPONSE_POLICY = 'deep'

// Each file owns a fresh process but shares the dedicated database serially.
// Report real wall time and propagate every failure, signal and timeout.
const groups = partitionMigrationTests(selectedFiles)
const started = performance.now(), records = []
const budgetMs = mode === 'full' ? 1_500_000 : mode === 'selected' ? 360_000 : 180_000
let code = 0
for (const name of groups.current) {
  const remaining = budgetMs - (performance.now() - started)
  if (remaining <= 0) { console.error(`[integration] ${mode} time budget exhausted before ${name}`); code = 1; break }
  const begin = performance.now()
  const exitCode = await runTestChild([
    '--import', 'tsx', '--experimental-test-module-mocks', '--test', '--test-reporter=tap',
    '--test-concurrency=1', '--test-force-exit', join(integrationDir, name),
  ], { timeout: Math.max(1, Math.floor(Math.min(remaining, mode === 'full' ? 600_000 : 180_000))) })
  const durationMs = Math.round(performance.now() - begin)
  records.push({ files: [name], runtime: 'current', durationMs, exitCode })
  console.log(`[integration file] ${name} duration_ms=${durationMs} exit=${exitCode}`)
  if (exitCode !== 0) { code = exitCode; break }
}
if (!code && groups.historical.length) {
  const begin = performance.now()
  console.log(`[integration historical] ${groups.historical.length} file(s) using the exact formal 3.8.2 fixture`)
  try { code = await runHistoricalMigrationTests(join(here, '..'), groups.historical) }
  catch { console.error('[integration historical] fixture execution failed; tests were not skipped'); code = 1 }
  records.push({ files: groups.historical, runtime: '3.8.2', durationMs: Math.round(performance.now() - begin), exitCode: code })
}
const report = {
  mode, availableFiles: availableFiles.length, selectedFiles,
  executedFiles: records.flatMap(record => record.files), records,
  durationMs: Math.round(performance.now() - started), exitCode: code,
}
const reportPath = process.env.INTEGRATION_REPORT_PATH || join(here, '../artifacts/ci-integration/timings.json')
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(`[integration result] mode=${mode} files=${report.executedFiles.length} duration_ms=${report.durationMs} exit=${code}`)
process.exit(code)
