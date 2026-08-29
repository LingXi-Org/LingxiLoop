import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import type {
  CalendarChangedEvent,
  CalendarDispatchResult,
  RecurrenceRule,
} from './contracts.js'
import {
  allocateCalendarMessageSequence,
  calendarConversationMembers,
  claimCalendarDispatch,
  claimCalendarReminder,
  completeCalendarDispatch,
  completeCalendarReminder,
  insertCalendarSystemMessage,
  listActiveCalendarEvents,
  listCalendarReminderRecipients,
  markCalendarEventDone,
  markCalendarEventFired,
  recordCalendarReminderLeg,
  type CalendarEventRow,
} from './repository.js'

const TICK_INTERVAL_MS = 60_000
const MAX_CATCHUP_MS = 60 * 60_000
const CALENDAR_SYSTEM_AUTHOR_ID = 'calendar'

export interface CalendarSchedulerInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  publishMessage(event: {
    type: 'message.new'
    conversationId: string
    companyId: string
    message: {
      id: string
      conversationId: string
      authorId: string
      kind: 'system'
      body: string
      sequence: number
      at: string
    }
  }): Promise<void>
  publishCalendar(event: CalendarChangedEvent): Promise<void>
  publishReminder(event: {
    type: 'calendar.reminder'
    companyId: string
    workspaceId: string
    eventId: string
    title: string
    occurrenceAt: string
    leadMinutes: number
    recipientUserIds: string[]
    kind: CalendarEventRow['kind']
    assigneeId: string | null
  }): Promise<void>
  sendReminderEmail(args: {
    to: string; subject: string; text: string; html: string; idempotencyKey: string
  }): Promise<void>
}

function addDays(value: Date, count: number): Date {
  const result = new Date(value.getTime())
  result.setUTCDate(result.getUTCDate() + count)
  return result
}

function addMonths(value: Date, count: number): Date {
  const result = new Date(value.getTime())
  result.setUTCMonth(result.getUTCMonth() + count)
  return result
}

function addYears(value: Date, count: number): Date {
  const result = new Date(value.getTime())
  result.setUTCFullYear(result.getUTCFullYear() + count)
  return result
}

function stepOnce(from: Date, rule: RecurrenceRule): Date {
  const interval = Math.max(1, Math.floor(rule.interval || 1))
  if (rule.freq === 'daily') return addDays(from, interval)
  if (rule.freq === 'monthly') return addMonths(from, interval)
  if (rule.freq === 'yearly') return addYears(from, interval)
  const weekdays = rule.byweekday?.length ? [...rule.byweekday].sort((a, b) => a - b) : null
  if (!weekdays) return addDays(from, interval * 7)
  const currentWeekday = from.getUTCDay()
  const remainingWeekday = weekdays.find((weekday) => weekday > currentWeekday)
  if (remainingWeekday !== undefined) return addDays(from, remainingWeekday - currentWeekday)
  return addDays(from, interval * 7 - currentWeekday + weekdays[0])
}

export function nextOccurrenceOnOrAfter(
  startAt: Date,
  recurrence: RecurrenceRule | null,
  after: Date,
): Date | null {
  if (!recurrence) return startAt.getTime() >= after.getTime() ? startAt : null
  const until = recurrence.until ? new Date(recurrence.until).getTime() : Number.POSITIVE_INFINITY
  const maximum = recurrence.count ?? Number.POSITIVE_INFINITY
  let occurrence = startAt
  for (let count = 1; count <= 5_000; count += 1) {
    if (occurrence.getTime() > until || count > maximum) return null
    if (occurrence.getTime() >= after.getTime()) return occurrence
    occurrence = stepOnce(occurrence, recurrence)
  }
  return null
}

function dispatchBody(event: CalendarEventRow, scheduledFor: Date): string {
  return JSON.stringify({
    kind: 'calendar_event',
    eventId: event.id,
    eventKind: event.kind,
    title: event.title.trim() || 'Calendar event',
    description: event.description?.trim() || null,
    agentPrompt: event.agent_prompt?.trim() || null,
    assigneeId: event.assignee_id,
    targetConversationId: event.target_conversation_id,
    scheduledFor: scheduledFor.toISOString(),
    startAt: event.start_at.toISOString(),
    endAt: event.end_at?.toISOString() ?? null,
    allDay: event.all_day,
    recurrence: event.recurrence,
    createdBy: event.created_by,
  })
}

function reminderSubject(event: CalendarEventRow, leadMinutes: number): string {
  const title = event.title.replace(/[\r\n\t\u0000-\u001f]/g, ' ').slice(0, 160)
  if (leadMinutes <= 1) return `Starting now: ${title}`
  if (leadMinutes < 60) return `In ${leadMinutes} min: ${title}`
  const hours = Math.round(leadMinutes / 60)
  return `In ${hours} hour${hours === 1 ? '' : 's'}: ${title}`
}

function reminderText(event: CalendarEventRow, occurrence: Date, leadMinutes: number): string {
  const lines = [
    `Heads-up — "${event.title}" is coming up.`,
    '',
    `When: ${occurrence.toUTCString()} (in ~${leadMinutes} minute${leadMinutes === 1 ? '' : 's'})`,
  ]
  if (event.description) lines.push('', event.description)
  if (event.kind === 'agent_task' && event.assignee_id) {
    lines.push('', `Will be handed off to: @${event.assignee_id}`)
  }
  lines.push('', '—', 'LingxiLoop Calendar')
  return lines.join('\n')
}

function reminderHtml(event: CalendarEventRow, occurrence: Date, leadMinutes: number): string {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const description = event.description ? `<p>${escapeHtml(event.description)}</p>` : ''
  const assignee = event.kind === 'agent_task' && event.assignee_id
    ? `<p>Will be handed off to <strong>@${escapeHtml(event.assignee_id)}</strong>.</p>`
    : ''
  return `<!doctype html><html><body><main><p>Reminder · in ${leadMinutes} minutes</p><h1>${escapeHtml(event.title)}</h1><p>${escapeHtml(occurrence.toUTCString())} UTC</p>${description}${assignee}</main></body></html>`
}

export class CalendarScheduler {
  private timer: NodeJS.Timeout | null = null
  private kickoff: NodeJS.Timeout | null = null

  constructor(private readonly infrastructure: CalendarSchedulerInfrastructure) {}

  async dispatch(event: CalendarEventRow, scheduledFor: Date): Promise<CalendarDispatchResult> {
    const dispatchId = `cd-${randomUUID()}`
    try {
      if (!await claimCalendarDispatch(this.infrastructure.db, {
        id: dispatchId,
        eventId: event.id,
        companyId: event.company_id,
        scheduledFor,
      })) return { status: 'duplicate' }
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
    if (event.kind !== 'agent_task' || !event.assignee_id) {
      const error = event.kind === 'personal' ? 'personal event' : 'no assignee'
      await completeCalendarDispatch(this.infrastructure.db, { id: dispatchId, status: 'skipped', error })
      return { status: 'skipped' }
    }
    let conversationId: string | null = null
    try {
      if (!event.target_conversation_id) throw new Error('targetConversationId is required')
      conversationId = event.target_conversation_id
      const body = dispatchBody(event, scheduledFor)
      const created = await this.infrastructure.transaction(async (db) => {
        const members = await calendarConversationMembers(db, {
          conversationId: conversationId as string,
          companyId: event.company_id,
          projectId: event.project_id,
        })
        if (!members) throw new Error('target conversation not found')
        if (!members.includes(event.assignee_id as string)) {
          throw new Error('assignee is not a target conversation member')
        }
        const sequence = await allocateCalendarMessageSequence(db, conversationId as string)
        const messageId = `m-${randomUUID()}`
        await insertCalendarSystemMessage(db, {
          id: messageId,
          conversationId: conversationId as string,
          body,
          sequence,
          companyId: event.company_id,
          authorId: CALENDAR_SYSTEM_AUTHOR_ID,
        })
        await completeCalendarDispatch(db, {
          id: dispatchId,
          status: 'dispatched',
          conversationId,
          messageId,
        })
        return { messageId, sequence }
      })
      await this.infrastructure.publishMessage({
        type: 'message.new',
        conversationId,
        companyId: event.company_id,
        message: {
          id: created.messageId,
          conversationId,
          authorId: CALENDAR_SYSTEM_AUTHOR_ID,
          kind: 'system',
          body,
          sequence: created.sequence,
          at: new Date().toISOString(),
        },
      }).catch(() => undefined)
      return { status: 'dispatched', messageId: created.messageId, conversationId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await completeCalendarDispatch(this.infrastructure.db, {
        id: dispatchId,
        status: 'failed',
        conversationId,
        error: message,
      })
      return { status: 'failed', error: message, conversationId: conversationId ?? undefined }
    }
  }

  async tick(now = new Date()): Promise<{ scanned: number; fired: number; reminded: number }> {
    const events = await listActiveCalendarEvents(this.infrastructure.db)
    let fired = 0
    let reminded = 0
    for (const event of events) {
      const after = event.last_fired_at
        ? new Date(event.last_fired_at.getTime() + 1)
        : event.start_at
      const occurrence = nextOccurrenceOnOrAfter(event.start_at, event.recurrence, after)
      if (!occurrence) {
        await markCalendarEventDone(this.infrastructure.db, { id: event.id, companyId: event.company_id })
        await this.changed(event, 'event.updated')
        continue
      }
      if (event.reminder_minutes_before !== null && event.reminder_channel) {
        const reminderAt = occurrence.getTime() - event.reminder_minutes_before * 60_000
        if (now.getTime() >= reminderAt && now.getTime() < occurrence.getTime()) {
          if (await this.remind(event, occurrence, now)) reminded += 1
        }
      }
      if (occurrence.getTime() > now.getTime()) continue
      if (now.getTime() - occurrence.getTime() > MAX_CATCHUP_MS) {
        await markCalendarEventFired(this.infrastructure.db, {
          id: event.id,
          companyId: event.company_id,
          scheduledFor: occurrence,
        })
        continue
      }
      const result = await this.dispatch(event, occurrence)
      if (!['dispatched', 'skipped'].includes(result.status)) continue
      await markCalendarEventFired(this.infrastructure.db, {
        id: event.id,
        companyId: event.company_id,
        scheduledFor: occurrence,
      })
      if (result.status === 'dispatched') fired += 1
      if (!event.recurrence) {
        await markCalendarEventDone(this.infrastructure.db, { id: event.id, companyId: event.company_id })
      }
      await this.changed(event, result.status === 'dispatched' ? 'event.dispatched' : 'event.updated')
    }
    return { scanned: events.length, fired, reminded }
  }

  start(): WorkerTaskHandle {
    if (this.timer || this.kickoff) return { stop: () => this.stop() }
    const loop = async () => {
      try {
        const result = await this.tick()
        if (result.fired > 0 || result.reminded > 0) {
          console.log(`[calendar] tick fired=${result.fired} reminded=${result.reminded} scanned=${result.scanned}`)
        }
      } catch (error) {
        console.error('[calendar] tick error', error)
      }
    }
    this.kickoff = setTimeout(() => {
      this.kickoff = null
      void loop()
    }, 5_000)
    this.kickoff.unref?.()
    this.timer = setInterval(() => { void loop() }, TICK_INTERVAL_MS)
    console.log(`[calendar] scheduler started (tick=${TICK_INTERVAL_MS}ms)`)
    return { stop: () => this.stop() }
  }

  stop(): void {
    if (this.kickoff) clearTimeout(this.kickoff)
    if (this.timer) clearInterval(this.timer)
    this.kickoff = null
    this.timer = null
  }

  private async remind(event: CalendarEventRow, occurrence: Date, now: Date): Promise<boolean> {
    if (event.reminder_minutes_before === null || !event.reminder_channel) return false
    const reminderId = `cr-${randomUUID()}`
    const claimedLegs = await claimCalendarReminder(this.infrastructure.db, {
      id: reminderId,
      eventId: event.id,
      companyId: event.company_id,
      scheduledFor: occurrence,
      channel: event.reminder_channel,
    })
    if (!claimedLegs) return false
    const deliveredLegs = new Set(claimedLegs)
    const recipients = await listCalendarReminderRecipients(this.infrastructure.db, {
      companyId: event.company_id,
      creatorId: event.created_by,
      assigneeId: event.assignee_id,
    })
    if (recipients.length === 0) {
      await completeCalendarReminder(this.infrastructure.db, {
        id: reminderId,
        recipients: [],
        status: 'skipped',
        deliveredLegs: [...deliveredLegs],
        error: 'no reminder recipients',
      })
      return false
    }
    const leadMinutes = Math.max(0, Math.round((occurrence.getTime() - now.getTime()) / 60_000))
    const errors: string[] = []
    if ((event.reminder_channel === 'toast' || event.reminder_channel === 'both') && !deliveredLegs.has('toast')) {
      try {
        await this.infrastructure.publishReminder({
          type: 'calendar.reminder',
          companyId: event.company_id,
          workspaceId: event.project_id,
          eventId: event.id,
          title: event.title,
          occurrenceAt: occurrence.toISOString(),
          leadMinutes,
          recipientUserIds: recipients.map((recipient) => recipient.user_id),
          kind: event.kind,
          assigneeId: event.assignee_id,
        })
        await recordCalendarReminderLeg(this.infrastructure.db, { id: reminderId, leg: 'toast' })
        deliveredLegs.add('toast')
      } catch (error) {
        errors.push(`toast: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (event.reminder_channel === 'email' || event.reminder_channel === 'both') {
      const emailRecipients = recipients.flatMap((recipient) => recipient.email ? [recipient.email] : [])
      if (emailRecipients.length === 0) errors.push('email: no mailable recipients')
      for (const to of emailRecipients) {
        const leg = `email:${to.toLowerCase()}`
        if (deliveredLegs.has(leg)) continue
        try {
          await this.infrastructure.sendReminderEmail({
            to,
            subject: reminderSubject(event, leadMinutes),
            text: reminderText(event, occurrence, leadMinutes),
            html: reminderHtml(event, occurrence, leadMinutes),
            idempotencyKey: `calendar-reminder/${createHash('sha256')
              .update(event.company_id).update('\0').update(event.id).update('\0')
              .update(occurrence.toISOString()).update('\0').update(to.toLowerCase()).digest('hex')}`,
          })
          await recordCalendarReminderLeg(this.infrastructure.db, { id: reminderId, leg })
          deliveredLegs.add(leg)
        } catch (error) {
          errors.push(`email[${to}]: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
    await completeCalendarReminder(this.infrastructure.db, {
      id: reminderId,
      recipients: recipients.map((recipient) => recipient.user_id),
      status: errors.length ? 'failed' : 'sent',
      deliveredLegs: [...deliveredLegs],
      error: errors.length ? errors.join('; ') : null,
    })
    return errors.length === 0
  }

  private changed(
    event: CalendarEventRow,
    kind: 'event.updated' | 'event.dispatched',
  ): Promise<void> {
    return this.infrastructure.publishCalendar({
      type: 'calendar.changed',
      kind,
      eventId: event.id,
      companyId: event.company_id,
      workspaceId: event.project_id,
      actorId: null,
    })
  }
}
