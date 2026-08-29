import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type { AddLearningMissionStepInput, LearningAgentRoomScope, LearningScope, RecordLearningAttemptCommand, StartLearningMissionCommand } from './contracts.js'
import type { LearningMission, LearningMissionKind, LearningTurnContext } from './types.js'
import { LearningApplicationError } from './errors.js'
import {
  activateLearningMission, activeLearningMissionId, completeLearningMissionRecord, countCourseObjectives,
  countLearningMissionSteps, countPendingLearningEvaluations, enqueueLearningMissionCoordinatorWork,
  findEligibleLearningMissionCoordinator, findLearningCanvasEvidence, findLearningDocumentEvidence,
  findLearningMission, findLearningRoomState, insertAgentLearningAttempt, insertLearningMissionStep,
  learningChannelType, learningMasteryContext, learningMissionCompletionSummary, learningMissionPlanningSummary,
  listLearningMissions, listLearningObjectives, lockLearningMission, updateLearningMissionCoordinator,
  updateLearningMissionStepRecord, upsertLearningMission,
} from './repository.js'

export type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

async function assertCourseLearner(
  db: Queryable,
  companyId: string,
  courseId: string,
  userId: string,
): Promise<void> {
  await createPermissionService(db).assertCan({
    actorUserId: userId,
    action: 'learning:submit',
    companyId,
    resource: { type: 'course', id: courseId },
  })
}

function learningText(value: string, name: string, maxLength = 10_000): string {
  const text = String(value ?? '').trim()
  if (!text) throw new LearningApplicationError('invalid', `${name} is required`)
  if (text.length > maxLength) throw new LearningApplicationError('invalid', `${name} exceeds ${maxLength} characters`)
  return text
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
  return listLearningMissions(db, {
    companyId: scope.companyId,
    courseId,
    userId: scope.userId,
    includeAllLearners: manage.allowed,
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
  await assertCourseLearner(db, room.companyId, room.courseId, trigger.fromUid)
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
        authorizationUserId: trigger.fromUid,
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
      await assertCourseLearner(client, room.companyId, room.courseId, message.fromUid)
      learnerIds.add(message.fromUid)
    }
    const documents: Array<{ id: string; revision: number; authorId: string }> = []
    for (const documentId of documentIds) {
      const evidence = await findLearningDocumentEvidence(client, {
        companyId: room.companyId, projectId: room.projectId, documentId,
      })
      if (!evidence) throw new LearningApplicationError('not_found', 'document evidence is outside the current course project')
      await assertCourseLearner(client, room.companyId, room.courseId, evidence.authorId)
      learnerIds.add(evidence.authorId)
      documents.push(evidence)
    }
    const canvasFrames: Array<{ id: string; revision: number; authorId: string }> = []
    for (const frameId of canvasFrameIds) {
      const evidence = await findLearningCanvasEvidence(client, {
        companyId: room.companyId, projectId: room.projectId, frameId,
      })
      if (!evidence) throw new LearningApplicationError('not_found', 'Canvas Frame evidence is outside the current course project')
      await assertCourseLearner(client, room.companyId, room.courseId, evidence.authorId)
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
  const permissions = createPermissionService(db)
  const learnerDecision = resolvedActorId ? await permissions.can({
    actorUserId: resolvedActorId,
    action: 'learning:submit',
    companyId: room.companyId,
    resource: { type: 'course', id: room.courseId },
  }) : null
  const managerDecision = resolvedActorId ? await permissions.can({
    actorUserId: resolvedActorId,
    action: 'learning:manage',
    companyId: room.companyId,
    resource: { type: 'course', id: room.courseId },
  }) : null
  const learnerId = learnerDecision?.allowed ? resolvedActorId : undefined
  const actorRole = managerDecision?.allowed ? 'teacher' : learnerDecision?.allowed ? 'learner' : undefined
  const objectives = await listLearningObjectives(db, room.companyId, room.courseId)
  const mastery = learnerId ? await learningMasteryContext(db, {
    companyId: room.companyId, courseId: room.courseId, learnerId,
  }) : []
  const byObjective = new Map(mastery.map((item) => [item.objectiveId,item]))
  const missionId = learnerId ? await activeLearningMissionId(db, {
    companyId: room.companyId, courseId: room.courseId, learnerId, channelId: input.channelId,
  }) : null
  const pendingTeacherReviews = managerDecision?.allowed
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
    ...(actorRole ? { actorRole } : {}),
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
