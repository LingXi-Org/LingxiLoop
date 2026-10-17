// Bounded, loopback-only GET sampler. It measures the selected HTTP operation,
// not model-turn or durable-delivery throughput. Run real dialogue load separately.
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { cpus, totalmem, release } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const args = process.argv.slice(2)
function option(name, fallback) { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1] }
function integer(name, fallback, max) {
  const n = Number(option(name, fallback))
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`--${name} must be 1..${max}`)
  return n
}
const base = new URL(option('base', 'http://127.0.0.1:5181'))
if (!['127.0.0.1', '[::1]', 'localhost'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
  throw new Error('Only an isolated loopback base URL without credentials/query/path is allowed')
}
if (process.env.S153P_ISOLATED !== '1') throw new Error('Set S153P_ISOLATED=1 after verifying this is a disposable local instance, not a production tunnel')
const phase = option('phase', 'idle')
if (!['idle', 'normal', 'burst', 'soak'].includes(phase)) throw new Error('Unknown phase')
const seconds = integer('seconds', 30, 86400)
const concurrency = phase === 'idle' ? 0 : integer('concurrency', phase === 'burst' ? 16 : 1, 64)
const requestedInterval = integer('interval-ms', 1000, 60000)
const interval = Math.max(requestedInterval, Math.ceil(seconds * 1000 / 10000)) // bound retained samples during soak
const path = option('path', '/api/livez')
const metricsPath = option('metrics-path', '/api/metrics')
for (const p of [path, metricsPath]) if (!p.startsWith('/') || p.startsWith('//') || p.includes('?') || p.includes('#')) throw new Error('Paths must be local and contain no query or fragment')
const token = process.env.METRICS_BEARER_TOKEN
if (!token) throw new Error('METRICS_BEARER_TOKEN required; it is never written to artifacts')
const samples = [], durations = [], errors = {}
let successes = 0, failures = 0, latencyCount = 0
const maxLatencySamples = 100000
const begin = performance.now(), deadline = begin + seconds * 1000
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function scrape() {
  const response = await fetch(new URL(metricsPath, base), { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(4000) })
  if (!response.ok) throw new Error(`Metrics HTTP ${response.status}`)
  const metrics = {}
  for (const line of (await response.text()).split('\n')) {
    const match = line.match(/^((?:db_(?:pool|sql)_|process_)[a-z_]+(?:\{(?:status|le)="[a-z0-9.+-]+"\})?) ([0-9.e+-]+)$/)
    if (match) metrics[match[1]] = Number(match[2])
  }
  if (!Object.keys(metrics).length) throw new Error('Required infrastructure metrics missing; do not treat a legacy scrape as zero')
  samples.push({ elapsedSeconds: (performance.now() - begin) / 1000, metrics })
}
await scrape()
await Promise.all([
  (async () => { while (performance.now() < deadline) { await delay(Math.min(interval, Math.max(1, deadline - performance.now()))); await scrape() } })(),
  ...Array.from({ length: concurrency }, async () => {
    while (performance.now() < deadline) {
      const start = performance.now()
      try {
        const response = await fetch(new URL(path, base), { redirect: 'error', signal: AbortSignal.timeout(4000) })
        await response.arrayBuffer()
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        successes++
      } catch (error) { failures++; const category = /^HTTP \d+$/.test(error.message) ? error.message : error.name; errors[category] = (errors[category] ?? 0) + 1 }
      const duration = performance.now() - start
      latencyCount++
      if (durations.length < maxLatencySamples) durations.push(duration)
      else {
        const index = Math.floor(Math.random() * latencyCount)
        if (index < maxLatencySamples) durations[index] = duration
      }
      if (phase === 'normal' || phase === 'soak') await delay(100) // bounded per-client rate
    }
  }),
])
durations.sort((a, b) => a - b)
const percentile = (p) => durations.length ? durations[Math.min(durations.length - 1, Math.ceil(p * durations.length) - 1)] : null
const files = ['server/src/db/pool.ts', 'server/src/metrics.ts', 'server/src/modules/platform/application.ts', 'server/src/modules/platform/health.ts']
const hashes = {}
for (const file of files) { try { hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex') } catch {} }
let head = null
try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
const report = {
  generatedAt: new Date().toISOString(), head, sourceSha256: hashes,
  machine: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), arch: process.arch, osRelease: release(), samplerNode: process.version },
  configuration: { phase, seconds, concurrency, requestedInterval, interval, path, metricsPath, image: option('image', 'unrecorded'), limits: option('limits', 'unrecorded') },
  result: { successes, failures, errors, latencySamples: durations.length, percentileMethod: latencyCount > maxLatencySamples ? 'uniform reservoir (100000 samples)' : 'all requests', elapsedSeconds: (performance.now() - begin) / 1000, p50Ms: percentile(.5), p75Ms: percentile(.75), p95Ms: percentile(.95), p99Ms: percentile(.99) },
  samples,
  limits: ['GET operation latency only; not real dialogue or durable delivery.', 'No automatic heap snapshots; capture protected profiles separately in disposable processes.', 'Sampler success does not establish OOM/restart/queue-age/provider/browser or 24-hour acceptance.'],
}
const output = resolve(option('out', `scripts/issue-153/evidence/${phase}.json`))
await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ output, result: report.result }))
if (failures) process.exitCode = 1
