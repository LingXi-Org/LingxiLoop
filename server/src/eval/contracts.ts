export const EVAL_SCHEMA_VERSION = 'lingxiloop.eval.v1' as const

export const EVAL_DIMENSIONS = [
  'answer',
  'teaching',
  'rag',
  'tools',
  'safety',
  'task',
  'collaboration',
  'efficiency',
] as const
export type EvalDimension = (typeof EVAL_DIMENSIONS)[number]
export type EvalStage = 'ingest' | EvalDimension | 'aggregate'
export type EvalStatus = 'pass' | 'fail' | 'error'
export type EvalStageStatus = 'pass' | 'fail' | 'skipped' | 'error'
export type EvalFindingStatus = 'pass' | 'fail' | 'not_observed'
export type EvalFailureCategory =
  | 'answer_quality'
  | 'teaching_quality'
  | 'rag_missing_source'
  | 'rag_missing_citation'
  | 'rag_hallucination'
  | 'rag_bad_citation'
  | 'tool_missing'
  | 'tool_selection'
  | 'tool_error'
  | 'approval_violation'
  | 'policy_violation'
  | 'task_incomplete'
  | 'routing_error'
  | 'canvas_failure'
  | 'timeout'
  | 'cost_regression'
  | 'trace_efficiency'
  | 'runtime_error'
  | 'coverage_gap'

export interface EvalFinding {
  checkId: string
  status: EvalFindingStatus
  severity: 'info' | 'warning' | 'error'
  message: string
  category?: EvalFailureCategory
  expected?: unknown
  actual?: unknown
}

export interface EvalCitationObservation {
  sourceId: string
  chunkId?: string
  marker?: string
  title?: string
}

export interface EvalToolCallObservation {
  id?: string
  name: string
  args?: unknown
  result?: unknown
  status?: 'ok' | 'error' | 'pending'
  durationMs?: number
  approvalId?: string
  cellId?: string
}

export interface EvalAgentTurnObservation {
  agentId: string
  role?: string
  status?: string
  handoffTo?: string
  startedAt?: string
  finishedAt?: string
  error?: string
}

export interface EvalApprovalObservation {
  id: string
  action: string
  status: 'pending' | 'approved' | 'rejected' | 'failed'
  requestedAt?: string
  resolvedAt?: string
}

export interface EvalArtifactObservation {
  kind: string
  id?: string
  title?: string
}

export type EvalTraceKind = 'input' | 'decision' | 'model' | 'ipython' | 'host_action' | 'approval' | 'canvas' | 'answer'
export interface EvalTraceEvent {
  id: string
  kind: EvalTraceKind
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

export interface EvalTarget {
  commitSha?: string
  promptVersion?: string
  model?: string
}

export interface EvalObservation {
  input?: string
  answer?: string
  retrievedSourceIds?: string[]
  citedSourceIds?: string[]
  citations?: EvalCitationObservation[]
  toolCalls?: EvalToolCallObservation[]
  agentTurns?: EvalAgentTurnObservation[]
  approvals?: EvalApprovalObservation[]
  artifacts?: EvalArtifactObservation[]
  trace?: EvalTraceEvent[]
  taskCompletion?: { completed?: boolean; completionRate?: number; outcome?: string }
  policyViolations?: string[]
  latencyMs?: number
  tokenCount?: number
  costUsd?: number
  error?: string
  metadata?: Record<string, unknown>
}

export interface AnswerExpectations {
  referenceAnswer?: string
  requiredKeywords?: string[]
  forbiddenPatterns?: string[]
  minLength?: number
  maxLength?: number
  minSimilarity?: number
  maxLatencyMs?: number
  maxTokens?: number
}

export interface RagExpectations {
  requiredSourceIds?: string[]
  requiredClaimCitations?: Array<{ claim: string; sourceId: string }>
  requireCitations?: boolean
  minRetrievalRecall?: number
  minCitationPrecision?: number
}

export interface TeachingExpectations {
  requiredConcepts?: string[]
  explanationMarkers?: string[]
  requireExplanation?: boolean
  requireCheckForUnderstanding?: boolean
  minExplanationLength?: number
}

export interface ExpectedToolCall {
  name: string
  argsSubset?: unknown
  required?: boolean
}

export interface ToolExpectations {
  calls?: ExpectedToolCall[]
  allowedToolNames?: string[]
  forbiddenToolNames?: string[]
  allowUnexpected?: boolean
  enforceOrder?: boolean
  requireSuccess?: boolean
  maxCalls?: number
}

export interface CollaborationExpectations {
  requiredAgentIds?: string[]
  minAgents?: number
  maxHandoffs?: number
  maxFailedAgents?: number
  requireAllCompleted?: boolean
  requireParallelism?: boolean
}

export interface SafetyExpectations {
  requiredApprovalActions?: string[]
  forbiddenActionNames?: string[]
  requireNoPolicyViolations?: boolean
}

export interface TaskExpectations {
  requireCompleted?: boolean
  minCompletionRate?: number
  requiredArtifactKinds?: string[]
}

export interface EfficiencyExpectations {
  maxLatencyMs?: number
  maxTokens?: number
  maxCostUsd?: number
  maxModelCalls?: number
  maxIpythonCells?: number
  maxToolCalls?: number
  requireSuccessfulTrace?: boolean
}

export interface EvalCaseExpectations {
  answer?: AnswerExpectations
  teaching?: TeachingExpectations
  rag?: RagExpectations
  tools?: ToolExpectations
  safety?: SafetyExpectations
  task?: TaskExpectations
  collaboration?: CollaborationExpectations
  efficiency?: EfficiencyExpectations
  requiredStages?: EvalDimension[]
  passThreshold?: number
  weights?: Partial<Record<EvalDimension, number>>
}

export interface EvalCaseInput {
  caseId: string
  name?: string
  sourceAgentRunId?: string
  /** Versioned deterministic executor scenario resolved by a local/CI runtime harness. */
  runtimeScenario?: string
  observation?: EvalObservation
  expectations: EvalCaseExpectations
  metadata?: Record<string, unknown>
}

export interface EvalRunInput {
  schemaVersion?: typeof EVAL_SCHEMA_VERSION
  suiteKey: string
  suiteName?: string
  version: string
  baselineRunId?: string
  target?: EvalTarget
  passThreshold?: number
  cases: EvalCaseInput[]
  metadata?: Record<string, unknown>
}

export interface EvalStageResult {
  stage: EvalStage
  status: EvalStageStatus
  score: number | null
  durationMs: number
  findings: EvalFinding[]
  metrics: Record<string, number | string | boolean | null>
  failureReason: string | null
}

export interface EvalCaseReport {
  caseId: string
  name: string
  sourceAgentRunId: string | null
  status: EvalStatus
  score: number
  observation: EvalObservation
  expectations: EvalCaseExpectations
  stages: EvalStageResult[]
  failureReasons: string[]
  failureCategories: EvalFailureCategory[]
}

export interface EvalRunReport {
  schemaVersion: typeof EVAL_SCHEMA_VERSION
  suiteKey: string
  suiteName: string
  version: string
  baselineRunId: string | null
  target: EvalTarget
  status: EvalStatus
  score: number
  passThreshold: number
  summary: {
    caseCount: number
    passedCases: number
    failedCases: number
    errorCases: number
    stageScores: Record<EvalDimension, number | null>
    stageStatuses: Record<EvalDimension, EvalStageStatus>
    failureCategories: Partial<Record<EvalFailureCategory, number>>
    resources: {
      averageLatencyMs: number | null
      totalTokens: number
      totalCostUsd: number
      modelCalls: number
      ipythonCells: number
      toolCalls: number
    }
  }
  cases: EvalCaseReport[]
}

export class EvalInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EvalInputError'
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertStringArray(record: Record<string, unknown>, key: string, path: string): void {
  const value = record[key]
  if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
    throw new EvalInputError(`${path}.${key} must be an array of strings`)
  }
}

function assertOptionalNumber(record: Record<string, unknown>, key: string, path: string, options: { integer?: boolean; max?: number } = {}): void {
  const value = record[key]
  if (value === undefined) return
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      (options.integer && !Number.isInteger(value)) || (options.max !== undefined && value > options.max)) {
    throw new EvalInputError(`${path}.${key} must be a ${options.integer ? 'non-negative integer' : 'non-negative number'}${options.max !== undefined ? ` up to ${options.max}` : ''}`)
  }
}

function assertOptionalBoolean(record: Record<string, unknown>, key: string, path: string): void {
  if (record[key] !== undefined && typeof record[key] !== 'boolean') {
    throw new EvalInputError(`${path}.${key} must be a boolean`)
  }
}

function assertOptionalRecord(record: Record<string, unknown>, key: string, path: string): void {
  if (record[key] !== undefined && !isObject(record[key])) {
    throw new EvalInputError(`${path}.${key} must be an object`)
  }
}

function validateObservation(value: unknown, path: string): void {
  if (!isObject(value)) throw new EvalInputError(`${path} must be an object`)
  for (const key of ['input', 'answer', 'error'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new EvalInputError(`${path}.${key} must be a string`)
  }
  assertStringArray(value, 'retrievedSourceIds', path)
  assertStringArray(value, 'citedSourceIds', path)
  assertStringArray(value, 'policyViolations', path)
  assertOptionalNumber(value, 'latencyMs', path)
  assertOptionalNumber(value, 'tokenCount', path, { integer: true })
  assertOptionalNumber(value, 'costUsd', path)
  for (const [key, identity] of [
    ['citations', 'sourceId'],
    ['toolCalls', 'name'],
    ['agentTurns', 'agentId'],
    ['approvals', 'id'],
    ['artifacts', 'kind'],
    ['trace', 'id'],
  ] as const) {
    const items = value[key]
    if (items === undefined) continue
    if (!Array.isArray(items) || items.some((item) => !isObject(item) || typeof item[identity] !== 'string' || !item[identity])) {
      throw new EvalInputError(`${path}.${key} must be an array of objects with ${identity}`)
    }
  }
  for (const item of Array.isArray(value.toolCalls) ? value.toolCalls : []) {
    if (!isObject(item)) continue
    if (item.status !== undefined && !['ok', 'error', 'pending'].includes(String(item.status))) {
      throw new EvalInputError(`${path}.toolCalls[].status is unsupported`)
    }
    assertOptionalNumber(item, 'durationMs', `${path}.toolCalls[]`)
  }
  for (const item of Array.isArray(value.approvals) ? value.approvals : []) {
    if (!isObject(item) || typeof item.action !== 'string' || !item.action ||
        !['pending', 'approved', 'rejected', 'failed'].includes(String(item.status))) {
      throw new EvalInputError(`${path}.approvals[] must contain action and a supported status`)
    }
  }
  for (const item of Array.isArray(value.trace) ? value.trace : []) {
    if (!isObject(item) || typeof item.kind !== 'string' || typeof item.label !== 'string' ||
        !['input', 'decision', 'model', 'ipython', 'host_action', 'approval', 'canvas', 'answer'].includes(item.kind) ||
        !['started', 'completed', 'failed', 'pending', 'skipped'].includes(String(item.status))) {
      throw new EvalInputError(`${path}.trace[] contains an invalid trace event`)
    }
    assertOptionalNumber(item, 'durationMs', `${path}.trace[]`)
  }
  if (value.taskCompletion !== undefined) {
    if (!isObject(value.taskCompletion)) throw new EvalInputError(`${path}.taskCompletion must be an object`)
    assertOptionalBoolean(value.taskCompletion, 'completed', `${path}.taskCompletion`)
    assertOptionalNumber(value.taskCompletion, 'completionRate', `${path}.taskCompletion`, { max: 1 })
    if (value.taskCompletion.outcome !== undefined && typeof value.taskCompletion.outcome !== 'string') {
      throw new EvalInputError(`${path}.taskCompletion.outcome must be a string`)
    }
  }
  assertOptionalRecord(value, 'metadata', path)
}

function validateExpectations(value: Record<string, unknown>, path: string): void {
  const allowedStages = new Set<string>(EVAL_DIMENSIONS)
  if (value.requiredStages !== undefined && (!Array.isArray(value.requiredStages) ||
      value.requiredStages.some((item) => typeof item !== 'string' || !allowedStages.has(item)))) {
    throw new EvalInputError(`${path}.requiredStages contains an unsupported stage`)
  }
  assertOptionalNumber(value, 'passThreshold', path, { max: 1 })
  if (value.weights !== undefined) {
    if (!isObject(value.weights)) throw new EvalInputError(`${path}.weights must be an object`)
    for (const [key, weight] of Object.entries(value.weights)) {
      if (!allowedStages.has(key) || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
        throw new EvalInputError(`${path}.weights contains an invalid stage or weight`)
      }
    }
  }
  for (const stage of allowedStages) {
    if (value[stage] !== undefined && !isObject(value[stage])) throw new EvalInputError(`${path}.${stage} must be an object`)
  }
  const answer = isObject(value.answer) ? value.answer : null
  if (answer) {
    assertStringArray(answer, 'requiredKeywords', `${path}.answer`)
    assertStringArray(answer, 'forbiddenPatterns', `${path}.answer`)
    for (const key of ['minLength', 'maxLength', 'maxLatencyMs', 'maxTokens'] as const) assertOptionalNumber(answer, key, `${path}.answer`, { integer: true })
    assertOptionalNumber(answer, 'minSimilarity', `${path}.answer`, { max: 1 })
    if (answer.referenceAnswer !== undefined && typeof answer.referenceAnswer !== 'string') throw new EvalInputError(`${path}.answer.referenceAnswer must be a string`)
  }
  const teaching = isObject(value.teaching) ? value.teaching : null
  if (teaching) {
    assertStringArray(teaching, 'requiredConcepts', `${path}.teaching`)
    assertStringArray(teaching, 'explanationMarkers', `${path}.teaching`)
    assertOptionalBoolean(teaching, 'requireExplanation', `${path}.teaching`)
    assertOptionalBoolean(teaching, 'requireCheckForUnderstanding', `${path}.teaching`)
    assertOptionalNumber(teaching, 'minExplanationLength', `${path}.teaching`, { integer: true })
  }
  const rag = isObject(value.rag) ? value.rag : null
  if (rag) {
    assertStringArray(rag, 'requiredSourceIds', `${path}.rag`)
    assertOptionalNumber(rag, 'minRetrievalRecall', `${path}.rag`, { max: 1 })
    assertOptionalNumber(rag, 'minCitationPrecision', `${path}.rag`, { max: 1 })
    assertOptionalBoolean(rag, 'requireCitations', `${path}.rag`)
  }
  const tools = isObject(value.tools) ? value.tools : null
  if (tools) {
    assertStringArray(tools, 'allowedToolNames', `${path}.tools`)
    assertStringArray(tools, 'forbiddenToolNames', `${path}.tools`)
    assertOptionalNumber(tools, 'maxCalls', `${path}.tools`, { integer: true })
    if (tools.calls !== undefined && (!Array.isArray(tools.calls) || tools.calls.some((item) => !isObject(item) || typeof item.name !== 'string' || !item.name))) {
      throw new EvalInputError(`${path}.tools.calls must be an array of objects with name`)
    }
    for (const item of Array.isArray(tools.calls) ? tools.calls : []) {
      if (isObject(item)) assertOptionalBoolean(item, 'required', `${path}.tools.calls[]`)
    }
    for (const key of ['allowUnexpected', 'enforceOrder', 'requireSuccess'] as const) {
      assertOptionalBoolean(tools, key, `${path}.tools`)
    }
  }
  const collaboration = isObject(value.collaboration) ? value.collaboration : null
  if (collaboration) {
    assertStringArray(collaboration, 'requiredAgentIds', `${path}.collaboration`)
    for (const key of ['minAgents', 'maxHandoffs', 'maxFailedAgents'] as const) assertOptionalNumber(collaboration, key, `${path}.collaboration`, { integer: true })
    for (const key of ['requireAllCompleted', 'requireParallelism'] as const) {
      assertOptionalBoolean(collaboration, key, `${path}.collaboration`)
    }
  }
  const safety = isObject(value.safety) ? value.safety : null
  if (safety) {
    assertStringArray(safety, 'requiredApprovalActions', `${path}.safety`)
    assertStringArray(safety, 'forbiddenActionNames', `${path}.safety`)
    assertOptionalBoolean(safety, 'requireNoPolicyViolations', `${path}.safety`)
  }
  const task = isObject(value.task) ? value.task : null
  if (task) {
    assertOptionalBoolean(task, 'requireCompleted', `${path}.task`)
    assertOptionalNumber(task, 'minCompletionRate', `${path}.task`, { max: 1 })
    assertStringArray(task, 'requiredArtifactKinds', `${path}.task`)
  }
  const efficiency = isObject(value.efficiency) ? value.efficiency : null
  if (efficiency) {
    for (const key of ['maxLatencyMs', 'maxTokens', 'maxModelCalls', 'maxIpythonCells', 'maxToolCalls'] as const) {
      assertOptionalNumber(efficiency, key, `${path}.efficiency`, { integer: true })
    }
    assertOptionalNumber(efficiency, 'maxCostUsd', `${path}.efficiency`)
    assertOptionalBoolean(efficiency, 'requireSuccessfulTrace', `${path}.efficiency`)
  }
}

export function validateEvalRunInput(
  value: unknown,
  options: { allowRuntimeScenarios?: boolean } = {},
): EvalRunInput {
  if (!isObject(value)) throw new EvalInputError('request body must be an object')
  if (value.schemaVersion !== undefined && value.schemaVersion !== EVAL_SCHEMA_VERSION) {
    throw new EvalInputError(`schemaVersion must be ${EVAL_SCHEMA_VERSION}`)
  }
  const suiteKey = typeof value.suiteKey === 'string' ? value.suiteKey.trim() : ''
  const version = typeof value.version === 'string' ? value.version.trim() : ''
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(suiteKey)) {
    throw new EvalInputError('suiteKey must contain 1-80 letters, numbers, dots, underscores, or dashes')
  }
  if (!version || version.length > 120) throw new EvalInputError('version must contain 1-120 characters')
  if (value.suiteName !== undefined && (typeof value.suiteName !== 'string' || !value.suiteName.trim() || value.suiteName.trim().length > 160)) {
    throw new EvalInputError('suiteName must contain 1-160 characters')
  }
  if (value.baselineRunId !== undefined && (typeof value.baselineRunId !== 'string' || !value.baselineRunId.trim())) {
    throw new EvalInputError('baselineRunId must be a non-empty string')
  }
  if (value.target !== undefined) {
    if (!isObject(value.target)) throw new EvalInputError('target must be an object')
    for (const key of ['commitSha', 'promptVersion', 'model'] as const) {
      if (value.target[key] !== undefined && (typeof value.target[key] !== 'string' || !value.target[key].trim())) {
        throw new EvalInputError(`target.${key} must be a non-empty string`)
      }
    }
  }
  assertOptionalRecord(value, 'metadata', 'request')
  if (!Array.isArray(value.cases) || value.cases.length === 0 || value.cases.length > 100) {
    throw new EvalInputError('cases must contain between 1 and 100 items')
  }
  const seen = new Set<string>()
  for (const [index, rawCase] of value.cases.entries()) {
    if (!isObject(rawCase)) throw new EvalInputError(`cases[${index}] must be an object`)
    const caseId = typeof rawCase.caseId === 'string' ? rawCase.caseId.trim() : ''
    if (!caseId || caseId.length > 120) throw new EvalInputError(`cases[${index}].caseId must contain 1-120 characters`)
    if (seen.has(caseId)) throw new EvalInputError(`duplicate caseId: ${caseId}`)
    seen.add(caseId)
    if (!isObject(rawCase.expectations)) throw new EvalInputError(`cases[${index}].expectations must be an object`)
    if (rawCase.name !== undefined && (typeof rawCase.name !== 'string' || !rawCase.name.trim() || rawCase.name.trim().length > 160)) {
      throw new EvalInputError(`cases[${index}].name must contain 1-160 characters`)
    }
    assertOptionalRecord(rawCase, 'metadata', `cases[${index}]`)
    validateExpectations(rawCase.expectations, `cases[${index}].expectations`)
    if (rawCase.sourceAgentRunId !== undefined && (typeof rawCase.sourceAgentRunId !== 'string' || !rawCase.sourceAgentRunId.trim())) {
      throw new EvalInputError(`cases[${index}].sourceAgentRunId must be a non-empty string`)
    }
    if (rawCase.runtimeScenario !== undefined && (typeof rawCase.runtimeScenario !== 'string' || !rawCase.runtimeScenario.trim())) {
      throw new EvalInputError(`cases[${index}].runtimeScenario must be a non-empty string`)
    }
    if (rawCase.runtimeScenario && !options.allowRuntimeScenarios) {
      throw new EvalInputError(`cases[${index}].runtimeScenario is only available to a trusted local runtime harness`)
    }
    if (rawCase.observation !== undefined) validateObservation(rawCase.observation, `cases[${index}].observation`)
    if (!rawCase.sourceAgentRunId && !(options.allowRuntimeScenarios && rawCase.runtimeScenario) && !isObject(rawCase.observation)) {
      throw new EvalInputError(`cases[${index}] must provide sourceAgentRunId, runtimeScenario, or observation`)
    }
  }
  const threshold = value.passThreshold
  if (threshold !== undefined && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
    throw new EvalInputError('passThreshold must be between 0 and 1')
  }
  return {
    ...value,
    suiteKey,
    version,
    ...(typeof value.suiteName === 'string' ? { suiteName: value.suiteName.trim() } : {}),
    ...(typeof value.baselineRunId === 'string' ? { baselineRunId: value.baselineRunId.trim() } : {}),
    ...(isObject(value.target) ? { target: Object.fromEntries(Object.entries(value.target)
      .flatMap(([key, item]) => typeof item === 'string' ? [[key, item.trim()]] : [])) } : {}),
    cases: value.cases.map((rawCase) => {
      const item = rawCase as Record<string, unknown>
      return {
        ...item,
        caseId: String(item.caseId).trim(),
        ...(typeof item.name === 'string' ? { name: item.name.trim() } : {}),
        ...(typeof item.sourceAgentRunId === 'string' ? { sourceAgentRunId: item.sourceAgentRunId.trim() } : {}),
        ...(typeof item.runtimeScenario === 'string' ? { runtimeScenario: item.runtimeScenario.trim() } : {}),
      }
    }),
  } as unknown as EvalRunInput
}
