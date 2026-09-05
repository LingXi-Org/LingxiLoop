import type { AppendDomainEventInput, JsonObject } from '../events/public.js'
import type { LearningCaseActionRecord, LearningCaseRecord } from './cases-repository.js'

interface LearningCaseDetectedPayload extends JsonObject {
  caseId: string
  learnerId: string
  knowledgeUnitId: string
  status: LearningCaseRecord['status']
  version: number
}

interface LearningCaseActionAppliedPayload extends JsonObject {
  caseId: string
  actionId: string
  kind: LearningCaseActionRecord['kind']
  result: LearningCaseActionRecord['result']
  fromStatus: LearningCaseActionRecord['fromStatus']
  toStatus: LearningCaseActionRecord['toStatus']
  caseVersion: number
  activityId: string | null
  missionId: string | null
  attemptId: string | null
  evaluationId: string | null
}

export function learningCaseDetectedEvent(input: {
  companyId: string
  actorUserId: string
  learningCase: LearningCaseRecord
}): AppendDomainEventInput<'LEARNING_CASE.DETECTED', LearningCaseDetectedPayload> {
  const learningCase = input.learningCase
  return {
    companyId: input.companyId,
    projectId: learningCase.projectId,
    aggregateType: 'LEARNING_CASE',
    aggregateId: learningCase.id,
    idempotencyKey: `learning-case:${learningCase.id}:detected`,
    actor: { type: 'USER', id: input.actorUserId },
    event: {
      eventType: 'LEARNING_CASE.DETECTED',
      schemaVersion: 1,
      payload: {
        caseId: learningCase.id,
        learnerId: learningCase.learnerId,
        knowledgeUnitId: learningCase.knowledgeUnitId,
        status: learningCase.status,
        version: learningCase.version,
      },
    },
  }
}

export function learningCaseActionAppliedEvent(input: {
  companyId: string
  projectId: string
  actorUserId: string
  action: LearningCaseActionRecord
}): AppendDomainEventInput<'LEARNING_CASE.ACTION_APPLIED', LearningCaseActionAppliedPayload> {
  const action = input.action
  return {
    companyId: input.companyId,
    projectId: input.projectId,
    aggregateType: 'LEARNING_CASE',
    aggregateId: action.caseId,
    idempotencyKey: `learning-case-action:${action.id}`,
    actor: { type: 'USER', id: input.actorUserId },
    event: {
      eventType: 'LEARNING_CASE.ACTION_APPLIED',
      schemaVersion: 1,
      payload: {
        caseId: action.caseId,
        actionId: action.id,
        kind: action.kind,
        result: action.result,
        fromStatus: action.fromStatus,
        toStatus: action.toStatus,
        caseVersion: action.caseVersion,
        activityId: action.activityId,
        missionId: action.missionId,
        attemptId: action.attemptId,
        evaluationId: action.evaluationId,
      },
    },
  }
}
