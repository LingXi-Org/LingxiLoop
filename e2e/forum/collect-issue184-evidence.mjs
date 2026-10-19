import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

// Copy only explicit synthetic-fixture screenshots from successful reports.
// Never publish traces, browser storage, network payloads or raw runner reports.
const root = resolve(import.meta.dirname, '../..')
const destination = resolve(root, 'docs/evidence/issue-184')
await mkdir(resolve(destination, 'screenshots'), { recursive: true })
const evidence = []
for (const [issue, expectedTests] of [['184', 3], ['163', 1]]) {
  const output = resolve(root, `artifacts/forum/issue${issue}/browser`)
  const { run } = JSON.parse(await readFile(resolve(output, 'report.json'), 'utf8'))
  assert.equal(run.status, 'passed', `issue${issue} must pass before retaining review evidence`)
  const tests = run.results.filter(result => result.kind === 'test' && result.selected)
  assert.equal(tests.length, expectedTests)
  assert.ok(tests.every(test => test.status === 'passed'), 'Skipped or failed tests are not verified')
  const screenshots = []
  for (const test of tests) for (const artifact of test.attempts.at(-1).artifacts) {
    if (artifact.kind !== 'screenshot' || artifact.redaction !== 'complete') continue
    const name = basename(artifact.path).replace(/^\d+-/, '')
    if (!name.startsWith(`issue${issue}-`)) continue
    if (issue === '163' && !/multiple-account-avatars|account-avatar-roster-refresh|expanded-dark-mobile|compact-dark-keyboard/.test(name)) continue
    const bytes = await readFile(resolve(output, 'artifacts', artifact.path))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    assert.equal(sha256, artifact.sha256, `Screenshot changed since reported: ${name}`)
    await writeFile(resolve(destination, 'screenshots', name), bytes)
    screenshots.push({ path: `screenshots/${name}`, sha256, bytes: bytes.length })
  }
  evidence.push({
    issue: Number(issue), runId: run.id, startedAt: run.startedAt, finishedAt: run.finishedAt,
    runtime: run.environment.runtime, runner: run.runner, engine: run.targets[0].engine,
    passed: tests.length, failed: 0, skipped: 0,
    tests: tests.map(test => ({ name: test.titlePath.join(' > '), status: test.status, durationMs: test.attempts.at(-1).durationMs })),
    screenshots,
  })
}
await writeFile(resolve(destination, 'browser-validation.json'), `${JSON.stringify({
  reproduce: ['node e2e/server/forum.mjs --browser-only --issue184', 'node e2e/server/forum.mjs --browser-only --issue163', 'node e2e/forum/collect-issue184-evidence.mjs'],
  limitations: ['Synthetic identities; isolated PostgreSQL/Redis; integration object storage and recorded WuKong provider.', 'No live authentication, production storage, external delivery or deployment is validated.'],
  runs: evidence,
}, null, 2)}\n`)
console.log(`Retained ${evidence.reduce((total, run) => total + run.screenshots.length, 0)} verified screenshots and sanitized browser-validation.json`)
