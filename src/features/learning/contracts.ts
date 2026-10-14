import type { ApiInvitationPreviewStatus } from '@/features/companies/contracts'
import type { ProjectKind, ProjectStatus } from '@/types'

export interface ApiCourse {
  avatarUrl?: string | null
  avatarSeed?: string | null
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
  avatarUrl?: string | null
  avatarSeed?: string | null
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
  canUpdateMembers: boolean
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

