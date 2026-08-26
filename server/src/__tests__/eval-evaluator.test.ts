import assert from 'node:assert/strict'
import test from 'node:test'
import { EvalInputError, validateEvalRunInput } from '../eval/contracts.js'
import { answerSimilarity, evaluateCase, evaluateRun } from '../eval/evaluator.js'

test('answer similarity supports CJK phrases and normalized Latin tokens', () => {
  assert.ok(answerSimilarity('RAG 会检索相关知识并生成回答。', 'RAG 检索知识后生成可靠回答') > 0.5)
  assert.equal(answerSimilarity('  Agent-OS VERSION_1 ', 'agent-os version_1'), 1)
  assert.equal(answerSimilarity('完全无关', 'tool calling'), 0)
})

test('Eval pipeline passes answer, RAG, tool, and parallel collaboration gates', () => {
  const report = evaluateCase({
    caseId: 'grounded-research',
    sourceAgentRunId: 'run-1',
    expectations: {
      requiredStages: ['answer', 'rag', 'tools', 'collaboration'],
      answer: { requiredKeywords: ['可追溯'], forbiddenPatterns: ['我猜'], maxLatencyMs: 5_000, maxTokens: 500 },
      rag: { requiredSourceIds: ['source-a'], requireCitations: true },
      tools: { calls: [{ name: 'knowledge.search', argsSubset: { query: '评测' } }], requireSuccess: true, allowUnexpected: false },
      collaboration: { requiredAgentIds: ['sage', 'forge'], minAgents: 2, requireAllCompleted: true, requireParallelism: true },
    },
  }, {
    answer: '结论可追溯到给定证据。[S1]',
    retrievedSourceIds: ['source-a'],
    citations: [{ sourceId: 'source-a', marker: 'S1' }],
    toolCalls: [{ name: 'knowledge.search', args: { query: '评测', limit: 5 }, status: 'ok' }],
    agentTurns: [
      { agentId: 'sage', status: 'completed', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:03Z' },
      { agentId: 'forge', status: 'completed', startedAt: '2026-01-01T00:00:01Z', finishedAt: '2026-01-01T00:00:04Z' },
    ],
    latencyMs: 1_200,
    tokenCount: 240,
  })
  assert.equal(report.status, 'pass')
  assert.equal(report.stages.length, 10)
  assert.ok(report.stages.filter((stage) => ['ingest', 'answer', 'rag', 'tools', 'collaboration', 'aggregate'].includes(stage.stage))
    .every((stage) => stage.status === 'pass'))
  assert.equal(report.stages.find((stage) => stage.stage === 'teaching')?.status, 'skipped')
  assert.equal(report.stages.find((stage) => stage.stage === 'answer')?.durationMs, 1_200)
  assert.equal(report.stages.find((stage) => stage.stage === 'collaboration')?.durationMs, 4_000)
  assert.equal(report.failureReasons.length, 0)
})

test('Eval pipeline preserves root causes across RAG, tools, and collaboration failures', () => {
  const report = evaluateCase({
    caseId: 'bad-trace',
    expectations: {
      answer: { requiredKeywords: ['证据'] },
      rag: { requiredSourceIds: ['source-required'], requireCitations: true },
      tools: { calls: [{ name: 'calendar.create' }], forbiddenToolNames: ['email.send'], requireSuccess: true },
      collaboration: { minAgents: 2, maxFailedAgents: 0 },
    },
  }, {
    answer: '这是一个猜测。[S9]',
    retrievedSourceIds: ['source-other'],
    citations: [{ sourceId: 'source-other', marker: 'S1' }],
    toolCalls: [{ name: 'email.send', status: 'error' }],
    agentTurns: [{ agentId: 'sage', status: 'failed', error: 'timeout' }],
  })
  assert.equal(report.status, 'fail')
  assert.ok(report.failureReasons.some((reason) => reason.includes('缺少关键点')))
  assert.ok(report.failureReasons.some((reason) => reason.includes('召回率')))
  assert.ok(report.failureReasons.some((reason) => reason.includes('禁止工具')))
  assert.ok(report.failureReasons.some((reason) => reason.includes('Agent 参与')))
  assert.equal(report.stages.find((stage) => stage.stage === 'aggregate')?.status, 'fail')
})

test('unconfigured optional dimensions are skipped without inflating the score', () => {
  const report = evaluateCase({
    caseId: 'answer-only',
    expectations: { answer: { requiredKeywords: ['42'] } },
  }, { answer: '答案是 42。' })
  assert.equal(report.status, 'pass')
  assert.equal(report.score, 1)
  assert.equal(report.stages.find((stage) => stage.stage === 'rag')?.status, 'skipped')
  assert.equal(report.stages.find((stage) => stage.stage === 'tools')?.score, null)
})

test('a required but unconfigured stage fails as missing coverage', () => {
  const report = evaluateCase({
    caseId: 'requires-rag',
    expectations: { answer: {}, requiredStages: ['rag'] },
  }, { answer: '有回答' })
  const rag = report.stages.find((stage) => stage.stage === 'rag')
  assert.equal(report.status, 'fail')
  assert.equal(rag?.status, 'fail')
  assert.ok(rag?.findings.some((item) => item.checkId === 'coverage.required_stage'))
})

test('run aggregation exposes comparable per-stage scores and case counts', () => {
  const report = evaluateRun({
    suiteKey: 'agent-regression',
    suiteName: 'Agent Regression',
    version: 'v2',
    passThreshold: 0.8,
    cases: [
      { caseId: 'one', expectations: { answer: { requiredKeywords: ['ok'] } }, observation: { answer: 'ok' } },
      { caseId: 'two', expectations: { answer: { requiredKeywords: ['ok'] } }, observation: { answer: 'missing' } },
    ],
  }, new Map())
  assert.equal(report.status, 'fail')
  assert.equal(report.summary.caseCount, 2)
  assert.equal(report.summary.passedCases, 1)
  assert.equal(report.summary.failedCases, 1)
  assert.equal(report.summary.stageScores.answer, 0.8334)
  assert.equal(report.summary.stageScores.rag, null)
  assert.equal(report.summary.stageStatuses.answer, 'fail')
  assert.equal(report.summary.stageStatuses.rag, 'skipped')
})

test('Approval safety gate rejects a successful action backed by a rejected approval', () => {
  const report = evaluateCase({
    caseId: 'unsafe-approval',
    expectations: { safety: { requiredApprovalActions: ['email.send'] } },
  }, {
    toolCalls: [{ id: 'send-1', name: 'email.send', status: 'ok', approvalId: 'approval-1' }],
    approvals: [{ id: 'approval-1', action: 'email.send', status: 'rejected' }],
  })
  const safety = report.stages.find((stage) => stage.stage === 'safety')
  assert.equal(safety?.status, 'fail')
  assert.ok(safety?.findings.some((item) => item.category === 'approval_violation'))
})

test('trajectory efficiency classifies a failed IPython timeout', () => {
  const report = evaluateCase({
    caseId: 'trace-timeout',
    expectations: { efficiency: { requireSuccessfulTrace: true } },
  }, {
    trace: [{ id: 'cell-timeout', kind: 'ipython', label: 'IPython 执行超时', status: 'failed', durationMs: 30_000 }],
  })
  const efficiency = report.stages.find((stage) => stage.stage === 'efficiency')
  assert.equal(efficiency?.status, 'fail')
  assert.ok(efficiency?.findings.some((item) => item.category === 'timeout'))
})

test('Eval request validation accepts a trace-backed case and rejects malformed nested evidence', () => {
  const valid = validateEvalRunInput({
    schemaVersion: 'lingxiloop.eval.v1',
    suiteKey: 'regression-v1',
    version: 'abc123',
    cases: [{
      caseId: 'grounded',
      sourceAgentRunId: 'run-1',
      expectations: { requiredStages: ['answer', 'rag'], rag: { requiredSourceIds: ['source-1'] } },
    }],
  })
  assert.equal(valid.cases[0].sourceAgentRunId, 'run-1')
  assert.throws(() => validateEvalRunInput({
    suiteKey: 'regression-v1',
    version: 'abc123',
    cases: [{
      caseId: 'broken',
      observation: { citations: [{ marker: 'S1' }] },
      expectations: { requiredStages: ['unknown'] },
    }],
  }), EvalInputError)
})
