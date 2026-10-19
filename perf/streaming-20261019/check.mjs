import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const report = JSON.parse(readFileSync(process.argv[2] ?? 'perf/streaming-20261019/paired.json', 'utf8'))
assert.ok(report.runs >= 10, 'at least ten pairs are required')
for (const kind of ['short', 'long']) {
  const expected = kind === 'short' ? { chunks: 42, chars: 105907, bytes: 9131 } : { chunks: 402, chars: 35455027, bytes: 261331 }
  const rows = report.samples.filter(sample => sample.kind === kind)
  assert.equal(rows.length, report.runs * 2)
  for (let pair = 0; pair < report.runs; pair++) {
    const a = rows.find(row => row.pair === pair && row.variant === 'base')
    const b = rows.find(row => row.pair === pair && row.variant === 'candidate')
    assert.equal(a.runtimeVersion, b.runtimeVersion, 'same published runtime on both sides')
    assert.equal(a.timing.wireSha256, b.timing.wireSha256, 'exact protocol output, not only final text')
    assert.equal(b.counts.projections, expected.chunks, 'one validated projection per frame')
    assert.ok(b.counts.stringifyCalls <= expected.chunks * 3, 'serialization call ceiling')
    assert.ok(b.counts.serializedChars <= expected.chars, 'serialization work ceiling')
    assert.equal(b.counts.wireBytes, expected.bytes)
    for (const metric of ['totalMs', 'firstStateMs', 'firstBodyMs', 'peakHeapBytes', 'heapRetainedBytes', 'peakRssBytes']) {
      assert.ok(Number.isFinite(b.timing[metric]) && b.timing[metric] > 0, metric)
    }
  }
}
console.log('PASS: ten or more paired samples, identical wire, bounded serialization, one snapshot per frame')
