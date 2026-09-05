import { addUsage, hash, zeroUsage, type Sample } from './contracts.js'
import type { Job, Manifest } from './store.js'

export function comparisonKey(manifest: Manifest): string {
  // Candidate identity intentionally varies; evaluation conditions must not.
  return hash({ engine: manifest.engine, suite: manifest.suite, dataset: manifest.dataset, judge: manifest.judge, seed: manifest.seed })
}
export function buildReport(job: Job, samples: Sample[], baseline?: Job) {
  const gate = job.manifest.suite.gate
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const cases = job.manifest.dataset.cases.map(c => {
    const results = samples.filter(s => s.caseId === c.id)
    return { id: c.id, score: mean(results.map(s => s.score)), passed: results.length === job.manifest.suite.samples && results.every(s => s.status === 'pass') }
  })
  const score = mean(cases.map(c => c.score))
  const passRate = cases.filter(c => c.passed).length / cases.length
  const latency = samples.map(s => s.latencyMs).sort((a, b) => a - b)
  const p95LatencyMs = latency[Math.max(0, Math.ceil(latency.length * 0.95) - 1)] ?? 0
  const candidate = samples.reduce((sum, s) => addUsage(sum, s.candidate ?? zeroUsage()), zeroUsage())
  const judge = samples.reduce((sum, s) => addUsage(sum, s.judge), zeroUsage())
  const reasons: string[] = []
  if (samples.length !== job.manifest.dataset.cases.length * job.manifest.suite.samples) reasons.push('incomplete_samples')
  if (samples.some(s => s.status === 'error')) reasons.push('sample_errors')
  if (samples.some(s => !s.candidate)) reasons.push('candidate_usage_unknown')
  if (score < gate.minScore) reasons.push('score_below_threshold')
  if (passRate < gate.minPassRate) reasons.push('pass_rate_below_threshold')
  if (p95LatencyMs > gate.maxP95LatencyMs) reasons.push('latency_budget_exceeded')
  if (candidate.costCny > gate.maxCandidateCostCny) reasons.push('candidate_cost_budget_exceeded')
  if (judge.costCny > gate.maxJudgeCostCny) reasons.push('judge_cost_budget_exceeded')
  const eligible = reasons.length === 0
  let comparison: { baselineId: string; scoreDelta?: number; caseDeltas?: { id: string; delta: number }[] } | null = null
  if (!baseline && gate.requireBaseline) reasons.push('baseline_required')
  if (baseline) {
    comparison = { baselineId: baseline.id }
    const prior = baseline.report as { score: number; cases: typeof cases; eligible: boolean } | null
    if (baseline.status !== 'completed' || !prior?.eligible || comparisonKey(baseline.manifest) !== comparisonKey(job.manifest)) {
      reasons.push('baseline_incompatible')
    } else {
      comparison.scoreDelta = score - prior.score
      comparison.caseDeltas = cases.map(c => ({ id: c.id, delta: c.score - (prior.cases.find(p => p.id === c.id)?.score ?? Infinity) }))
      if (comparison.scoreDelta < -gate.maxScoreDrop) reasons.push('score_regression')
      if (comparison.caseDeltas.some(c => c.delta < -gate.maxCaseDrop)) reasons.push('case_regression')
    }
  }
  return { schemaVersion: 2 as const, jobId: job.id, manifestHash: hash(job.manifest), comparisonKey: comparisonKey(job.manifest),
    engine: job.manifest.engine, revision: job.manifest.provenance.revision, seed: job.manifest.seed,
    suite: { id: job.manifest.suite.id, version: job.manifest.suite.version, digest: hash(job.manifest.suite) },
    dataset: { id: job.manifest.dataset.id, version: job.manifest.dataset.version, digest: hash(job.manifest.dataset) },
    target: job.manifest.target, judgeFingerprint: job.manifest.judge,
    score, passRate, p95LatencyMs, usage: { candidate, judge }, cases, samples,
    graders: job.manifest.suite.graders.map(g => ({ id: g.id, score: mean(samples.map(s => s.grades.find(r => r.id === g.id)?.score ?? 0)) })),
    failures: samples.reduce<Record<string, number>>((all, s) => { if (s.failure) all[s.failure] = (all[s.failure] ?? 0) + 1; return all }, {}),
    eligible, comparison, gate: { passed: reasons.length === 0, reasons } }
}
export type Report = ReturnType<typeof buildReport>
export function markdown(report: Report): string {
  return [`# Black-box Eval ${report.jobId}`, '', `Gate: **${report.gate.passed ? 'PASS' : 'FAIL'}**`,
    `Score: ${report.score.toFixed(4)} · Case pass rate: ${report.passRate.toFixed(4)} · p95: ${report.p95LatencyMs} ms`,
    `Candidate: CNY ${report.usage.candidate.costCny.toFixed(6)} · Judge: CNY ${report.usage.judge.costCny.toFixed(6)}`, '',
    ...report.gate.reasons.map(r => `- ${r}`), '', '| Case | Score | Pass |', '|---|---:|---|',
    ...report.cases.map(c => `| ${c.id} | ${c.score.toFixed(4)} | ${c.passed} |`), '',
    'Provider responses are stochastic; reruns pin inputs/configuration, not identical model outputs.', ''].join('\n')
}
