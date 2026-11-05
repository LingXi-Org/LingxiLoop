import type { RunVerificationContext, SkillDeliveryDecision, VerificationRecord } from '@lingxi-org/lingxios'

export const RETIRED_VISUALIZE_NOTICE = '原 Visualize 已退役，本次未交付旧版交互内容。'

/** Compatibility for already persisted obligations; never a skill registration. */
function retiredActivations(context: RunVerificationContext) {
  return context.skillActivations.filter(activation => activation.checker === 'product:visualize-delivery'
    && activation.skill.name === 'visualize' && activation.tenantId === context.work.tenantId
    && activation.runId === context.work.id && activation.requestVersion === context.requestVersion)
}
export async function resolveRetiredDeliveries(context: RunVerificationContext): Promise<SkillDeliveryDecision[]> {
  context.signal.throwIfAborted()
  return retiredActivations(context).map(activation => ({ activationId: activation.id,
    outcome: context.unavailableSkillActivationIds.includes(activation.id) && context.candidate.body.trimStart().startsWith(RETIRED_VISUALIZE_NOTICE) ? 'unsupported' : 'pending', evidence: {
    reason: 'capability_retired', delivered: false,
    hint: `Visualize is retired. Begin the public answer with exactly: ${RETIRED_VISUALIZE_NOTICE} Then preserve useful text and refer to the inert archive for existing work; use Design only if it is currently authorized. Do not claim that a legacy interactive result was delivered.`,
  } }))
}
export function verifyRetiredDeliveries(context: RunVerificationContext): VerificationRecord[] {
  context.signal.throwIfAborted()
  return retiredActivations(context).length ? [{ checker: 'product:retired-capability',
    status: context.candidate.body.trimStart().startsWith(RETIRED_VISUALIZE_NOTICE) ? 'inconclusive' : 'failed', evidence: {
    reason: 'The previously activated Visualize capability is retired; it cannot count as a delivered interactive result.', delivered: false,
    hint: `Begin the public answer with exactly: ${RETIRED_VISUALIZE_NOTICE} Then provide useful text without claiming legacy delivery.`,
  } }] : []
}
