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
  draftActivity,
  finishMissionPlanning,
  getActivity,
  getMission,
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
  createLearningObjectives,
  setLearningObjectiveStatus,
} from './application.js'
import type { CreateLearningObjectivesCommand } from './contracts.js'
