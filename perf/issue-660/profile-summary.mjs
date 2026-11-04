import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { SourceMapConsumer } from 'source-map-js'
const [buildDir, outputDir] = process.argv.slice(2).map(path => resolve(path))
const readGz = path => JSON.parse(gunzipSync(readFileSync(path)))
const maps = new Map()
for (const file of readdirSync(resolve(buildDir, 'assets')).filter(file => file.endsWith('.js.map'))) maps.set(file.slice(0, -4), new SourceMapConsumer(JSON.parse(readFileSync(resolve(buildDir, 'assets', file), 'utf8'))))
const mapped = frame => {
  let name
  try { name = basename(new URL(frame.url).pathname) } catch { name = '' }
  const consumer = maps.get(name)
  const original = consumer?.originalPositionFor({ line: frame.lineNumber + 1, column: Math.max(0, frame.columnNumber) })
  return original?.source ? `${original.source}:${original.line}:${original.column} ${original.name ?? frame.functionName}` : `${frame.url || 'VM/injected'} ${frame.functionName}`
}
const rows = []
for (const file of readdirSync(outputDir).filter(file => file.endsWith('-report.json.gz')).sort()) {
  const report = readGz(resolve(outputDir, file)), profile = readGz(resolve(outputDir, file.replace('-report', '-profile')))
  const trace = readGz(resolve(outputDir, file.replace('-report', '-trace'))).traceEvents
  const mains = new Set(trace.filter(e => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map(e => `${e.pid}:${e.tid}`))
  report.longTraceTasks = trace.filter(e => e.ph === 'X' && e.name.endsWith('RunTask') && e.dur >= 50000 && mains.has(`${e.pid}:${e.tid}`)).map(task => {
    const nested = trace.filter(e => e.ph === 'X' && e.pid === task.pid && e.tid === task.tid && e.ts >= task.ts && e.ts < task.ts + task.dur)
    return { at: task.ts, ms: task.dur / 1000, costs: Object.fromEntries(['Layout', 'UpdateLayoutTree', 'Paint', 'FunctionCall', 'FireAnimationFrame', 'MajorGC', 'MinorGC'].map(name => [name, Math.round(nested.filter(e => e.name === name).reduce((sum, e) => sum + (e.dur ?? 0), 0) / 10) / 100])), calls: nested.filter(e => e.name === 'FunctionCall').map(e => e.args) }
  })
  const nodes = new Map(profile.nodes.map(node => [node.id, mapped(node.callFrame)]))
  const timings = []; let timestamp = profile.startTime
  for (let i = 0; i < profile.samples.length; i++) { const delta = profile.timeDeltas[i]; timestamp += delta; timings.push({ timestamp, delta, name: nodes.get(profile.samples[i]) }) }
  const top = samples => {
    const totals = new Map()
    for (const sample of samples) totals.set(sample.name, (totals.get(sample.name) ?? 0) + sample.delta)
    return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([source, microseconds]) => ({ source, ms: Math.round(microseconds / 10) / 100 }))
  }
  rows.push({ trial: report.trial, geometry: report.geometry, observer: report.observer.tasks, longAnimationFrames: report.observer.loafs,
    longTasks: report.longTraceTasks.map(task => ({ ...task, topCpuSamples: top(timings.filter(sample => sample.timestamp >= task.at && sample.timestamp < task.at + task.ms * 1000)) })), topCpuSamples: top(timings) })
}
writeFileSync(resolve(outputDir, 'mapped-summary.json'), JSON.stringify({ scope: 'Diagnostic samples with profiling overhead. CPU sample weights are approximate; nested trace category durations are inclusive and cannot be added.', rows }, null, 2) + '\n')
console.log(JSON.stringify(rows.map(row => ({ trial: row.trial, geometry: row.geometry, observer: row.observer, longTasks: row.longTasks.map(task => ({ ms: task.ms, costs: task.costs, topCpuSamples: task.topCpuSamples.slice(0, 5) })) })), null, 2))
