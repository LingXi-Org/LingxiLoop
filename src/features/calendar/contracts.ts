export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  byweekday?: number[]
  until?: string | null
  count?: number | null
}

export type CalendarEventKind = 'personal' | 'agent_task'
export type CalendarEventStatus = 'active' | 'paused' | 'done' | 'cancelled'
export type CalendarReminderChannel = 'toast' | 'email' | 'both'

export interface CalendarEvent {
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
  status: CalendarEventStatus
  lastFiredAt: string | null
  reminderMinutesBefore: number | null
  reminderChannel: CalendarReminderChannel | null
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

export interface CalendarDispatch {
  id: string
  eventId: string
  scheduledFor: string
  dispatchedAt: string
  status: string
  conversationId: string | null
  messageId: string | null
  error: string | null
}

export interface CalendarEventInput {
  title: string
  kind?: CalendarEventKind
  description?: string | null
  assigneeId?: string | null
  targetConversationId?: string | null
  agentPrompt?: string | null
  startAt: string
  endAt?: string | null
  allDay?: boolean
  recurrence?: RecurrenceRule | null
  status?: CalendarEventStatus
  reminderMinutesBefore?: number | null
  reminderChannel?: CalendarReminderChannel | null
  isPrivate?: boolean
}

export interface CalendarDispatchResult {
  status: string
  messageId?: string
  conversationId?: string
  error?: string
}
