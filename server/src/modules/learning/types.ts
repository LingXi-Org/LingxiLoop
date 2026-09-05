export type LearningCourseStatus = import('../../domain/public.js').ProjectStatus
export type LearningRole = 'teacher' | 'learner'
export type LearningRoomPurpose = 'study' | 'lab' | 'discussion'
export type LearningKnowledgeUnitStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
/** Teaching-only response projection of a LearningKnowledgeUnit status. */
export type LearningObjectiveStatus = LearningKnowledgeUnitStatus
export type LearningActivityType = 'LESSON' | 'PRACTICE' | 'ASSESSMENT' | 'PROJECT' | 'REVIEW'
export type LearningActivityStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'
export type LearningEvaluationMode = 'AGENT_FORMATIVE' | 'TEACHER_REQUIRED'
export type LearningMissionStatus = 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
export type LearningMissionKind = 'STUDY' | 'RESEARCH' | 'PROJECT'
export type LearningStepType = 'LEARN' | 'PRACTICE' | 'CHECK' | 'REFLECT'
export type LearningStepStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type LearningAssistance = 'NONE' | 'HINT' | 'GUIDED'
export type LearningStateStatus = 'LEARNING' | 'VERIFIED' | 'NEEDS_REVIEW'
export type CourseMemberChangeOutcome =
  | 'updated'
  | 'not_found'
  | 'last_teacher'
  | 'last_owner'
  | 'protected_owner'
  | 'protected_creator'

export interface LearningCourseSummary {
  id: string
  companyId: string
  projectId: string
  projectKind: import('../../domain/public.js').ProjectKind
  title: string
  description: string
  status: LearningCourseStatus
  courseRole: LearningRole
  roomCount: number
  objectiveCount: number
  learnerCount: number
  createdAt: string
  updatedAt: string
}

export interface LearningKnowledgeUnit {
  id: string
  projectId: string
  title: string
  successCriteria: string
  targetLevel: 1 | 2 | 3 | 4
  position: number
  status: LearningKnowledgeUnitStatus
  prerequisiteKnowledgeUnitIds: string[]
}

/** Course-addressed teaching projection. Core learning code uses LearningKnowledgeUnit. */
export interface LearningObjective {
  id: string
  courseId: string
  title: string
  successCriteria: string
  targetLevel: 1 | 2 | 3 | 4
  position: number
  status: LearningObjectiveStatus
  prerequisiteIds: string[]
}

export interface LearningActivity {
  id: string
  projectId: string
  title: string
  instructions: string
  kind: LearningActivityType
  status: LearningActivityStatus
  evaluationMode: LearningEvaluationMode
  targetLevel: 1 | 2 | 3 | 4
  rubric: unknown[]
  knowledgeUnitIds: string[]
  dueAt?: string
}

/** Course-addressed teaching projection of a project-scoped LearningActivity. */
export interface LearningCourseActivity {
  id: string
  courseId: string
  title: string
  instructions: string
  type: LearningActivityType
  status: LearningActivityStatus
  evaluationMode: LearningEvaluationMode
  targetLevel: 1 | 2 | 3 | 4
  rubric: unknown[]
  objectiveIds: string[]
  dueAt?: string
}

export interface LearningMissionStep {
  id: string
  kind: LearningStepType
  description: string
  successCriteria: string
  knowledgeUnitId?: string
  status: LearningStepStatus
  position: number
  outcome?: string
  completionEvidenceId?: string
  completionAttemptId?: string
}

export interface LearningMission {
  id: string
  projectId: string
  learnerId: string
  conversationId: string
  triggerClientMsgNo: string
  goal: string
  successCriteria: string
  kind: LearningMissionKind
  coordinatorAgentId: string
  status: LearningMissionStatus
  steps: LearningMissionStep[]
  createdAt: string
  updatedAt: string
}

export interface LearningStateProjectionInput {
  previousLevel: number
  previousIndependentEvidenceCount: number
  demonstratedLevel: number
  assistance: LearningAssistance
  confidence: number
  activityType: LearningActivityType
  activityTargetLevel: number
  evaluatorKind: 'AGENT' | 'TEACHER'
  teacherConfirmed: boolean
  /** False when this evidence comes from an activity/step already counted. */
  evidenceDistinct?: boolean
}

export interface LearningStateProjectionDecision {
  accepted: boolean
  pendingTeacher: boolean
  candidateLevel: number
  nextLevel: number
  nextIndependentEvidenceCount: number
  needsReview: boolean
  reason: string
}

export interface LearningTurnContext {
  project: {
    id: string
    kind: import('../../domain/public.js').ProjectKind
    title: string
    status: import('../../domain/public.js').ProjectStatus
  }
  courseId?: string
  roomPurpose: LearningRoomPurpose
  actorRole?: LearningRole
  learnerId?: string
  activeMission?: LearningMission
  knowledgeUnits: Array<LearningKnowledgeUnit & {
    level: number
    stateStatus: LearningStateStatus
    nextReviewAt?: string
  }>
  due: Array<{ knowledgeUnitId: string; title: string; level: number; nextReviewAt: string }>
  pendingTeacherReviews: number
}

export type TeacherDigestFrequency = 'daily' | 'weekly' | 'off'

export interface TeacherDigestSchedule {
  frequency: TeacherDigestFrequency
  timezone: string
  localTime?: string
  weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  status: 'active' | 'paused'
  nextRunAt?: string
}

/** Ephemeral, bounded state for the Project teacher Agent. It is refreshed on
 * every model hop and never stores learner answers or arbitrary evidence. */
export interface TeacherTurnContext {
  agent: { id: string; name: string; projectId: string }
  course: Pick<LearningCourseSummary, 'id' | 'projectId' | 'title' | 'status'>
  room: { id: string; status: 'active' | 'closed' }
  trigger: { mode: 'teacher' | 'routine' | 'approval'; teacherId?: string }
  counts: { learners: number; objectives: number; activities: number; pendingReviews: number }
  digest: TeacherDigestSchedule
}

export interface TeacherAgentSummary {
  agentId: string
  displayName: string
  projectId: string
  courseId: string
  roomId: string
  roomStatus: 'active' | 'closed'
  digest: TeacherDigestSchedule
  pendingApprovals: number
}
