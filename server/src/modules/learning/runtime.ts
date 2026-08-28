/**
 * Public Learning runtime surface consumed by Agent OS and IM approval handling.
 *
 * The legacy implementation files remain private to the Learning domain while
 * their persistence is migrated into the domain repository. Consumers must not
 * import those implementation files directly.
 */
export {
  addMissionSteps,
  completeMission,
  finishMissionPlanning,
  loadLearningTurnContext,
  preferredCoordinatorPreset,
  proposeEvaluation,
  recordAttempt,
  startMission,
  updateMissionStep,
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
  const activity = await findLearningActivity(pool, companyId, courseId, activityId)
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
  answer: string; assistance?: 'none'|'hint'|'guided'
}) {
  return submitLearningActivity(pool, input)
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
import {
  closeLearningActivity,
  createLearningActivity,
  createLearningObjectives,
  publishLearningActivity,
  setLearningObjectiveStatus,
  submitLearningActivity,
} from './application.js'
import type { CreateLearningActivityCommand, CreateLearningObjectivesCommand } from './contracts.js'
import { findLearningActivity } from './repository.js'
import { findLearningMission } from './repository.js'

export async function getMission(missionId: string, companyId: string, courseId: string) {
  const mission = await findLearningMission(pool, companyId, courseId, missionId)
  if (!mission) throw new Error('mission not found')
  return mission
}
