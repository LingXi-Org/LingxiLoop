export interface CompanySummary {
  id: string
  name: string
  slug: string
  createdAt: string
  role: string
}

export type ApiInvitationStatus = 'active' | 'revoked' | 'expired' | 'consumed'

export interface ApiInvitation {
  id: string
  email: string | null
  role: 'member' | 'admin'
  note: string | null
  maxUses: number
  useCount: number
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  lastAcceptedAt: string | null
  lastAcceptedBy: string | null
  invitedBy: string
  inviterName: string | null
  status: ApiInvitationStatus
}

export interface ApiInvitationWithToken {
  id: string
  token: string
  url: string
  email: string | null
  role: 'member' | 'admin'
  note: string | null
  maxUses: number
  useCount: number
  createdAt: string
  expiresAt: string
  status: 'active'
  emailDelivery: { ok: true } | null
}

export type ApiInvitationPreviewStatus =
  | 'valid' | 'revoked' | 'expired' | 'consumed'
  | 'wrong_email' | 'already_member' | 'not_found'

export interface ApiInvitationPreview {
  status: ApiInvitationPreviewStatus
  invitation?: {
    role: string
    email: string | null
    note: string | null
    expiresAt: string
    createdAt: string
    inviterName: string | null
    company: { id: string; name: string; slug: string }
    multiUse: boolean
  }
}

export interface ApiInvitationAccept {
  ok: true
  alreadyMember: boolean
  company: { id: string; name: string; slug: string; role: string }
}

export interface ApiCompanyProfile {
  id: string
  name: string
  slug: string
  description: string
  role: 'owner' | 'admin' | 'member'
  createdAt: string
}

export interface ApiCompanyMember {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  courses: Array<{ courseId: string; projectKind: import('@/types').ProjectKind; name: string; role: 'teacher' | 'learner' }>
}
