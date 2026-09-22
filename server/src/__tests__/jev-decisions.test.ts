import assert from 'node:assert/strict'
import test from 'node:test'
import type { DecisionDriver, RequestSnapshot, TurnContext } from '@lyyzka/lingxios'
import { createProductDecisionContext, decisionReadObservations, productDecisionOptions, productDecisionRequest } from '../agent-runtime/decisions.js'

const frozen = { originalText: 'original', revisions: [{ text: 'new requirement', author: { kind: 'human' } }] } as RequestSnapshot
const context = () => ({ work: { id: 'work', tenantId: 'tenant', principalId: 'human', fence: 1 }, messages: [], capabilities: ['email'],
  grants: [{ name: 'email', methods: ['show'] }], evidence: [{ marker: 'S1', excerpt: 'first' }, { marker: 'S2', excerpt: 'second' }],
  dynamic: { learningContext: { knowledgeUnits: [{ successCriteria: 'goal' }] }, canvas: { status: 'active' } },
  executionSteps: [1, 2].map(requestVersion => ({ kind: 'ipython', requestVersion, output: JSON.stringify({ receipts: [
    { action: 'email.show', result: { ok: true, value: { body: 'observed' } } },
    { action: 'email.inbox', result: { ok: true, value: 'method not granted' } },
    { action: 'email.send', result: { ok: true, value: 'never include writes' } },
  ] }) })),
}) as unknown as TurnContext

test('product decisions only classify authorized current reads and use frozen revisions', () => {
  const input = context(), request = productDecisionRequest(input, frozen)
  assert.deepEqual(decisionReadObservations(input, frozen), [{ action: 'email.show', value: { body: 'observed' } }])
  assert.match(request.state.query, /new requirement/)
  assert.ok(request.questions.email_0 && request.questions.evidence_kind && request.questions.canvas_gap)
  assert.equal(productDecisionOptions({}), undefined)
  assert.equal(productDecisionOptions({ TYPESAFE_API_KEY: 'fixture' })?.mode, 'active')
  assert.throws(() => productDecisionOptions({ TYPESAFE_API_KEY: 'fixture', JEV_MODE: 'invalid' }))
})

test('advice reorders copies, cache is scoped to tenant and revisions; shadow never changes output', async () => {
  let calls = 0
  const driver: DecisionDriver = { modelId: 'jev-1.13.0', configurationFingerprint: 'config', inputCostMicrosPerMillion: 42000,
    mode: () => 'active', async decide() { calls++; return { model: 'jev-1.13.0', usage: { available: true, inputTokens: 1, outputTokens: 1 }, answers: {
      evidence_0: { type: 'score', score: 0, confidence: 1, probabilities: {}, legend: {} }, evidence_1: { type: 'score', score: 2, confidence: 1, probabilities: {}, legend: {} },
    } } } }
  const hook = createProductDecisionContext(), input = context(), signal = new AbortController().signal, evidence = input.evidence
  await hook(input, driver, signal, frozen)
  assert.deepEqual(input.evidence?.map(item => item.marker), ['S2', 'S1'])
  assert.deepEqual(evidence?.map(item => item.marker), ['S1', 'S2'])
  await hook(context(), driver, signal, frozen); assert.equal(calls, 1)
  const different = context(); different.work.tenantId = 'other'
  await hook(different, driver, signal, frozen); assert.equal(calls, 2)
  await hook(context(), driver, signal, { ...frozen, revisions: [] }); assert.equal(calls, 3)
  const shadow = context(), before = structuredClone(shadow)
  await hook(shadow, { ...driver, configurationFingerprint: 'shadow-failure', mode: () => 'shadow', decide: async () => { throw new Error('jev_connection_failed') } }, signal, frozen)
  assert.deepEqual(shadow, before)
})
