export interface AdminUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  isAdmin: boolean
  createdAt: string
  lastLoginAt: string | null
  companyCount: number
  suspended: boolean
  suspendedAt: string | null
  suspensionReason: string | null
  suspendedBy: string | null
}

export interface AdminUserDetail extends AdminUser {
  companies: Array<{
    id: string
    name: string
    slug: string
    role: string
    createdAt: string
    agentCount: number
  }>
}

export interface AdminWaitlistEntry {
  id: string
  provider: string
  providerId: string
  email: string
  displayName: string
  avatarUrl: string | null
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  requestedAt: string
  decidedAt: string | null
  decidedBy: string | null
}

export interface AdminSettings {
  waitlist_enabled: boolean
  signups_paused: boolean
}

export interface AdminStats {
  users: { total: number; admins: number }
  waitlist: { pending: number; approved: number; rejected: number }
  companies: number
  agents: number
}
