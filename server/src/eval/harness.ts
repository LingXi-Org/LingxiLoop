import { EVAL_DIMENSIONS, type EvalDimension, type EvalRunReport } from './contracts.js'

export const EVAL_BASELINE_SCHEMA_VERSION = 'lingxiloop.eval-baseline.v1' as const

export interface EvalBaseline {
  schemaVersion: typeof EVAL_BASELINE_SCHEMA_VERSION
  suiteKey: string
  referenceVersion: string
  minimumScore: number
  maximumScoreDrop: number
  reference: {
    score: number
    stageScores: Partial<Record<EvalDimension, number>>
    caseScores: Record<string, number>
  }
  stageMinimums?: Partial<Record<EvalDimension, number>>
  caseMinimums?: Record<string, number>
}

export interface EvalGateCheck {
  scope: 'run' | 'stage' | 'case'
  key: string
  status: 'pass' | 'fail'
  actual: number | null
  minimum: number | null
  delta: number | null
  message: string
}

export interface EvalGateResult {
  passed: boolean
  checks: EvalGateCheck[]
  regressions: EvalGateCheck[]
}

function finiteUnit(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${path} must be a number between 0 and 1`)
  }
  return value
}

function scoreRecord(value: unknown, path: string, allowedKeys?: ReadonlySet<string>): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  const output: Record<string, number> = {}
  for (const [key, score] of Object.entries(value)) {
    if (!key || (allowedKeys && !allowedKeys.has(key))) throw new Error(`${path}.${key || '<empty>'} is unsupported`)
    output[key] = finiteUnit(score, `${path}.${key}`)
  }
  return output
}

export function validateEvalBaseline(value: unknown): EvalBaseline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('baseline must be an object')
  const baseline = value as Record<string, unknown>
  if (baseline.schemaVersion !== EVAL_BASELINE_SCHEMA_VERSION) {
    throw new Error(`baseline.schemaVersion must be ${EVAL_BASELINE_SCHEMA_VERSION}`)
  }
  if (typeof baseline.suiteKey !== 'string' || !baseline.suiteKey) throw new Error('baseline.suiteKey is required')
  if (typeof baseline.referenceVersion !== 'string' || !baseline.referenceVersion) throw new Error('baseline.referenceVersion is required')
  finiteUnit(baseline.minimumScore, 'baseline.minimumScore')
  finiteUnit(baseline.maximumScoreDrop, 'baseline.maximumScoreDrop')
  const reference = baseline.reference as Record<string, unknown>
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) throw new Error('baseline.reference is required')
  finiteUnit(reference.score, 'baseline.reference.score')
  const dimensions = new Set<string>(EVAL_DIMENSIONS)
  scoreRecord(reference.stageScores, 'baseline.reference.stageScores', dimensions)
  scoreRecord(reference.caseScores, 'baseline.reference.caseScores')
  if (baseline.stageMinimums !== undefined) scoreRecord(baseline.stageMinimums, 'baseline.stageMinimums', dimensions)
  if (baseline.caseMinimums !== undefined) scoreRecord(baseline.caseMinimums, 'baseline.caseMinimums')
  return value as EvalBaseline
}

function roundDelta(value: number): number {
  return Number(value.toFixed(4))
}

export function compareEvalReport(report: EvalRunReport, baseline: EvalBaseline): EvalGateResult {
  if (report.suiteKey !== baseline.suiteKey) {
    throw new Error(`suiteKey mismatch: report=${report.suiteKey}, baseline=${baseline.suiteKey}`)
  }
  const checks: EvalGateCheck[] = []
  const runDelta = roundDelta(report.score - baseline.reference.score)
  const runPassed = report.status === 'pass' && report.score >= baseline.minimumScore && runDelta >= -baseline.maximumScoreDrop
  checks.push({
    scope: 'run',
    key: report.suiteKey,
    status: runPassed ? 'pass' : 'fail',
    actual: report.score,
    minimum: baseline.minimumScore,
    delta: runDelta,
    message: runPassed
      ? `run score ${report.score} passed baseline gate`
      : `run score ${report.score} failed minimum ${baseline.minimumScore} or maximum drop ${baseline.maximumScoreDrop}`,
  })
  for (const stage of EVAL_DIMENSIONS) {
    const actual = report.summary.stageScores[stage]
    const reference = baseline.reference.stageScores[stage]
    const minimum = baseline.stageMinimums?.[stage] ?? null
    if (reference === undefined && minimum === null) continue
    const delta = actual === null || reference === undefined ? null : roundDelta(actual - reference)
    const passed = actual !== null && (minimum === null || actual >= minimum) &&
      (delta === null || delta >= -baseline.maximumScoreDrop)
    checks.push({
      scope: 'stage', key: stage, status: passed ? 'pass' : 'fail', actual, minimum, delta,
      message: passed ? `${stage} passed` : `${stage} regressed or is below its minimum`,
    })
  }
  const reportCases = new Map(report.cases.map((item) => [item.caseId, item]))
  const caseIds = new Set([...Object.keys(baseline.reference.caseScores), ...Object.keys(baseline.caseMinimums ?? {})])
  for (const caseId of caseIds) {
    const actual = reportCases.get(caseId)?.score ?? null
    const reference = baseline.reference.caseScores[caseId]
    const minimum = baseline.caseMinimums?.[caseId] ?? null
    const delta = actual === null || reference === undefined ? null : roundDelta(actual - reference)
    const passed = actual !== null && (minimum === null || actual >= minimum) &&
      (delta === null || delta >= -baseline.maximumScoreDrop)
    checks.push({
      scope: 'case', key: caseId, status: passed ? 'pass' : 'fail', actual, minimum, delta,
      message: passed ? `${caseId} passed` : `${caseId} regressed, is missing, or is below its minimum`,
    })
  }
  const regressions = checks.filter((check) => check.status === 'fail')
  return { passed: regressions.length === 0, checks, regressions }
}

export function evalGateMarkdown(report: EvalRunReport, baseline: EvalBaseline, gate: EvalGateResult): string {
  const lines = [
    `## Agent Eval · ${report.suiteName}`,
    '',
    `**${gate.passed ? 'PASS' : 'FAIL'}** · score ${(report.score * 100).toFixed(1)}% · baseline ${baseline.referenceVersion}`,
    '',
    '| Scope | Key | Score | Delta | Gate |',
    '| --- | --- | ---: | ---: | --- |',
  ]
  for (const check of gate.checks) lines.push(
    `| ${check.scope} | ${check.key} | ${check.actual === null ? 'not observed' : `${(check.actual * 100).toFixed(1)}%`} | ${check.delta === null ? '—' : `${check.delta >= 0 ? '+' : ''}${(check.delta * 100).toFixed(1)}pp`} | ${check.status.toUpperCase()} |`,
  )
  return `${lines.join('\n')}\n`
}
