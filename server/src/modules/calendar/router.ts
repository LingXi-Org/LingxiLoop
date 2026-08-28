import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { HttpError } from '../../http/errors.js'
import { requireCompanyArtifactContext, } from '../../http/request-context.js'
import { CH_CALENDAR_EVENTS, publish, } from '../../redis.js'

export const calendarRouter = Router()
const api = calendarRouter

/* ================================ Calendar =================================
 * AI-native shared calendar. Humans schedule events from the Calendar view;
 * 'agent_task' events fire at their start time (plus recurrence) and the
 * server-side scheduler posts a typed Calendar system dispatch into the target
 * conversation, waking the assignee agent. Agents can also create / list events here —
 * same shape, same gating — so cron-style "every Monday 9am, draft the
 * standup" works whether the schedule was set up by a human or an agent.
 *
 * Scope rules: every row lives in exactly one company. The caller must be a
 * member of that company (requireCompany). We do NOT require the caller to
 * be the creator — anyone in the workspace can see + edit shared events,
 * matching how conversations work. Tightening this later (e.g. "creator
 * only edits") is a one-line ownership check; intentionally permissive
 * during v1 so a teammate can adjust a colleague's recurring agent task.
 */

type CalendarEventKind = 'personal' | 'agent_task'
type CalendarStatus = 'active' | 'paused' | 'done' | 'cancelled'

type ReminderChannel = 'toast' | 'email' | 'both'

interface CalendarEventPayload {
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
  recurrence: import('../../calendar.js').RecurrenceRule | null
  status: CalendarStatus
  lastFiredAt: string | null
  reminderMinutesBefore: number | null
  reminderChannel: ReminderChannel | null
  /** When true, only the row's creator and assignee may read or write it.
   *  Visibility is enforced at the API + CLI layer. Default false = the
   *  row is shared with everyone in the company. */
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

function isReminderChannel(v: unknown): v is ReminderChannel {
  return v === 'toast' || v === 'email' || v === 'both'
}

interface CalendarDispatchPayload {
  id: string
  eventId: string
  scheduledFor: string
  dispatchedAt: string
  status: string
  conversationId: string | null
  messageId: string | null
  error: string | null
}

function isCalendarKind(v: unknown): v is CalendarEventKind {
  return v === 'personal' || v === 'agent_task'
}

function isCalendarStatus(v: unknown): v is CalendarStatus {
  return v === 'active' || v === 'paused' || v === 'done' || v === 'cancelled'
}

/** Coerce + validate a recurrence rule from request JSON. Returns null when
 *  the field is absent / explicitly null; throws on malformed shape. */
function parseRecurrence(raw: unknown): import('../../calendar.js').RecurrenceRule | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object') throw new HttpError(400, 'recurrence must be an object')
  const r = raw as Record<string, unknown>
  const freq = r.freq
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly' && freq !== 'yearly') {
    throw new HttpError(400, 'recurrence.freq must be daily|weekly|monthly|yearly')
  }
  const interval = Math.max(1, Math.floor(Number(r.interval ?? 1)))
  let byweekday: number[] | undefined
  if (Array.isArray(r.byweekday)) {
    byweekday = r.byweekday
      .map((d) => Number(d))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    if (byweekday.length === 0) byweekday = undefined
  }
  let until: string | null = null
  if (typeof r.until === 'string' && r.until.trim()) {
    const d = new Date(r.until)
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'recurrence.until must be a valid ISO timestamp')
    until = d.toISOString()
  }
  let count: number | null = null
  if (r.count !== null && r.count !== undefined) {
    const n = Math.floor(Number(r.count))
    if (!Number.isFinite(n) || n < 1) throw new HttpError(400, 'recurrence.count must be a positive integer')
    count = n
  }
  return { freq, interval, byweekday, until, count }
}

function rowToCalendarEvent(row: Record<string, unknown>): CalendarEventPayload {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    createdBy: String(row.created_by),
    kind: row.kind as CalendarEventKind,
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    assigneeId: row.assignee_id == null ? null : String(row.assignee_id),
    targetConversationId: row.target_conversation_id == null ? null : String(row.target_conversation_id),
    agentPrompt: row.agent_prompt == null ? null : String(row.agent_prompt),
    startAt: (row.start_at as Date).toISOString(),
    endAt: row.end_at ? (row.end_at as Date).toISOString() : null,
    allDay: Boolean(row.all_day),
    recurrence: (row.recurrence as import('../../calendar.js').RecurrenceRule | null) ?? null,
    status: row.status as CalendarStatus,
    lastFiredAt: row.last_fired_at ? (row.last_fired_at as Date).toISOString() : null,
    reminderMinutesBefore: row.reminder_minutes_before == null ? null : Number(row.reminder_minutes_before),
    reminderChannel: (row.reminder_channel as ReminderChannel | null) ?? null,
    isPrivate: Boolean(row.is_private),
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }
}

const CALENDAR_SELECT = `id,company_id,project_id,created_by,kind,title,description,
  assignee_id, target_conversation_id, agent_prompt, start_at, end_at, all_day,
  recurrence, status, last_fired_at,
  reminder_minutes_before, reminder_channel,
  is_private,
  created_at, updated_at`

/** SQL fragment that filters out private rows the caller can't see.
 *  Used by GET (list + single) and as a guard in the write paths.
 *
 *  Visibility rules:
 *    - public row → everyone in the company sees it
 *    - private row → only `created_by` or `assignee_id` see it
 *    - private row WITH an agent on either side → the company owner ALSO
 *      sees it. This gives the workspace owner supervisorial visibility
 *      into what agents are scheduling for themselves, without leaking
 *      human-to-human private events to the owner.
 *
 *  The caller binds its userId at `meIdx` and the tenant id at `companyIdx`.
 *  The owner check is a cheap EXISTS subquery against `companies`; the
 *  agent check uses `participants(kind='agent')` scoped to the same tenant. */
function calendarVisibilityClause(meIdx: number, companyIdx: number): string {
  return `(
    is_private = false
    OR created_by = $${meIdx}
    OR assignee_id = $${meIdx}
    OR (
      EXISTS (SELECT 1 FROM companies WHERE id = $${companyIdx} AND owner_user_id = $${meIdx})
      AND (
        created_by IN (SELECT id FROM participants WHERE company_id = $${companyIdx} AND kind = 'agent')
        OR assignee_id IN (SELECT id FROM participants WHERE company_id = $${companyIdx} AND kind = 'agent')
      )
    )
  )`
}

/** Required WS broadcast for a calendar row change. Thin payload —
 *  the client refetches the affected row (or the whole list on delete)
 *  rather than receiving inline diffs. Mirrors the doc.changed shape. */
async function publishCalendarChange(args: {
  kind: 'event.created' | 'event.updated' | 'event.deleted' | 'event.dispatched'
  eventId: string
  companyId: string
  actorId: string | null
  workspaceId: string
}): Promise<void> {
  await publish(CH_CALENDAR_EVENTS, {
    type: 'calendar.changed',
    kind: args.kind,
    eventId: args.eventId,
    companyId: args.companyId,
    workspaceId: args.workspaceId,
    actorId: args.actorId,
  })
}

api.get('/calendar/events', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req)
  // Optional range window — keeps the list bounded for the agenda / month
  // view. Without a window we return everything in the company, capped at
  // 1000 rows. The list page will paginate when that becomes a real cap.
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : null
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : null
  // Privacy filter: `is_private` rows are only visible to their creator
  // or assignee. The clause uses $2 for the caller id; range filters
  // bind after.
  const params: unknown[] = [companyId, me, projectId]
  let sql = `SELECT ${CALENDAR_SELECT} FROM calendar_events
             WHERE company_id = $1 AND project_id = $3 AND ${calendarVisibilityClause(2, 1)}`
  if (from && !Number.isNaN(from.getTime())) {
    params.push(from)
    // We want recurring 'active' events to show up regardless of their seed
    // start_at — they keep firing into the future. So range filtering is
    // "start in window OR recurring + active".
    sql += ` AND (start_at >= $${params.length} OR (recurrence IS NOT NULL AND status = 'active'))`
  }
  if (to && !Number.isNaN(to.getTime())) {
    params.push(to)
    sql += ` AND start_at <= $${params.length}`
  }
  sql += ` ORDER BY start_at ASC LIMIT 1000`
  const { rows } = await pool.query(sql, params)
  res.json({ events: rows.map(rowToCalendarEvent) })
})

api.post('/calendar/events', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') throw new HttpError(400, 'body required')

  const title = String(body.title ?? '').trim().slice(0, 200)
  if (!title) throw new HttpError(400, 'title required')
  const kind: CalendarEventKind = isCalendarKind(body.kind) ? body.kind : 'personal'
  const description = body.description == null ? null : String(body.description).slice(0, 4000)
  const assigneeId = body.assigneeId == null ? null : String(body.assigneeId).trim() || null
  const targetConversationId = body.targetConversationId == null
    ? null : String(body.targetConversationId).trim() || null
  const agentPrompt = body.agentPrompt == null ? null : String(body.agentPrompt).slice(0, 8000)
  const startAtStr = String(body.startAt ?? '').trim()
  const startAt = new Date(startAtStr)
  if (!startAtStr || Number.isNaN(startAt.getTime())) throw new HttpError(400, 'startAt must be a valid ISO timestamp')
  const endAt = (() => {
    if (body.endAt == null) return null
    const d = new Date(String(body.endAt))
    return Number.isNaN(d.getTime()) ? null : d
  })()
  const allDay = Boolean(body.allDay)
  const recurrence = parseRecurrence(body.recurrence)
  const status: CalendarStatus = isCalendarStatus(body.status) ? body.status : 'active'
  // Reminders are co-validated: a non-null channel requires a positive
  // lead time, and vice versa. Either both null = no reminder, or both
  // set = reminder armed.
  let reminderMinutesBefore: number | null = null
  let reminderChannel: ReminderChannel | null = null
  if (body.reminderMinutesBefore != null) {
    const n = Math.floor(Number(body.reminderMinutesBefore))
    if (!Number.isFinite(n) || n < 0 || n > 14 * 24 * 60) {
      throw new HttpError(400, 'reminderMinutesBefore must be a non-negative integer (≤ 2 weeks)')
    }
    reminderMinutesBefore = n
  }
  if (body.reminderChannel != null) {
    if (!isReminderChannel(body.reminderChannel)) {
      throw new HttpError(400, 'reminderChannel must be toast|email|both')
    }
    reminderChannel = body.reminderChannel
  }
  if ((reminderMinutesBefore !== null) !== (reminderChannel !== null)) {
    throw new HttpError(400, 'reminderMinutesBefore and reminderChannel must both be set or both null')
  }
  const isPrivate = Boolean(body.isPrivate)

  if (kind === 'agent_task' && (!assigneeId || !targetConversationId)) {
    throw new HttpError(400, 'agent_task events require assigneeId and targetConversationId')
  }
  // Membership sanity-check for cross-tenant safety: the assignee + target
  // conversation must live in this company. Cheap pre-write check that
  // catches typo'd ids early.
  if (assigneeId) {
    const { rows: p } = await pool.query(
      `SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [assigneeId, companyId],
    )
    if (!p[0]) throw new HttpError(400, 'assigneeId not found in this workspace')
  }
  if (targetConversationId) {
    const { rows: c } = await pool.query(
      `SELECT 1 FROM conversations WHERE id = $1 AND company_id = $2 AND project_id = $3 LIMIT 1`,
      [targetConversationId, companyId, projectId],
    )
    if (!c[0]) throw new HttpError(400, 'targetConversationId not found in this workspace')
  }

  const id = `ce-${randomUUID()}`
  const { rows } = await pool.query(
    `INSERT INTO calendar_events
       (id, company_id, project_id, created_by, kind, title, description, assignee_id,
        target_conversation_id, agent_prompt, start_at, end_at, all_day,
        recurrence, status, reminder_minutes_before, reminder_channel,
        is_private)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18)
     RETURNING ${CALENDAR_SELECT}`,
    [
      id, companyId, projectId, me, kind, title, description, assigneeId,
      targetConversationId, agentPrompt, startAt, endAt, allDay,
      recurrence ? JSON.stringify(recurrence) : null, status,
      reminderMinutesBefore, reminderChannel,
      isPrivate,
    ],
  )
  await publishCalendarChange({ kind: 'event.created', eventId: id, companyId, workspaceId: projectId, actorId: me })
  res.status(201).json({ event: rowToCalendarEvent(rows[0]) })
})

api.get('/calendar/events/:id', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req)
  const id = String(req.params.id)
  // Tenant filter + privacy filter are both 404 (not 403) — we don't want
  // to leak "this id exists but you can't see it" vs "no such id."
  const { rows } = await pool.query(
    `SELECT ${CALENDAR_SELECT} FROM calendar_events
      WHERE id = $1 AND company_id = $2 AND project_id = $4 AND ${calendarVisibilityClause(3, 2)}
      LIMIT 1`,
    [id, companyId, me, projectId],
  )
  if (!rows[0]) throw new HttpError(404, 'event not found')
  res.json({ event: rowToCalendarEvent(rows[0]) })
})

api.patch('/calendar/events/:id', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const id = String(req.params.id)
  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body !== 'object') throw new HttpError(400, 'body required')

  // Privacy guard: callers who can't *see* the row also can't *modify*
  // it. We use the same visibility clause as GET so PATCH on a private
  // row by a non-author / non-assignee / non-owner returns 404 (same
  // shape as "no such id," so we don't leak existence).
  {
    const { rows } = await pool.query(
      `SELECT 1 FROM calendar_events
        WHERE id = $1 AND company_id = $2 AND project_id = $4 AND ${calendarVisibilityClause(3, 2)}
        LIMIT 1`,
      [id, companyId, me, projectId],
    )
    if (!rows[0]) throw new HttpError(404, 'event not found')
  }

  // Build a SET clause from whichever fields are present. Each field is
  // validated independently so partial updates are safe.
  const sets: string[] = []
  const params: unknown[] = []
  const push = (sql: string, value: unknown) => {
    params.push(value)
    sets.push(`${sql} = $${params.length}`)
  }
  if (body.title !== undefined) {
    const t = String(body.title).trim().slice(0, 200)
    if (!t) throw new HttpError(400, 'title cannot be empty')
    push('title', t)
  }
  if (body.kind !== undefined) {
    if (!isCalendarKind(body.kind)) throw new HttpError(400, 'invalid kind')
    push('kind', body.kind)
  }
  if (body.description !== undefined) {
    push('description', body.description == null ? null : String(body.description).slice(0, 4000))
  }
  if (body.assigneeId !== undefined) {
    push('assignee_id', body.assigneeId == null ? null : String(body.assigneeId))
  }
  if (body.targetConversationId !== undefined) {
    push('target_conversation_id', body.targetConversationId == null ? null : String(body.targetConversationId))
  }
  if (body.agentPrompt !== undefined) {
    push('agent_prompt', body.agentPrompt == null ? null : String(body.agentPrompt).slice(0, 8000))
  }
  if (body.startAt !== undefined) {
    const d = new Date(String(body.startAt))
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'invalid startAt')
    push('start_at', d)
  }
  if (body.endAt !== undefined) {
    if (body.endAt == null) push('end_at', null)
    else {
      const d = new Date(String(body.endAt))
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'invalid endAt')
      push('end_at', d)
    }
  }
  if (body.allDay !== undefined) push('all_day', Boolean(body.allDay))
  if (body.recurrence !== undefined) {
    const r = parseRecurrence(body.recurrence)
    params.push(r ? JSON.stringify(r) : null)
    sets.push(`recurrence = $${params.length}::jsonb`)
  }
  if (body.status !== undefined) {
    if (!isCalendarStatus(body.status)) throw new HttpError(400, 'invalid status')
    push('status', body.status)
  }
  if (body.reminderMinutesBefore !== undefined) {
    if (body.reminderMinutesBefore == null) push('reminder_minutes_before', null)
    else {
      const n = Math.floor(Number(body.reminderMinutesBefore))
      if (!Number.isFinite(n) || n < 0 || n > 14 * 24 * 60) {
        throw new HttpError(400, 'reminderMinutesBefore must be a non-negative integer (≤ 2 weeks)')
      }
      push('reminder_minutes_before', n)
    }
  }
  if (body.reminderChannel !== undefined) {
    if (body.reminderChannel == null) push('reminder_channel', null)
    else {
      if (!isReminderChannel(body.reminderChannel)) {
        throw new HttpError(400, 'reminderChannel must be toast|email|both')
      }
      push('reminder_channel', body.reminderChannel)
    }
  }
  if (body.isPrivate !== undefined) {
    push('is_private', Boolean(body.isPrivate))
  }
  if (sets.length === 0) throw new HttpError(400, 'no updatable fields')
  sets.push('updated_at = NOW()')
  params.push(id, companyId, projectId)
  const sql = `UPDATE calendar_events SET ${sets.join(', ')}
                WHERE id = $${params.length - 2} AND company_id = $${params.length - 1} AND project_id = $${params.length}
            RETURNING ${CALENDAR_SELECT}`
  const { rows } = await pool.query(sql, params)
  if (!rows[0]) throw new HttpError(404, 'event not found')
  await publishCalendarChange({ kind: 'event.updated', eventId: id, companyId, workspaceId: projectId, actorId: me })
  res.json({ event: rowToCalendarEvent(rows[0]) })
})

api.delete('/calendar/events/:id', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const id = String(req.params.id)
  // The visibility clause is folded into the DELETE so the same caller
  // who can't read the row can't delete it either. rowCount === 0 covers
  // both "no such id" and "privacy filtered" — same 404 on the wire.
  const r = await pool.query(
    `DELETE FROM calendar_events
      WHERE id = $1 AND company_id = $2 AND project_id = $4 AND ${calendarVisibilityClause(3, 2)}`,
    [id, companyId, me, projectId],
  )
  if (r.rowCount === 0) throw new HttpError(404, 'event not found')
  await publishCalendarChange({ kind: 'event.deleted', eventId: id, companyId, workspaceId: projectId, actorId: me })
  res.json({ ok: true })
})

api.post('/calendar/events/:id/run-now', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const id = String(req.params.id)
  const { rows } = await pool.query(
    `SELECT ${CALENDAR_SELECT} FROM calendar_events
      WHERE id = $1 AND company_id = $2 AND project_id = $4 AND ${calendarVisibilityClause(3, 2)}`,
    [id, companyId, me, projectId],
  )
  if (!rows[0]) throw new HttpError(404, 'event not found')
  const { dispatchEvent } = await import('../../calendar.js')
  // Use NOW() as the slot; uniqueness against (event_id, scheduled_for) is
  // wide enough to absorb concurrent button-mashing within the same minute.
  const result = await dispatchEvent(rows[0] as import('../../calendar.js').CalendarEventRow, new Date())
  // last_fired_at moved + dispatch happened → renderers want to refetch.
  await publishCalendarChange({ kind: 'event.dispatched', eventId: id, companyId, workspaceId: projectId, actorId: me })
  res.json(result)
})

api.get('/calendar/events/:id/dispatches', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req)
  const id = String(req.params.id)
  // Visibility gate: if the caller can't see the underlying event, they
  // can't see its dispatch history either. Cheap pre-check keeps the
  // main query free of an extra join.
  {
    const { rows } = await pool.query(
      `SELECT 1 FROM calendar_events
        WHERE id = $1 AND company_id = $2 AND project_id = $4 AND ${calendarVisibilityClause(3, 2)}
        LIMIT 1`,
      [id, companyId, me, projectId],
    )
    if (!rows[0]) throw new HttpError(404, 'event not found')
  }
  const { rows } = await pool.query(
    `SELECT cd.id, cd.event_id, cd.scheduled_for, cd.dispatched_at, cd.status,
            cd.conversation_id, cd.message_id, cd.error
       FROM calendar_dispatches cd
       JOIN calendar_events ce ON ce.id = cd.event_id
      WHERE cd.event_id = $1 AND ce.company_id = $2 AND ce.project_id = $3
      ORDER BY cd.scheduled_for DESC LIMIT 200`,
    [id, companyId, projectId],
  )
  const dispatches: CalendarDispatchPayload[] = rows.map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    scheduledFor: (r.scheduled_for as Date).toISOString(),
    dispatchedAt: (r.dispatched_at as Date).toISOString(),
    status: String(r.status),
    conversationId: r.conversation_id == null ? null : String(r.conversation_id),
    messageId: r.message_id == null ? null : String(r.message_id),
    error: r.error == null ? null : String(r.error),
  }))
  res.json({ dispatches })
})

/* =================== Collaborative documents (CRDT) =================== */
