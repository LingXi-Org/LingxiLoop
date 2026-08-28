import { createHash } from 'node:crypto'
import {
  CalendarApplicationError,
  calendarApplication,
  type CalendarScope,
  type CreateCalendarEventInput,
  type RecurrenceRule,
  type UpdateCalendarEventInput,
} from '../../modules/calendar/index.js'
import type { CliResult, CliSideEffect } from '../cli-result.js'
import { resolveAs } from '../cli-identity.js'
import type { ParsedArgs } from '../cli-parse.js'
import { consumeHold, recordHold } from '../seen-boundary.js'
import { normalizeWorkSubject, type WorkTaskType } from '../work-claims.js'

interface RunCliInternalContext {
  idempotencyKey?: string
  projectId?: string
  deferReadCursor?: boolean
}

interface CalendarCommandDependencies {
  ok(text: string, sideEffects?: CliSideEffect[]): CliResult
  err(text: string, code?: number): CliResult
  agentCompany(agentId: string): Promise<string | null>
  resolveCliProjectId(companyId: string, requested?: string): Promise<string>
  tryClaimTenantWork(
    companyId: string,
    agentId: string,
    taskType: WorkTaskType,
    subject: string,
  ): Promise<CliResult | null>
  releaseTenantWork(
    companyId: string,
    agentId: string,
    taskType: WorkTaskType,
    subject: string,
  ): Promise<void>
}

function nullableFlag(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return !normalized || normalized === 'null' || normalized === '-' ? null : normalized
}

function recurrenceFromFlags(flags: ParsedArgs['flags']): RecurrenceRule | null {
  if (!flags.every) return null
  const freq = String(flags.every)
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) {
    throw new Error(`--every must be daily|weekly|monthly|yearly (got: ${freq})`)
  }
  const interval = flags.interval === undefined ? 1 : Math.floor(Number(flags.interval))
  if (!Number.isFinite(interval) || interval < 1) throw new Error('--interval must be a positive integer')
  const byweekday = flags.byweekday
    ? String(flags.byweekday).split(',').map((value) => Number(value.trim()))
    : undefined
  if (byweekday?.some((value) => !Number.isInteger(value) || value < 0 || value > 6)) {
    throw new Error('--byweekday must contain comma-separated integers in [0, 6]')
  }
  const until = flags.until ? new Date(String(flags.until)) : null
  if (until && Number.isNaN(until.getTime())) throw new Error('--until must be a valid ISO timestamp')
  const count = flags.count === undefined ? null : Math.floor(Number(flags.count))
  if (count !== null && (!Number.isFinite(count) || count < 1)) {
    throw new Error('--count must be a positive integer')
  }
  return {
    freq: freq as RecurrenceRule['freq'],
    interval,
    ...(byweekday?.length ? { byweekday } : {}),
    until: until?.toISOString() ?? null,
    count,
  }
}

function parseReminder(flags: ParsedArgs['flags']): {
  minutes: number | null
  channel: 'toast' | 'email' | 'both' | null
} {
  if (flags.remind === undefined) return { minutes: null, channel: null }
  const raw = nullableFlag(flags.remind)
  if (raw === null) return { minutes: null, channel: null }
  const minutes = Math.floor(Number(raw))
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 14 * 24 * 60) {
    throw new Error(`--remind must be minutes in [0, 20160] (got: ${raw})`)
  }
  const channel = flags['remind-channel'] ? String(flags['remind-channel']) : 'toast'
  if (channel !== 'toast' && channel !== 'email' && channel !== 'both') {
    throw new Error(`--remind-channel must be toast|email|both (got: ${channel})`)
  }
  return { minutes, channel }
}

export function createCalendarCommand(dependencies: CalendarCommandDependencies) {
  const { ok, err, agentCompany, resolveCliProjectId, tryClaimTenantWork, releaseTenantWork } = dependencies

  async function cmdCalendar(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'list'
    const me = resolveAs(parsed)
    const companyId = await agentCompany(me)
    if (!companyId) return err(`unknown agent ${me} (no company)`)
    const projectId = await resolveCliProjectId(companyId, internal.projectId)
    const scope: CalendarScope = { userId: me, companyId, projectId }

    try {
      if (op === 'list') {
        const all = Boolean(parsed.flags.all)
        const status = parsed.flags.status ? String(parsed.flags.status) : null
        const visible = await calendarApplication.list(scope, {})
        const events = visible
          .filter((event) => all || event.assigneeId === me || event.createdBy === me)
          .filter((event) => !status || event.status === status)
          .slice(0, 200)
        if (parsed.flags.json) return ok(JSON.stringify(events, null, 2))
        if (events.length === 0) return ok(`(no calendar events for ${me}${all ? ' [workspace]' : ''})`)
        return ok([
          `${events.length} calendar event(s)${all ? ' in workspace' : ` for ${me}`}:`,
          '',
          ...events.map((event) => {
            const recurrence = event.recurrence
              ? `every ${event.recurrence.interval || 1} ${event.recurrence.freq}`
              : 'one-shot'
            const who = event.assigneeId ? ` → @${event.assigneeId}` : ''
            const lock = event.isPrivate ? ' 🔒' : ''
            return `  [${event.status.padEnd(7)}] ${event.id.slice(0, 14).padEnd(15)} ${event.startAt.slice(0, 16)} · ${recurrence}${who}${lock}  ${event.title}`
          }),
        ].join('\n'))
      }

      if (op === 'create') {
        const title = parsed.positional.slice(1).join(' ').trim()
        if (!title) return err('usage: calendar create "<title>" --at <iso> [flags]')
        const startAt = new Date(String(parsed.flags.at ?? ''))
        if (!parsed.flags.at) return err('--at <iso-timestamp> is required')
        if (Number.isNaN(startAt.getTime())) return err(`invalid --at: ${parsed.flags.at}`)
        const assigneeId = parsed.flags.assignee ? String(parsed.flags.assignee) : null
        const targetConversationId = parsed.flags.in ? String(parsed.flags.in) : null
        const kind = parsed.flags.kind === 'personal'
          ? 'personal'
          : assigneeId || parsed.flags.prompt ? 'agent_task' : 'personal'
        if (kind === 'agent_task' && !assigneeId) return err('agent_task events need an --assignee')
        if (kind === 'agent_task' && !targetConversationId) {
          return err('agent_task events need --in <conversation_id>')
        }
        const recurrence = recurrenceFromFlags(parsed.flags)
        const reminder = parseReminder(parsed.flags)
        const isPrivate = Boolean(parsed.flags.private)
        const stableCalendarId = internal.idempotencyKey
          ? `ce-agent-${createHash('sha256').update(`${companyId}:${internal.idempotencyKey}`).digest('hex').slice(0, 32)}`
          : undefined
        if (stableCalendarId && await calendarApplication.find(scope, stableCalendarId)) {
          return ok(`scheduled ${stableCalendarId} [replayed]`)
        }

        const blocked = await tryClaimTenantWork(companyId, me, 'calendar-create', title)
        if (blocked) return blocked
        try {
          if (!isPrivate) {
            const normalizedTitle = normalizeWorkSubject(title)
            const holdScope = `calendar-create:${normalizedTitle}`
            const forceArmed = Boolean(parsed.flags.force) && (await consumeHold(me, holdScope)).armed
            if (!forceArmed) {
              const recent = await calendarApplication.recentSharedEvents(scope)
              const duplicate = recent.find((event) => normalizeWorkSubject(event.title) === normalizedTitle)
              if (duplicate) {
                await recordHold(me, holdScope)
                const ageSeconds = Math.max(1, Math.round((Date.now() - new Date(duplicate.createdAt).getTime()) / 1000))
                return err(
                  `HELD — event NOT created. ${duplicate.createdBy} already scheduled "${duplicate.title}" (${duplicate.id}) ${ageSeconds}s ago — `
                  + 'this work is DONE; a second copy double-books everyone. '
                  + `Inspect theirs instead: \`lingxiloop calendar list\` / \`lingxiloop calendar update ${duplicate.id} ...\` if it needs changes. `
                  + 'If you GENUINELY need a separate same-title event, rerun with --force '
                  + '(--force only works after you have been shown this hold — passing it preemptively does nothing).',
                  2,
                )
              }
            }
          }
          const input: CreateCalendarEventInput = {
            title,
            kind,
            assigneeId,
            targetConversationId,
            agentPrompt: parsed.flags.prompt ? String(parsed.flags.prompt).slice(0, 8000) : null,
            startAt,
            allDay: false,
            recurrence,
            status: 'active',
            reminderMinutesBefore: reminder.minutes,
            reminderChannel: reminder.channel,
            isPrivate,
          }
          const event = await calendarApplication.create(scope, input, {
            eventId: stableCalendarId,
            replayExisting: Boolean(stableCalendarId),
          })
          return ok(
            `scheduled ${event.id}: "${title}" at ${event.startAt}`
            + `${recurrence ? ` · every ${recurrence.interval} ${recurrence.freq}` : ''}`
            + `${assigneeId ? ` → @${assigneeId}` : ''}`
            + `${reminder.minutes != null ? ` · remind ${reminder.minutes}m before (${reminder.channel})` : ''}`
            + `${isPrivate ? ' · 🔒 private' : ''}`,
            [{
              event: 'calendar.event_created',
              command: 'calendar create',
              calendarEventId: event.id,
              actorId: me,
              companyId,
              title,
              kind,
              assigneeId,
              targetConversationId,
              startAt: event.startAt,
              recurrence,
              reminderMinutesBefore: reminder.minutes,
              reminderChannel: reminder.channel,
              visibleToUser: true,
            }],
          )
        } finally {
          await releaseTenantWork(companyId, me, 'calendar-create', title)
        }
      }

      if (op === 'update' || op === 'edit') {
        const eventId = parsed.positional[1]
        if (!eventId) return err(`usage: calendar ${op} <event_id> [flags]`)
        const patch: UpdateCalendarEventInput = {}
        if (parsed.flags.title !== undefined) {
          const title = String(parsed.flags.title).trim().slice(0, 200)
          if (!title) return err('--title cannot be empty')
          patch.title = title
        }
        if (parsed.flags.description !== undefined) patch.description = nullableFlag(parsed.flags.description)?.slice(0, 4000) ?? null
        if (parsed.flags.kind !== undefined) {
          const kind = String(parsed.flags.kind)
          if (kind !== 'personal' && kind !== 'agent_task') return err('--kind must be personal|agent_task')
          patch.kind = kind
        }
        if (parsed.flags.assignee !== undefined) patch.assigneeId = nullableFlag(parsed.flags.assignee)
        if (parsed.flags.prompt !== undefined) patch.agentPrompt = nullableFlag(parsed.flags.prompt)?.slice(0, 8000) ?? null
        if (parsed.flags.in !== undefined) patch.targetConversationId = nullableFlag(parsed.flags.in)
        if (parsed.flags.at !== undefined) {
          const value = new Date(String(parsed.flags.at))
          if (Number.isNaN(value.getTime())) return err(`invalid --at: ${parsed.flags.at}`)
          patch.startAt = value
        }
        if (parsed.flags.end !== undefined) {
          const raw = nullableFlag(parsed.flags.end)
          if (raw) {
            const value = new Date(raw)
            if (Number.isNaN(value.getTime())) return err(`invalid --end: ${raw}`)
            patch.endAt = value
          } else patch.endAt = null
        }
        if (parsed.flags.status !== undefined) {
          const status = String(parsed.flags.status)
          if (!['active', 'paused', 'cancelled', 'done'].includes(status)) {
            return err('--status must be active|paused|cancelled|done')
          }
          patch.status = status as UpdateCalendarEventInput['status']
        }
        if (parsed.flags.remind !== undefined) {
          const reminder = parseReminder(parsed.flags)
          patch.reminderMinutesBefore = reminder.minutes
          patch.reminderChannel = reminder.channel
        } else if (parsed.flags['remind-channel'] !== undefined) {
          return err('--remind-channel requires --remind')
        }
        if (parsed.flags.private !== undefined) patch.isPrivate = true
        else if (parsed.flags.public !== undefined) patch.isPrivate = false
        if (parsed.flags['clear-recurrence'] !== undefined) patch.recurrence = null
        else if (parsed.flags.every !== undefined) patch.recurrence = recurrenceFromFlags(parsed.flags)
        if (Object.keys(patch).length === 0) return err('nothing to update — pass at least one calendar field flag')
        const event = await calendarApplication.update(scope, eventId, patch)
        return ok(`updated ${eventId}: "${event.title}" at ${event.startAt} (${event.status})`, [{
          event: 'calendar.event_updated',
          command: `calendar ${op}`,
          calendarEventId: eventId,
          actorId: me,
          companyId,
          title: event.title,
          kind: event.kind,
          status: event.status,
          assigneeId: event.assigneeId,
          targetConversationId: event.targetConversationId,
          startAt: event.startAt,
          visibleToUser: true,
        }])
      }

      if (op === 'run-now') {
        const eventId = parsed.positional[1]
        if (!eventId) return err('usage: calendar run-now <event_id>')
        const result = await calendarApplication.runNow(scope, eventId)
        return ok(`dispatched ${eventId}: ${JSON.stringify(result)}`, [{
          event: 'calendar.event_dispatched',
          command: 'calendar run-now',
          calendarEventId: eventId,
          actorId: me,
          companyId,
          result,
          visibleToUser: true,
        }])
      }

      if (op === 'dispatches') {
        const eventId = parsed.positional[1]
        if (!eventId) return err('usage: calendar dispatches <event_id>')
        const dispatches = await calendarApplication.dispatches(scope, eventId)
        if (parsed.flags.json) return ok(JSON.stringify(dispatches, null, 2))
        if (dispatches.length === 0) return ok(`(no dispatches for ${eventId})`)
        return ok([
          `${dispatches.length} dispatch(es) for ${eventId}:`,
          '',
          ...dispatches.map((dispatch) =>
            `  [${dispatch.status}] ${dispatch.scheduledFor} → ${dispatch.conversationId ?? '-'} ${dispatch.messageId ?? ''}${dispatch.error ? ` · ${dispatch.error}` : ''}`,
          ),
        ].join('\n'))
      }

      if (op === 'cancel' || op === 'delete') {
        const eventId = parsed.positional[1]
        if (!eventId) return err(`usage: calendar ${op} <event_id>`)
        if (op === 'delete') await calendarApplication.delete(scope, eventId)
        else await calendarApplication.update(scope, eventId, { status: 'cancelled' })
        return ok(`${op === 'delete' ? 'deleted' : 'cancelled'} ${eventId}`, [{
          event: op === 'delete' ? 'calendar.event_deleted' : 'calendar.event_cancelled',
          command: `calendar ${op}`,
          calendarEventId: eventId,
          actorId: me,
          companyId,
          visibleToUser: true,
        }])
      }

      return err('usage: calendar <list|create|update|run-now|dispatches|cancel|delete> [...]')
    } catch (error) {
      if (error instanceof CalendarApplicationError) {
        if (error.code === 'event_not_found') return err(`no event ${parsed.positional[1] ?? ''}`.trim())
        return err(error.message, 2)
      }
      return err(error instanceof Error ? error.message : String(error), 2)
    }
  }

  return { cmdCalendar }
}
