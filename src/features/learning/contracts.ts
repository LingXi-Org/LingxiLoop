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
  id: string
  companyId: string
  projectId: string
  projectKind: ProjectKind
  title: string
  description: string
  status: ProjectStatus
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
  status: 'draft' | 'published' | 'archived'
  prerequisiteIds: string[]
}

export interface LearningActivity {
  id: string
  courseId: string
  title: string
  instructions: string
  type: 'lesson' | 'practice' | 'assessment' | 'project' | 'review'
  status: 'draft' | 'published' | 'closed'
  evaluationMode: 'agent_formative' | 'teacher_required'
  targetLevel: 1 | 2 | 3 | 4
  rubric: unknown[]
  objectiveIds: string[]
  dueAt?: string
}

export interface LearningMissionStep {
  id: string
  type: 'learn' | 'practice' | 'check' | 'reflect'
  description: string
  successCriteria: string
  objectiveId?: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
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
  missionKind: 'study' | 'research' | 'project'
  coordinatorAgentId: string
  coordinatorName?: string
  status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled'
  steps: LearningMissionStep[]
  createdAt: string
  updatedAt: string
}

export interface LearningEvidence {
  id: string
  activity_id: string | null
  mission_step_id: string | null
  assistance: 'none' | 'hint' | 'guided'
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
  source_report_id: string | null
  verifier_report_id: string | null
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
  verified_objectives: number
  due_objectives: number
  attempts: number
}

export interface LearningDashboard {
  courses: LearningCourse[]
  due: Array<{ course_id: string; objective_id: string; title: string; level: number; status: string; next_review_at: string }>
  mastery: Array<{ course_id: string; objective_id: string; title: string; level: number; status: string; next_review_at: string | null; review_interval_days: number }>
  pendingReviews: number
}

export interface LearningNotificationPreferences {
  company_id?: string
  user_id?: string
  course_id: string | null
  in_app_enabled: boolean
  email_enabled: boolean
  timezone: string
  preferred_time: string
  quiet_start: string | null
  quiet_end: string | null
}

export interface LearningDelivery {
  id: string
  kind: string
  channel: 'in_app' | 'email'
  status: 'pending' | 'processing' | 'sent' | 'failed'
  digest_date: string | null
  sent_at?: string | null
  last_error?: string | null
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

