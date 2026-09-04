import type {
  LearningStateProjectionDecision,
  LearningStateProjectionInput,
} from './types.js'

/** Pure, deterministic LearningState policy. The model proposes evidence; this
 * function owns the actual state transition and can be evaluated offline. */
export function projectLearningState(
  input: LearningStateProjectionInput,
): LearningStateProjectionDecision {
  const demonstrated = Math.max(0, Math.min(4, Math.trunc(input.demonstratedLevel)))
  const target = Math.max(1, Math.min(4, Math.trunc(input.activityTargetLevel)))
  let candidate = Math.min(demonstrated, target)
  if (input.assistance !== 'NONE') candidate = Math.min(candidate, 2)
  if (input.confidence < 0.7) {
    return {
      accepted: false,
      pendingTeacher: true,
      candidateLevel: candidate,
      nextLevel: input.previousLevel,
      nextIndependentEvidenceCount: input.previousIndependentEvidenceCount,
      needsReview: false,
      reason: 'confidence below the 0.70 formative threshold',
    }
  }
  if (
    candidate === 4
    && (!input.teacherConfirmed || !['PROJECT', 'ASSESSMENT'].includes(input.activityType))
  ) {
    return {
      accepted: false,
      pendingTeacher: true,
      candidateLevel: candidate,
      nextLevel: input.previousLevel,
      nextIndependentEvidenceCount: input.previousIndependentEvidenceCount,
      needsReview: false,
      reason: 'level 4 requires teacher-confirmed transfer or assessment evidence',
    }
  }
  if (input.evaluatorKind === 'AGENT') candidate = Math.min(candidate, 3)
  const independentCount = input.assistance === 'NONE'
    && candidate >= 3
    && input.evidenceDistinct !== false
    ? input.previousIndependentEvidenceCount + 1
    : input.previousIndependentEvidenceCount
  if (
    candidate === 3
    && independentCount < 2
    && !(input.teacherConfirmed && input.activityType === 'ASSESSMENT')
  ) {
    return {
      accepted: true,
      pendingTeacher: false,
      candidateLevel: candidate,
      nextLevel: Math.max(input.previousLevel, 2),
      nextIndependentEvidenceCount: independentCount,
      needsReview: false,
      reason: 'first independent demonstration recorded; a second distinct activity is required for level 3',
    }
  }
  if (candidate < input.previousLevel) {
    return {
      accepted: true,
      pendingTeacher: false,
      candidateLevel: candidate,
      nextLevel: input.previousLevel,
      nextIndependentEvidenceCount: independentCount,
      needsReview: true,
      reason: 'lower evidence flags review without silently erasing prior state',
    }
  }
  return {
    accepted: true,
    pendingTeacher: false,
    candidateLevel: candidate,
    nextLevel: Math.max(input.previousLevel, candidate),
    nextIndependentEvidenceCount: independentCount,
    needsReview: false,
    reason: 'evidence accepted by deterministic LearningState policy',
  }
}
