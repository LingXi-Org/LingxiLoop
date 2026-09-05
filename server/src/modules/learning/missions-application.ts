import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { createEvidenceRecordInTransaction, createEvidenceWithLinksInTransaction } from '../evidence/public.js'
import type {
  LearningAgentRoomScope,
  LearningScope,
  RecordLearningAttemptCommand,
  StartLearningMissionCommand,
} from './contracts.js'
import { LearningApplicationError } from './errors.js'
import {
  activeLearningMissionId,
  countPendingLearningEvaluations,
  enqueueLearningMissionCoordinatorWork,
  findEligibleLearningMissionCoordinator,
  findLearningCanvasEvidence,
  findLearningDocumentEvidence,
  findLearningMission,
  findLearningRoomState,
  insertAgentLearningAttempt,
  learningChannelType,
  learningStateContext,
  listLearningMissions,
  listProjectLearningKnowledgeUnits,
  requireLearningCourseProjectScope,
  updateLearningMissionCoordinator,
  upsertLearningMission,
} from './repository.js'
import type { LearningMission, LearningMissionKind, LearningTurnContext } from './types.js'
import { getLearningMission } from './mission-lifecycle-application.js'

export {
  addLearningMissionSteps,
  completeLearningMission,
  finishLearningMissionPlanning,
  getLearningMission,
  updateLearningMissionStep,
} from './mission-lifecycle-application.js'

export type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

async function assertProjectLearner(
  db: Queryable,
  scope: { companyId: string; projectId: string },
  userId: string,
): Promise<void> {
  await createPermissionService(db).assertCan({
    actorUserId: userId,
    action: 'learning:submit',
    companyId: scope.companyId,
    projectId: scope.projectId,
    resource: { type: 'project', id: scope.projectId },
  })
}

function learningText(value: string, name: string, maxLength = 10_000): string {
  const text = String(value ?? '').trim()
  if (!text) throw new LearningApplicationError('invalid', `${name} is required`)
  if (text.length > maxLength) throw new LearningApplicationError('invalid', `${name} exceeds ${maxLength} characters`)
  return text
}

function contextText(value: string, maxLength: number): string {
  return String(value).slice(0, maxLength)
}

function boundedMission(mission: LearningMission): LearningMission {
  return {
    ...mission,
    id: contextText(mission.id, 96),
    projectId: contextText(mission.projectId, 96),
    learnerId: contextText(mission.learnerId, 96),
    conversationId: contextText(mission.conversationId, 96),
    triggerClientMsgNo: contextText(mission.triggerClientMsgNo, 120),
    goal: contextText(mission.goal, 400),
    successCriteria: contextText(mission.successCriteria, 400),
    coordinatorAgentId: contextText(mission.coordinatorAgentId, 96),
    steps: mission.steps.slice(0, 10).map((step) => ({
      ...step,
      id: contextText(step.id, 96),
      description: contextText(step.description, 240),
      successCriteria: contextText(step.successCriteria, 320),
      ...(step.knowledgeUnitId ? { knowledgeUnitId: contextText(step.knowledgeUnitId, 96) } : {}),
      ...(step.outcome ? { outcome: contextText(step.outcome, 320) } : {}),
      ...(step.completionEvidenceId ? { completionEvidenceId: contextText(step.completionEvidenceId, 96) } : {}),
      ...(step.completionAttemptId ? { completionAttemptId: contextText(step.completionAttemptId, 96) } : {}),
    })),
    createdAt: contextText(mission.createdAt, 64),
    updatedAt: contextText(mission.updatedAt, 64),
  }
}

export async function listVisibleLearningMissions(
  db: Queryable,
  scope: LearningScope,
  courseId: string,
) {
  const permissions = createPermissionService(db)
  await permissions.assertCan({
    actorUserId: scope.userId,
    action: 'learning:read',
    companyId: scope.companyId,
    resource: { type: 'course', id: courseId },
  })
  const manage = await permissions.can({
    actorUserId: scope.userId,
    action: 'learning:manage',
    companyId: scope.companyId,
    resource: { type: 'course', id: courseId },
  })
  const project = await requireLearningCourseProjectScope(db, scope.companyId, courseId)
  return listLearningMissions(db, {
    companyId: scope.companyId,
    projectId: project.projectId,
    userId: scope.userId,
    includeAllLearners: manage.allowed,
  })
}

export async function assignLearningMissionCoordinator(
  db: Queryable,
  input: { companyId: string; courseId: string; missionId: string; teacherId: string; agentId: string },
) {
  const project = await requireLearningCourseProjectScope(db, input.companyId, input.courseId)
  await createPermissionService(db).assertCan({
    actorUserId: input.teacherId,
    action: 'learning:manage',
    companyId: input.companyId,
    projectId: project.projectId,
    resource: { type: 'project', id: project.projectId },
  })
  if (!await updateLearningMissionCoordinator(db, {
    companyId: input.companyId,
    projectId: project.projectId,
    missionId: input.missionId,
    agentId: input.agentId,
  })) {
    throw new LearningApplicationError(
      'not_found',
      'mission or eligible learning/canvas coordinator not found',
    )
  }
  return getLearningMission(db, input.companyId, project.projectId, input.missionId)
}

async function requireLearningRoomState(db: Queryable, scope: LearningAgentRoomScope) {
  const room = await findLearningRoomState(db, scope)
  if (!room) throw new LearningApplicationError('not_found', 'current conversation is not bound to a project')
  return room
}

export interface LearningMissionInfrastructure {
  syncMessages(input: {
    channelId: string
    channelType: number
    limit: number
    loginUid: string
  }): Promise<Array<{ clientMsgNo: string; fromUid: string; authoredByAgent: boolean }>>
  publishMission(input: {
    channelId: string
    channelType: number
    senderId: string
    mission: LearningMission
    projectId: string
    courseId?: string
  }): Promise<void>
  metric(name: string, labels?: Record<string, string>): void
}

export function preferredLearningMissionCoordinator(kind: LearningMissionKind): 'nova'|'scout'|'forge' {
  return kind === 'PROJECT' ? 'forge' : kind === 'RESEARCH' ? 'scout' : 'nova'
}

export async function startLearningMission(
  db: Queryable,
  transaction: LearningTransaction,
  infrastructure: LearningMissionInfrastructure,
  input: StartLearningMissionCommand,
): Promise<LearningMission> {
  const room = await requireLearningRoomState(db, input)
  if (room.purpose !== 'study' && input.explicit !== true) {
    throw new LearningApplicationError(
      'forbidden',
      'automatic missions are allowed only in study-scoped project conversations; explicit learner requests may opt in elsewhere',
    )
  }
  const triggerClientMsgNo = input.sourceClientMsgNo?.trim() || input.triggerClientMsgNo
  const channelType = await learningChannelType(db, input.companyId, input.channelId)
  const messages = await infrastructure.syncMessages({
    channelId: input.channelId,
    channelType,
    limit: 100,
    loginUid: input.agentId,
  })
  const trigger = messages.find((message) => message.clientMsgNo === triggerClientMsgNo)
  if (!trigger || trigger.authoredByAgent) {
    throw new LearningApplicationError('invalid', 'evidence must reference an existing human message in the current project conversation')
  }
  await assertProjectLearner(db, room, trigger.fromUid)
  const kind = input.missionKind ?? (room.purpose === 'lab' ? 'PROJECT' : 'STUDY')
  const goal = learningText(input.goal, 'goal')
  const successCriteria = learningText(input.successCriteria, 'successCriteria')
  const result = await transaction(async (client) => {
    const coordinatorAgentId = await findEligibleLearningMissionCoordinator(client, {
      companyId: room.companyId,
      projectId: room.projectId,
      channelId: input.channelId,
      preferredPreset: preferredLearningMissionCoordinator(kind),
      currentAgentId: input.agentId,
    })
    if (!coordinatorAgentId) {
      throw new LearningApplicationError('conflict', 'no eligible Mission coordinator is available in the current project conversation')
    }
    const stored = await upsertLearningMission(client, {
      id: randomUUID(),
      companyId: room.companyId,
      projectId: room.projectId,
      learnerId: trigger.fromUid,
      channelId: input.channelId,
      triggerClientMsgNo,
      goal,
      successCriteria,
      kind,
      coordinatorAgentId,
      createdBy: input.agentId,
    })
    if (stored.inserted && coordinatorAgentId !== input.agentId) {
      await enqueueLearningMissionCoordinatorWork(client, {
        id: `mission-coordinator-${createHash('sha256').update(stored.id).digest('hex').slice(0, 24)}`,
        companyId: room.companyId,
        coordinatorAgentId,
        channelId: input.channelId,
        threadRootClientMsgNo: input.threadRootClientMsgNo ?? triggerClientMsgNo,
        missionId: stored.id,
        authorizationUserId: trigger.fromUid,
      })
    }
    const mission = await findLearningMission(client, room.companyId, room.projectId, stored.id)
    if (!mission) throw new LearningApplicationError('conflict', 'mission could not be loaded after creation')
    return { mission, inserted: stored.inserted }
  })
  infrastructure.metric(
    result.inserted ? 'learning.mission.created' : 'learning.mission.deduplicated',
    result.inserted ? { mode: 'agent' } : undefined,
  )
  await infrastructure.publishMission({
    channelId: input.channelId,
    channelType,
    senderId: input.agentId,
    mission: result.mission,
    projectId: room.projectId,
    ...(room.courseId ? { courseId: room.courseId } : {}),
  })
  return result.mission
}

export async function recordLearningAttempt(
  db: Queryable,
  transaction: LearningTransaction,
  infrastructure: Pick<LearningMissionInfrastructure, 'syncMessages' | 'metric'>,
  input: RecordLearningAttemptCommand,
): Promise<{ id: string; learnerId: string }> {
  if (Boolean(input.activityId) === Boolean(input.missionStepId)) {
    throw new LearningApplicationError('invalid', 'exactly one activityId or missionStepId is required')
  }
  const refs = [...new Set((input.evidenceClientMsgNos ?? []).map(String).filter(Boolean))]
  const documentIds = [...new Set((input.documentIds ?? []).map(String).filter(Boolean))]
  const canvasFrameIds = [...new Set((input.canvasFrameIds ?? []).map(String).filter(Boolean))]
  if (!refs.length && !documentIds.length && !canvasFrameIds.length) {
    throw new LearningApplicationError('invalid', 'at least one Host-verifiable learner evidence source is required')
  }
  if (refs.length > 20) throw new LearningApplicationError('invalid', 'one attempt may reference at most 20 evidence messages')
  if (documentIds.length > 20 || canvasFrameIds.length > 20) {
    throw new LearningApplicationError('invalid', 'one attempt may reference at most 20 documents and 20 Canvas Frames')
  }
  const room = await requireLearningRoomState(db, input)
  const channelType = await learningChannelType(db, input.companyId, input.channelId)
  const messages = refs.length ? await infrastructure.syncMessages({
    channelId: input.channelId,
    channelType,
    limit: 100,
    loginUid: input.agentId,
  }) : []
  const result = await transaction(async (client) => {
    const learnerIds = new Set<string>()
    for (const ref of refs) {
      const message = messages.find((candidate) => candidate.clientMsgNo === ref)
      if (!message || message.authoredByAgent) {
        throw new LearningApplicationError('invalid', 'evidence must reference an existing human message in the current project conversation')
      }
      await assertProjectLearner(client, room, message.fromUid)
      learnerIds.add(message.fromUid)
    }
    const documents: Array<{ id: string; revision: number; authorId: string }> = []
    for (const documentId of documentIds) {
      const evidence = await findLearningDocumentEvidence(client, {
        companyId: room.companyId,
        projectId: room.projectId,
        documentId,
      })
      if (!evidence) throw new LearningApplicationError('not_found', 'document evidence is outside the current project')
      await assertProjectLearner(client, room, evidence.authorId)
      learnerIds.add(evidence.authorId)
      documents.push(evidence)
    }
    const canvasFrames: Array<{ id: string; revision: number; authorId: string }> = []
    for (const frameId of canvasFrameIds) {
      const evidence = await findLearningCanvasEvidence(client, {
        companyId: room.companyId,
        projectId: room.projectId,
        frameId,
      })
      if (!evidence) throw new LearningApplicationError('not_found', 'Canvas Frame evidence is outside the current project')
      await assertProjectLearner(client, room, evidence.authorId)
      learnerIds.add(evidence.authorId)
      canvasFrames.push(evidence)
    }
    if (learnerIds.size !== 1) {
      throw new LearningApplicationError('invalid', 'one attempt cannot combine evidence from multiple learners')
    }
    const learnerId = [...learnerIds][0]
    const id = randomUUID()
    const evidenceInput = {
      id: `evidence-${randomUUID()}`,
      companyId: room.companyId,
      projectId: room.projectId,
      level: 'L1' as const,
      derivation: 'OBSERVED' as const,
      kind: 'HOST_REFERENCES',
      subjectUserId: learnerId,
      data: {
        conversationId: input.channelId,
        clientMsgNos: refs,
        documents,
        canvasFrames,
      },
      createdBy: { type: 'AGENT' as const, id: input.agentId },
    }
    await createEvidenceRecordInTransaction(client, evidenceInput)
    const inserted = await insertAgentLearningAttempt(client, {
      id,
      companyId: room.companyId,
      projectId: room.projectId,
      channelId: input.channelId,
      learnerId,
      ...(input.activityId ? { activityId: input.activityId } : {}),
      ...(input.missionStepId ? { missionStepId: input.missionStepId } : {}),
      assistance: input.assistance ?? 'NONE',
      evidenceId: evidenceInput.id,
    })
    if (!inserted) {
      throw new LearningApplicationError('not_found', 'published activity or mission step is outside the current project')
    }
    await createEvidenceWithLinksInTransaction(client, evidenceInput, [{
      relation: 'SOURCE', targetLevel: 'L1', targetKind: 'LEARNING_ATTEMPT', targetId: id,
    }])
    return { id, learnerId }
  })
  infrastructure.metric('learning.attempt.accepted', { source: 'message' })
  return result
}

export async function loadLearningContext(
  db: Queryable,
  infrastructure: Pick<LearningMissionInfrastructure, 'syncMessages'>,
  input: LearningAgentRoomScope & { agentId: string; triggerClientMsgNo: string; actorId?: string },
): Promise<LearningTurnContext | undefined> {
  const room = await findLearningRoomState(db, input)
  if (!room) return undefined
  let resolvedActorId = input.actorId
  if (!resolvedActorId) {
    const channelType = await learningChannelType(db, input.companyId, input.channelId)
    const messages = await infrastructure.syncMessages({
      channelId: input.channelId,
      channelType,
      limit: 100,
      loginUid: input.agentId,
    })
    const trigger = messages.find((message) => (
      message.clientMsgNo === input.triggerClientMsgNo && !message.authoredByAgent
    ))
    resolvedActorId = trigger?.fromUid
      ?? [...messages].reverse().find((message) => !message.authoredByAgent)?.fromUid
  }
  const permissions = createPermissionService(db)
  const learnerDecision = resolvedActorId ? await permissions.can({
    actorUserId: resolvedActorId,
    action: 'learning:submit',
    companyId: room.companyId,
    projectId: room.projectId,
    resource: { type: 'project', id: room.projectId },
  }) : null
  const managerDecision = resolvedActorId ? await permissions.can({
    actorUserId: resolvedActorId,
    action: 'learning:manage',
    companyId: room.companyId,
    projectId: room.projectId,
    resource: { type: 'project', id: room.projectId },
  }) : null
  const learnerId = learnerDecision?.allowed ? resolvedActorId : undefined
  const actorRole = learnerDecision?.allowed ? 'learner'
    : managerDecision?.allowed ? 'teacher' : undefined
  const allUnits = await listProjectLearningKnowledgeUnits(db, room.companyId, room.projectId)
  const units = actorRole === 'teacher' || room.projectKind === 'PERSONAL_LEARNING'
    ? allUnits
    : allUnits.filter((unit) => unit.status === 'PUBLISHED')
  const state = learnerId ? await learningStateContext(db, {
    companyId: room.companyId,
    projectId: room.projectId,
    userId: learnerId,
  }) : []
  const byUnit = new Map(state.map((item) => [item.knowledgeUnitId,item]))
  const missionId = learnerId ? await activeLearningMissionId(db, {
    companyId: room.companyId,
    projectId: room.projectId,
    learnerId,
    channelId: input.channelId,
  }) : null
  const pendingTeacherReviews = actorRole === 'teacher'
    ? await countPendingLearningEvaluations(db, room.companyId, room.projectId)
    : 0
  const knowledgeUnits = units.slice(0, 10).map((unit) => {
    const item = byUnit.get(unit.id)
    return {
      ...unit,
      id: contextText(unit.id, 96),
      projectId: contextText(unit.projectId, 96),
      title: contextText(unit.title, 160),
      successCriteria: contextText(unit.successCriteria, 320),
      prerequisiteKnowledgeUnitIds: unit.prerequisiteKnowledgeUnitIds
        .slice(0, 6).map((id) => contextText(id, 96)),
      level: item?.level ?? 0,
      stateStatus: item?.status ?? 'LEARNING' as const,
      ...(item?.nextReviewAt ? { nextReviewAt: item.nextReviewAt } : {}),
    }
  })
  const activeMission = missionId
    ? await findLearningMission(db, room.companyId, room.projectId, missionId)
    : null
  return {
    project: {
      id: contextText(room.projectId, 96),
      kind: room.projectKind,
      title: contextText(room.projectTitle, 160),
      status: room.projectStatus,
    },
    ...(room.courseId ? { courseId: contextText(room.courseId, 96) } : {}),
    roomPurpose: room.purpose,
    ...(actorRole ? { actorRole } : {}),
    ...(learnerId ? { learnerId: contextText(learnerId, 96) } : {}),
    ...(activeMission ? { activeMission: boundedMission(activeMission) } : {}),
    knowledgeUnits,
    due: knowledgeUnits.filter((item) => item.nextReviewAt && new Date(item.nextReviewAt) <= new Date())
      .slice(0, 12).map((item) => ({
        knowledgeUnitId: item.id,
        title: item.title,
        level: item.level,
        nextReviewAt: item.nextReviewAt as string,
      })),
    pendingTeacherReviews,
  }
}
