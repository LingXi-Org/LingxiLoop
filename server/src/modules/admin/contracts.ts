import { z } from 'zod'

export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const adminUserPatchSchema = z.object({
  isAdmin: z.boolean().optional(),
  suspended: z.boolean().optional(),
  suspensionReason: z.string().trim().max(500).nullable().optional(),
}).strict().refine(
  (value) => value.isAdmin !== undefined || value.suspended !== undefined,
  { message: 'no user fields to update' },
)

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

export interface AdminStats {
  users: { total: number; admins: number }
  waitlist: { pending: number; approved: number; rejected: number }
  companies: number
  agents: number
}

export interface AppSettings {
  waitlist_enabled: boolean
  signups_paused: boolean
}

export type AppSettingKey = keyof AppSettings

export interface WaitlistRow {
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

export interface WaitlistFilter {
  status?: WaitlistRow['status']
  q?: string
  limit?: number
  offset?: number
}

export interface EnqueueWaitlistInput {
  provider: string
  providerId: string
  email: string
  displayName: string
  avatarUrl: string | null
}

export interface ApprovedWaitlist {
  userId: string
  companyId: string | null
}
