export type LearningCourseStatus = 'active' | 'archived'
export type LearningRole = 'teacher' | 'learner'
export type LearningRoomPurpose = 'study' | 'lab' | 'discussion'
export type LearningObjectiveStatus = 'draft' | 'published' | 'archived'
export type LearningActivityType = 'lesson' | 'practice' | 'assessment' | 'project' | 'review'
export type LearningActivityStatus = 'draft' | 'published' | 'closed'
export type LearningEvaluationMode = 'agent_formative' | 'teacher_required'
export type LearningMissionStatus = 'planning' | 'active' | 'paused' | 'completed' | 'cancelled'
export type LearningMissionKind = 'study' | 'research' | 'project'
export type LearningStepType = 'learn' | 'practice' | 'check' | 'reflect'
export type LearningStepStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
export type LearningAssistance = 'none' | 'hint' | 'guided'

export interface LearningCourseSummary {
  id: string
  companyId: string
  projectId: string
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
  type: LearningStepType
  description: string
  successCriteria: string
  objectiveId?: string
  status: LearningStepStatus
  position: number
  outcome?: string
  completionReportId?: string
  completionAttemptId?: string
}

export interface LearningMission {
  id: string
  courseId: string
  learnerId: string
  conversationId: string
  triggerClientMsgNo: string
  goal: string
  successCriteria: string
  missionKind: LearningMissionKind
  coordinatorAgentId: string
  status: LearningMissionStatus
  steps: LearningMissionStep[]
  createdAt: string
  updatedAt: string
}

export interface MasteryProjectionInput {
  previousLevel: number
  previousIndependentEvidenceCount: number
  demonstratedLevel: number
  assistance: LearningAssistance
  confidence: number
  activityType: LearningActivityType
  activityTargetLevel: number
  evaluatorKind: 'agent' | 'teacher'
  teacherConfirmed: boolean
  /** False when this evidence comes from an activity/step already counted. */
  evidenceDistinct?: boolean
}

export interface MasteryProjectionDecision {
  accepted: boolean
  pendingTeacher: boolean
  candidateLevel: number
  nextLevel: number
  nextIndependentEvidenceCount: number
  needsReview: boolean
  reason: string
}

export interface LearningTurnContext {
  course: Pick<LearningCourseSummary, 'id' | 'projectId' | 'title' | 'status'>
  roomPurpose: LearningRoomPurpose
  actorRole?: LearningRole
  learnerId?: string
  activeMission?: LearningMission
  objectives: Array<LearningObjective & { masteryLevel: number; masteryStatus: string; nextReviewAt?: string }>
  due: Array<{ objectiveId: string; title: string; level: number; nextReviewAt: string }>
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
