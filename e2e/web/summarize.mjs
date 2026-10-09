import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const reports = process.argv.slice(2)
if (!reports.length) throw new Error('Pass original Web report.json paths in chronological order')
const latest = new Map()
const runs = []
for (const file of reports) {
  const { run } = JSON.parse(await readFile(file, 'utf8'))
  let execution = null
  try { execution = JSON.parse(await readFile(path.join(path.dirname(file), 'run-metadata.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const engine = run.targets[0]?.engine
  runs.push({ report: file.replaceAll('\\', '/'), id: run.id, startedAt: run.startedAt, finishedAt: run.finishedAt,
    runner: { name: run.runner.name, version: run.runner.version },
    environment: { os: run.environment.os, arch: run.environment.arch, runtime: run.environment.runtime, ci: run.environment.ci },
    engine: engine ? { name: engine.name, version: engine.version, spiVersion: engine.spiVersion } : null, execution })
  for (const result of run.results.filter(item => item.selected)) {
    latest.set(result.testId, {
      id: result.testId, file: result.file, title: result.titlePath.join(' > '), kind: result.kind,
      status: result.status, durationMs: result.attempts.reduce((total, attempt) => total + attempt.durationMs, 0),
      report: file.replaceAll('\\', '/'), runId: run.id,
      ...(result.skip?.reason ? { skipReason: result.skip.reason } : {}),
    })
  }
}
const cases = [...latest.values()].sort((a, b) => a.id.localeCompare(b.id))
const counts = { total: cases.length, passed: 0, failed: 0, skipped: 0, interrupted: 0 }
for (const result of cases) counts[result.status] = (counts[result.status] ?? 0) + 1
const output = 'artifacts/e2e/web-validation.json'
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, JSON.stringify({
  generatedAt: new Date().toISOString(), scope: 'Latest selected result per Web test id; collection alone is not verification',
  counts, runs, cases,
  limits: [
    'No dedicated live model account or email receiver was supplied; model completions/quality and email delivery are not verified.',
    'Local Notebook model fixture validates ingestion plumbing, not live provider quality.',
    'Separate concurrently authored navigation, business-layout and agent-actions cases are outside this verification report.',
  ],
}, null, 2))
console.log(`${output}: ${counts.passed}/${counts.total} latest cases passed`)
