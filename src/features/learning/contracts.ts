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

export interface ApiCourseInvitation {
  id: string
  email: string | null
  role: 'teacher' | 'learner'
  note: string | null
  maxUses: number
  useCount: number
  createdAt: string
  expiresAt: string
  revokedAt?: string | null
  lastAcceptedAt?: string | null
  lastAcceptedBy?: string | null
  acceptances?: Array<{ userId: string; name: string | null; role: 'teacher' | 'learner'; acceptedAt: string }>
  status: 'active' | 'revoked' | 'expired' | 'consumed'
}

export interface ApiCourseInvitationWithToken extends ApiCourseInvitation {
  token: string
  url: string
}

export interface ApiCourseInvitationPreview {
  kind: 'course'
  status: ApiInvitationPreviewStatus | 'archived'
  invitation?: {
    role: 'teacher' | 'learner'
    email: string | null
    note: string | null
    expiresAt: string
    inviterName: string | null
    company: { id: string; name: string; slug: string }
    course: { id: string; name: string; projectId: string; studyRoomId: string | null }
  }
}

export interface ApiCourseInvitationAccept {
  ok: true
  alreadyMember: boolean
  joinedCompany: boolean
  company: { id: string; name: string; slug: string; role: string; status: import('@/auth/contracts').CompanyStatus }
  course: { id: string; name: string; projectId: string; studyRoomId: string | null; role: 'teacher' | 'learner' }
}

export type LearningRole = 'teacher' | 'learner'

export interface LearningCourse {
  projectId: string
  courseId?: string
  projectKind: ProjectKind
  title: string
  description: string
  status: ProjectStatus
  perspective: LearningRole
  learnerCount: number
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

