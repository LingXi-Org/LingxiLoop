import type { ApiInvitationPreviewStatus } from '@/features/companies/contracts'
import type { ProjectKind, ProjectStatus } from '@/types'

export interface ApiCourse {
  id: string
  companyId: string
  projectId: string
  projectKind: ProjectKind
  name: string
  description: string
  color: string
  status: ProjectStatus
  createdBy: string
  studyRoomId: string | null
  companyRole?: 'owner' | 'admin' | 'member'
  courseRole: 'teacher' | 'learner' | null
  memberCount: number
  canManage: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ApiCourseMember {
  id: string
  name: string
  email: string
  role: 'teacher' | 'learner'
  joinedAt: string
}

export interface ApiProjectInvitation {
  id: string
  email: string | null
  role: 'learner'
  note: string | null
  maxUses: number
  useCount: number
  createdAt: string
  expiresAt: string
  revokedAt?: string | null
  lastAcceptedAt?: string | null
  lastAcceptedBy?: string | null
  acceptances?: Array<{ userId: string; name: string | null; role: 'learner'; acceptedAt: string }>
  status: 'active' | 'revoked' | 'expired' | 'consumed'
}

export interface ApiProjectInvitationWithToken extends ApiProjectInvitation {
  token: string
  url: string
}

export interface ApiProjectInvitationPreview {
  kind: 'project'
  status: ApiInvitationPreviewStatus | 'archived'
  invitation?: {
    role: 'learner'
    email: string | null
    note: string | null
    expiresAt: string
    inviterName: string | null
    company: { id: string; name: string; slug: string }
    course: { id: string; name: string; projectId: string; studyRoomId: string | null }
  }
}

export interface ApiProjectInvitationAccept {
  ok: true
  alreadyMember: boolean
  joinedCompany: boolean
  company: { id: string; name: string; slug: string; role: string; status: import('@/auth/contracts').CompanyStatus }
  course: { id: string; name: string; projectId: string; studyRoomId: string | null; role: 'teacher' | 'learner' }
}

export type LearningRole = 'teacher' | 'learner'

export interface LearningSpace {
  companyId: string
  projectId: string
  projectKind: ProjectKind
  courseId?: string
  title: string
  description: string
  color: string | null
  status: ProjectStatus
  perspective: LearningRole
  canManage: boolean
  canEditContent: boolean
  canUpdateCourse: boolean
  canInviteMembers: boolean
  canRevokeInvitations: boolean
  canRemoveMembers: boolean
  canSubmit: boolean
  canReview: boolean
  lifecycleAction: 'END' | 'ENTER_READ_ONLY' | 'ENTER_RETENTION' | 'ARCHIVE' | null
  studyRoomId?: string | null
  isDefault: boolean
  lastVisitedAt: string | null
}

export interface CursorPage<T> {
  data: T[]
  nextCursor: string | null
}

export interface LearningCountByLevel {
  level: number
  count: number
}

export interface LearningCountByStatus {
  status: string
  count: number
}

export interface LearningAttemptTrendPoint {
  date: string
  count: number
}

export interface LearningAssistanceDistribution {
  assistance: LearningEvidence['assistance']
  count: number
}

export interface LearningDueReview {
  knowledgeUnitId: string
  title: string
  level: number
  status: string
  nextReviewAt: string
}

export interface LearningMissionProgress {
  missionId: string
  goal: string
  status: string
  completedSteps: number
  totalSteps: number
  updatedAt: string
}

export interface LearnerLearningOverview {
  perspective: 'learner'
  windowDays: number
  summary: {
    dueReviews: number
    verifiedObjectives: number
    activeMissions: number
    evidenceAttempts: number
  }
  masteryDistribution: LearningCountByLevel[]
  attemptTrend: LearningAttemptTrendPoint[]
  assistanceDistribution: LearningAssistanceDistribution[]
  dueReviews: LearningDueReview[]
  missionProgress: LearningMissionProgress[]
}

export interface TeacherAttentionItem {
  learnerId: string
  displayName: string
  reasons: string[]
}

export interface TeacherLearningOverview {
  perspective: 'teacher'
  windowDays: number
  summary: {
    learnerCount: number
    pendingReviews: number
    attempts: number
    learnersWithEvidence: number
    dueReviews: number
  }
  masteryDistribution: LearningCountByLevel[]
  missionDistribution: LearningCountByStatus[]
  evaluationDistribution: LearningCountByStatus[]
  attention: TeacherAttentionItem[]
}

export type LearningOverview = LearnerLearningOverview | TeacherLearningOverview

export interface TeacherLearnerSummary {
  learnerId: string
  displayName: string
  email: string
  averageLevel: number
  verifiedObjectives: number
  dueReviews: number
  needsReview: number
  pausedMissions: number
  attemptCount: number
  lastAttemptAt: string | null
  attentionReasons: string[]
}

export interface LearnerMasteryState {
  knowledgeUnitId: string
  title: string
  level: number
  status: string
  nextReviewAt: string | null
  reviewIntervalDays: number
  lastEvidenceAt: string | null
}

export interface LearnerMissionDetail {
  missionId: string
  goal: string
  successCriteria: string
  kind: LearningMission['kind']
  status: LearningMission['status']
  completedSteps: number
  totalSteps: number
  updatedAt: string
}

export interface LearnerAttemptSummary {
  attemptId: string
  activityId: string | null
  missionStepId: string | null
  title: string
  assistance: LearningEvidence['assistance']
  status: string
  submittedAt: string
  evaluation: {
    evaluationId: string
    demonstratedLevel: number
    confidence: number
    status: string
    feedback: string
  } | null
}

export interface TeacherLearnerDetail {
  learner: {
    learnerId: string
    displayName: string
    email: string
    joinedAt: string
  }
  summary: {
    averageLevel: number
    verifiedObjectives: number
    dueReviews: number
    attemptCount: number
    activeMissions: number
  }
  masteryDistribution: LearningCountByLevel[]
  states: LearnerMasteryState[]
  missions: LearnerMissionDetail[]
  attempts: LearnerAttemptSummary[]
}

export interface LearningAttemptDetail {
  attemptId: string
  learner: {
    learnerId: string
    displayName: string
    email: string
  }
  source: {
    type: 'activity' | 'missionStep'
    id: string
    title: string
  } | null
  assistance: LearningEvidence['assistance']
  status: string
  submittedAt: string
  evidence: {
    evidenceId: string
    kind: string
    data: unknown
    createdAt: string
  } | null
  evaluations: Array<{
    evaluationId: string
    demonstratedLevel: number
    confidence: number
    rubricResults: unknown
    feedback: string
    evaluatorId: string
    evaluatorKind: string
    status: string
    reviewReason: string | null
    reviewedBy: string | null
    reviewedAt: string | null
    createdAt: string
  }>
}

export interface LearningCourse {
  projectId: string
  courseId?: string
  projectKind: ProjectKind
  title: string
  description: string
  status: ProjectStatus
  perspective: LearningRole
  canManage?: boolean
  canEditContent?: boolean
  canSubmit?: boolean
  canReview?: boolean
}

export interface LearningObjective {
  id: string
  projectId: string
  title: string
  successCriteria: string
  targetLevel: 1 | 2 | 3 | 4
  position: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  prerequisiteIds: string[]
}

export interface LearningActivity {
  id: string
  projectId: string
  title: string
  instructions: string
  kind: 'LESSON' | 'PRACTICE' | 'ASSESSMENT' | 'PROJECT' | 'REVIEW'
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  evaluationMode: 'AGENT_FORMATIVE' | 'TEACHER_REQUIRED'
  targetLevel: 1 | 2 | 3 | 4
  rubric: unknown[]
  knowledgeUnitIds: string[]
  dueAt?: string
}

export interface LearningMissionStep {
  id: string
  kind: 'LEARN' | 'PRACTICE' | 'CHECK' | 'REFLECT'
  description: string
  successCriteria: string
  knowledgeUnitId?: string
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  position: number
  outcome?: string
  completionEvidenceId?: string
  completionAttemptId?: string
}

export interface LearningMission {
  id: string
  projectId: string
  courseId?: string
  learnerId: string
  conversationId: string
  triggerClientMsgNo: string
  goal: string
  successCriteria: string
  kind: 'STUDY' | 'RESEARCH' | 'PROJECT'
  coordinatorAgentId: string
  coordinatorName?: string
  status: 'PLANNING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
  steps: LearningMissionStep[]
  createdAt: string
  updatedAt: string
}

export interface LearningEvidence {
  id: string
  activity_id: string | null
  mission_step_id: string | null
  assistance: 'NONE' | 'HINT' | 'GUIDED'
  status: string
  evidence: unknown
  created_at: string
  evaluation_id: string | null
  demonstrated_level: number | null
  confidence: number | null
  rubric_results: unknown
  feedback: string | null
  evaluation_status: string | null
  learner_id?: string
}

export interface LearningReview {
  id: string
  attempt_id: string
  learner_id: string
  activity_id: string | null
  activity_title: string | null
  demonstrated_level: number
  confidence: number
  feedback: string
  source_evidence_id: string | null
  verifier_evidence_id: string | null
  builder_agent_id: string | null
  verifier_agent_id: string | null
  verifier_verdict: 'supported' | 'rejected' | 'inconclusive' | null
  status?: string
  [key: string]: unknown
}

export interface LearningProgress {
  user_id: string
  display_name: string
  email: string
  average_level: number
  verified_knowledge_units: number
  due_knowledge_units: number
  attempts: number
}

export interface LearningDashboard {
  projects: LearningCourse[]
  due: Array<{ projectId: string; knowledgeUnitId: string; title: string; level: number; status: string; nextReviewAt: string }>
  states: Array<{ projectId: string; knowledgeUnitId: string; title: string; level: number; status: string; nextReviewAt: string | null; reviewIntervalDays: number }>
  pendingReviews: number
}

export interface LearningNotificationPreferences {
  company_id?: string
  user_id?: string
  project_id: string | null
  in_app_enabled: boolean
  email_enabled: boolean
  push_enabled: false
  timezone: string
  daily_time: string
  weekly_day: number
  quiet_start: string | null
  quiet_end: string | null
}

export interface LearningDelivery {
  id: string
  project_id: string
  channel: 'IN_APP' | 'EMAIL'
  policy: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'FORMAL'
  summary: string
  link_path: string
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  sent_at?: string | null
  created_at?: string
}

export interface TeacherDigestSchedule {
  frequency: 'daily' | 'weekly' | 'off'
  timezone: string
  localTime?: string
  weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  status: 'active' | 'paused'
  nextRunAt?: string
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

