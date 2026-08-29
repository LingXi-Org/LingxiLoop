import { z } from 'zod'

export type IdentityProvider = 'lingxi'

export const authStartQuerySchema = z.object({
  return: z.string().trim().min(1).optional(),
  invite: z.string().min(8).max(200).optional(),
  inviteKind: z.enum(['company', 'course']).optional(),
}).strict()

export const authCallbackQuerySchema = z.object({
  code: z.string().default(''),
  state: z.string().default(''),
  error: z.string().default(''),
  error_description: z.string().default(''),
}).passthrough()

export interface IdentityRequestMetadata {
  ip: string | null
  userAgent: string | null
}

export interface NormalizedIdentityProfile {
  providerId: string
  email: string
  displayName: string
  avatarUrl: string | null
}

export interface IdentityUserPayload {
  id: string
  email: string
  name: string
  emailVerified: boolean
  providers: string[]
}

export interface IdentityCompanyPayload {
  id: string
  name: string
  slug: string
  role: string
}

export interface IdentityMePayload {
  user: IdentityUserPayload
  companies: IdentityCompanyPayload[]
  activeCompanyId: string
  serverCapabilities: { invitationEmail: boolean }
}
