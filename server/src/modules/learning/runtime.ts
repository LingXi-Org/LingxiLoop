/**
 * Public Learning runtime surface consumed by Agent OS and IM approval handling.
 *
 * The legacy implementation files remain private to the Learning domain while
 * their persistence is migrated into the domain repository. Consumers must not
 * import those implementation files directly.
 */
export {
  proposeEvaluation,
} from '../../learning/service.js'

export function createObjectives(input: CreateLearningObjectivesCommand) {
  return createLearningObjectives(pool, (work) => withTransaction(pool, work), input)
}

export function setObjectiveStatus(input: {
  companyId: string
  courseId: string
  objectiveId: string
  teacherId: string
  status: 'draft' | 'published' | 'archived'
}) {
  return setLearningObjectiveStatus(pool, input)
}

export function draftActivity(input: CreateLearningActivityCommand) {
  return createLearningActivity(pool, (work) => withTransaction(pool, work), input)
}

export async function getActivity(activityId: string, companyId: string, courseId: string) {
  const activity = await findVisibleLearningActivity(pool, companyId, courseId, activityId)
  if (!activity) throw new Error('activity not found')
  return activity
}

export function publishActivity(input: {
  companyId: string; courseId: string; activityId: string; teacherId: string
}) {
  return publishLearningActivity((work) => withTransaction(pool, work), input)
}

export function closeActivity(input: {
  companyId: string; courseId: string; activityId: string; teacherId: string
}) {
  return closeLearningActivity(pool, input)
}

export function submitActivity(input: {
  companyId: string; courseId: string; activityId: string; learnerId: string
  answer: string; assistance?: 'none'|'hint'|'guided'; idempotencyKey: string
}) {
  return submitLearningActivity(pool, input)
}

type RuntimeRoomScope = { companyId: string; channelId: string }

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
    missionId: string; stepId: string; status: 'open'|'in_progress'|'completed'|'cancelled'
    outcome?: string; sourceReportId?: string; attemptId?: string
  },
) {
  return updateLearningMissionStep(pool, (run) => withTransaction(pool, run), work, input)
}

export function completeMission(work: RuntimeRoomScope, missionId: string) {
  return completeLearningMission(pool, (run) => withTransaction(pool, run), work, missionId)
}

export {
  assertTeacherApprovalFresh,
  describeTeacherAction,
  executeTeacherAction,
  loadTeacherTurnContext,
  nextTeacherDigestRun,
  teacherActionRequiresApproval,
} from '../../learning/teacher-agent.js'

export type {
  LearningActivityType,
  LearningEvaluationMode,
  LearningStepStatus,
  LearningStepType,
  LearningTurnContext,
  TeacherTurnContext,
} from '../../learning/types.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { wukongClient } from '../../im/wukong.js'
import { inc } from '../../metrics.js'
import {
  addLearningMissionSteps,
  closeLearningActivity,
  completeLearningMission,
  createLearningActivity,
  createLearningObjectives,
  finishLearningMissionPlanning,
  loadLearningContext,
  publishLearningActivity,
  preferredLearningMissionCoordinator,
  recordLearningAttempt,
  setLearningObjectiveStatus,
  submitLearningActivity,
  startLearningMission,
  updateLearningMissionStep,
} from './application.js'
import type {
  AddLearningMissionStepInput,
  CreateLearningActivityCommand,
  CreateLearningObjectivesCommand,
} from './contracts.js'
import { findLearningMission, findVisibleLearningActivity } from './repository.js'
import type { AgentWorkItem } from '../../agent-os/types.js'

export const preferredCoordinatorPreset = preferredLearningMissionCoordinator

async function syncLearningMessages(input: {
  channelId: string; channelType: number; limit: number; loginUid: string
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

export function startMission(
  work: AgentWorkItem,
  input: {
    goal: string; successCriteria: string; missionKind?: 'study'|'research'|'project'
    sourceClientMsgNo?: string; explicit?: boolean
  },
) {
  return startLearningMission(pool, (run) => withTransaction(pool, run), {
    syncMessages: syncLearningMessages,
    publishMission: async ({ channelId, channelType, senderId, mission, courseId }) => {
      await wukongClient().sendMessage(channelId, channelType, senderId, {
        version: 1, kind: 'learning_mission', clientMsgNo: `learning-mission-${mission.id}`,
        body: mission.goal, refs: { agentId: senderId },
        data: {
          missionId: mission.id, courseId, goal: mission.goal,
          successCriteria: mission.successCriteria, missionKind: mission.missionKind,
          coordinatorAgentId: mission.coordinatorAgentId, status: mission.status,
          suppressAgentWake: true,
        },
      })
    },
    metric: inc,
  }, {
    workId: work.id, companyId: work.companyId, agentId: work.agentId,
    channelId: work.channelId, triggerClientMsgNo: work.triggerClientMsgNo,
    ...(work.threadRootClientMsgNo ? { threadRootClientMsgNo: work.threadRootClientMsgNo } : {}),
    ...input,
  })
}

export function recordAttempt(
  work: AgentWorkItem,
  input: {
    activityId?: string; missionStepId?: string; evidenceClientMsgNos?: string[]
    documentIds?: string[]; canvasFrameIds?: string[]; assistance?: 'none'|'hint'|'guided'
  },
) {
  return recordLearningAttempt(pool, (run) => withTransaction(pool, run), {
    syncMessages: syncLearningMessages,
    metric: inc,
  }, {
    companyId: work.companyId, channelId: work.channelId, agentId: work.agentId, ...input,
  })
}

export function loadLearningTurnContext(work: AgentWorkItem, actorId?: string) {
  return loadLearningContext(pool, { syncMessages: syncLearningMessages }, {
    companyId: work.companyId, channelId: work.channelId, agentId: work.agentId,
    triggerClientMsgNo: work.triggerClientMsgNo,
    ...(actorId ? { actorId } : {}),
  })
}

export async function getMission(
  missionId: string,
  companyId: string,
  courseId: string,
  learnerId: string,
  conversationId: string,
) {
  const mission = await findLearningMission(pool, companyId, courseId, missionId)
  if (!mission || mission.learnerId !== learnerId || mission.conversationId !== conversationId) {
    throw new Error('mission not found')
  }
  return mission
}
