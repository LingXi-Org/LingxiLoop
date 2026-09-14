import { productConversationId } from '../../agent-runtime/identity.js'
/**
 * Public Learning runtime surface consumed by Agent OS and IM approval handling.
 *
 * This is the only Agent OS/IM entry point into Learning application use cases.
 * Persistence remains private to capability repositories behind this surface.
 */
import type { AgentActionContext, AgentAction } from '../../agents/contracts.js'
import { createHash } from 'node:crypto'
import { NoEffectError, type WorkItem } from '@lyyzka/lingxios'
import { pool } from '../../db/pool.js'
import type { Queryable } from '../../db/queryable.js'
import { withTransaction } from '../../db/transaction.js'
import { wukongClient } from '../../im/wukong.js'
import { inc } from '../../metrics.js'
import {
  addLearningMissionSteps,
  completeLearningMission,
  finishLearningMissionPlanning,
  loadLearningContext,
  preferredLearningMissionCoordinator,
  proposeLearningEvaluation,
  recordLearningAttempt,
  updateLearningMissionStep,
} from './application.js'
import type {
  AddLearningMissionStepInput,
  CreateLearningKnowledgeUnitsCommand,
  CreateProjectLearningActivityCommand,
  LearningScoreCriterion,
} from './contracts.js'
import {
  closeProjectLearningActivity,
  createLearningKnowledgeUnits,
  createProjectLearningActivity,
  publishProjectLearningActivity,
  submitProjectLearningActivity,
} from './curriculum-application.js'
import { findLearningMission, findVisibleProjectLearningActivity } from './repository.js'
import {
  assertTeacherApprovalFresh as assertTeacherApprovalFreshApplication,
  describeTeacherAction as describeTeacherActionApplication,
  executeTeacherAction as executeTeacherActionApplication,
  loadTeacherTurnContext as loadTeacherTurnContextApplication,
  nextTeacherDigestRun as nextTeacherDigestRunApplication,
} from './teacher-agent-application.js'

export function createKnowledgeUnits(input: CreateLearningKnowledgeUnitsCommand) {
  return createLearningKnowledgeUnits(pool, (work) => withTransaction(pool, work), input)
}

export function draftActivity(input: CreateProjectLearningActivityCommand) {
  return createProjectLearningActivity(pool, (work) => withTransaction(pool, work), input)
}

export async function getActivity(activityId: string, companyId: string, projectId: string) {
  const activity = await findVisibleProjectLearningActivity(pool, companyId, projectId, activityId)
  if (!activity) throw new Error('activity not found')
  return activity
}

export function publishActivity(input: {
  companyId: string
  projectId: string
  activityId: string
  teacherId: string
}) {
  return publishProjectLearningActivity((work) => withTransaction(pool, work), input)
}

export function closeActivity(input: {
  companyId: string
  projectId: string
  activityId: string
  teacherId: string
}) {
  return closeProjectLearningActivity(pool, input)
}

export function submitActivity(input: {
  companyId: string
  projectId: string
  activityId: string
  learnerId: string
  answer: string
  assistance?: 'NONE'|'HINT'|'GUIDED'
  idempotencyKey: string
}) {
  return submitProjectLearningActivity((work) => withTransaction(pool, work), input)
}

type RuntimeRoomScope = { companyId: string; channelId: string }

export async function assertMissionCoordinatorRun(db: Queryable, work: Omit<WorkItem, 'leaseToken'>) {
  const missionId = work.meta?.missionId
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM learning_missions WHERE id=$1 AND company_id=$2
    AND coordinator_agent_id=$3 AND learner_id=$4 AND conversation_id=$5 AND status IN ('PLANNING','ACTIVE','COMPLETED')`,
    [missionId,work.tenantId,work.agentId,work.principalId,productConversationId(work)])
  if (!rows[0] || work.id !== `mission-coordinator-${createHash('sha256').update(rows[0].id).digest('hex').slice(0,24)}`) {
    throw new NoEffectError('Mission coordinator or learner scope was revoked', 'forbidden')
  }
}

export function addMissionSteps(
  work: RuntimeRoomScope,
  missionId: string,
  steps: AddLearningMissionStepInput[],
) {
  return addLearningMissionSteps(
    pool, (run) => withTransaction(pool, run), work, missionId, steps,
  )
}

export async function finishMissionPlanning(work: RuntimeRoomScope, missionId: string) {
  const mission = await finishLearningMissionPlanning(
    pool, (run) => withTransaction(pool, run), work, missionId,
  )
  inc('learning.mission.planning_completed', { mode: 'agent' })
  return mission
}

export function updateMissionStep(
  work: RuntimeRoomScope,
  input: {
    missionId: string
    stepId: string
    status: 'OPEN'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'
    outcome?: string
    sourceEvidenceId?: string
    attemptId?: string
  },
) {
  return updateLearningMissionStep(pool, (run) => withTransaction(pool, run), work, input)
}

export function completeMission(work: RuntimeRoomScope, missionId: string) {
  return completeLearningMission(pool, (run) => withTransaction(pool, run), work, missionId)
}

export { teacherActionRequiresApproval } from './teacher-agent-application.js'
export type {
  LearningActivityType,
  LearningEvaluationMode,
  LearningStepStatus,
  LearningStepType,
  LearningTurnContext,
  TeacherTurnContext,
} from './types.js'

function teacherTransaction(db: Queryable) {
  return <T>(work: (client: Queryable) => Promise<T>): Promise<T> => db === pool
    ? withTransaction(pool, work)
    : work(db)
}

export function loadTeacherTurnContext(work: AgentActionContext, db: Queryable = pool) {
  return loadTeacherTurnContextApplication(work, db)
}

export function describeTeacherAction(work: AgentActionContext, action: AgentAction, db: Queryable = pool) {
  return describeTeacherActionApplication(work, action, db)
}

export function assertTeacherApprovalFresh(
  input: { channelId: string; companyId: string; action: string; preview: Record<string, unknown> },
  db: Queryable = pool,
) {
  return assertTeacherApprovalFreshApplication(input, db)
}

export function executeTeacherAction(
  work: AgentActionContext,
  method: string,
  args: Record<string, unknown>,
  db: Queryable = pool,
) {
  return executeTeacherActionApplication(work, method, args, db, teacherTransaction(db))
}

export function nextTeacherDigestRun(
  schedule: {
    frequency: 'daily'|'weekly'
    localTime: string
    weekday?: 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'
  },
  timezone: string,
  from: Date,
  db: Queryable = pool,
) {
  return nextTeacherDigestRunApplication(schedule, timezone, from, db)
}

export const preferredCoordinatorPreset = preferredLearningMissionCoordinator

async function syncLearningMessages(input: {
  channelId: string
  channelType: number
  limit: number
  loginUid: string
}) {
  const messages = await wukongClient().syncMessages(
    input.channelId, input.channelType, input.limit, input.loginUid,
  )
  return messages.map((message) => ({
    clientMsgNo: message.clientMsgNo,
    fromUid: message.fromUid,
    authoredByAgent: Boolean(message.payload.refs?.agentId),
  }))
}

export function recordAttempt(
  work: AgentActionContext,
  input: {
    activityId?: string
    missionStepId?: string
    evidenceClientMsgNos?: string[]
    documentIds?: string[]
    canvasFrameIds?: string[]
    assistance?: 'NONE'|'HINT'|'GUIDED'
  },
) {
  return recordLearningAttempt(pool, (run) => withTransaction(pool, run), {
    syncMessages: syncLearningMessages,
    metric: inc,
  }, {
    companyId: work.companyId,
    channelId: work.channelId,
    agentId: work.agentId,
    ...input,
  })
}

export function loadLearningTurnContext(work: AgentActionContext, actorId?: string) {
  return loadLearningContext(pool, { syncMessages: syncLearningMessages }, {
    companyId: work.companyId,
    channelId: work.channelId,
    agentId: work.agentId,
    triggerClientMsgNo: work.triggerClientMsgNo,
    ...(actorId ? { actorId } : {}),
  })
}

export function proposeEvaluation(
  work: AgentActionContext,
  input: {
    attemptId: string
    demonstratedLevel: number
    confidence: number
    rubricResults: LearningScoreCriterion[]
    feedback?: string
    sourceEvidenceId?: string
    verifierEvidenceId?: string
  },
) {
  return proposeLearningEvaluation(pool, (run) => withTransaction(pool, run), inc, {
    companyId: work.companyId,
    channelId: work.channelId,
    agentId: work.agentId,
    ...input,
  })
}

export async function getMission(
  missionId: string,
  companyId: string,
  projectId: string,
  learnerId: string,
  conversationId: string,
) {
  const mission = await findLearningMission(pool, companyId, projectId, missionId)
  if (!mission || mission.learnerId !== learnerId || mission.conversationId !== conversationId) {
    throw new Error('mission not found')
  }
  return mission
}
