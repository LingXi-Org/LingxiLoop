import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { Queryable } from '../../db/queryable.js'
import { projectMastery } from '../../learning/mastery.js'
import type {
  AddLearningMissionStepInput,
  BindCourseRoomInput,
  CreateActivityInput,
  CreateLearningActivityCommand,
  CreateCourseInput,
  CreateCourseInvitationInput,
  CreateObjectivesInput,
  CreateLearningObjectivesCommand,
  LearningAgentRoomScope,
  LearningScope,
  MissionCoordinatorInput,
  NotificationPreferencesInput,
  ObjectiveStatusInput,
  ReviewEvaluationInput,
  RecordLearningAttemptCommand,
  ProposeLearningEvaluationCommand,
  StartLearningMissionCommand,
  SubmitActivityInput,
  UpdateCourseInput,
} from './contracts.js'
import {
  activateLearningMission,
  activeLearningMissionId,
  canCreateCourse,
  changeCourseMember,
  closeLearningActivityRecord,
  completeLearningMissionRecord,
  companyMembershipRole,
  courseInvitationPreview,
  courseExists,
  courseManager,
  courseMembershipRole,
  courseRole,
  deleteLearningCourseRoom,
  countCourseObjectives,
  countLearningMissionSteps,
  countPendingLearningEvaluations,
  countViewerPendingLearningReviews,
  countPublishedCourseObjectives,
  findCourse,
  findLearningActivity,
  findLearningCanvasEvidence,
  findLearningDocumentEvidence,
  findLearningEvaluationAttempt,
  findLearningMission,
  findEligibleLearningMissionCoordinator,
  findLearningRoomState,
  findNotificationPreferences,
  findVerifiedUser,
  insertCourse,
  insertCourseInvitation,
  insertLearningObjective,
  insertLearningObjectiveDependency,
  insertLearningActivity,
  insertLearningActivityAttempt,
  insertAgentLearningAttempt,
  insertLearningMissionStep,
  independentLearningEvidenceKeys,
  insertLearningEvaluation,
  insertLearningMasteryEvent,
  enqueueLearningMissionCoordinatorWork,
  invitationViewer,
  joinInvitationCompany,
  listCourseInvitations,
  listCourseMembers,
  listCourses,
  listDeliveries,
  listDueLearningMastery,
  listLearningCourseProgress,
  listLearningCourseSummaries,
  listLearningEvidenceRecords,
  listLearningObjectives,
  listLearningActivities,
  listLearningMissions,
  listPendingLearningEvaluationRecords,
  listViewerLearningMastery,
  learningMissionCompletionSummary,
  learningMissionPlanningSummary,
  learningChannelType,
  learningMasteryContext,
  learningEvaluationEvidenceKey,
  learningMasteryLevels,
  lockCourseInvitation,
  priorCourseAcceptance,
  publishLearningActivityRecord,
  recordCourseAcceptance,
  removeMemberFromProjectChannels,
  reviewLearningEvaluationRecord,
  revokeCourseInvitation,
  setCourseArchived,
  setLearningCourseMembershipRecord,
  studyRoomState,
  syncStudyRoomMembers,
  lockLearningActivityForPublish,
  lockLearningMission,
  lockLearningMastery,
  lockPendingLearningEvaluation,
  owningCourseRole,
  updateCourseMetadata,
  updateLearningObjectiveStatus,
  updateLearningMissionCoordinator,
  updateLearningMissionStepRecord,
  upsertLearningMastery,
  upsertLearningCourseRoom,
  upsertNotificationPreferences,
  upsertLearningMission,
  upsertAcceptedCourseMembership,
  verifyIndependentLearningReport,
  markLearningAttemptEvaluated,
} from './repository.js'
import type {
  LearningActivityType,
  LearningAssistance,
  LearningMission,
  LearningMissionKind,
  LearningTurnContext,
  MasteryProjectionDecision,
} from '../../learning/types.js'
import { enqueueLearningEffect } from './effects-repository.js'
import type { LearningEffect } from './effects-repository.js'

export type LearningApplicationErrorCode = 'invalid' | 'not_found' | 'forbidden' | 'conflict' | 'gone' | 'unauthorized'

export class LearningApplicationError extends Error {
  constructor(readonly code: LearningApplicationErrorCode, message: string) { super(message) }
}

const REVIEW_INTERVAL_BY_LEVEL = [1, 1, 3, 7, 21] as const

export interface LearningInfrastructure {
  transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T>
  audit(event: { kind: string; userId: string; companyId: string; detail: Record<string, unknown> }): Promise<void>
  ensureTeacherAgent(courseId: string, db: Pick<PoolClient, 'query'>): Promise<{ created: boolean }>
  syncTeacherRoom(courseId: string): Promise<void>
  welcomeTeacherAgent(courseId: string): Promise<void>
  closeTeacherRoom(courseId: string): Promise<void>
  reactivateTeacherRoom(courseId: string): Promise<void>
  ensureNotebook(projectId: string, companyId: string): Promise<void>
  syncNotebook(projectId: string): Promise<void>
  syncChannel(channel: { channelId: string; title: string; members: string[]; leaderAgentId?: string }): Promise<void>
  revokeDocumentSubscriptions(userId: string, projectId: string): Promise<void>
  publishDocumentAccessRevoked(event: { companyId: string; workspaceId: string; userId: string }): Promise<void>
  seedMemberDms(companyId: string, userId: string): Promise<void>
  generateInvitationToken(): string
  hashInvitationToken(token: string): string
  invitationUrl(token: string): string
  avatarForEmail(email: string): string
  teacherAgentSummary(courseId: string, userId: string): Promise<unknown>
  metric(name: string, tags?: Record<string, string>): void
}

const privilegedRoles = new Set(['owner', 'admin'])

export type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

export async function requireLearningCourseRole(
  db: Queryable,
  input: { courseId: string; userId: string; role: 'teacher'|'learner'; companyId?: string },
): Promise<void> {
  const membership = input.companyId
    ? await courseRole(db, input.courseId, input.companyId, input.userId).then((role) => (
      role ? { company_id: input.companyId as string, role } : null
    ))
    : await owningCourseRole(db, input.courseId, input.userId)
  if (!membership || membership.role !== input.role) {
    throw new LearningApplicationError('forbidden', `course ${input.role} role required`)
  }
}

async function requireLearningCourseManager(
  db: Queryable,
  input: { companyId: string; courseId: string; userId: string },
) {
  const manager = await courseManager(db, input.courseId, input.userId)
  if (!manager || manager.companyId !== input.companyId) {
    throw new LearningApplicationError('not_found', 'course not found')
  }
  if (!privilegedRoles.has(manager.companyRole) && manager.courseRole !== 'teacher') {
    throw new LearningApplicationError('forbidden', 'course manager role required')
  }
  return manager
}

export async function setLearningCourseMembership(
  db: Queryable,
  transaction: LearningTransaction,
  input: {
    companyId: string; courseId: string; managerId: string; userId: string
    role: 'teacher'|'learner'; enabled: boolean
  },
): Promise<void> {
  await requireLearningCourseManager(db, {
    companyId: input.companyId, courseId: input.courseId, userId: input.managerId,
  })
  const outcome = await transaction((client) => setLearningCourseMembershipRecord(client, input))
  if (outcome === 'not_found') {
    throw new LearningApplicationError('not_found', 'course or company member not found')
  }
  if (outcome === 'last_teacher') {
    throw new LearningApplicationError('conflict', 'cannot remove the final course teacher')
  }
}

export async function bindLearningCourseRoom(
  db: Queryable,
  input: {
    companyId: string; courseId: string; managerId: string; conversationId: string
    purpose?: 'lab'|'discussion'; enabled: boolean
  },
): Promise<void> {
  await requireLearningCourseManager(db, {
    companyId: input.companyId, courseId: input.courseId, userId: input.managerId,
  })
  if (!input.enabled) {
    await deleteLearningCourseRoom(db, input)
    return
  }
  if (!input.purpose) throw new LearningApplicationError('invalid', 'room purpose is required')
  if (!await upsertLearningCourseRoom(db, {
    ...input, purpose: input.purpose, createdBy: input.managerId,
  })) throw new LearningApplicationError('not_found', 'room must be a group in the course project')
}

function learningText(value: string, name: string, maxLength = 10_000): string {
  const text = value.trim()
  if (!text) throw new LearningApplicationError('invalid', `${name} is required`)
  if (text.length > maxLength) throw new LearningApplicationError('invalid', `${name} exceeds ${maxLength} characters`)
  return text
}

function learningLevel(value: number | undefined, defaultValue: 1|2|3|4): 1 | 2 | 3 | 4 {
  const level = value ?? defaultValue
  if (!Number.isInteger(level) || level < 1 || level > 4) {
    throw new LearningApplicationError('invalid', 'targetLevel must be between 1 and 4')
  }
  return level as 1 | 2 | 3 | 4
}

export async function createLearningObjectives(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningObjectivesCommand,
) {
  if (!input.objectives.length || input.objectives.length > 100) {
    throw new LearningApplicationError('invalid', 'objectives must contain between 1 and 100 items')
  }
  await transaction(async (client) => {
    if (input.actorKind === 'teacher') {
      const role = await courseRole(client, input.courseId, input.companyId, input.actorId)
      if (role !== 'teacher') throw new LearningApplicationError('forbidden', 'course teacher role required')
    }
    for (const [position, objective] of input.objectives.entries()) {
      const objectiveId = randomUUID()
      await insertLearningObjective(client, {
        id: objectiveId,
        companyId: input.companyId,
        courseId: input.courseId,
        actorId: input.actorId,
        title: learningText(objective.title, 'objective title'),
        successCriteria: learningText(objective.successCriteria, 'successCriteria'),
        targetLevel: learningLevel(objective.targetLevel, 3),
        position,
      })
      for (const prerequisiteId of objective.prerequisiteIds ?? []) {
        await insertLearningObjectiveDependency(client, {
          companyId: input.companyId,
          courseId: input.courseId,
          objectiveId,
          prerequisiteId,
        })
      }
    }
  })
  return listLearningObjectives(db, input.companyId, input.courseId)
}

export async function createLearningActivity(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningActivityCommand,
) {
  const objectiveIds = [...new Set(input.objectiveIds ?? [])]
  const rubric = Array.isArray(input.rubric) ? input.rubric : []
  if (objectiveIds.length > 100 || rubric.length > 100) {
    throw new LearningApplicationError('invalid', 'activity objective and rubric lists are limited to 100 items')
  }
  const activityId = randomUUID()
  await transaction(async (client) => {
    if (input.actorKind === 'teacher') {
      const role = await courseRole(client, input.courseId, input.companyId, input.actorId)
      if (role !== 'teacher') throw new LearningApplicationError('forbidden', 'course teacher role required')
    }
    if (objectiveIds.length
      && await countCourseObjectives(client, input.companyId, input.courseId, objectiveIds) !== objectiveIds.length) {
      throw new LearningApplicationError('invalid', 'every activity objective must belong to the current course')
    }
    await insertLearningActivity(client, {
      id: activityId,
      companyId: input.companyId,
      courseId: input.courseId,
      actorId: input.actorId,
      title: learningText(input.title, 'title'),
      instructions: learningText(input.instructions, 'instructions'),
      type: input.type,
      evaluationMode: input.evaluationMode ?? 'teacher_required',
      targetLevel: learningLevel(input.targetLevel, 2),
      rubric,
      objectiveIds,
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    })
  })
  const activity = await findLearningActivity(db, input.companyId, input.courseId, activityId)
  if (!activity) throw new LearningApplicationError('not_found', 'activity not found after creation')
  return activity
}

export async function publishLearningActivity(
  transaction: LearningTransaction,
  input: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<void> {
  await transaction(async (client) => {
    const activity = await lockLearningActivityForPublish(
      client, input.companyId, input.courseId, input.activityId,
    )
    if (!activity) throw new LearningApplicationError('not_found', 'draft activity not found')
    if (!activity.objectiveIds.length
      || await countPublishedCourseObjectives(
        client, input.companyId, input.courseId, activity.objectiveIds,
      ) !== activity.objectiveIds.length) {
      throw new LearningApplicationError('conflict', 'published activities require at least one published objective')
    }
    if (['assessment','project'].includes(activity.type) && !activity.rubric.length) {
      throw new LearningApplicationError('conflict', 'assessment and project activities require a rubric')
    }
    if (!await publishLearningActivityRecord(client, input)) {
      throw new LearningApplicationError('not_found', 'draft activity not found')
    }
  })
}

export async function closeLearningActivity(
  db: Queryable,
  input: { companyId: string; courseId: string; activityId: string; teacherId: string },
): Promise<void> {
  if (!await closeLearningActivityRecord(db, input)) {
    throw new LearningApplicationError('not_found', 'published activity not found')
  }
}

export async function submitLearningActivity(
  db: Queryable,
  input: {
    companyId: string; courseId: string; activityId: string; learnerId: string
    answer: string; assistance?: 'none'|'hint'|'guided'; idempotencyKey: string
  },
): Promise<{ attemptId: string }> {
  const attemptId = randomUUID()
  const acceptedId = await insertLearningActivityAttempt(db, {
    id: attemptId,
    companyId: input.companyId,
    courseId: input.courseId,
    activityId: input.activityId,
    learnerId: input.learnerId,
    assistance: input.assistance ?? 'none',
    answer: learningText(input.answer, 'answer', 100_000),
    idempotencyKey: input.idempotencyKey,
  })
  if (!acceptedId) throw new LearningApplicationError('not_found', 'published activity not found')
  return { attemptId: acceptedId }
}

export async function getLearningMission(
  db: Queryable,
  companyId: string,
  courseId: string,
  missionId: string,
) {
  const mission = await findLearningMission(db, companyId, courseId, missionId)
  if (!mission) throw new LearningApplicationError('not_found', 'mission not found')
  return mission
}

export async function listVisibleLearningMissions(
  db: Queryable,
  scope: LearningScope,
  courseId: string,
) {
  const role = await courseRole(db, courseId, scope.companyId, scope.userId)
  if (!role) throw new LearningApplicationError('forbidden', 'course membership required')
  return listLearningMissions(db, {
    companyId: scope.companyId,
    courseId,
    userId: scope.userId,
    includeAllLearners: role === 'teacher',
  })
}

export async function assignLearningMissionCoordinator(
  db: Queryable,
  input: { companyId: string; courseId: string; missionId: string; teacherId: string; agentId: string },
) {
  if (!await updateLearningMissionCoordinator(db, input)) {
    throw new LearningApplicationError(
      'not_found',
      'mission or eligible learning/canvas coordinator not found',
    )
  }
  return getLearningMission(db, input.companyId, input.courseId, input.missionId)
}

async function requireLearningRoomState(db: Queryable, scope: LearningAgentRoomScope) {
  const room = await findLearningRoomState(db, scope)
  if (!room) throw new LearningApplicationError('not_found', 'current conversation is not bound to a learning course')
  return room
}

export interface LearningMissionInfrastructure {
  syncMessages(input: {
    channelId: string; channelType: number; limit: number; loginUid: string
  }): Promise<Array<{ clientMsgNo: string; fromUid: string; authoredByAgent: boolean }>>
  publishMission(input: {
    channelId: string; channelType: number; senderId: string; mission: LearningMission; courseId: string
  }): Promise<void>
  metric(name: string, labels?: Record<string, string>): void
}

export function preferredLearningMissionCoordinator(kind: LearningMissionKind): 'nova'|'scout'|'forge' {
  return kind === 'project' ? 'forge' : kind === 'research' ? 'scout' : 'nova'
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
      'automatic missions are allowed only in course-bound study rooms; set explicit=true only for a direct learner request',
    )
  }
  const triggerClientMsgNo = input.sourceClientMsgNo?.trim() || input.triggerClientMsgNo
  const channelType = await learningChannelType(db, input.companyId, input.channelId)
  const messages = await infrastructure.syncMessages({
    channelId: input.channelId, channelType, limit: 100, loginUid: input.agentId,
  })
  const trigger = messages.find((message) => message.clientMsgNo === triggerClientMsgNo)
  if (!trigger || trigger.authoredByAgent) {
    throw new LearningApplicationError('invalid', 'evidence must reference an existing human message in the current room')
  }
  if (await courseRole(db, room.courseId, room.companyId, trigger.fromUid) !== 'learner') {
    throw new LearningApplicationError('forbidden', 'mission evidence author must be a learner in the current course')
  }
  const missionKind = input.missionKind ?? (room.purpose === 'lab' ? 'project' : 'study')
  const goal = learningText(input.goal, 'goal')
  const successCriteria = learningText(input.successCriteria, 'successCriteria')
  const result = await transaction(async (client) => {
    const coordinatorAgentId = await findEligibleLearningMissionCoordinator(client, {
      companyId: input.companyId,
      channelId: input.channelId,
      preferredPreset: preferredLearningMissionCoordinator(missionKind),
      currentAgentId: input.agentId,
    })
    if (!coordinatorAgentId) {
      throw new LearningApplicationError('conflict', 'no eligible Mission coordinator is available in the current learning room')
    }
    const stored = await upsertLearningMission(client, {
      id: randomUUID(), companyId: room.companyId, courseId: room.courseId,
      learnerId: trigger.fromUid, channelId: input.channelId, triggerClientMsgNo,
      goal, successCriteria, missionKind, coordinatorAgentId, createdBy: input.agentId,
    })
    if (stored.inserted && coordinatorAgentId !== input.agentId) {
      await enqueueLearningMissionCoordinatorWork(client, {
        id: `mission-coordinator-${createHash('sha256').update(stored.id).digest('hex').slice(0, 24)}`,
        companyId: input.companyId, coordinatorAgentId, channelId: input.channelId,
        threadRootClientMsgNo: input.threadRootClientMsgNo ?? triggerClientMsgNo,
        missionId: stored.id,
      })
    }
    const mission = await findLearningMission(client, room.companyId, room.courseId, stored.id)
    if (!mission) throw new LearningApplicationError('conflict', 'mission could not be loaded after creation')
    return { mission, inserted: stored.inserted }
  })
  infrastructure.metric(
    result.inserted ? 'learning.mission.created' : 'learning.mission.deduplicated',
    result.inserted ? { mode: 'agent' } : undefined,
  )
  await infrastructure.publishMission({
    channelId: input.channelId, channelType, senderId: input.agentId,
    mission: result.mission, courseId: room.courseId,
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
  if (refs.length > 20) {
    throw new LearningApplicationError('invalid', 'one attempt may reference at most 20 evidence messages')
  }
  if (documentIds.length > 20 || canvasFrameIds.length > 20) {
    throw new LearningApplicationError('invalid', 'one attempt may reference at most 20 documents and 20 Canvas Frames')
  }
  const room = await requireLearningRoomState(db, input)
  const channelType = await learningChannelType(db, input.companyId, input.channelId)
  const messages = refs.length ? await infrastructure.syncMessages({
    channelId: input.channelId, channelType, limit: 100, loginUid: input.agentId,
  }) : []
  const result = await transaction(async (client) => {
    const learnerIds = new Set<string>()
    for (const ref of refs) {
      const message = messages.find((candidate) => candidate.clientMsgNo === ref)
      if (!message || message.authoredByAgent) {
        throw new LearningApplicationError('invalid', 'evidence must reference an existing human message in the current room')
      }
      if (await courseRole(client, room.courseId, room.companyId, message.fromUid) !== 'learner') {
        throw new LearningApplicationError('forbidden', 'evidence author must be a learner in the current course')
      }
      learnerIds.add(message.fromUid)
    }
    const documents: Array<{ id: string; revision: number; authorId: string }> = []
    for (const documentId of documentIds) {
      const evidence = await findLearningDocumentEvidence(client, {
        companyId: room.companyId, projectId: room.projectId, documentId,
      })
      if (!evidence) throw new LearningApplicationError('not_found', 'document evidence is outside the current course project')
      if (await courseRole(client, room.courseId, room.companyId, evidence.authorId) !== 'learner') {
        throw new LearningApplicationError('forbidden', 'document evidence author must be a learner in the current course')
      }
      learnerIds.add(evidence.authorId)
      documents.push(evidence)
    }
    const canvasFrames: Array<{ id: string; revision: number; authorId: string }> = []
    for (const frameId of canvasFrameIds) {
      const evidence = await findLearningCanvasEvidence(client, {
        companyId: room.companyId, projectId: room.projectId, frameId,
      })
      if (!evidence) throw new LearningApplicationError('not_found', 'Canvas Frame evidence is outside the current course project')
      if (await courseRole(client, room.courseId, room.companyId, evidence.authorId) !== 'learner') {
        throw new LearningApplicationError('forbidden', 'Canvas Frame evidence author must be a learner in the current course')
      }
      learnerIds.add(evidence.authorId)
      canvasFrames.push(evidence)
    }
    if (learnerIds.size !== 1) {
      throw new LearningApplicationError('invalid', 'one attempt cannot combine evidence from multiple learners')
    }
    const learnerId = [...learnerIds][0]
    const id = randomUUID()
    const inserted = await insertAgentLearningAttempt(client, {
      id, companyId: room.companyId, courseId: room.courseId, channelId: input.channelId,
      learnerId, ...(input.activityId ? { activityId: input.activityId } : {}),
      ...(input.missionStepId ? { missionStepId: input.missionStepId } : {}),
      assistance: input.assistance ?? 'none',
      evidence: {
        kind: 'host_references', conversationId: input.channelId,
        clientMsgNos: refs, documents, canvasFrames,
      },
    })
    if (!inserted) {
      throw new LearningApplicationError('not_found', 'published activity or mission step is outside the current course')
    }
    return { id, learnerId }
  })
  infrastructure.metric('learning.attempt.accepted', { source: 'message' })
  return result
}

export async function loadLearningContext(
  db: Queryable,
  infrastructure: Pick<LearningMissionInfrastructure, 'syncMessages'>,
  input: LearningAgentRoomScope & {
    agentId: string; triggerClientMsgNo: string; actorId?: string
  },
): Promise<LearningTurnContext | undefined> {
  const room = await findLearningRoomState(db, input)
  if (!room) return undefined
  let resolvedActorId = input.actorId
  if (!resolvedActorId) {
    const channelType = await learningChannelType(db, input.companyId, input.channelId)
    const messages = await infrastructure.syncMessages({
      channelId: input.channelId, channelType, limit: 100, loginUid: input.agentId,
    })
    const trigger = messages.find((message) => (
      message.clientMsgNo === input.triggerClientMsgNo && !message.authoredByAgent
    ))
    resolvedActorId = trigger?.fromUid
      ?? [...messages].reverse().find((message) => !message.authoredByAgent)?.fromUid
  }
  const role = resolvedActorId
    ? await courseRole(db, room.courseId, room.companyId, resolvedActorId)
    : null
  const learnerId = role === 'learner' ? resolvedActorId : undefined
  const objectives = await listLearningObjectives(db, room.companyId, room.courseId)
  const mastery = learnerId ? await learningMasteryContext(db, {
    companyId: room.companyId, courseId: room.courseId, learnerId,
  }) : []
  const byObjective = new Map(mastery.map((item) => [item.objectiveId,item]))
  const missionId = learnerId ? await activeLearningMissionId(db, {
    companyId: room.companyId, courseId: room.courseId, learnerId, channelId: input.channelId,
  }) : null
  const pendingTeacherReviews = role === 'teacher'
    ? await countPendingLearningEvaluations(db, room.companyId, room.courseId)
    : 0
  const mapped = objectives.slice(0, 40).map((objective) => {
    const state = byObjective.get(objective.id)
    return {
      ...objective,
      masteryLevel: state?.level ?? 0,
      masteryStatus: state?.status ?? 'learning',
      ...(state?.nextReviewAt ? { nextReviewAt: state.nextReviewAt } : {}),
    }
  })
  const activeMission = missionId
    ? await findLearningMission(db, room.companyId, room.courseId, missionId)
    : null
  return {
    course: {
      id: room.courseId, projectId: room.projectId, title: room.courseTitle, status: room.courseStatus,
    },
    roomPurpose: room.purpose,
    ...(role ? { actorRole: role } : {}),
    ...(learnerId ? { learnerId } : {}),
    ...(activeMission ? { activeMission } : {}),
    objectives: mapped,
    due: mapped.filter((item) => item.nextReviewAt && new Date(item.nextReviewAt) <= new Date())
      .slice(0, 12).map((item) => ({
        objectiveId: item.id, title: item.title, level: item.masteryLevel,
        nextReviewAt: item.nextReviewAt as string,
      })),
    pendingTeacherReviews,
  }
}

async function applyLearningEvaluationToMastery(
  db: Queryable,
  metric: LearningMissionInfrastructure['metric'],
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
  metric: LearningMissionInfrastructure['metric'],
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
  metric: LearningMissionInfrastructure['metric'],
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
  metric: LearningMissionInfrastructure['metric'],
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

export async function addLearningMissionSteps(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  missionId: string,
  steps: AddLearningMissionStepInput[],
) {
  if (!steps.length || steps.length > 64) {
    throw new LearningApplicationError('invalid', 'steps must contain between 1 and 64 items')
  }
  const room = await requireLearningRoomState(db, scope)
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope, courseId: room.courseId, missionId, statuses: ['planning','active','paused'],
    })) throw new LearningApplicationError('not_found', 'mission not found in current learning room')
    let position = await countLearningMissionSteps(client, missionId)
    for (const step of steps) {
      if (step.objectiveId
        && await countCourseObjectives(client, room.companyId, room.courseId, [step.objectiveId]) !== 1) {
        throw new LearningApplicationError('invalid', 'mission step objective must belong to the current course')
      }
      const inserted = await insertLearningMissionStep(client, {
        id: randomUUID(),
        missionId,
        type: step.type,
        description: learningText(step.description, 'step description'),
        successCriteria: learningText(step.successCriteria, 'step successCriteria'),
        ...(step.objectiveId ? { objectiveId: step.objectiveId } : {}),
        position: position++,
      })
      if (!inserted) position--
    }
    if (await countLearningMissionSteps(client, missionId) < 1) {
      throw new LearningApplicationError('conflict', 'mission requires at least one checkable step')
    }
  })
  return getLearningMission(db, room.companyId, room.courseId, missionId)
}

export async function finishLearningMissionPlanning(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  missionId: string,
) {
  const room = await requireLearningRoomState(db, scope)
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope, courseId: room.courseId, missionId, statuses: ['planning'],
    })) throw new LearningApplicationError('not_found', 'planning Mission not found in the current learning room')
    const summary = await learningMissionPlanningSummary(client, missionId)
    if (summary.total < 1) throw new LearningApplicationError('conflict', 'planning gate blocked: add concrete Mission steps first')
    if (summary.checks < 1) throw new LearningApplicationError('conflict', 'planning gate blocked: add at least one check step with observable success criteria')
    if (summary.reflections < 1) throw new LearningApplicationError('conflict', 'planning gate blocked: add a reflect step before execution')
    if (!await activateLearningMission(client, missionId)) {
      throw new LearningApplicationError('conflict', 'Mission planning state changed')
    }
  })
  return getLearningMission(db, room.companyId, room.courseId, missionId)
}

export async function updateLearningMissionStep(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  input: {
    missionId: string; stepId: string; status: 'open'|'in_progress'|'completed'|'cancelled'
    outcome?: string; sourceReportId?: string; attemptId?: string
  },
) {
  if (input.status === 'completed' && !input.outcome?.trim()) {
    throw new LearningApplicationError('invalid', 'completed mission steps require an outcome')
  }
  if (input.status === 'completed' && !input.sourceReportId && !input.attemptId) {
    throw new LearningApplicationError('invalid', 'completed mission steps require a persisted report or learner attempt')
  }
  const room = await requireLearningRoomState(db, scope)
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope, courseId: room.courseId, missionId: input.missionId, statuses: ['active','paused'],
    })) throw new LearningApplicationError('not_found', 'active Mission not found in the current learning room')
    if (!await updateLearningMissionStepRecord(client, {
      ...scope, courseId: room.courseId, ...input,
    })) throw new LearningApplicationError('not_found', 'mission step or completion evidence not found')
  })
  return getLearningMission(db, room.companyId, room.courseId, input.missionId)
}

export async function completeLearningMission(
  db: Queryable,
  transaction: LearningTransaction,
  scope: LearningAgentRoomScope,
  missionId: string,
) {
  const room = await requireLearningRoomState(db, scope)
  await transaction(async (client) => {
    if (!await lockLearningMission(client, {
      ...scope, courseId: room.courseId, missionId, statuses: ['active','paused'],
    })) throw new LearningApplicationError('not_found', 'active Mission not found in the current learning room')
    const summary = await learningMissionCompletionSummary(client, missionId)
    if (summary.unresolved > 0) throw new LearningApplicationError('conflict', 'mission has unresolved steps')
    if (summary.reflections < 1) throw new LearningApplicationError('conflict', 'mission requires a completed reflection step')
    if (!await completeLearningMissionRecord(client, missionId)) {
      throw new LearningApplicationError('conflict', 'Mission state changed before completion')
    }
  })
  return getLearningMission(db, room.companyId, room.courseId, missionId)
}

export async function setLearningObjectiveStatus(
  db: Queryable,
  input: {
    companyId: string
    courseId: string
    objectiveId: string
    teacherId: string
    status: 'draft' | 'published' | 'archived'
  },
): Promise<void> {
  if (!await updateLearningObjectiveStatus(db, input)) {
    throw new LearningApplicationError('not_found', 'objective not found')
  }
}

export class LearningApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: LearningInfrastructure) {}

  courses(scope: LearningScope) { return listCourses(this.db, scope.companyId, scope.userId) }

  async runEffect(effect: LearningEffect): Promise<void> {
    const payload = effect.payload
    switch (effect.kind) {
      case 'study_room.sync':
        await this.syncStudyRoom(effect.courseId)
        return
      case 'teacher_room.sync':
        await this.infrastructure.syncTeacherRoom(effect.courseId)
        return
      case 'teacher_agent.welcome':
        await this.infrastructure.welcomeTeacherAgent(effect.courseId)
        return
      case 'notebook.ensure': {
        const projectId = String(payload.projectId ?? '')
        if (!projectId) throw new Error('notebook effect requires projectId')
        await this.infrastructure.ensureNotebook(projectId, effect.companyId)
        return
      }
      case 'course_create.audit':
        await this.infrastructure.audit({
          kind: 'course_create', companyId: effect.companyId,
          userId: String(payload.userId ?? ''),
          detail: { courseId: effect.courseId, projectId: payload.projectId, name: payload.name },
        })
    }
  }

  async createCourse(scope: LearningScope, input: CreateCourseInput) {
    const permission = await canCreateCourse(this.db, scope.companyId, scope.userId)
    if (!permission) throw new LearningApplicationError('forbidden', 'not a member of this company')
    if (!privilegedRoles.has(permission.company_role) && !permission.is_teacher) {
      throw new LearningApplicationError('forbidden', 'only a company admin or existing teacher can create courses')
    }
    const projectId = `p-${randomUUID().slice(0, 10)}`
    const courseId = `course-${randomUUID().slice(0, 12)}`
    const roomId = `course-room-${randomUUID().slice(0, 12)}`
    await this.infrastructure.transaction(async (db) => {
      await insertCourse(db, { ...scope, projectId, courseId, roomId, input })
      const teacher = await this.infrastructure.ensureTeacherAgent(courseId, db)
      const effects = [
        { kind: 'study_room.sync' as const },
        { kind: 'teacher_room.sync' as const },
        ...(teacher.created ? [{ kind: 'teacher_agent.welcome' as const }] : []),
        { kind: 'notebook.ensure' as const, payload: { projectId } },
        { kind: 'course_create.audit' as const, payload: { userId: scope.userId, projectId, name: input.name } },
      ]
      for (const effect of effects) {
        await enqueueLearningEffect(db, {
          companyId: scope.companyId, courseId, kind: effect.kind, payload: effect.payload,
        })
      }
    })
    return {
      id: courseId, companyId: scope.companyId, projectId, name: input.name,
      description: input.description, color: input.color, status: 'active',
      createdBy: scope.userId, studyRoomId: roomId, courseRole: 'teacher', memberCount: 1,
      canManage: true, knowledgeState: 'pending' as const,
    }
  }

  async course(scope: LearningScope, courseId: string) {
    const course = await findCourse(this.db, courseId, scope.companyId, scope.userId)
    if (!course) throw new LearningApplicationError('not_found', 'course not found')
    return course
  }

  async updateCourse(userId: string, courseId: string, patch: UpdateCourseInput) {
    const manager = await this.manager(userId, courseId, true)
    await updateCourseMetadata(this.db, { courseId, companyId: manager.companyId, projectId: manager.projectId, patch })
    if (patch.name !== undefined) await this.syncStudyRoom(courseId)
    await this.infrastructure.syncNotebook(manager.projectId)
    await this.infrastructure.audit({
      kind: 'course_update', userId, companyId: manager.companyId,
      detail: { courseId, ...patch },
    })
    return { ok: true as const }
  }

  async archiveCourse(userId: string, courseId: string, archive: boolean) {
    const manager = await this.manager(userId, courseId)
    await setCourseArchived(this.db, manager.companyId, manager.projectId, archive)
    if (archive) await this.infrastructure.closeTeacherRoom(courseId)
    else await this.infrastructure.reactivateTeacherRoom(courseId)
    await this.infrastructure.syncNotebook(manager.projectId)
    await this.infrastructure.audit({
      kind: archive ? 'course_archive' : 'course_unarchive', userId, companyId: manager.companyId,
      detail: { courseId },
    })
    return { ok: true as const, status: archive ? 'archived' : 'active' }
  }

  async members(userId: string, courseId: string) {
    const manager = await this.manager(userId, courseId)
    return listCourseMembers(this.db, courseId, manager.companyId)
  }

  async updateMember(userId: string, courseId: string, targetId: string, role: 'teacher' | 'learner') {
    const manager = await this.manager(userId, courseId, true)
    const outcome = await this.infrastructure.transaction((db) => changeCourseMember(db, {
      courseId, companyId: manager.companyId, userId: targetId, role,
    }))
    this.assertMemberChange(outcome)
    await this.infrastructure.syncTeacherRoom(courseId)
    await this.infrastructure.audit({
      kind: 'course_member_role_update', userId, companyId: manager.companyId,
      detail: { courseId, targetId, role },
    })
    return { ok: true as const, userId: targetId, role }
  }

  async removeMember(userId: string, courseId: string, targetId: string) {
    const manager = await this.manager(userId, courseId, true)
    const channels = await this.infrastructure.transaction(async (db) => {
      const outcome = await changeCourseMember(db, {
        courseId, companyId: manager.companyId, userId: targetId, role: null,
      })
      this.assertMemberChange(outcome)
      return removeMemberFromProjectChannels(db, {
        companyId: manager.companyId, projectId: manager.projectId, userId: targetId,
      })
    })
    await Promise.allSettled([
      ...channels.map((channel) => this.infrastructure.syncChannel({
        channelId: channel.id, title: channel.title, members: channel.members,
      })),
      this.infrastructure.revokeDocumentSubscriptions(targetId, manager.projectId),
      this.infrastructure.publishDocumentAccessRevoked({
        companyId: manager.companyId, workspaceId: manager.projectId, userId: targetId,
      }),
      this.syncStudyRoom(courseId),
      this.infrastructure.syncTeacherRoom(courseId),
      this.infrastructure.audit({
        kind: 'course_member_remove', userId, companyId: manager.companyId,
        detail: { courseId, targetId },
      }),
    ])
    return { ok: true as const }
  }

  async invitations(userId: string, courseId: string) {
    const manager = await this.manager(userId, courseId)
    return listCourseInvitations(this.db, courseId, manager.companyId)
  }

  async createInvitation(userId: string, courseId: string, input: CreateCourseInvitationInput) {
    const manager = await this.manager(userId, courseId, true, 'archived courses cannot issue invitations')
    const token = this.infrastructure.generateInvitationToken()
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000)
    const email = input.email?.toLowerCase() || null
    const note = input.note || null
    await this.infrastructure.transaction((db) => insertCourseInvitation(db, {
      tokenHash, courseId, companyId: manager.companyId, userId, email,
      role: input.role, note, maxUses: input.maxUses, expiresAt,
    }))
    await this.infrastructure.audit({
      kind: 'course_invitation_create', userId, companyId: manager.companyId,
      detail: { courseId, email, role: input.role, maxUses: input.maxUses, expiresInDays: input.expiresInDays },
    })
    return {
      id: tokenHash, token, url: this.infrastructure.invitationUrl(token), email, role: input.role,
      note, maxUses: input.maxUses, useCount: 0, createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(), status: 'active',
    }
  }

  async revokeInvitation(userId: string, courseId: string, invitationId: string) {
    const manager = await this.manager(userId, courseId)
    const revoked = await revokeCourseInvitation(this.db, courseId, manager.companyId, invitationId)
    if (revoked) await this.infrastructure.audit({
      kind: 'course_invitation_revoke', userId, companyId: manager.companyId,
      detail: { courseId, invitationId },
    })
    return { ok: true as const, revoked }
  }

  async invitationPreview(token: string, viewerId?: string) {
    const invitation = await courseInvitationPreview(this.db, this.infrastructure.hashInvitationToken(token))
    if (!invitation) return { status: 'not_found', kind: 'course' as const }
    let status = invitation.revoked_at ? 'revoked'
      : new Date(invitation.expires_at).getTime() < Date.now() ? 'expired'
        : invitation.use_count >= invitation.max_uses ? 'consumed'
          : invitation.project_status !== 'active' ? 'archived' : 'valid'
    if (viewerId) {
      const viewer = await invitationViewer(this.db, viewerId, invitation.course_id)
      if (viewer?.role && (viewer.role === 'teacher' || invitation.role === viewer.role)) status = 'already_member'
      else if (invitation.email && viewer?.email.toLowerCase() !== invitation.email) status = 'wrong_email'
    }
    return {
      kind: 'course' as const, status,
      invitation: {
        role: invitation.role, email: invitation.email, note: invitation.note,
        expiresAt: new Date(invitation.expires_at).toISOString(), inviterName: invitation.inviter_name,
        company: { id: invitation.company_id, name: invitation.company_name, slug: invitation.company_slug },
        course: {
          id: invitation.course_id, name: invitation.course_name, projectId: invitation.project_id,
          studyRoomId: invitation.room_id,
        },
      },
    }
  }

  async acceptInvitation(userId: string, token: string) {
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const user = await findVerifiedUser(this.db, userId)
    if (!user) throw new LearningApplicationError('unauthorized', 'session points to missing user')
    if (!user.email_verified_at) {
      throw new LearningApplicationError('forbidden', 'a verified email is required to accept a course invitation')
    }
    const result = await this.infrastructure.transaction(async (db) => {
      const invitation = await lockCourseInvitation(db, tokenHash, userId)
      if (!invitation) throw new LearningApplicationError('not_found', 'invitation not found')
      if (invitation.revoked_at) throw new LearningApplicationError('gone', 'invitation revoked')
      if (new Date(invitation.expires_at).getTime() < Date.now()) {
        throw new LearningApplicationError('gone', 'invitation expired')
      }
      if (invitation.project_status !== 'active') throw new LearningApplicationError('gone', 'course archived')
      if (invitation.email && invitation.email !== user.email.toLowerCase()) {
        throw new LearningApplicationError('forbidden', `this invitation is reserved for ${invitation.email}`)
      }
      const prior = await priorCourseAcceptance(db, tokenHash, userId)
      const companyRole = await companyMembershipRole(db, invitation.company_id, userId)
      const joinedCompany = !companyRole
      if (joinedCompany) await joinInvitationCompany(db, {
        companyId: invitation.company_id, userId, displayName: user.display_name,
        avatarUrl: user.avatar_url ?? this.infrastructure.avatarForEmail(user.email),
      })
      const existingRole = await courseMembershipRole(db, invitation.course_id, userId)
      if (prior && !existingRole) {
        throw new LearningApplicationError('gone', 'this invitation was already accepted and no longer grants course access')
      }
      let role: 'teacher' | 'learner' = prior
        ? existingRole!
        : existingRole === 'teacher' || invitation.role === 'teacher' ? 'teacher' : 'learner'
      const changesRole = !prior && (!existingRole || role !== existingRole)
      if (changesRole && invitation.use_count >= invitation.max_uses) {
        throw new LearningApplicationError('gone', 'invitation already used')
      }
      if (changesRole) role = await upsertAcceptedCourseMembership(db, { invitation, userId, role })
      if (changesRole) await recordCourseAcceptance(db, { tokenHash, userId, role })
      return {
        companyId: invitation.company_id, companyName: invitation.company_name,
        companySlug: invitation.company_slug, companyRole: companyRole ?? 'member',
        courseId: invitation.course_id, courseName: invitation.course_name,
        projectId: invitation.project_id, roomId: invitation.room_id, role,
        alreadyMember: Boolean(existingRole) && !changesRole, joinedCompany,
      }
    })
    await this.syncStudyRoom(result.courseId)
    await this.infrastructure.syncTeacherRoom(result.courseId)
    if (result.joinedCompany) await this.infrastructure.seedMemberDms(result.companyId, userId)
    await this.infrastructure.audit({
      kind: 'course_invitation_accept', userId, companyId: result.companyId,
      detail: { courseId: result.courseId, role: result.role },
    })
    return {
      ok: true as const, alreadyMember: result.alreadyMember, joinedCompany: result.joinedCompany,
      company: {
        id: result.companyId, name: result.companyName, slug: result.companySlug, role: result.companyRole,
      },
      course: {
        id: result.courseId, name: result.courseName, projectId: result.projectId,
        studyRoomId: result.roomId, role: result.role,
      },
    }
  }

  dashboard(scope: LearningScope) {
    return this.classroom(async () => {
      const [courseRows, due, pendingReviews, mastery] = await Promise.all([
        listLearningCourseSummaries(this.db, scope.companyId, scope.userId),
        listDueLearningMastery(this.db, scope.companyId, scope.userId),
        countViewerPendingLearningReviews(this.db, scope.companyId, scope.userId),
        listViewerLearningMastery(this.db, scope.companyId, scope.userId),
      ])
      const courses = courseRows.map((row) => ({
        id: row.id, companyId: row.company_id, projectId: row.project_id, title: row.title,
        description: row.description, status: row.status, courseRole: row.course_role,
        roomCount: Number(row.room_count), objectiveCount: Number(row.objective_count),
        learnerCount: Number(row.learner_count), createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }))
      return { courses, due, mastery, pendingReviews }
    })
  }

  async teacherAgent(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => this.infrastructure.teacherAgentSummary(courseId, scope.userId))
  }

  async bindRoom(scope: LearningScope, courseId: string, conversationId: string, input: BindCourseRoomInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await bindLearningCourseRoom(this.db, {
        companyId: scope.companyId, courseId, managerId: scope.userId,
        conversationId, purpose: input.purpose, enabled: true,
      })
      return { ok: true as const }
    })
  }

  async objectives(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    const role = await courseRole(this.db, courseId, scope.companyId, scope.userId)
    if (!role) throw new LearningApplicationError('forbidden', 'course membership required')
    const objectives = await this.classroom(() => listLearningObjectives(this.db, scope.companyId, courseId))
    return role === 'teacher' ? objectives : objectives.filter((objective) => objective.status === 'published')
  }

  async createObjectives(scope: LearningScope, courseId: string, input: CreateObjectivesInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => createLearningObjectives(this.db, (work) => this.infrastructure.transaction(work), {
      companyId: scope.companyId,
      courseId,
      actorId: scope.userId,
      actorKind: 'teacher',
      objectives: input.objectives,
    }))
  }

  async setObjectiveStatus(scope: LearningScope, courseId: string, objectiveId: string, input: ObjectiveStatusInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await setLearningObjectiveStatus(this.db, {
        companyId: scope.companyId,
        courseId,
        objectiveId,
        teacherId: scope.userId,
        status: input.status,
      })
      return { ok: true as const }
    })
  }

  async activities(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    const role = await courseRole(this.db, courseId, scope.companyId, scope.userId)
    if (!role) throw new LearningApplicationError('forbidden', 'course membership required')
    return listLearningActivities(this.db, scope.companyId, courseId, role === 'teacher')
  }

  async createActivity(scope: LearningScope, courseId: string, input: CreateActivityInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => createLearningActivity(this.db, (work) => this.infrastructure.transaction(work), {
      companyId: scope.companyId,
      courseId,
      actorId: scope.userId,
      actorKind: 'teacher',
      ...input,
    }))
  }

  async activity(scope: LearningScope, courseId: string, activityId: string) {
    const visible = await this.activities(scope, courseId)
    const activity = visible.find((item) => item.id === activityId)
    if (!activity) throw new LearningApplicationError('not_found', 'activity not found')
    return activity
  }

  async publishActivity(scope: LearningScope, courseId: string, activityId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await publishLearningActivity((work) => this.infrastructure.transaction(work), {
        companyId: scope.companyId, courseId, activityId, teacherId: scope.userId,
      })
      return { ok: true as const }
    })
  }

  async closeActivity(scope: LearningScope, courseId: string, activityId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await closeLearningActivity(this.db, {
        companyId: scope.companyId, courseId, activityId, teacherId: scope.userId,
      })
      return { ok: true as const }
    })
  }

  async submitActivity(scope: LearningScope, courseId: string, activityId: string, input: SubmitActivityInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    const result = await this.classroom(() => submitLearningActivity(this.db, {
      companyId: scope.companyId, courseId, activityId, learnerId: scope.userId, ...input,
    }))
    this.infrastructure.metric('learning.attempt.accepted', { source: 'ui' })
    return result
  }

  async missions(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => listVisibleLearningMissions(this.db, scope, courseId))
  }

  async setMissionCoordinator(
    scope: LearningScope,
    courseId: string,
    missionId: string,
    input: MissionCoordinatorInput,
  ) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => assignLearningMissionCoordinator(this.db, {
      companyId: scope.companyId,
      courseId,
      missionId,
      teacherId: scope.userId,
      agentId: input.agentId,
    }))
  }

  async evidence(scope: LearningScope, courseId: string, learnerId = scope.userId) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      const role = await courseRole(this.db, courseId, scope.companyId, scope.userId)
      if (role !== 'teacher' && (role !== 'learner' || learnerId !== scope.userId)) {
        throw new LearningApplicationError('forbidden', 'course evidence access denied')
      }
      return listLearningEvidenceRecords(this.db, {
        companyId: scope.companyId, courseId, learnerId,
      })
    })
  }

  async reviews(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      if (await courseRole(this.db, courseId, scope.companyId, scope.userId) !== 'teacher') {
        throw new LearningApplicationError('forbidden', 'course teacher role required')
      }
      return listPendingLearningEvaluationRecords(this.db, scope.companyId, courseId)
    })
  }

  async progress(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      if (await courseRole(this.db, courseId, scope.companyId, scope.userId) !== 'teacher') {
        throw new LearningApplicationError('forbidden', 'course teacher role required')
      }
      return listLearningCourseProgress(this.db, scope.companyId, courseId)
    })
  }

  async review(scope: LearningScope, courseId: string, evaluationId: string, input: ReviewEvaluationInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await reviewLearningEvaluation(this.db, this.infrastructure.transaction, this.infrastructure.metric, {
        companyId: scope.companyId, courseId, evaluationId, teacherId: scope.userId, ...input,
      })
      return { ok: true as const }
    })
  }

  notificationPreferences(scope: LearningScope, courseId?: string) {
    return this.classroom(async () => await findNotificationPreferences(
      this.db, scope.companyId, scope.userId, courseId,
    ) ?? {
      company_id: scope.companyId,
      user_id: scope.userId,
      course_id: courseId ?? null,
      in_app_enabled: true,
      email_enabled: false,
      timezone: 'Asia/Shanghai',
      preferred_time: '19:00',
      quiet_start: null,
      quiet_end: null,
    })
  }

  async setNotificationPreferences(scope: LearningScope, input: NotificationPreferencesInput) {
    if (input.courseId) {
      const role = await courseRole(this.db, input.courseId, scope.companyId, scope.userId)
      if (!role) throw new LearningApplicationError('forbidden', 'course membership required')
    }
    await upsertNotificationPreferences(this.db, { id: randomUUID(), ...scope, ...input })
    return this.notificationPreferences(scope, input.courseId)
  }

  deliveries(scope: LearningScope) { return listDeliveries(this.db, scope.companyId, scope.userId) }

  private async manager(userId: string, courseId: string, active = false, archivedMessage = 'archived courses are read-only') {
    const manager = await courseManager(this.db, courseId, userId)
    if (!manager) throw new LearningApplicationError('not_found', 'course not found')
    if (!privilegedRoles.has(manager.companyRole) && manager.courseRole !== 'teacher') {
      throw new LearningApplicationError('forbidden', 'this action requires a course teacher or company admin')
    }
    if (active && manager.status !== 'active') throw new LearningApplicationError('conflict', archivedMessage)
    return manager
  }

  private async assertCourseScope(companyId: string, courseId: string): Promise<void> {
    if (!await courseExists(this.db, courseId, companyId)) {
      throw new LearningApplicationError('not_found', 'course not found')
    }
  }

  private async classroom<T>(work: () => Promise<T>): Promise<T> {
    try { return await work() }
    catch (error) {
      if (error instanceof LearningApplicationError) throw error
      if (!(error instanceof Error)) throw error
      if (/not found|not provisioned/.test(error.message)) {
        throw new LearningApplicationError('not_found', error.message)
      }
      if (/access denied|role required|membership required/.test(error.message)) {
        throw new LearningApplicationError('forbidden', error.message)
      }
      throw new LearningApplicationError('invalid', error.message)
    }
  }

  private assertMemberChange(outcome: 'updated' | 'not_found' | 'last_teacher'): void {
    if (outcome === 'not_found') throw new LearningApplicationError('not_found', 'course member not found')
    if (outcome === 'last_teacher') {
      throw new LearningApplicationError('conflict', 'an active course must keep at least one teacher')
    }
  }

  private async syncStudyRoom(courseId: string): Promise<void> {
    const state = await studyRoomState(this.db, courseId)
    if (!state?.room_id) return
    const members = await syncStudyRoomMembers(this.db, {
      courseId, companyId: state.company_id, roomId: state.room_id,
      title: state.title, topic: state.topic, leaderId: state.leader_id,
    })
    await this.infrastructure.syncChannel({
      channelId: state.room_id, title: state.title, members,
      ...(state.leader_id ? { leaderAgentId: state.leader_id } : {}),
    })
  }
}
