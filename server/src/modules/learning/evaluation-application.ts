import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { projectMastery } from '../../learning/mastery.js'
import type { LearningActivityType, LearningAssistance, MasteryProjectionDecision } from '../../learning/types.js'
import type { LearningAgentRoomScope, ProposeLearningEvaluationCommand } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import {
  courseRole,
  findLearningEvaluationAttempt,
  findLearningRoomState,
  independentLearningEvidenceKeys,
  insertLearningEvaluation,
  insertLearningMasteryEvent,
  learningEvaluationEvidenceKey,
  learningMasteryLevels,
  lockLearningMastery,
  lockPendingLearningEvaluation,
  markLearningAttemptEvaluated,
  reviewLearningEvaluationRecord,
  upsertLearningMastery,
  verifyIndependentLearningReport,
} from './repository.js'

type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type LearningMetric = (
  name: 'learning.mastery.changed' | 'learning.evaluation.proposed',
  labels?: Record<string, string>,
) => void
const REVIEW_INTERVAL_BY_LEVEL = [1, 1, 3, 7, 21] as const

async function requireLearningRoomState(db: Queryable, scope: LearningAgentRoomScope) {
  const room = await findLearningRoomState(db, scope)
  if (!room) throw new LearningApplicationError('not_found', 'current conversation is not bound to a learning course')
  return room
}

async function applyLearningEvaluationToMastery(
  db: Queryable,
  metric: LearningMetric,
  input: {
    companyId: string; courseId: string; learnerId: string; objectiveId: string; evaluationId: string
    demonstratedLevel: number; confidence: number; assistance: LearningAssistance
    activityType: LearningActivityType; activityTargetLevel: number
    evaluatorKind: 'agent'|'teacher'; teacherConfirmed: boolean; actorId: string
  },
): Promise<MasteryProjectionDecision> {
  const priorKeys = new Set(await independentLearningEvidenceKeys(db, input))
  const currentKey = await learningEvaluationEvidenceKey(db, input)
  const previous = await lockLearningMastery(db, input)
  const decision = projectMastery({
    previousLevel: previous.level,
    previousIndependentEvidenceCount: priorKeys.size,
    demonstratedLevel: input.demonstratedLevel,
    assistance: input.assistance,
    confidence: input.confidence,
    activityType: input.activityType,
    activityTargetLevel: input.activityTargetLevel,
    evaluatorKind: input.evaluatorKind,
    teacherConfirmed: input.teacherConfirmed,
    evidenceDistinct: currentKey ? !priorKeys.has(currentKey) : false,
  })
  if (!decision.accepted) return decision
  const baseInterval = REVIEW_INTERVAL_BY_LEVEL[decision.nextLevel] ?? 1
  const reviewIntervalDays = decision.needsReview || decision.candidateLevel === 0
    ? 1
    : Math.min(90, Math.max(
      baseInterval,
      previous.reviewIntervalDays * (decision.nextLevel > previous.level ? 1 : 2),
    ))
  const status = decision.needsReview ? 'needs_review' : decision.nextLevel >= 3 ? 'verified' : 'learning'
  await upsertLearningMastery(db, {
    ...input,
    level: decision.nextLevel,
    status,
    independentEvidenceCount: decision.nextIndependentEvidenceCount,
    reviewIntervalDays,
  })
  await insertLearningMasteryEvent(db, {
    id: randomUUID(), ...input,
    previousLevel: previous.level,
    nextLevel: decision.nextLevel,
    kind: decision.needsReview ? 'review_flag' : 'evidence',
    reason: decision.reason,
  })
  if (decision.nextLevel !== previous.level || decision.needsReview) {
    metric('learning.mastery.changed', { status })
  }
  return decision
}

export async function proposeLearningEvaluation(
  db: Queryable,
  transaction: LearningTransaction,
  metric: LearningMetric,
  input: ProposeLearningEvaluationCommand,
): Promise<{ evaluationId: string; status: 'accepted'|'pending'; decisions: MasteryProjectionDecision[] }> {
  const confidence = Number(input.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new LearningApplicationError('invalid', 'confidence must be between 0 and 1')
  }
  const demonstratedLevel = Number(input.demonstratedLevel)
  if (!Number.isInteger(demonstratedLevel) || demonstratedLevel < 0 || demonstratedLevel > 4) {
    throw new LearningApplicationError('invalid', 'demonstratedLevel must be an integer between 0 and 4')
  }
  const room = await requireLearningRoomState(db, input)
  const attempt = await findLearningEvaluationAttempt(db, {
    companyId: room.companyId, courseId: room.courseId, attemptId: input.attemptId,
  })
  if (!attempt) throw new LearningApplicationError('not_found', 'attempt not found')
  const masteryLevels = await learningMasteryLevels(db, {
    companyId: room.companyId, courseId: room.courseId,
    learnerId: attempt.learnerId, objectiveIds: attempt.objectiveIds,
  })
  const suggestedDowngrade = masteryLevels.some((level) => level > demonstratedLevel)
  let verified = false
  if (demonstratedLevel >= 3 || suggestedDowngrade) {
    if (!input.sourceReportId) {
      throw new LearningApplicationError(
        'invalid',
        'L3+, transfer, and downgrade evaluations require a persisted source report',
      )
    }
    if (input.verifierReportId) {
      const verdict = await verifyIndependentLearningReport(db, {
        companyId: room.companyId, courseId: room.courseId,
        sourceReportId: input.sourceReportId, verifierReportId: input.verifierReportId,
      })
      if (verdict === null) {
        throw new LearningApplicationError(
          'invalid',
          'verifier report is not an independent verification of the source report',
        )
      }
      verified = verdict === 'supported'
    }
  }
  const teacherRequired = attempt.evaluationMode !== 'agent_formative'
    || demonstratedLevel >= 4
    || confidence < 0.7
    || suggestedDowngrade
    || (demonstratedLevel >= 3 && !verified)
  const status: 'accepted'|'pending' = teacherRequired ? 'pending' : 'accepted'
  const evaluationId = randomUUID()
  const decisions = await transaction(async (client) => {
    if (!await insertLearningEvaluation(client, {
      id: evaluationId, companyId: room.companyId, courseId: room.courseId,
      attemptId: input.attemptId, demonstratedLevel, confidence,
      rubricResults: input.rubricResults ?? [], feedback: input.feedback?.trim() ?? '',
      evaluatorId: input.agentId, status,
      ...(input.sourceReportId ? { sourceReportId: input.sourceReportId } : {}),
      ...(input.verifierReportId ? { verifierReportId: input.verifierReportId } : {}),
    })) throw new LearningApplicationError('not_found', 'attempt not found')
    const projected: MasteryProjectionDecision[] = []
    if (status === 'accepted') {
      for (const objectiveId of attempt.objectiveIds) {
        projected.push(await applyLearningEvaluationToMastery(client, metric, {
          companyId: room.companyId, courseId: room.courseId, learnerId: attempt.learnerId,
          objectiveId, evaluationId, demonstratedLevel, confidence, assistance: attempt.assistance,
          activityType: attempt.activityType ?? 'practice', activityTargetLevel: attempt.targetLevel,
          evaluatorKind: 'agent', teacherConfirmed: false, actorId: input.agentId,
        }))
      }
      await markLearningAttemptEvaluated(client, {
        companyId: room.companyId, courseId: room.courseId, attemptId: input.attemptId,
      })
    }
    return projected
  })
  metric('learning.evaluation.proposed', { status })
  return { evaluationId, status, decisions }
}

async function applyTeacherLearningOverride(
  db: Queryable,
  metric: LearningMetric,
  input: {
    companyId: string; courseId: string; learnerId: string; objectiveId: string; evaluationId: string
    nextLevel: number; reason: string; teacherId: string; activityType: LearningActivityType
  },
): Promise<void> {
  const level = Math.trunc(input.nextLevel)
  if (level < 0 || level > 4) {
    throw new LearningApplicationError('invalid', 'overrideLevel must be between 0 and 4')
  }
  if (level === 4 && !['project','assessment'].includes(input.activityType)) {
    throw new LearningApplicationError('invalid', 'level 4 override requires project or assessment evidence')
  }
  const previous = await lockLearningMastery(db, input)
  const reviewIntervalDays = level < previous.level ? 1 : REVIEW_INTERVAL_BY_LEVEL[level] ?? 1
  const status = level >= 3 ? 'verified' : 'learning'
  await upsertLearningMastery(db, {
    ...input,
    level,
    status,
    independentEvidenceCount: previous.independentEvidenceCount,
    reviewIntervalDays,
  })
  await insertLearningMasteryEvent(db, {
    id: randomUUID(), ...input,
    actorId: input.teacherId,
    previousLevel: previous.level,
    nextLevel: level,
    kind: 'teacher_override',
  })
  metric('learning.mastery.changed', { status })
}

export async function reviewLearningEvaluation(
  db: Queryable,
  transaction: LearningTransaction,
  metric: LearningMetric,
  input: {
    companyId: string; courseId: string; evaluationId: string; teacherId: string
    decision: 'accept'|'reject'; overrideLevel?: number; reason: string
  },
): Promise<void> {
  if (await courseRole(db, input.courseId, input.companyId, input.teacherId) !== 'teacher') {
    throw new LearningApplicationError('forbidden', 'teacher course role required')
  }
  const reason = input.reason.trim()
  if (!reason) throw new LearningApplicationError('invalid', 'review reason is required')
  await transaction(async (client) => {
    const evaluation = await lockPendingLearningEvaluation(client, input)
    if (!evaluation) throw new LearningApplicationError('not_found', 'pending evaluation not found')
    const accepted = input.decision === 'accept'
    if (!await reviewLearningEvaluationRecord(client, {
      ...input, status: accepted ? 'accepted' : 'rejected', reason,
    })) throw new LearningApplicationError('conflict', 'evaluation review state changed')
    if (!accepted) return
    const level = input.overrideLevel === undefined
      ? evaluation.demonstratedLevel
      : Math.trunc(Number(input.overrideLevel))
    for (const objectiveId of evaluation.objectiveIds) {
      if (input.overrideLevel !== undefined) {
        await applyTeacherLearningOverride(client, metric, {
          companyId: input.companyId, courseId: input.courseId, learnerId: evaluation.learnerId,
          objectiveId, evaluationId: input.evaluationId, nextLevel: level, reason,
          teacherId: input.teacherId, activityType: evaluation.activityType ?? 'practice',
        })
      } else {
        await applyLearningEvaluationToMastery(client, metric, {
          companyId: input.companyId, courseId: input.courseId, learnerId: evaluation.learnerId,
          objectiveId, evaluationId: input.evaluationId, demonstratedLevel: level,
          confidence: Math.max(0.7, evaluation.confidence), assistance: evaluation.assistance,
          activityType: evaluation.activityType ?? 'practice',
          activityTargetLevel: Math.max(level, evaluation.targetLevel),
          evaluatorKind: 'teacher', teacherConfirmed: true, actorId: input.teacherId,
        })
      }
    }
    await markLearningAttemptEvaluated(client, {
      companyId: input.companyId, courseId: input.courseId, attemptId: evaluation.attemptId,
    })
  })
}
