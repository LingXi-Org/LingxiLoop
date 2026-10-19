import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import os from 'node:os'

const [base, candidate = '.', output = 'perf/streaming-20261019/paired.json'] = process.argv.slice(2)
if (!base) throw new Error('usage: node perf/streaming-20261019/run.mjs BASE_CHECKOUT CANDIDATE_CHECKOUT OUTPUT')
const runs = Number(process.env.PERF_RUNS ?? 10)
if (!Number.isInteger(runs) || runs < 1) throw new Error('invalid PERF_RUNS')
const samples = [], startedAt = new Date().toISOString()
for (const kind of ['short', 'long']) for (let pair = 0; pair < runs; pair++) for (const [variant, source] of [['base', base], ['candidate', candidate]]) {
  const raw = execFileSync(process.execPath, ['--expose-gc', '--import', 'tsx', 'perf/streaming-20261019/sample.ts', resolve(source), kind], { encoding: 'utf8', maxBuffer: 2 ** 20 })
  samples.push({ pair, variant, ...JSON.parse(raw.trim().split('\n').at(-1)) })
  console.error(`${kind} pair ${pair + 1}/${runs} ${variant}: ${samples.at(-1).timing.totalMs.toFixed(1)}ms`)
}
const summary = {}
for (const kind of ['short', 'long']) {
  summary[kind] = {}
  for (const variant of ['base', 'candidate']) {
    const rows = samples.filter(row => row.kind === kind && row.variant === variant)
    const metrics = {}
    for (const metric of ['firstStateMs', 'firstBodyMs', 'totalMs', 'cpuUserMs', 'cpuSystemMs', 'peakHeapBytes', 'heapRetainedBytes', 'peakRssBytes']) {
      const values = rows.map(row => row.timing[metric]).sort((a, b) => a - b)
      metrics[metric] = Object.fromEntries([50, 75, 95].map(q => [`p${q}`, values[Math.ceil(q / 100 * values.length) - 1]]))
    }
    summary[kind][variant] = { metrics, counts: rows[0].counts }
  }
  for (let pair = 0; pair < runs; pair++) {
    const rows = samples.filter(row => row.kind === kind && row.pair === pair)
    if (rows[0].timing.wireSha256 !== rows[1].timing.wireSha256) throw new Error(`wire mismatch ${kind} pair ${pair}`)
  }
}
const commit = source => execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
mkdirSync(resolve(output, '..'), { recursive: true })
writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), runs, baseCommit: commit(base), candidateCommit: commit(candidate),
  node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0].model, logicalCpus: os.cpus().length,
  protocol: 'Alternating fresh-process A/B, one identical warmup, explicit GC before each sample; instrumentation counted separately',
  summary, samples }, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
