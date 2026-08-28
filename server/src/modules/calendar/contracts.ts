import { z } from 'zod'

export type CalendarEventKind = 'personal' | 'agent_task'
export type CalendarStatus = 'active' | 'paused' | 'done' | 'cancelled'
export type ReminderChannel = 'toast' | 'email' | 'both'

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  byweekday?: number[]
  until?: string | null
  count?: number | null
}

const isoDateSchema = z.string().trim().min(1).superRefine((value, context) => {
  if (Number.isNaN(new Date(value).getTime())) {
    context.addIssue({ code: 'custom', message: 'must be a valid ISO timestamp' })
  }
}).transform((value) => new Date(value))

const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.coerce.number().int().min(1).default(1),
  byweekday: z.array(z.coerce.number().int().min(0).max(6)).min(1).optional(),
  until: isoDateSchema.transform((value) => value.toISOString()).nullable().optional(),
  count: z.coerce.number().int().min(1).nullable().optional(),
}).strict()

const reminderMinutesSchema = z.coerce.number().int().min(0).max(14 * 24 * 60)

export const listCalendarEventsQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
}).strict()

export const createCalendarEventRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['personal', 'agent_task']).default('personal'),
  description: z.string().max(4000).nullable().optional(),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  targetConversationId: z.string().trim().min(1).nullable().optional(),
  agentPrompt: z.string().max(8000).nullable().optional(),
  startAt: isoDateSchema,
  endAt: isoDateSchema.nullable().optional(),
  allDay: z.boolean().default(false),
  recurrence: recurrenceSchema.nullable().optional(),
  status: z.enum(['active', 'paused', 'done', 'cancelled']).default('active'),
  reminderMinutesBefore: reminderMinutesSchema.nullable().optional(),
  reminderChannel: z.enum(['toast', 'email', 'both']).nullable().optional(),
  isPrivate: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (value.kind === 'agent_task' && (!value.assigneeId || !value.targetConversationId)) {
    context.addIssue({ code: 'custom', message: 'agent_task events require assigneeId and targetConversationId' })
  }
  if ((value.reminderMinutesBefore != null) !== (value.reminderChannel != null)) {
    context.addIssue({
      code: 'custom',
      message: 'reminderMinutesBefore and reminderChannel must both be set or both null',
    })
  }
})

export const updateCalendarEventRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(['personal', 'agent_task']).optional(),
  description: z.string().max(4000).nullable().optional(),
  assigneeId: z.string().trim().min(1).nullable().optional(),
  targetConversationId: z.string().trim().min(1).nullable().optional(),
  agentPrompt: z.string().max(8000).nullable().optional(),
  startAt: isoDateSchema.optional(),
  endAt: isoDateSchema.nullable().optional(),
  allDay: z.boolean().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
  status: z.enum(['active', 'paused', 'done', 'cancelled']).optional(),
  reminderMinutesBefore: reminderMinutesSchema.nullable().optional(),
  reminderChannel: z.enum(['toast', 'email', 'both']).nullable().optional(),
  isPrivate: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'no updatable fields' })

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventRequestSchema>
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventRequestSchema>

export interface CalendarScope {
  userId: string
  companyId: string
  projectId: string
}

export interface CalendarEventPayload {
  id: string
  companyId: string
  createdBy: string
  kind: CalendarEventKind
  title: string
  description: string | null
  assigneeId: string | null
  targetConversationId: string | null
  agentPrompt: string | null
  startAt: string
  endAt: string | null
  allDay: boolean
  recurrence: RecurrenceRule | null
  status: CalendarStatus
  lastFiredAt: string | null
  reminderMinutesBefore: number | null
  reminderChannel: ReminderChannel | null
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

export interface CalendarDispatchPayload {
  id: string
  eventId: string
  scheduledFor: string
  dispatchedAt: string
  status: string
  conversationId: string | null
  messageId: string | null
  error: string | null
}

export interface RecentCalendarEventPayload {
  id: string
  title: string
  createdBy: string
  createdAt: string
}

export interface CalendarChangedEvent {
  type: 'calendar.changed'
  kind: 'event.created' | 'event.updated' | 'event.deleted' | 'event.dispatched'
  eventId: string
  companyId: string
  workspaceId: string
  actorId: string | null
}

export interface CalendarDispatchResult {
  status: 'dispatched' | 'skipped' | 'failed' | 'duplicate'
  messageId?: string
  conversationId?: string
  error?: string
}
