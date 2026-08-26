import {
  type AnswerExpectations,
  type CollaborationExpectations,
  EVAL_SCHEMA_VERSION,
  type EvalCaseInput,
  type EvalCaseReport,
  type EvalFinding,
  type EvalObservation,
  type EvalRunInput,
  type EvalRunReport,
  type EvalStage,
  type EvalStageResult,
  type RagExpectations,
  type ToolExpectations,
} from './contracts.js'

const DEFAULT_PASS_THRESHOLD = 0.8
const STAGE_THRESHOLDS: Record<'answer' | 'rag' | 'tools' | 'collaboration', number> = {
  answer: 0.75,
  rag: 0.75,
  tools: 1,
  collaboration: 0.8,
}
const DEFAULT_WEIGHTS = { answer: 0.35, rag: 0.25, tools: 0.2, collaboration: 0.2 }

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number, places = 4): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function finding(
  checkId: string,
  status: EvalFinding['status'],
  message: string,
  options: { severity?: EvalFinding['severity']; expected?: unknown; actual?: unknown } = {},
): EvalFinding {
  return {
    checkId,
    status,
    severity: status === 'pass' ? 'info' : options.severity ?? (status === 'fail' ? 'error' : 'warning'),
    message,
    ...(options.expected !== undefined ? { expected: options.expected } : {}),
    ...(options.actual !== undefined ? { actual: options.actual } : {}),
  }
}

function stageResult(
  stage: EvalStage,
  startedAt: number,
  findings: EvalFinding[],
  metrics: EvalStageResult['metrics'] = {},
  threshold?: number,
): EvalStageResult {
  const observed = findings.filter((item) => item.status !== 'not_observed')
  const passed = observed.filter((item) => item.status === 'pass').length
  const score = observed.length ? round(passed / observed.length) : null
  const hardFailure = findings.some((item) => item.status === 'fail' && item.severity === 'error')
  const status = score === null ? 'skipped' : hardFailure || score < (threshold ?? 1) ? 'fail' : 'pass'
  const failed = findings.find((item) => item.status === 'fail')
  return {
    stage,
    status,
    score,
    durationMs: Math.max(0, Date.now() - startedAt),
    findings,
    metrics,
    failureReason: failed?.message ?? null,
  }
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function textFeatures(value: string): Set<string> {
  const normalized = normalizedText(value)
  const features = new Set<string>()
  for (const token of normalized.match(/[a-z0-9]+(?:[-_.][a-z0-9]+)*/g) ?? []) features.add(token)
  const cjkRuns = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? []
  for (const run of cjkRuns) {
    // CJK text has no whitespace word boundary. Unigrams preserve overlap
    // across small paraphrases; bigrams reward local phrase agreement.
    for (const character of run) features.add(character)
    for (let index = 0; index < run.length - 1; index += 1) features.add(run.slice(index, index + 2))
  }
  return features
}

export function answerSimilarity(actual: string, reference: string): number {
  const left = textFeatures(actual)
  const right = textFeatures(reference)
  if (left.size === 0 || right.size === 0) return normalizedText(actual) === normalizedText(reference) ? 1 : 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1
  const precision = intersection / left.size
  const recall = intersection / right.size
  return precision + recall === 0 ? 0 : round((2 * precision * recall) / (precision + recall))
}

function evaluateAnswer(observation: EvalObservation, expected: AnswerExpectations): EvalStageResult {
  const startedAt = Date.now()
  const findings: EvalFinding[] = []
  const answer = observation.answer?.trim() ?? ''
  findings.push(finding('answer.response_present', answer ? 'pass' : 'fail', answer ? '回答已生成' : '没有可评测的 Agent 回答'))
  if (observation.error) {
    findings.push(finding('answer.runtime_error', 'fail', `Agent 运行失败：${observation.error}`, { actual: observation.error }))
  } else {
    findings.push(finding('answer.runtime_error', 'pass', 'Agent 运行未报告错误'))
  }
  for (const keyword of expected.requiredKeywords ?? []) {
    const found = normalizedText(answer).includes(normalizedText(keyword))
    findings.push(finding('answer.required_keyword', found ? 'pass' : 'fail', found ? `包含关键点“${keyword}”` : `缺少关键点“${keyword}”`, {
      expected: keyword,
    }))
  }
  for (const pattern of expected.forbiddenPatterns ?? []) {
    let matched = false
    try { matched = new RegExp(pattern, 'iu').test(answer) } catch { matched = normalizedText(answer).includes(normalizedText(pattern)) }
    findings.push(finding('answer.forbidden_pattern', matched ? 'fail' : 'pass', matched ? `命中禁止内容“${pattern}”` : `未命中禁止内容“${pattern}”`, {
      expected: pattern,
    }))
  }
  if (expected.minLength !== undefined) {
    findings.push(finding('answer.min_length', answer.length >= expected.minLength ? 'pass' : 'fail',
      answer.length >= expected.minLength ? '回答长度达到下限' : `回答过短：${answer.length} < ${expected.minLength}`,
      { expected: expected.minLength, actual: answer.length }))
  }
  if (expected.maxLength !== undefined) {
    findings.push(finding('answer.max_length', answer.length <= expected.maxLength ? 'pass' : 'fail',
      answer.length <= expected.maxLength ? '回答长度未超过上限' : `回答过长：${answer.length} > ${expected.maxLength}`,
      { expected: expected.maxLength, actual: answer.length }))
  }
  let similarity: number | null = null
  if (expected.referenceAnswer) {
    similarity = answerSimilarity(answer, expected.referenceAnswer)
    const minimum = expected.minSimilarity ?? 0.55
    findings.push(finding('answer.reference_similarity', similarity >= minimum ? 'pass' : 'fail',
      similarity >= minimum ? `参考答案相似度 ${similarity}` : `参考答案相似度 ${similarity} 低于 ${minimum}`,
      { expected: minimum, actual: similarity }))
  }
  if (expected.maxLatencyMs !== undefined) {
    const actual = observation.latencyMs
    findings.push(finding('answer.latency_budget', actual !== undefined && actual <= expected.maxLatencyMs ? 'pass' : 'fail',
      actual !== undefined && actual <= expected.maxLatencyMs ? '响应时延在预算内' : `响应时延 ${actual ?? '未观测'}ms 超出预算`,
      { expected: expected.maxLatencyMs, actual: actual ?? null }))
  }
  if (expected.maxTokens !== undefined) {
    const actual = observation.tokenCount
    findings.push(finding('answer.token_budget', actual !== undefined && actual <= expected.maxTokens ? 'pass' : 'fail',
      actual !== undefined && actual <= expected.maxTokens ? 'Token 用量在预算内' : `Token 用量 ${actual ?? '未观测'} 超出预算`,
      { expected: expected.maxTokens, actual: actual ?? null }))
  }
  return stageResult('answer', startedAt, findings, {
    answerLength: answer.length,
    similarity,
    latencyMs: observation.latencyMs ?? null,
    tokenCount: observation.tokenCount ?? null,
  }, STAGE_THRESHOLDS.answer)
}

function evaluateRag(observation: EvalObservation, expected: RagExpectations): EvalStageResult {
  const startedAt = Date.now()
  const findings: EvalFinding[] = []
  const retrieved = new Set(observation.retrievedSourceIds ?? observation.citations?.map((item) => item.sourceId) ?? [])
  const answer = observation.answer ?? ''
  const markersInAnswer = new Set([...answer.matchAll(/\[(S\d+)\]/gi)].map((match) => match[1].toUpperCase()))
  const citationsByMarker = new Map((observation.citations ?? []).filter((item) => item.marker).map((item) => [String(item.marker).toUpperCase(), item.sourceId]))
  const cited = new Set(observation.citedSourceIds ?? [...markersInAnswer].flatMap((marker) => citationsByMarker.get(marker) ?? []))
  const required = new Set(expected.requiredSourceIds ?? [])
  let recall: number | null = null
  if (required.size > 0) {
    recall = [...required].filter((sourceId) => retrieved.has(sourceId)).length / required.size
    const minimum = expected.minRetrievalRecall ?? 1
    findings.push(finding('rag.retrieval_recall', recall >= minimum ? 'pass' : 'fail',
      recall >= minimum ? `检索召回率 ${round(recall)}` : `检索召回率 ${round(recall)} 低于 ${minimum}`,
      { expected: minimum, actual: round(recall) }))
  }
  if (expected.requireCitations) {
    findings.push(finding('rag.citations_present', cited.size > 0 ? 'pass' : 'fail', cited.size > 0 ? '回答包含来源引用' : '回答缺少来源引用'))
  }
  const unknownMarkers = [...markersInAnswer].filter((marker) => !citationsByMarker.has(marker))
  if (markersInAnswer.size > 0 || observation.citations?.length) {
    findings.push(finding('rag.marker_validity', unknownMarkers.length === 0 ? 'pass' : 'fail',
      unknownMarkers.length === 0 ? '引用标记均可追溯' : `存在无法追溯的引用标记：${unknownMarkers.join(', ')}`,
      { actual: unknownMarkers }))
  }
  let citationPrecision: number | null = null
  if (cited.size > 0) {
    citationPrecision = [...cited].filter((sourceId) => retrieved.has(sourceId)).length / cited.size
    const minimum = expected.minCitationPrecision ?? 1
    findings.push(finding('rag.citation_precision', citationPrecision >= minimum ? 'pass' : 'fail',
      citationPrecision >= minimum ? `引用准确率 ${round(citationPrecision)}` : `引用准确率 ${round(citationPrecision)} 低于 ${minimum}`,
      { expected: minimum, actual: round(citationPrecision) }))
  } else if (!expected.requireCitations) {
    findings.push(finding('rag.citation_precision', 'not_observed', '没有引用可用于计算准确率'))
  }
  if (findings.length === 0) findings.push(finding('rag.evidence', 'not_observed', '未配置 RAG 检查项'))
  return stageResult('rag', startedAt, findings, {
    retrievedSources: retrieved.size,
    citedSources: cited.size,
    retrievalRecall: recall === null ? null : round(recall),
    citationPrecision: citationPrecision === null ? null : round(citationPrecision),
  }, STAGE_THRESHOLDS.rag)
}

function isSubset(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item, index) => isSubset(item, actual[index]))
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false
    return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
      key in (actual as Record<string, unknown>) && isSubset(value, (actual as Record<string, unknown>)[key]))
  }
  return Object.is(expected, actual)
}

function evaluateTools(observation: EvalObservation, expected: ToolExpectations): EvalStageResult {
  const startedAt = Date.now()
  const findings: EvalFinding[] = []
  const actual = observation.toolCalls ?? []
  const expectedCalls = expected.calls ?? []
  const matchedIndexes: number[] = []
  const usedIndexes = new Set<number>()
  for (const call of expectedCalls) {
    const index = actual.findIndex((candidate, candidateIndex) => !usedIndexes.has(candidateIndex) && candidate.name === call.name &&
      (call.argsSubset === undefined || isSubset(call.argsSubset, candidate.args)))
    if (index >= 0) { matchedIndexes.push(index); usedIndexes.add(index) }
    if (call.required !== false) {
      findings.push(finding('tools.required_call', index >= 0 ? 'pass' : 'fail',
        index >= 0 ? `已调用必需工具 ${call.name}` : `缺少必需工具调用 ${call.name}`,
        { expected: call }))
    }
  }
  if (expected.enforceOrder && matchedIndexes.length > 1) {
    const ordered = matchedIndexes.every((value, index) => index === 0 || value > matchedIndexes[index - 1])
    findings.push(finding('tools.call_order', ordered ? 'pass' : 'fail', ordered ? '工具调用顺序符合预期' : '工具调用顺序与预期不符'))
  }
  const forbidden = new Set(expected.forbiddenToolNames ?? [])
  for (const call of actual.filter((item) => forbidden.has(item.name))) {
    findings.push(finding('tools.forbidden_call', 'fail', `调用了禁止工具 ${call.name}`, { actual: call.name }))
  }
  const allowed = new Set(expected.allowedToolNames ?? expectedCalls.map((item) => item.name))
  if (expected.allowUnexpected === false && allowed.size > 0) {
    const unexpected = actual.filter((call) => !allowed.has(call.name)).map((call) => call.name)
    findings.push(finding('tools.unexpected_calls', unexpected.length === 0 ? 'pass' : 'fail',
      unexpected.length === 0 ? '未发现意外工具调用' : `存在意外工具调用：${unexpected.join(', ')}`, { actual: unexpected }))
  }
  if (expected.requireSuccess) {
    const failed = actual.filter((call) => call.status === 'error')
    findings.push(finding('tools.execution_success', failed.length === 0 ? 'pass' : 'fail',
      failed.length === 0 ? '工具调用均成功' : `${failed.length} 次工具调用失败`, { actual: failed.map((call) => call.name) }))
  }
  if (expected.maxCalls !== undefined) {
    findings.push(finding('tools.call_budget', actual.length <= expected.maxCalls ? 'pass' : 'fail',
      actual.length <= expected.maxCalls ? '工具调用次数在预算内' : `工具调用次数 ${actual.length} 超过 ${expected.maxCalls}`,
      { expected: expected.maxCalls, actual: actual.length }))
  }
  if (findings.length === 0) findings.push(finding('tools.trace', 'not_observed', '未配置工具调用检查项'))
  return stageResult('tools', startedAt, findings, {
    callCount: actual.length,
    failedCalls: actual.filter((call) => call.status === 'error').length,
    uniqueTools: new Set(actual.map((call) => call.name)).size,
  }, STAGE_THRESHOLDS.tools)
}

function turnsOverlap(left: NonNullable<EvalObservation['agentTurns']>[number], right: NonNullable<EvalObservation['agentTurns']>[number]): boolean {
  if (!left.startedAt || !left.finishedAt || !right.startedAt || !right.finishedAt) return false
  const a0 = Date.parse(left.startedAt); const a1 = Date.parse(left.finishedAt)
  const b0 = Date.parse(right.startedAt); const b1 = Date.parse(right.finishedAt)
  return [a0, a1, b0, b1].every(Number.isFinite) && a0 < b1 && b0 < a1
}

function evaluateCollaboration(observation: EvalObservation, expected: CollaborationExpectations): EvalStageResult {
  const startedAt = Date.now()
  const findings: EvalFinding[] = []
  const turns = observation.agentTurns ?? []
  const agents = new Set(turns.map((turn) => turn.agentId))
  const failed = turns.filter((turn) => turn.status === 'failed' || turn.error)
  const handoffs = turns.filter((turn) => turn.handoffTo)
  for (const agentId of expected.requiredAgentIds ?? []) {
    findings.push(finding('collaboration.required_agent', agents.has(agentId) ? 'pass' : 'fail',
      agents.has(agentId) ? `Agent ${agentId} 已参与` : `缺少必需 Agent ${agentId}`, { expected: agentId }))
  }
  if (expected.minAgents !== undefined) {
    findings.push(finding('collaboration.agent_count', agents.size >= expected.minAgents ? 'pass' : 'fail',
      agents.size >= expected.minAgents ? `${agents.size} 个 Agent 参与协作` : `仅 ${agents.size} 个 Agent 参与，少于 ${expected.minAgents}`,
      { expected: expected.minAgents, actual: agents.size }))
  }
  if (expected.maxHandoffs !== undefined) {
    findings.push(finding('collaboration.handoff_budget', handoffs.length <= expected.maxHandoffs ? 'pass' : 'fail',
      handoffs.length <= expected.maxHandoffs ? '交接次数在预算内' : `交接次数 ${handoffs.length} 超过 ${expected.maxHandoffs}`,
      { expected: expected.maxHandoffs, actual: handoffs.length }))
  }
  if (expected.maxFailedAgents !== undefined) {
    findings.push(finding('collaboration.failed_agents', failed.length <= expected.maxFailedAgents ? 'pass' : 'fail',
      failed.length <= expected.maxFailedAgents ? '失败 Agent 数量在阈值内' : `${failed.length} 个 Agent 失败`,
      { expected: expected.maxFailedAgents, actual: failed.length }))
  }
  if (expected.requireAllCompleted) {
    const incomplete = turns.filter((turn) => turn.status !== 'completed')
    findings.push(finding('collaboration.all_completed', turns.length > 0 && incomplete.length === 0 ? 'pass' : 'fail',
      turns.length > 0 && incomplete.length === 0 ? '所有协作任务均已完成' : `${incomplete.length || turns.length} 个协作任务未完成`,
      { actual: incomplete.map((turn) => ({ agentId: turn.agentId, status: turn.status })) }))
  }
  let parallelPairs = 0
  for (let left = 0; left < turns.length; left += 1) {
    for (let right = left + 1; right < turns.length; right += 1) {
      if (turns[left].agentId !== turns[right].agentId && turnsOverlap(turns[left], turns[right])) parallelPairs += 1
    }
  }
  if (expected.requireParallelism) {
    findings.push(finding('collaboration.parallelism', parallelPairs > 0 ? 'pass' : 'fail',
      parallelPairs > 0 ? '观测到并行 Agent 执行' : '未观测到并行 Agent 执行'))
  }
  if (findings.length === 0) findings.push(finding('collaboration.trace', 'not_observed', '未配置多 Agent 协作检查项'))
  return stageResult('collaboration', startedAt, findings, {
    agentCount: agents.size,
    handoffCount: handoffs.length,
    failedAgents: failed.length,
    parallelPairs,
  }, STAGE_THRESHOLDS.collaboration)
}

function requiredStageFailure(stage: EvalStageResult, required: boolean): EvalStageResult {
  if (!required || stage.status !== 'skipped') return stage
  const findings = [...stage.findings, finding('coverage.required_stage', 'fail', `必需阶段 ${stage.stage} 缺少可评测证据`)]
  return stageResult(stage.stage, Date.now(), findings, stage.metrics, STAGE_THRESHOLDS[stage.stage as keyof typeof STAGE_THRESHOLDS])
}

export function evaluateCase(input: EvalCaseInput, observation: EvalObservation, runThreshold = DEFAULT_PASS_THRESHOLD): EvalCaseReport {
  const ingestStartedAt = Date.now()
  const ingestFindings = [
    finding('ingest.observation', 'pass', input.sourceAgentRunId ? `已载入 Agent OS 运行 ${input.sourceAgentRunId}` : '已载入内联观测数据'),
    finding('ingest.expectations', 'pass', '评测期望已校验'),
  ]
  const stages: EvalStageResult[] = [stageResult('ingest', ingestStartedAt, ingestFindings, {}, 1)]
  const required = new Set(input.expectations.requiredStages ?? [])
  const dimensionResults: EvalStageResult[] = []
  if (input.expectations.answer || required.has('answer')) {
    dimensionResults.push(evaluateAnswer(observation, input.expectations.answer ?? {}))
  } else {
    dimensionResults.push(stageResult('answer', Date.now(), [finding('answer.configured', 'not_observed', '此用例未配置回答评测')]))
  }
  if (input.expectations.rag || required.has('rag')) {
    dimensionResults.push(evaluateRag(observation, input.expectations.rag ?? {}))
  } else {
    dimensionResults.push(stageResult('rag', Date.now(), [finding('rag.configured', 'not_observed', '此用例未配置 RAG 评测')]))
  }
  if (input.expectations.tools || required.has('tools')) {
    dimensionResults.push(evaluateTools(observation, input.expectations.tools ?? {}))
  } else {
    dimensionResults.push(stageResult('tools', Date.now(), [finding('tools.configured', 'not_observed', '此用例未配置工具评测')]))
  }
  if (input.expectations.collaboration || required.has('collaboration')) {
    dimensionResults.push(evaluateCollaboration(observation, input.expectations.collaboration ?? {}))
  } else {
    dimensionResults.push(stageResult('collaboration', Date.now(), [finding('collaboration.configured', 'not_observed', '此用例未配置协作评测')]))
  }
  const gated = dimensionResults.map((stage) => requiredStageFailure(stage, required.has(stage.stage as never)))
  stages.push(...gated)
  const weights = { ...DEFAULT_WEIGHTS, ...(input.expectations.weights ?? {}) }
  const observed = gated.filter((stage) => stage.score !== null)
  const weightSum = observed.reduce((sum, stage) => sum + Math.max(0, weights[stage.stage as keyof typeof weights] ?? 0), 0)
  const score = weightSum > 0
    ? round(observed.reduce((sum, stage) => sum + (stage.score ?? 0) * Math.max(0, weights[stage.stage as keyof typeof weights] ?? 0), 0) / weightSum)
    : 0
  const threshold = input.expectations.passThreshold ?? runThreshold
  const hardFailure = gated.some((stage) => stage.status === 'fail' || stage.status === 'error')
  const status = hardFailure || score < threshold ? 'fail' : 'pass'
  const failures = gated.flatMap((stage) => stage.findings.filter((item) => item.status === 'fail').map((item) => item.message))
  stages.push(stageResult('aggregate', Date.now(), [finding('aggregate.threshold', status === 'pass' ? 'pass' : 'fail',
    status === 'pass' ? `综合分 ${score} 达到阈值 ${threshold}` : `综合分 ${score} 未通过阈值 ${threshold} 或存在阶段门控失败`,
    { expected: threshold, actual: score })], { score, threshold }, 1))
  return {
    caseId: input.caseId,
    name: input.name?.trim() || input.caseId,
    sourceAgentRunId: input.sourceAgentRunId ?? null,
    status,
    score,
    observation,
    expectations: input.expectations,
    stages,
    failureReasons: failures,
  }
}

export function evaluateRun(input: EvalRunInput, observations: Map<string, EvalObservation>): EvalRunReport {
  const passThreshold = clamp01(input.passThreshold ?? DEFAULT_PASS_THRESHOLD)
  const cases = input.cases.map((item) => evaluateCase(item, observations.get(item.caseId) ?? item.observation ?? {}, passThreshold))
  const score = round(cases.reduce((sum, item) => sum + item.score, 0) / cases.length)
  const stageScores = Object.fromEntries((['answer', 'rag', 'tools', 'collaboration'] as const).map((stage) => {
    const values = cases.flatMap((item) => item.stages.filter((candidate) => candidate.stage === stage && candidate.score !== null).map((candidate) => candidate.score as number))
    return [stage, values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null]
  })) as EvalRunReport['summary']['stageScores']
  const failedCases = cases.filter((item) => item.status === 'fail').length
  const errorCases = cases.filter((item) => item.status === 'error').length
  return {
    schemaVersion: EVAL_SCHEMA_VERSION,
    suiteKey: input.suiteKey,
    suiteName: input.suiteName?.trim() || input.suiteKey,
    version: input.version,
    baselineRunId: input.baselineRunId ?? null,
    status: failedCases > 0 || errorCases > 0 || score < passThreshold ? 'fail' : 'pass',
    score,
    passThreshold,
    summary: {
      caseCount: cases.length,
      passedCases: cases.filter((item) => item.status === 'pass').length,
      failedCases,
      errorCases,
      stageScores,
    },
    cases,
  }
}
