// node perf/issue-652/assess.mjs evidence.json[.gz] [--retained=retained.json] [--require-target]
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
const budgets = JSON.parse(await readFile(new URL('./budgets.json', import.meta.url)))
const path = process.argv[2], bytes = await readFile(path)
const evidence = JSON.parse(path.endsWith('.gz') ? gunzipSync(bytes) : bytes)
const percentile = (rows, q) => {
  const values = rows.map(row => row.editableMs).sort((a, b) => a - b)
  return values[Math.ceil(values.length * q) - 1]
}
const rows = []
const retainedPath = process.argv.find(value => value.startsWith('--retained='))?.slice('--retained='.length)
const retainedEvidence = retainedPath ? JSON.parse(await readFile(retainedPath, 'utf8')) : null
const retainedRows = []
let stagedGate = true, coldTargetMet = true, retainedTargetMet = true
for (const kind of ['design', 'slides']) {
  for (const scenario of [...new Set(evidence.samples.filter(row => row.kind === kind).map(row => row.scenario))]) {
    const arms = {}
    for (const arm of ['baseline', 'candidate']) {
      const samples = evidence.samples.filter(row => row.kind === kind && row.scenario === scenario && row.arm === arm)
      assert.ok(samples.length >= budgets.minimumSamplesPerArm, `Missing ${arm}/${kind}/${scenario} samples`)
      assert.ok(samples.every(row => Number.isFinite(row.editableMs) && row.errors.length === 0), 'Failed editor open')
      arms[arm] = { n: samples.length, p50: percentile(samples, .5), p75: percentile(samples, .75), p95: percentile(samples, .95),
        bytesP50: samples.map(row => row.bytes).sort((a, b) => a - b)[Math.ceil(samples.length / 2) - 1] }
    }
    rows.push({ kind, scenario, ...arms })
    if (scenario === 'cold') {
      stagedGate &&= arms.candidate.p75 <= arms.baseline.p75 * budgets.stagedChangeMaxColdRegressionRatio
      coldTargetMet &&= arms.candidate.p75 <= budgets.coldEditableP75Ms[kind]
    }
  }
  const cold = rows.find(row => row.kind === kind && row.scenario === 'cold')
  coldTargetMet &&= Boolean(cold)
  const retained = rows.find(row => row.kind === kind && row.scenario === 'retained')
  if (retainedEvidence) {
    const samples = retainedEvidence.samples.filter(row => row.kind === kind && row.scenario === 'retained')
    assert.ok(samples.length >= budgets.minimumSamplesPerArm, `Missing retained/${kind} samples`)
    assert.ok(samples.every(row => Number.isFinite(row.editableMs) && row.errors.length === 0
      && row.sameIframe && row.sameDocument && row.scriptTransfers === 0), 'Retained frame was replaced, failed, or fetched scripts')
    const candidate = { n: samples.length, p50: percentile(samples, .5), p75: percentile(samples, .75), p95: percentile(samples, .95) }
    retainedRows.push({ kind, scenario: 'retained', candidate })
    retainedTargetMet &&= candidate.p75 <= budgets.retainedEditableP75Ms
  } else retainedTargetMet &&= Boolean(retained && retained.candidate.p75 <= budgets.retainedEditableP75Ms)
}
console.log(JSON.stringify({ rows, retainedRows, stagedGate, coldTargetMet, retainedTargetMet,
  remainingIssueGates: ['complete functional splitting and dependency inventory', 'first-use failure/retry and exports',
    'real retained-instance count/memory/background bounds', 'account/project/access/expiry cleanup', 'final independent review and release'] }, null, 2))
if (!stagedGate || process.argv.includes('--require-target') && (!coldTargetMet || !retainedTargetMet)) process.exitCode = 1
