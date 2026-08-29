import type { Queryable } from '../../db/queryable.js'
import type {
  CalendarEventKind,
  CalendarStatus,
  RecurrenceRule,
  ReminderChannel,
  UpdateCalendarEventInput,
} from './contracts.js'

export interface CalendarEventRow {
  id: string
  company_id: string
  project_id: string
  created_by: string
  kind: CalendarEventKind
  title: string
  description: string | null
  assignee_id: string | null
  target_conversation_id: string | null
  agent_prompt: string | null
  start_at: Date
  end_at: Date | null
  all_day: boolean
  recurrence: RecurrenceRule | null
  status: CalendarStatus
  last_fired_at: Date | null
  reminder_minutes_before: number | null
  reminder_channel: ReminderChannel | null
  is_private: boolean
  created_at: Date
  updated_at: Date
}

export interface CalendarDispatchRow {
  id: string
  event_id: string
  scheduled_for: Date
  dispatched_at: Date
  status: string
  conversation_id: string | null
  message_id: string | null
  error: string | null
}

export interface RecentCalendarEventRow {
  id: string
  title: string
  created_by: string
  created_at: Date
}

export interface CalendarReminderRecipientRow {
  user_id: string
  email: string | null
}

export interface InsertCalendarEventArgs {
  id: string
  companyId: string
  projectId: string
  createdBy: string
  kind: CalendarEventKind
  title: string
  description: string | null
  assigneeId: string | null
  targetConversationId: string | null
  agentPrompt: string | null
  startAt: Date
  endAt: Date | null
  allDay: boolean
  recurrence: RecurrenceRule | null
  status: CalendarStatus
  reminderMinutesBefore: number | null
  reminderChannel: ReminderChannel | null
  isPrivate: boolean
}

const CALENDAR_SELECT = `id, company_id, project_id, created_by, kind, title, description,
  assignee_id, target_conversation_id, agent_prompt, start_at, end_at, all_day,
  recurrence, status, last_fired_at, reminder_minutes_before, reminder_channel,
  is_private, created_at, updated_at`

function visibilityClause(userParameter: number, companyParameter: number): string {
  return `(
    is_private = false
    OR created_by = $${userParameter}
    OR assignee_id = $${userParameter}
    OR (
      EXISTS (
        SELECT 1 FROM company_memberships membership
         WHERE membership.company_id = $${companyParameter}
           AND membership.user_id = $${userParameter}
           AND membership.status='ACTIVE' AND membership.role='OWNER'
      )
      AND (
        created_by IN (
          SELECT id FROM participants
           WHERE company_id = $${companyParameter} AND kind = 'agent'
        )
        OR assignee_id IN (
          SELECT id FROM participants
           WHERE company_id = $${companyParameter} AND kind = 'agent'
        )
      )
    )
  )`
}

export async function listCalendarEvents(
  db: Queryable,
  args: { companyId: string; projectId: string; userId: string; from?: Date; to?: Date },
): Promise<CalendarEventRow[]> {
  const parameters: unknown[] = [args.companyId, args.userId, args.projectId]
  let sql = `SELECT ${CALENDAR_SELECT} FROM calendar_events
              WHERE company_id = $1 AND project_id = $3 AND ${visibilityClause(2, 1)}`
  if (args.from) {
    parameters.push(args.from)
    sql += ` AND (start_at >= $${parameters.length} OR (recurrence IS NOT NULL AND status = 'active'))`
  }
  if (args.to) {
    parameters.push(args.to)
    sql += ` AND start_at <= $${parameters.length}`
  }
  sql += ' ORDER BY start_at ASC LIMIT 1000'
  const { rows } = await db.query<CalendarEventRow>(sql, parameters)
  return rows
}

export async function listRecentSharedCalendarEvents(
  db: Queryable,
  args: { companyId: string; projectId: string; excludeCreatorId: string; sinceMinutes: number },
): Promise<RecentCalendarEventRow[]> {
  const { rows } = await db.query<RecentCalendarEventRow>(
    `SELECT id, title, created_by, created_at
       FROM calendar_events
      WHERE company_id = $1 AND project_id = $2 AND created_by <> $3
        AND status = 'active' AND is_private = FALSE
        AND created_at > NOW() - ($4 * INTERVAL '1 minute')
      ORDER BY created_at DESC
      LIMIT 50`,
    [args.companyId, args.projectId, args.excludeCreatorId, args.sinceMinutes],
  )
  return rows
}

export async function calendarParticipantExists(
  db: Queryable,
  companyId: string,
  participantId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [participantId, companyId],
  )
  return rows.length > 0
}

export async function calendarConversationExists(
  db: Queryable,
  companyId: string,
  projectId: string,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM conversations
      WHERE id = $1 AND company_id = $2 AND project_id = $3
      LIMIT 1`,
    [conversationId, companyId, projectId],
  )
  return rows.length > 0
}

export async function insertCalendarEvent(
  db: Queryable,
  args: InsertCalendarEventArgs,
): Promise<CalendarEventRow> {
  const { rows } = await db.query<CalendarEventRow>(
    `INSERT INTO calendar_events
       (id, company_id, project_id, created_by, kind, title, description, assignee_id,
        target_conversation_id, agent_prompt, start_at, end_at, all_day, recurrence,
        status, reminder_minutes_before, reminder_channel, is_private)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18)
     RETURNING ${CALENDAR_SELECT}`,
    [
      args.id,
      args.companyId,
      args.projectId,
      args.createdBy,
      args.kind,
      args.title,
      args.description,
      args.assigneeId,
      args.targetConversationId,
      args.agentPrompt,
      args.startAt,
      args.endAt,
      args.allDay,
      args.recurrence ? JSON.stringify(args.recurrence) : null,
      args.status,
      args.reminderMinutesBefore,
      args.reminderChannel,
      args.isPrivate,
    ],
  )
  if (!rows[0]) throw new Error('calendar event insert returned no row')
  return rows[0]
}

export async function findVisibleCalendarEvent(
  db: Queryable,
  args: { id: string; companyId: string; projectId: string; userId: string },
): Promise<CalendarEventRow | null> {
  const { rows } = await db.query<CalendarEventRow>(
    `SELECT ${CALENDAR_SELECT} FROM calendar_events
      WHERE id = $1 AND company_id = $2 AND project_id = $4
        AND ${visibilityClause(3, 2)}
      LIMIT 1`,
    [args.id, args.companyId, args.userId, args.projectId],
  )
  return rows[0] ?? null
}

const UPDATE_COLUMNS = {
  title: 'title',
  kind: 'kind',
  description: 'description',
  assigneeId: 'assignee_id',
  targetConversationId: 'target_conversation_id',
  agentPrompt: 'agent_prompt',
  startAt: 'start_at',
  endAt: 'end_at',
  allDay: 'all_day',
  recurrence: 'recurrence',
  status: 'status',
  reminderMinutesBefore: 'reminder_minutes_before',
  reminderChannel: 'reminder_channel',
  isPrivate: 'is_private',
} as const

export async function updateVisibleCalendarEvent(
  db: Queryable,
  scope: { id: string; companyId: string; projectId: string; userId: string },
  patch: UpdateCalendarEventInput,
): Promise<CalendarEventRow | null> {
  const parameters: unknown[] = []
  const sets: string[] = []
  for (const key of Object.keys(UPDATE_COLUMNS) as Array<keyof typeof UPDATE_COLUMNS>) {
    if (!Object.hasOwn(patch, key)) continue
    const value = patch[key]
    parameters.push(key === 'recurrence' && value != null ? JSON.stringify(value) : value)
    const cast = key === 'recurrence' ? '::jsonb' : ''
    sets.push(`${UPDATE_COLUMNS[key]} = $${parameters.length}${cast}`)
  }
  parameters.push(scope.id, scope.companyId, scope.userId, scope.projectId)
  const idParameter = parameters.length - 3
  const companyParameter = parameters.length - 2
  const userParameter = parameters.length - 1
  const projectParameter = parameters.length
  const { rows } = await db.query<CalendarEventRow>(
    `UPDATE calendar_events
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${idParameter}
        AND company_id = $${companyParameter}
        AND project_id = $${projectParameter}
        AND ${visibilityClause(userParameter, companyParameter)}
      RETURNING ${CALENDAR_SELECT}`,
    parameters,
  )
  return rows[0] ?? null
}

export async function deleteVisibleCalendarEvent(
  db: Queryable,
  args: { id: string; companyId: string; projectId: string; userId: string },
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM calendar_events
      WHERE id = $1 AND company_id = $2 AND project_id = $4
        AND ${visibilityClause(3, 2)}`,
    [args.id, args.companyId, args.userId, args.projectId],
  )
  return (result.rowCount ?? 0) > 0
}

export async function listCalendarDispatches(
  db: Queryable,
  companyId: string,
  projectId: string,
  eventId: string,
): Promise<CalendarDispatchRow[]> {
  const { rows } = await db.query<CalendarDispatchRow>(
    `SELECT dispatch.id, dispatch.event_id, dispatch.scheduled_for, dispatch.dispatched_at,
            dispatch.status, dispatch.conversation_id, dispatch.message_id, dispatch.error
       FROM calendar_dispatches dispatch
       JOIN calendar_events event
         ON event.id = dispatch.event_id
        AND event.company_id = dispatch.company_id
      WHERE dispatch.event_id = $1
        AND dispatch.company_id = $2
        AND event.company_id = $2
        AND event.project_id = $3
      ORDER BY dispatch.scheduled_for DESC
      LIMIT 200`,
    [eventId, companyId, projectId],
  )
  return rows
}

export async function claimCalendarDispatch(
  db: Queryable,
  args: { id: string; eventId: string; companyId: string; scheduledFor: Date },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO calendar_dispatches (id, event_id, company_id, scheduled_for, status)
     VALUES ($1,$2,$3,$4,'pending')
     ON CONFLICT (event_id, scheduled_for) DO UPDATE
       SET id=EXCLUDED.id,status='pending',claimed_at=NOW(),attempt_count=calendar_dispatches.attempt_count+1,error=NULL
     WHERE calendar_dispatches.status='failed'
        OR (calendar_dispatches.status='pending' AND calendar_dispatches.claimed_at < NOW() - INTERVAL '5 minutes')
     RETURNING id`,
    [args.id, args.eventId, args.companyId, args.scheduledFor],
  )
  return (result.rowCount ?? 0) > 0
}

export async function completeCalendarDispatch(
  db: Queryable,
  args: {
    id: string
    status: 'dispatched' | 'skipped' | 'failed'
    conversationId?: string | null
    messageId?: string | null
    error?: string | null
  },
): Promise<void> {
  await db.query(
    `UPDATE calendar_dispatches
        SET status = $2, conversation_id = $3, message_id = $4, error = $5
      WHERE id = $1`,
    [args.id, args.status, args.conversationId ?? null, args.messageId ?? null, args.error ?? null],
  )
}

export async function calendarConversationMembers(
  db: Queryable,
  args: { conversationId: string; companyId: string; projectId: string },
): Promise<string[] | null> {
  const { rows } = await db.query<{ members: string[] }>(
    `SELECT members FROM conversations
      WHERE id = $1 AND company_id = $2 AND project_id = $3
      LIMIT 1`,
    [args.conversationId, args.companyId, args.projectId],
  )
  return rows[0]?.members ?? null
}

export async function findCalendarDirectConversation(
  db: Queryable,
  args: { companyId: string; projectId: string; creatorId: string; assigneeId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM conversations
      WHERE company_id=$1 AND project_id=$2 AND kind='direct'
        AND members @> to_jsonb(ARRAY[$3::text,$4::text])
        AND jsonb_array_length(members)=2
      ORDER BY id LIMIT 1`,
    [args.companyId,args.projectId,args.creatorId,args.assigneeId],
  )
  return rows[0]?.id ?? null
}

export async function listCalendarReminderRecipients(
  db: Queryable,
  args: { companyId: string; creatorId: string; assigneeId: string | null },
): Promise<CalendarReminderRecipientRow[]> {
  const { rows } = await db.query<CalendarReminderRecipientRow>(
    `WITH recipient_ids AS (
       SELECT $2::text AS user_id
       UNION
       SELECT participant.id
         FROM participants participant
        WHERE participant.company_id = $1
          AND participant.id = $3
          AND participant.kind = 'human'
          AND participant.departed_at IS NULL
     )
     SELECT recipient.user_id, users.email
       FROM recipient_ids recipient
       LEFT JOIN users ON users.id = recipient.user_id`,
    [args.companyId, args.creatorId, args.assigneeId],
  )
  return rows
}

export async function claimCalendarReminder(
  db: Queryable,
  args: {
    id: string
    eventId: string
    companyId: string
    scheduledFor: Date
    channel: ReminderChannel
  },
): Promise<string[] | null> {
  const { rows } = await db.query<{ delivered_legs: string[] }>(
    `INSERT INTO calendar_reminders
       (id, event_id, company_id, scheduled_for, channel, recipients, status)
     VALUES ($1,$2,$3,$4,$5,'[]'::jsonb,'pending')
     ON CONFLICT (event_id, scheduled_for) DO UPDATE
       SET id=EXCLUDED.id,status='pending',claimed_at=NOW(),attempt_count=calendar_reminders.attempt_count+1,error=NULL,
           channel=EXCLUDED.channel
     WHERE calendar_reminders.status='failed'
        OR (calendar_reminders.status='pending' AND calendar_reminders.claimed_at < NOW() - INTERVAL '5 minutes')
     RETURNING delivered_legs`,
    [args.id, args.eventId, args.companyId, args.scheduledFor, args.channel],
  )
  return rows[0]?.delivered_legs ?? null
}

export async function completeCalendarReminder(
  db: Queryable,
  args: {
    id: string
    recipients: string[]
    status: 'sent' | 'skipped' | 'failed'
    deliveredLegs: string[]
    error?: string | null
  },
): Promise<void> {
  await db.query(
    `UPDATE calendar_reminders
        SET recipients = $2::jsonb, status = $3, error = $4, delivered_legs=$5::jsonb
      WHERE id = $1`,
    [args.id, JSON.stringify(args.recipients), args.status, args.error ?? null, JSON.stringify(args.deliveredLegs)],
  )
}

export async function recordCalendarReminderLeg(
  db: Queryable,
  args: { id: string; leg: string },
): Promise<void> {
  const result = await db.query(
    `UPDATE calendar_reminders
        SET delivered_legs=(SELECT jsonb_agg(DISTINCT value)
          FROM jsonb_array_elements_text(delivered_legs || to_jsonb($2::text)) AS leg(value))
      WHERE id=$1 AND status='pending'`,
    [args.id, args.leg],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error('calendar reminder leg lost its claim fence')
}

export async function listActiveCalendarEvents(db: Queryable): Promise<CalendarEventRow[]> {
  const { rows } = await db.query<CalendarEventRow>(
    `SELECT ${CALENDAR_SELECT} FROM calendar_events WHERE status = 'active'`,
  )
  return rows
}

export async function markCalendarEventDone(
  db: Queryable,
  args: { id: string; companyId: string },
): Promise<void> {
  await db.query(
    `UPDATE calendar_events
        SET status = 'done', updated_at = NOW()
      WHERE id = $1 AND company_id = $2`,
    [args.id, args.companyId],
  )
}

export async function markCalendarEventFired(
  db: Queryable,
  args: { id: string; companyId: string; scheduledFor: Date },
): Promise<void> {
  await db.query(
    `UPDATE calendar_events
        SET last_fired_at = $3, updated_at = NOW()
      WHERE id = $1 AND company_id = $2`,
    [args.id, args.companyId, args.scheduledFor],
  )
}
