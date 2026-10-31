import assert from 'node:assert/strict'
import test from 'node:test'
import { skillIndex } from '@lyyzka/lingxios'
import { selectVisualizeWorkflowReview, type VisualizeWorkflowReviewContext } from '../agent-runtime/visualize-workflow-review.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'

function context(): VisualizeWorkflowReviewContext {
  const index = skillIndex(visualizeSkill)
  return { work: { id: 'run', tenantId: 'tenant' }, requestVersion: 1, executionSteps: [],
    skillActivations: [{ id: 'activation', runId: 'run', tenantId: 'tenant', requestVersion: 1,
      skill: index, checker: 'product:visualize-delivery' }],
    candidate: { body: 'n=1024: 8.31 MiB / 3.16 MiB = 2.63\n::visualize{"path":"/output/attention.html"}', requestVersion: 1, artifacts: [] },
    availableSkills: [index], availableActions: [...visualizeSkill.actions], unavailableSkillActivationIds: [], signal: new AbortController().signal,
  } as unknown as VisualizeWorkflowReviewContext
}

test('current activated visualization nominates one content-consistency scope instead of relying on storage verification', () => {
  const selected = selectVisualizeWorkflowReview(context())
  assert.equal(selected?.id, 'visualize-content-consistency-v1')
  assert.match(selected!.rubric, /same parameters/)
  assert.match(selected!.rubric, /inconclusive/)
})

test('historical, unavailable and non-delivery activations do not nominate content review', () => {
  const ctx = context()
  ctx.skillActivations = [{ ...ctx.skillActivations[0], requestVersion: 2 }]
  assert.equal(selectVisualizeWorkflowReview(ctx), undefined)
  const unavailable = context(); unavailable.unavailableSkillActivationIds = ['activation']
  assert.equal(selectVisualizeWorkflowReview(unavailable), undefined)
  const fallback = context(); fallback.candidate = { ...fallback.candidate, body: 'The view could not be completed.' }
  assert.equal(selectVisualizeWorkflowReview(fallback), undefined)
})
