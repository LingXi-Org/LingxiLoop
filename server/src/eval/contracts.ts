export const EVAL_SCHEMA_VERSION = 'lingxiloop.eval.v1' as const

export type EvalStage = 'ingest' | 'answer' | 'rag' | 'tools' | 'collaboration' | 'aggregate'
export type EvalStatus = 'pass' | 'fail' | 'error'
export type EvalStageStatus = 'pass' | 'fail' | 'skipped' | 'error'
export type EvalFindingStatus = 'pass' | 'fail' | 'not_observed'

export interface EvalFinding {
  checkId: string
  status: EvalFindingStatus
  severity: 'info' | 'warning' | 'error'
  message: string
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
  name: string
  args?: unknown
  result?: unknown
  status?: 'ok' | 'error' | 'pending'
  durationMs?: number
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

export interface EvalObservation {
  answer?: string
  retrievedSourceIds?: string[]
  citedSourceIds?: string[]
  citations?: EvalCitationObservation[]
  toolCalls?: EvalToolCallObservation[]
  agentTurns?: EvalAgentTurnObservation[]
  latencyMs?: number
  tokenCount?: number
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
  requireCitations?: boolean
  minRetrievalRecall?: number
  minCitationPrecision?: number
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

export interface EvalCaseExpectations {
  answer?: AnswerExpectations
  rag?: RagExpectations
  tools?: ToolExpectations
  collaboration?: CollaborationExpectations
  requiredStages?: Array<Exclude<EvalStage, 'ingest' | 'aggregate'>>
  passThreshold?: number
  weights?: Partial<Record<'answer' | 'rag' | 'tools' | 'collaboration', number>>
}

export interface EvalCaseInput {
  caseId: string
  name?: string
  sourceAgentRunId?: string
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
}

export interface EvalRunReport {
  schemaVersion: typeof EVAL_SCHEMA_VERSION
  suiteKey: string
  suiteName: string
  version: string
  baselineRunId: string | null
  status: EvalStatus
  score: number
  passThreshold: number
  summary: {
    caseCount: number
    passedCases: number
    failedCases: number
    errorCases: number
    stageScores: Record<'answer' | 'rag' | 'tools' | 'collaboration', number | null>
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
  for (const key of ['answer', 'error'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new EvalInputError(`${path}.${key} must be a string`)
  }
  assertStringArray(value, 'retrievedSourceIds', path)
  assertStringArray(value, 'citedSourceIds', path)
  assertOptionalNumber(value, 'latencyMs', path)
  assertOptionalNumber(value, 'tokenCount', path, { integer: true })
  for (const [key, identity] of [['citations', 'sourceId'], ['toolCalls', 'name'], ['agentTurns', 'agentId']] as const) {
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
  assertOptionalRecord(value, 'metadata', path)
}

function validateExpectations(value: Record<string, unknown>, path: string): void {
  const allowedStages = new Set(['answer', 'rag', 'tools', 'collaboration'])
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
}

export function validateEvalRunInput(value: unknown): EvalRunInput {
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
    if (rawCase.observation !== undefined) validateObservation(rawCase.observation, `cases[${index}].observation`)
    if (!rawCase.sourceAgentRunId && !isObject(rawCase.observation)) {
      throw new EvalInputError(`cases[${index}] must provide sourceAgentRunId or observation`)
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
    cases: value.cases.map((rawCase) => {
      const item = rawCase as Record<string, unknown>
      return {
        ...item,
        caseId: String(item.caseId).trim(),
        ...(typeof item.name === 'string' ? { name: item.name.trim() } : {}),
        ...(typeof item.sourceAgentRunId === 'string' ? { sourceAgentRunId: item.sourceAgentRunId.trim() } : {}),
      }
    }),
  } as unknown as EvalRunInput
}
