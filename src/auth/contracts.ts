export interface AuthCompany {
  id: string
  name: string
  slug: string
  role: 'teacher' | 'student'
  isAdmin: boolean
  status: CompanyStatus
}

export type CompanyStatus =
  | 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'READ_ONLY'
  | 'OFFBOARDED' | 'RETENTION' | 'ARCHIVED' | 'DELETED'

export interface AuthUser {
  avatarUrl?: string | null
  avatarSeed?: string | null
  id: string
  email: string
  name: string
  emailVerified?: boolean
  providers?: string[]
}

export interface ServerCapabilities {
  invitationEmail: boolean
}

export interface AuthMeResponse {
  user: AuthUser & { emailVerified: boolean; providers: string[] }
  companies: AuthCompany[]
  activeCompanyId: string
  serverCapabilities: ServerCapabilities
}

export interface AuthStartOptions {
  inviteToken?: string | null
  inviteKind?: 'company' | 'project' | null
  returnUrl?: string | null
}
