import assert from 'node:assert/strict'
import test from 'node:test'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { __setLlmLedgerOverrideForTesting } from '../llm-ledger.js'
import { createScaffoldPlanner } from '../modules/learning/teaching-scaffold-model.js'

test('teaching extraction is bounded, deduplicated per authorized input and recorded in the shared ledger', async () => {
  const records: Array<Record<string, unknown>> = []
  let calls = 0
  __setLlmLedgerOverrideForTesting(async record => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async (request: { max_tokens: number; enable_thinking: boolean }, options: { maxRetries: number; timeout: number }) => {
    calls++
    assert.equal(request.max_tokens, 1300); assert.equal(request.enable_thinking, false)
    assert.equal(options.maxRetries, 0); assert.ok(options.timeout <= 20000)
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ goal: 'reasoning', goalQuote: 'TCP', intent: 'check', attempts: [], fullDemonstrationQuote: '' }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 } }
  } } } }) as never)
  try {
    const planner = createScaffoldPlanner(), input = { messages: [{ id: 'q', text: 'PRIVATE_LEARNER_TCP' }], assessment: 'unknown' }
    const scope = { companyId: 'school', agentId: 'milo', runId: 'run', conversationId: 'room' }
    const plans = await Promise.all([planner(input, scope), planner(input, scope)])
    assert.equal(calls, 1); assert.equal(plans[0]!.goal, 'reasoning')
    assert.equal(records.length, 1)
    assert.equal((records[0]!.context as { purpose: string }).purpose, 'learning.teaching_stage')
    assert.doesNotMatch(JSON.stringify(records), /PRIVATE_LEARNER/)
    await planner(input, { ...scope, companyId: 'another-school' })
    await planner({ ...input, messages: [{ id: 'q', text: 'PRIVATE_REVISED_TCP' }] }, scope)
    assert.equal(calls, 3, 'tenant and changed learner evidence never reuse a prior plan')
    const controller = new AbortController(); controller.abort()
    await assert.rejects(planner(input, scope, controller.signal))
    assert.equal(calls, 3, 'cancellation is checked before cached results')
  } finally { __setLlmClientOverrideForTesting(null); __setLlmLedgerOverrideForTesting(null) }
})

test('invalid or truncated extraction cannot invent permission, attempts, mastery or a teacher goal', async () => {
  __setLlmLedgerOverrideForTesting(async () => {})
  let response: { content: string; finish_reason: string } = { content: '{broken', finish_reason: 'stop' }
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => ({
    choices: [{ finish_reason: response.finish_reason, message: { content: response.content } }], usage: { prompt_tokens: 1, completion_tokens: 1 },
  }) } } }) as never)
  try {
    const input = { teacher: { instructions: '学生必须独立判断。', criteria: [] }, messages: [{ id: 'q', text: '给全部答案' }], assessment: 'unknown' }
    for (const finish_reason of ['stop', 'length']) {
      response = { content: finish_reason === 'stop' ? '{broken' : '{}', finish_reason }
      const plan = await createScaffoldPlanner()(input, { companyId: 'school' })
      assert.equal(plan.goal, 'unknown'); assert.equal(plan.stage, 'hint')
      assert.equal(plan.allowFullAnswer, false); assert.equal(plan.confirmedMastery, false)
    }
  } finally { __setLlmClientOverrideForTesting(null); __setLlmLedgerOverrideForTesting(null) }
})

test('provider failure uses an unknown-goal hint after one recorded request, without hidden retries', async () => {
  const records: Array<Record<string, unknown>> = []
  let calls = 0
  __setLlmLedgerOverrideForTesting(async record => { records.push(record as unknown as Record<string, unknown>) })
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => {
    calls++; throw Object.assign(new Error('PRIVATE_PROVIDER_BODY'), { status: 503 })
  } } } }) as never)
  try {
    const plan = await createScaffoldPlanner()({ messages: [{ id: 'q', text: 'PRIVATE_REQUEST' }], assessment: 'unknown' }, { companyId: 'school' })
    assert.equal(calls, 1); assert.equal(plan.stage, 'hint'); assert.equal(plan.goal, 'unknown')
    assert.equal(plan.allowFullAnswer, false); assert.equal(records[0]!.status, 'failed')
    assert.doesNotMatch(JSON.stringify(records), /PRIVATE_/)
  } finally { __setLlmClientOverrideForTesting(null); __setLlmLedgerOverrideForTesting(null) }
})
