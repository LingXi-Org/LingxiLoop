export type EvalDimensionName = 'answer' | 'teaching' | 'rag' | 'tools' | 'safety' | 'task' | 'collaboration' | 'efficiency'
export type EvalStageName = 'ingest' | EvalDimensionName | 'aggregate'
export type EvalStageStatus = 'pass' | 'fail' | 'skipped' | 'error'

export interface EvalFinding {
  checkId: string
  status: 'pass' | 'fail' | 'not_observed'
  severity: 'info' | 'warning' | 'error'
  message: string
  category?: string
  expected?: unknown
  actual?: unknown
}

export interface EvalStageResult {
  stage: EvalStageName
  status: EvalStageStatus
  score: number | null
  durationMs: number
  findings: EvalFinding[]
  metrics: Record<string, number | string | boolean | null>
  failureReason: string | null
}

export interface EvalRunSummary {
  caseCount: number
  passedCases: number
  failedCases: number
  errorCases: number
  stageScores: Record<EvalDimensionName, number | null>
  stageStatuses: Record<EvalDimensionName, EvalStageStatus>
  failureCategories: Record<string, number>
  resources: {
    averageLatencyMs: number | null
    totalTokens: number
    totalCostUsd: number
    modelCalls: number
    ipythonCells: number
    toolCalls: number
  }
}

export interface EvalDashboardRun {
  id: string
  suiteKey: string
  suiteName: string
  version: string
  target: { commitSha?: string; promptVersion?: string; model?: string }
  baselineRunId: string | null
  status: 'pass' | 'fail' | 'error'
  score: number
  passThreshold: number
  caseCount: number
  passedCases: number
  failedCases: number
  errorCases: number
  source: 'inline' | 'agent-os' | 'mixed'
  summary: EvalRunSummary
  metadata: Record<string, unknown>
  createdBy: string
  createdAt: string
  finishedAt: string
  baselineScore: number | null
  scoreDelta: number | null
}

export interface EvalDashboardPayload {
  summary: {
    totalRuns: number
    passRate: number
    averageScore: number
    failedRuns: number
    suites: number
    averageLatencyMs: number | null
    totalTokens: number
    totalCostUsd: number
  }
  runs: EvalDashboardRun[]
  stageAverages: EvalRunSummary['stageScores']
  failureClusters: Array<{ category: string; count: number; runCount: number }>
}

export interface EvalTraceEvent {
  id: string
  kind: 'input' | 'decision' | 'model' | 'ipython' | 'host_action' | 'approval' | 'canvas' | 'answer'
  label: string
  status: 'started' | 'completed' | 'failed' | 'pending' | 'skipped'
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  agentId?: string
  hop?: number
  cellId?: string
  action?: string
  input?: unknown
  output?: unknown
  metadata?: Record<string, unknown>
}

export interface EvalCaseDetail {
  id: string
  caseId: string
  name: string
  position: number
  sourceAgentRunId: string | null
  status: 'pass' | 'fail' | 'error'
  score: number
  observation: Record<string, unknown>
  expectations: Record<string, unknown>
  failureReasons: string[]
  failureCategories: string[]
  stages: EvalStageResult[]
}

export interface EvalRunDetail extends EvalDashboardRun {
  cases: EvalCaseDetail[]
}

export interface EvalCreateRunRequest {
  schemaVersion?: 'lingxiloop.eval.v1'
  suiteKey: string
  suiteName?: string
  version: string
  target?: { commitSha?: string; promptVersion?: string; model?: string }
  baselineRunId?: string
  passThreshold?: number
  cases: Array<{
    caseId: string
    name?: string
    sourceAgentRunId?: string
    observation?: Record<string, unknown>
    expectations: Record<string, unknown>
    metadata?: Record<string, unknown>
  }>
  metadata?: Record<string, unknown>
}

export interface EvalComparison {
  base: EvalDashboardRun
  candidate: EvalDashboardRun
  scoreDelta: number
  targetChanges: Array<{
    field: 'commitSha' | 'promptVersion' | 'model'
    base: string | null
    candidate: string | null
  }>
  stageDeltas: Array<{
    stage: EvalDimensionName
    base: number | null
    candidate: number | null
    delta: number | null
  }>
  caseDeltas: Array<{
    caseId: string
    name: string
    base: number | null
    candidate: number | null
    delta: number | null
    status: 'improved' | 'regressed' | 'unchanged' | 'added' | 'removed'
    stageDeltas: Array<{
      stage: EvalDimensionName
      base: number | null
      candidate: number | null
      delta: number | null
    }>
    addedFailureCategories: string[]
    resolvedFailureCategories: string[]
  }>
}
