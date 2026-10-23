import assert from 'node:assert/strict'
import { test } from 'node:test'
import { skillIndex, type SkillActivation, type ToolDefinition } from '@lyyzka/lingxios'
import { createProductHarness } from '../agent-runtime/harness.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { selectVisualizeWorkflowReview, visualizeWorkflowReviewPolicy, type VisualizeWorkflowReviewContext } from '../agent-runtime/visualize-workflow-review.js'

// Failure model recorded first: docs/evidence/issue-342-selective/FAILURE-MODEL.md.
const tools: ToolDefinition[] = [...visualizeSkill.actions, 'skills.load', 'skills.activate'].map(action => ({ action,
  name: action.replace('.', '__'), description: 'Synthetic authorized tool.', effect: 'read', approval: false,
  parameters: { type: 'object', properties: {}, additionalProperties: false }, parse: () => ({}), authorize: async () => {}, execute: async () => ({ ok: true }) }))
function context(selected = true): VisualizeWorkflowReviewContext {
  const { name, version, hash } = skillIndex(visualizeSkill)
  return { work: { id: 'review-fixture', tenantId: 'tenant', principalId: 'human', agentId: 'agent', sessionId: 'session',
    triggerRef: 'source', kind: 'turn', lane: 'interactive', fence: 1, homeEpoch: 1 },
    availableSkills: [skillIndex(visualizeSkill)], availableActions: tools.map(tool => tool.action),
    requestVersion: 1, skillActivations: [], signal: AbortSignal.timeout(5000),
    executionSteps: selected ? [{ id: 'select', kind: 'skills__load', requestVersion: 1,
      input: { arguments: JSON.stringify({ name, version, hash }) }, output: '{}', artifacts: [] }] : [] }
}
const activation = (): SkillActivation => ({ id: 'native-activation', tenantId: 'tenant', runId: 'review-fixture', requestVersion: 1,
  skill: { name: visualizeSkill.name, version: visualizeSkill.version, hash: skillIndex(visualizeSkill).hash }, checker: 'product:visualize-delivery' })

test('only an exact current registered loaded visualization nominates a trusted narrow review', () => {
  assert.equal(selectVisualizeWorkflowReview(context(false)), undefined)
  const selected = selectVisualizeWorkflowReview(context())
  assert.deepEqual(selected, visualizeWorkflowReviewPolicy)
  assert.match(selected!.rubric, /current.*human request/i)
  assert.match(selected!.rubric, /creation|create/i)
  assert.match(selected!.rubric, /read.only|documentation/i)
  assert.match(selected!.rubric, /promise.*(?:deliver|result)|(?:deliver|result).*promise/i)
  assert.equal(selectVisualizeWorkflowReview({ ...context(), skillActivations: [activation()] }), undefined, 'native activation uses deterministic delivery checks')
  assert.equal(selectVisualizeWorkflowReview({ ...context(), availableSkills: [], skillActivations: [activation()] }), undefined,
    'a revoked activated contract remains owned by the existing deterministic non-delivery verifier')
  assert.deepEqual(selectVisualizeWorkflowReview({ ...context(), skillActivations: [{ ...activation(), requestVersion: 2 }] }), visualizeWorkflowReviewPolicy)
})

test('read_reference SKILL.md selects the workflow; unrelated reads do not', () => {
  const selected = context()
  const step = { ...selected.executionSteps[0], kind: 'visualize__read_reference', input: { arguments: '{"path":"SKILL.md"}' } }
  assert.deepEqual(selectVisualizeWorkflowReview({ ...selected, executionSteps: [step] }), visualizeWorkflowReviewPolicy)
  assert.equal(selectVisualizeWorkflowReview({ ...selected, executionSteps: [{ ...step, input: { arguments: '{"path":"references/api.md"}' } }] }), undefined)
})

test('stale request, registry, uncompleted selection and revoked tools or grants cannot nominate', () => {
  const selected = context(), { name, version, hash } = skillIndex(visualizeSkill)
  assert.equal(selectVisualizeWorkflowReview({ ...selected, requestVersion: 2 }), undefined)
  assert.equal(selectVisualizeWorkflowReview({ ...selected, executionSteps: [{ ...selected.executionSteps[0], output: undefined }] }), undefined)
  assert.throws(() => selectVisualizeWorkflowReview({ ...selected, availableSkills: [] }), /unavailable|revoked/i)
  assert.throws(() => selectVisualizeWorkflowReview({ ...selected, availableActions: selected.availableActions.filter(action => action !== 'skills.load') }), /unavailable|revoked/i)
  assert.throws(() => selectVisualizeWorkflowReview({ ...selected, signal: AbortSignal.abort(new Error('synthetic-cancellation')) }), /synthetic-cancellation/)
  for (const args of [{ name, version, hash: 'stale' }, { name, version: 'stale', hash }, { name: 'other', version, hash }, { name, version, hash, extra: true }]) {
    assert.equal(selectVisualizeWorkflowReview({ ...selected, executionSteps: [{ ...selected.executionSteps[0], input: { arguments: JSON.stringify(args) } }] }), undefined)
  }
})

test('trusted review policy bytes participate in the harness identity', () => {
  assert.ok(createProductHarness(tools).rules!.includes(visualizeWorkflowReviewPolicy.rubric), 'full trusted rubric is hashed with the harness rules')
  assert.match(visualizeWorkflowReviewPolicy.id, /visualize/)
})
