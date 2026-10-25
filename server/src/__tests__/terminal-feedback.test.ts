import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunIdentity, RunState, TerminalFeedback } from '@lyyzka/lingxios'
import { terminalFailure, terminalFeedbackText, terminalFeedbackScope } from '../agent-runtime/terminal-feedback.js'

const identity: RunIdentity = { tenantId: 'synthetic-company', agentId: 'synthetic-agent', sessionId: 'synthetic-session', principalId: 'synthetic-human', runId: 'synthetic-root' }
const feedback: TerminalFeedback = { id: 'synthetic-terminal', rootWorkId: identity.runId, requestVersion: 2, status: 'failed', reason: 'execution_failed',
  failedCount: 1, cancelledCount: 0, notStartedCount: 0, notStartedAgentIds: [], createdAt: '2026-10-24T00:00:00Z', suppressAgentWake: true }
const state = (status: RunState['run']['status'] = 'failed'): RunState => ({
  run: { id: identity.runId, requestVersion: 2, fence: 3, status, resultId: null, resultFence: null, kind: 'turn', attempts: 1,
    createdAt: '', availableAt: '', heartbeatAt: null, lastProgressAt: null, goalOutcome: null, error: 'PRIVATE_EXCEPTION' }, message: null, delivery: null,
})
const delivered = (): RunState => ({ ...state('succeeded'), run: { ...state('succeeded').run, resultId: 'synthetic-result', resultFence: 3 }, delivery: 'delivered',
  message: { version: 2, runId: identity.runId, agentId: identity.agentId, sessionId: identity.sessionId, body: 'An already delivered answer.',
    envelope: { version: 1, requestVersion: 2, body: 'An already delivered answer.', evidenceSnapshotId: 'synthetic-evidence', citations: [], artifacts: [],
      goalOutcome: { status: 'partial', verification: 'inconclusive', requestVersion: 2, gaps: ['remaining work'] } } } })

test('root delivery and failed successors have separate scope without negating an existing answer', () => {
  const text = terminalFeedbackText({ ...feedback, notStartedCount: 2, cancelledCount: 1 }, delivered(), null, ['明理'])
  assert.match(text, /已有答复已发送/)
  assert.match(text, /后续有 1 项协作失败/)
  assert.match(text, /后续有 1 项协作已取消/)
  assert.match(text, /2 项协作未启动（明理）/)
  assert.doesNotMatch(text, /整项任务未完成|这次任务未能完成|PRIVATE_|synthetic-/)
})

test('only the matching delivered result permits an already-sent claim', () => {
  for (const value of [
    { ...delivered(), delivery: 'pending' as const },
    { ...delivered(), run: { ...delivered().run, resultFence: 2 } },
    { ...delivered(), run: { ...delivered().run, requestVersion: 1 } },
    { ...delivered(), message: null },
    { ...delivered(), message: { ...delivered().message!, runId: 'another-root' } },
    { ...delivered(), run: { ...delivered().run, status: 'failed' as const } },
  ]) assert.doesNotMatch(terminalFeedbackText(feedback, value, null), /已有答复已发送/)
})

test('terminal scope follows current result and accepted receipt evidence, never visible text', () => {
  assert.equal(terminalFeedbackScope(feedback, state()), 'response')
  assert.equal(terminalFeedbackScope(feedback, delivered()), 'follow_up')
  const failedDelivery = { ...delivered(), delivery: 'failed' as const }
  assert.equal(terminalFeedbackScope(feedback, failedDelivery), 'delivery')
  assert.equal(terminalFeedbackScope(feedback, failedDelivery, 'accepted-message'), 'finalization')
  assert.equal(terminalFeedbackScope(feedback, { ...delivered(), delivery: 'pending' }), 'unknown')
  assert.equal(terminalFeedbackScope(feedback, { ...delivered(), delivery: 'pending' }, 'accepted-message'), 'finalization')
  for (const value of [
    { ...failedDelivery, run: { ...failedDelivery.run, resultFence: 2 } },
    { ...failedDelivery, run: { ...failedDelivery.run, requestVersion: 1 } },
    { ...failedDelivery, message: { ...failedDelivery.message!, runId: 'another-root' } },
    { ...failedDelivery, run: { ...failedDelivery.run, status: 'failed' as const } },
  ]) assert.equal(terminalFeedbackScope(feedback, value, 'accepted-message'), 'unknown')
  const unfinished = { ...delivered(), run: { ...state().run }, delivery: null }
  assert.equal(terminalFeedbackScope(feedback, unfinished), 'response', 'visible body cannot prove delivery')
})

test('delivery and accepted finalization failures preserve their scope and do not blame answer generation', () => {
  const failedDelivery = { ...delivered(), delivery: 'failed' as const }
  const deliveryText = terminalFeedbackText(feedback, failedDelivery, 'protocol')
  assert.match(deliveryText, /答复已生成.*发送未能确认/)
  assert.doesNotMatch(deliveryText, /已有答复已发送|答复格式有误|当前答复未能完成|发送新消息/)
  const finalizationText = terminalFeedbackText(feedback, failedDelivery, null, [], 'finalization')
  assert.match(finalizationText, /答复已发送.*收尾未能完成/)
  assert.doesNotMatch(finalizationText, /后续协作未全部完成|发送新消息/)
})

test('a delivered root retains the actual follow-up stop reason and not-started count', () => {
  const text = terminalFeedbackText({ ...feedback, reason: 'budget_limit', failedCount: 0, notStartedCount: 2 }, delivered(), null)
  assert.match(text, /已有答复已发送/)
  assert.match(text, /本轮预算已达上限/)
  assert.match(text, /2 项协作未启动/)
  assert.doesNotMatch(text, /当前答复未能完成|这次任务未能完成/)
})

test('protocol, timeout and ordinary provider failures keep distinct safe wording', () => {
  assert.match(terminalFeedbackText(feedback, state(), 'protocol'), /答复格式有误/)
  assert.doesNotMatch(terminalFeedbackText(feedback, state(), 'protocol'), /服务.*不可用|PRIVATE_/)
  assert.match(terminalFeedbackText({ ...feedback, reason: 'model_unavailable' }, state(), 'timeout'), /响应超时/)
  assert.match(terminalFeedbackText({ ...feedback, reason: 'model_unavailable' }, state(), null), /模型服务暂时不可用/)
  assert.match(terminalFeedbackText({ ...feedback, reason: 'cancelled', status: 'cancelled', failedCount: 0, cancelledCount: 1 }, state('cancelled'), null), /执行已取消/)
})

test('structured terminal failure belongs to the current request and fence; raw text is never classification', async () => {
  const event = (requestVersion: number, fence: number, diagnostics?: object) => ({ runId: identity.runId, seq: 1, kind: 'run.failed', stage: 'failed' as const, visibility: 'user' as const,
    data: { error: 'PRIVATE_MODEL_ERROR', _executionTrace: { requestVersion, fence }, ...(diagnostics ? { modelDiagnostics: diagnostics } : {}) } })
  for (const [events, expected] of [
    [[event(2, 3, { kind: 'protocol', category: 'protocol', finishReasons: [] })], 'protocol'],
    [[event(2, 3, { kind: 'provider', category: 'timeout', finishReasons: [] })], 'timeout'],
    [[event(1, 3, { kind: 'protocol' }), event(2, 2, { kind: 'protocol' })], null],
    [[event(2, 3)], null],
  ] as const) {
    assert.equal(await terminalFailure({ readEvents: async () => ({ events: [...events], nextSeq: 1 }) }, identity, state(), { signal: new AbortController().signal }), expected)
  }
})

test('diagnostic pagination is bounded and the same callback operation is propagated', async () => {
  const operation = { signal: new AbortController().signal }, calls: number[] = []
  const api = { readEvents: async (_identity: RunIdentity, after = 0, passed?: typeof operation) => {
    assert.equal(passed, operation); calls.push(after)
    return { events: Array.from({ length: 100 }, (_, index) => ({ runId: identity.runId, seq: after + index + 1, kind: 'public.text.delta', stage: 'delta' as const, visibility: 'user' as const, data: {} })), nextSeq: after + 100 }
  } }
  assert.equal(await terminalFailure(api, identity, state(), operation), null)
  assert.deepEqual(calls, [0, 100, 200, 300])
  calls.length = 0
  assert.equal(await terminalFailure(api, identity, delivered(), operation), null)
  assert.equal(calls.length, 0, 'a successful root cannot inherit a child protocol error')
})
