export interface AuthCompany {
  id: string
  name: string
  slug: string
  role: string
}

export interface AuthUser {
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
  inviteKind?: 'company' | 'course' | null
  returnUrl?: string | null
}
