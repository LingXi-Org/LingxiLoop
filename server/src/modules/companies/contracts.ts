import { z } from 'zod'

export const createCompanyRequestSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(80),
}).strict()

export const updateCompanyRequestSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(80).optional(),
  description: z.string().trim().max(1000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'nothing to update')

export const updateMemberRoleRequestSchema = z.object({
  role: z.enum(['admin', 'member']),
}).strict()

export const createInvitationRequestSchema = z.object({
  email: z.string().trim().email('invalid email').nullable().optional(),
  role: z.enum(['member', 'admin']).default('member'),
  note: z.string().trim().max(280).nullable().optional(),
  multiUse: z.boolean().optional(),
  maxUses: z.coerce.number().int().positive().optional(),
  sendEmail: z.boolean().optional(),
}).strict()

export type CreateCompanyInput = z.infer<typeof createCompanyRequestSchema>
export type UpdateCompanyInput = z.infer<typeof updateCompanyRequestSchema>
export type CreateInvitationInput = z.infer<typeof createInvitationRequestSchema>

export interface RequestAuditContext {
  ip: string | null
  userAgent: string | null
}

export interface InvitationRow {
  token_hash: string
  company_id: string
  invited_by: string
  email: string | null
  role: string
  note: string | null
  max_uses: number
  use_count: number
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_accepted_at: string | null
  last_accepted_by: string | null
}

export interface InvitationPreview {
  status: 'valid' | 'revoked' | 'expired' | 'consumed' | 'wrong_email' | 'already_member' | 'not_found'
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
