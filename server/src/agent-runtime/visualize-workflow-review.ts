import { NoEffectError, skillIndex, type SemanticReviewContext } from '@lyyzka/lingxios'
import { matchesSystemSkillSelection } from './skill-context.js'
import { visualizeSkill } from './visualize-skill.js'

export const visualizeWorkflowReviewPolicy = {
  id: 'visualize-selected-workflow-v1',
  rubric: 'Review only the visualization deliverable currently due under the current human request and human revisions. '
    + 'Distinguish requested creation or modification of an inline visualization from read-only documentation, inspecting an existing view, an export-only request, ordinary code, examples or quoted requests. '
    + 'A selected skill or a promise to create a view is not the requested delivered result. If creation or modification is currently due but neither the visible answer nor actual current tool deliveries provides it, report the exact human request quote as missing and drive repair; honest non-delivery must remain partial. '
    + 'If the human only requests documentation, reading, explanation or export, evaluate only that requested result and do not invent a creation obligation. '
    + 'Use actual authorized current-request tool observations and resource evidence; do not infer success from a tool name, failed call, stale result or claim. Storage and a reference do not prove browser execution. '
    + 'Do not evaluate unrelated answer quality, add requirements or grant permissions. The original human request remains authoritative; this workflow selection is only a focused review trigger.',
} as const

export type VisualizeWorkflowReviewContext = Pick<SemanticReviewContext,
  'work' | 'requestVersion' | 'skillActivations' | 'executionSteps' | 'availableSkills' | 'availableActions' | 'signal'>

/** Registered selection nominates evaluation, never authoring or permission.
 * The public native selector supplies current authorization and exact-request
 * execution steps. Native activation already owns every current saved view. */
export function selectVisualizeWorkflowReview(context: VisualizeWorkflowReviewContext) {
  context.signal.throwIfAborted()
  const index = skillIndex(visualizeSkill)
  const selected = context.executionSteps.filter(step => ['skills__load', 'visualize__read_reference'].includes(step.kind)
    && matchesSystemSkillSelection(step, index, context.requestVersion))
  if (!selected.length) return undefined
  if (context.skillActivations.some(activation => activation.tenantId === context.work.tenantId && activation.runId === context.work.id
    && activation.requestVersion === context.requestVersion && activation.skill.name === index.name
    && activation.checker === 'product:visualize-delivery')) return undefined
  // A previously selected workflow cannot disappear into false completion when
  // its contract or capabilities are revoked between execution and final commit.
  if (!context.availableSkills.some(skill => skill.name === index.name && skill.version === index.version && skill.hash === index.hash)
    || selected.some(step => !context.availableActions.includes(step.kind === 'skills__load' ? 'skills.load' : 'visualize.read_reference'))) {
    throw new NoEffectError('The selected visualization workflow is unavailable or revoked.', 'forbidden')
  }
  return visualizeWorkflowReviewPolicy
}

export const visualizeSemanticReviewPolicy = {
  id: 'visualize-workflow-review', version: '1',
  async resolve(context: SemanticReviewContext) { return selectVisualizeWorkflowReview(context) },
}
