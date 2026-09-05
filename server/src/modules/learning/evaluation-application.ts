import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type { LearningAgentRoomScope, ProposeLearningEvaluationCommand } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import { projectLearningState } from './learning-state.js'
import { requireLearningCourseProjectScope } from './project-scope-repository.js'
import {
  findLearningEvaluationAttempt,
  findLearningRoomState,
  independentLearningEvidenceKeys,
  insertLearningEvaluation,
  learningEvaluationEvidenceKey,
  learningStateLevels,
  lockLearningState,
  lockPendingLearningEvaluation,
  markLearningAttemptEvaluated,
  reviewLearningEvaluationRecord,
  upsertLearningState,
  verifyIndependentLearningReport,
} from './repository.js'
import type {
  LearningActivityType,
  LearningAssistance,
  LearningStateProjectionDecision,
} from './types.js'

type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type LearningMetric = (
  name: 'learning.state.changed' | 'learning.evaluation.proposed',
  labels?: Record<string, string>,
) => void
const REVIEW_INTERVAL_BY_LEVEL = [1, 1, 3, 7, 21] as const

async function requireLearningRoomState(db: Queryable, scope: LearningAgentRoomScope) {
  const room = await findLearningRoomState(db, scope)
  if (!room) {
    throw new LearningApplicationError('not_found', 'current conversation is not bound to a learning project')
  }
  return room
}

async function applyLearningEvaluationToState(
  db: Queryable,
  metric: LearningMetric,
  input: {
    companyId: string
    projectId: string
    userId: string
    knowledgeUnitId: string
    evaluationId: string
    demonstratedLevel: number
    confidence: number
    assistance: LearningAssistance
    activityType: LearningActivityType
    activityTargetLevel: number
    evaluatorKind: 'AGENT' | 'TEACHER'
    teacherConfirmed: boolean
  },
): Promise<LearningStateProjectionDecision> {
  const previous = await lockLearningState(db, input)
  const priorKeys = new Set(await independentLearningEvidenceKeys(db, input))
  const currentKey = await learningEvaluationEvidenceKey(db, input)
  const decision = projectLearningState({
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
  const status = decision.needsReview
    ? 'NEEDS_REVIEW'
    : decision.nextLevel >= 3
      ? 'VERIFIED'
      : 'LEARNING'
  if (!await upsertLearningState(db, {
    ...input,
    level: decision.nextLevel,
    status,
    independentEvidenceCount: decision.nextIndependentEvidenceCount,
    reviewIntervalDays,
  })) {
    throw new LearningApplicationError('not_found', 'learning state scope not found')
  }
  if (decision.nextLevel !== previous.level || decision.needsReview) {
    metric('learning.state.changed', { status })
  }
  return decision
}

export async function proposeLearningEvaluation(
  db: Queryable,
  transaction: LearningTransaction,
  metric: LearningMetric,
  input: ProposeLearningEvaluationCommand,
): Promise<{
  evaluationId: string
  status: 'ACCEPTED' | 'PENDING'
  decisions: LearningStateProjectionDecision[]
}> {
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
    companyId: room.companyId,
    projectId: room.projectId,
    attemptId: input.attemptId,
  })
  if (!attempt) throw new LearningApplicationError('not_found', 'attempt not found')
  const stateLevels = await learningStateLevels(db, {
    companyId: room.companyId,
    projectId: room.projectId,
    userId: attempt.learnerId,
    knowledgeUnitIds: attempt.knowledgeUnitIds,
  })
  const suggestedDowngrade = stateLevels.some((level) => level > demonstratedLevel)
  let verified = false
  if (demonstratedLevel >= 3 || suggestedDowngrade) {
    if (!input.sourceEvidenceId) {
      throw new LearningApplicationError(
        'invalid',
        'L3+, transfer, and downgrade evaluations require persisted source Evidence',
      )
    }
    if (input.verifierEvidenceId) {
      const verdict = await verifyIndependentLearningReport(db, {
        companyId: room.companyId,
        projectId: room.projectId,
        sourceEvidenceId: input.sourceEvidenceId,
        verifierEvidenceId: input.verifierEvidenceId,
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
  const teacherRequired = attempt.evaluationMode !== 'AGENT_FORMATIVE'
    || demonstratedLevel >= 4
    || confidence < 0.7
    || suggestedDowngrade
    || (demonstratedLevel >= 3 && !verified)
  const status: 'ACCEPTED' | 'PENDING' = teacherRequired ? 'PENDING' : 'ACCEPTED'
  const evaluationId = randomUUID()
  const decisions = await transaction(async (client) => {
    if (!await insertLearningEvaluation(client, {
      id: evaluationId,
      companyId: room.companyId,
      projectId: room.projectId,
      attemptId: input.attemptId,
      demonstratedLevel,
      confidence,
      rubricResults: input.rubricResults,
      feedback: input.feedback?.trim() ?? '',
      evaluatorId: input.agentId,
      status,
      ...(input.sourceEvidenceId ? { sourceEvidenceId: input.sourceEvidenceId } : {}),
      ...(input.verifierEvidenceId ? { verifierEvidenceId: input.verifierEvidenceId } : {}),
    })) {
      throw new LearningApplicationError('not_found', 'attempt not found')
    }
    const projected: LearningStateProjectionDecision[] = []
    if (status === 'ACCEPTED') {
      for (const knowledgeUnitId of attempt.knowledgeUnitIds) {
        projected.push(await applyLearningEvaluationToState(client, metric, {
          companyId: room.companyId,
          projectId: room.projectId,
          userId: attempt.learnerId,
          knowledgeUnitId,
          evaluationId,
          demonstratedLevel,
          confidence,
          assistance: attempt.assistance,
          activityType: attempt.activityType ?? 'PRACTICE',
          activityTargetLevel: attempt.targetLevel,
          evaluatorKind: 'AGENT',
          teacherConfirmed: false,
        }))
      }
      if (!await markLearningAttemptEvaluated(client, {
        companyId: room.companyId,
        projectId: room.projectId,
        attemptId: input.attemptId,
      })) throw new LearningApplicationError('not_found', 'attempt not found')
    }
    return projected
  })
  metric('learning.evaluation.proposed', { status })
  return { evaluationId, status, decisions }
}

export async function reviewProjectLearningEvaluation(
  _db: Queryable,
  transaction: LearningTransaction,
  metric: LearningMetric,
  input: {
    companyId: string
    projectId: string
    evaluationId: string
    reviewerId: string
    decision: 'accept' | 'reject'
    reason: string
  },
): Promise<void> {
  const reason = input.reason.trim()
  if (!reason) throw new LearningApplicationError('invalid', 'review reason is required')
  await transaction(async (client) => {
    await createPermissionService(client).assertCan({
      actorUserId: input.reviewerId,
      action: 'learning:review',
      companyId: input.companyId,
      resource: { type: 'project', id: input.projectId },
    })
    const evaluation = await lockPendingLearningEvaluation(client, {
      companyId: input.companyId,
      projectId: input.projectId,
      evaluationId: input.evaluationId,
    })
    if (!evaluation) throw new LearningApplicationError('not_found', 'pending evaluation not found')
    const accepted = input.decision === 'accept'
    if (!await reviewLearningEvaluationRecord(client, {
      companyId: input.companyId,
      projectId: input.projectId,
      evaluationId: input.evaluationId,
      reviewerId: input.reviewerId,
      status: accepted ? 'ACCEPTED' : 'REJECTED',
      reason,
    })) {
      throw new LearningApplicationError('conflict', 'evaluation review state changed')
    }
    if (accepted) {
      for (const knowledgeUnitId of evaluation.knowledgeUnitIds) {
        await applyLearningEvaluationToState(client, metric, {
          companyId: input.companyId,
          projectId: input.projectId,
          userId: evaluation.userId,
          knowledgeUnitId,
          evaluationId: input.evaluationId,
          demonstratedLevel: evaluation.demonstratedLevel,
          confidence: Math.max(0.7, evaluation.confidence),
          assistance: evaluation.assistance,
          activityType: evaluation.activityType ?? 'PRACTICE',
          activityTargetLevel: Math.max(evaluation.demonstratedLevel, evaluation.targetLevel),
          evaluatorKind: 'TEACHER',
          teacherConfirmed: true,
        })
      }
    }
    if (!await markLearningAttemptEvaluated(client, {
      companyId: input.companyId,
      projectId: input.projectId,
      attemptId: evaluation.attemptId,
    })) throw new LearningApplicationError('not_found', 'attempt not found')
  })
}

/** Teaching-only address adapter. Canonical evaluation review is Project-scoped. */
export async function reviewLearningEvaluation(
  db: Queryable,
  transaction: LearningTransaction,
  metric: LearningMetric,
  input: {
    companyId: string
    courseId: string
    evaluationId: string
    teacherId: string
    decision: 'accept' | 'reject'
    reason: string
  },
): Promise<void> {
  const project = await requireLearningCourseProjectScope(db, input.companyId, input.courseId)
  await reviewProjectLearningEvaluation(db, transaction, metric, {
    companyId: input.companyId,
    projectId: project.projectId,
    evaluationId: input.evaluationId,
    reviewerId: input.teacherId,
    decision: input.decision,
    reason: input.reason,
  })
}
