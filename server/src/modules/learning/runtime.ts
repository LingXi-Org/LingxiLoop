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
  createObjectives,
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
