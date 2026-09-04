import { z } from 'zod'

export const NOTIFICATION_POLICIES = ['IMMEDIATE', 'DAILY', 'WEEKLY', 'FORMAL'] as const
export type NotificationPolicy = typeof NOTIFICATION_POLICIES[number]
export type NotificationChannel = 'IN_APP' | 'EMAIL'

export const notificationPreferencesRequestSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  timezone: z.string().trim().min(1).max(100),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weeklyDay: z.number().int().min(1).max(7),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).strict()

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesRequestSchema>

export interface NotificationPreferencesRow {
  company_id: string
  user_id: string
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

export interface NotificationScope {
  companyId: string
  userId: string
}
