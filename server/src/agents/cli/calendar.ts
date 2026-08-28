import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../../db/pool.js'
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
  tryClaimTenantWork(companyId: string, agentId: string, taskType: WorkTaskType, subject: string): Promise<CliResult | null>
  releaseTenantWork(companyId: string, agentId: string, taskType: WorkTaskType, subject: string): Promise<void>
}

export function createCalendarCommand(dependencies: CalendarCommandDependencies) {
  const { ok, err, agentCompany, resolveCliProjectId, tryClaimTenantWork, releaseTenantWork } = dependencies
  function cliCalendarVisibilityClause(meIdx: number): string {
    return `(is_private = false OR created_by = $${meIdx} OR assignee_id = $${meIdx})`
  }
  
  async function publishCalendarCli(args: {
    companyId: string
    kind: 'event.created' | 'event.updated' | 'event.deleted' | 'event.dispatched'
    eventId: string
    actorId: string
    workspaceId?: string
  }): Promise<void> {
    const workspaceId = args.workspaceId ?? (await pool.query<{ project_id: string }>(
      `SELECT project_id FROM calendar_events WHERE id=$1 AND company_id=$2 LIMIT 1`,
      [args.eventId, args.companyId],
    )).rows[0]?.project_id
    const { CH_CALENDAR_EVENTS, publish } = await import('../../redis.js')
    await publish(CH_CALENDAR_EVENTS, {
      type: 'calendar.changed',
      companyId: args.companyId,
      workspaceId,
      kind: args.kind,
      eventId: args.eventId,
      actorId: args.actorId,
    })
  }
  
  async function cmdCalendar(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'list'
    const me = resolveAs(parsed)
    const companyId = await agentCompany(me)
    if (!companyId) return err(`unknown agent ${me} (no company)`)
    const projectId = await resolveCliProjectId(companyId, internal.projectId)
  
    if (!['list', 'create'].includes(op)) {
      const eventId = parsed.positional[1]
      if (eventId) {
        const access = await pool.query(
          `SELECT 1 FROM calendar_events WHERE id=$1 AND company_id=$2 AND project_id=$3 LIMIT 1`,
          [eventId, companyId, projectId],
        )
        if (!access.rows[0]) return err(`no event ${eventId}`)
      }
    }
  
    if (op === 'list') {
      // Default scope: events assigned to `me` OR created by `me`. The
      // `--all` flag widens to every event in the workspace (parity with
      // the UI's "Workspace" filter).
      const all = Boolean(parsed.flags.all)
      const params: unknown[] = [companyId, me, projectId]
      let where = `company_id = $1 AND project_id = $3`
      if (all) {
        // --all widens to the whole workspace, BUT we still hide private
        // rows the caller isn't authorized to read. The default (narrow)
        // path is already self-filtered via assignee_id/created_by.
        where += ` AND ${cliCalendarVisibilityClause(2)}`
      } else {
        where += ` AND (assignee_id = $2 OR created_by = $2)`
      }
      if (parsed.flags.status) {
        params.push(String(parsed.flags.status))
        where += ` AND status = $${params.length}`
      }
      const { rows } = await pool.query<{
        id: string; title: string; kind: string; status: string;
        assignee_id: string | null; start_at: Date; recurrence: { freq: string; interval: number } | null;
        target_conversation_id: string | null; is_private: boolean
      }>(
        `SELECT id, title, kind, status, assignee_id, start_at, recurrence,
                target_conversation_id, is_private
           FROM calendar_events WHERE ${where}
           ORDER BY start_at ASC LIMIT 200`,
        params,
      )
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      if (rows.length === 0) return ok(`(no calendar events for ${me}${all ? ' [workspace]' : ''})`)
      return ok([
        `${rows.length} calendar event(s)${all ? ' in workspace' : ` for ${me}`}:`,
        '',
        ...rows.map((r) => {
          const rep = r.recurrence ? `every ${r.recurrence.interval || 1} ${r.recurrence.freq}` : 'one-shot'
          const who = r.assignee_id ? ` → @${r.assignee_id}` : ''
          const lock = r.is_private ? ' 🔒' : ''
          return `  [${r.status.padEnd(7)}] ${r.id.slice(0, 14).padEnd(15)} ${r.start_at.toISOString().slice(0, 16)} · ${rep}${who}${lock}  ${r.title}`
        }),
      ].join('\n'))
    }
  
    if (op === 'create') {
      // usage: calendar create "<title>" --at <iso> [--assignee <id>] [--prompt "..."]
      //                                  [--in <convo_id>] [--every daily|weekly|monthly|yearly]
      //                                  [--interval N] [--byweekday 0,1,2] [--until <iso>] [--count N]
      //                                  [--kind personal|agent_task]
      const title = parsed.positional.slice(1).join(' ').trim()
      if (!title) return err('usage: calendar create "<title>" --at <iso> [flags]')
      const stableCalendarId = internal.idempotencyKey
        ? `ce-agent-${createHash('sha256').update(internal.idempotencyKey).digest('hex').slice(0, 32)}`
        : null
      if (stableCalendarId) {
        const { rows } = await pool.query(`SELECT 1 FROM calendar_events WHERE id=$1 AND company_id=$2 AND project_id=$3`, [stableCalendarId, companyId, projectId])
        if (rows[0]) return ok(`scheduled ${stableCalendarId} [replayed]`)
      }
      const startStr = parsed.flags.at ? String(parsed.flags.at) : ''
      if (!startStr) return err('--at <iso-timestamp> is required')
      const start = new Date(startStr)
      if (Number.isNaN(start.getTime())) return err(`invalid --at: ${startStr}`)
      const assigneeId = parsed.flags.assignee ? String(parsed.flags.assignee) : null
      const agentPrompt = parsed.flags.prompt ? String(parsed.flags.prompt) : null
      const targetConvo = parsed.flags.in ? String(parsed.flags.in) : null
      if (targetConvo) {
        const target = await pool.query(
          `SELECT 1 FROM conversations WHERE id=$1 AND company_id=$2 AND project_id=$3 LIMIT 1`,
          [targetConvo, companyId, projectId],
        )
        if (!target.rows[0]) return err(`unknown conversation ${targetConvo} in this workspace`)
      }
      const kind = parsed.flags.kind === 'personal' ? 'personal' : (assigneeId || agentPrompt ? 'agent_task' : 'personal')
      if (kind === 'agent_task' && !assigneeId) {
        return err('agent_task events need an --assignee')
      }
      if (kind === 'agent_task' && !targetConvo) {
        return err('agent_task events need --in <conversation_id>')
      }
      let recurrence: Record<string, unknown> | null = null
      if (parsed.flags.every) {
        const freq = String(parsed.flags.every)
        if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) {
          return err(`--every must be daily|weekly|monthly|yearly (got: ${freq})`)
        }
        const interval = parsed.flags.interval ? Math.max(1, Math.floor(Number(parsed.flags.interval))) : 1
        const byweekday = parsed.flags.byweekday
          ? String(parsed.flags.byweekday).split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
          : undefined
        const until = parsed.flags.until ? String(parsed.flags.until) : null
        const count = parsed.flags.count ? Math.floor(Number(parsed.flags.count)) : null
        recurrence = { freq, interval, byweekday, until, count }
      }
      // Optional reminder. `--remind <minutes>` pairs with `--remind-channel
      // toast|email|both` (defaults to toast). Either both flags or neither.
      // --private hides this row from everyone in the workspace except its
      // created_by (the calling agent) and assignee_id. Useful for personal
      // reminders an agent sets for itself that would otherwise clutter the
      // shared calendar.
      const isPrivate = Boolean(parsed.flags.private)
      let reminderMinutes: number | null = null
      let reminderChannel: 'toast' | 'email' | 'both' | null = null
      if (parsed.flags.remind !== undefined) {
        const n = Math.floor(Number(parsed.flags.remind))
        if (!Number.isFinite(n) || n < 0) return err(`--remind must be minutes (got: ${parsed.flags.remind})`)
        reminderMinutes = n
        const ch = parsed.flags['remind-channel'] ? String(parsed.flags['remind-channel']) : 'toast'
        if (ch !== 'toast' && ch !== 'email' && ch !== 'both') {
          return err(`--remind-channel must be toast|email|both (got: ${ch})`)
        }
        reminderChannel = ch
      }
  
      // Same two-layer anti-duplicate shape as `doc create`: an in-flight
      // tenant claim against a CONCURRENT peer creating the same event, plus
      // a recently-created check against a SEQUENTIAL duplicate (peer created
      // it seconds ago and already released the claim). One team meeting
      // scheduled twice is the calendar analog of the double-doc incident.
      const calBlocked = await tryClaimTenantWork(companyId, me, 'calendar-create', title)
      if (calBlocked) return calBlocked
      try {
        // Private events are exempt on BOTH sides: a private reminder is not
        // shared work, and we must not leak another agent's private event
        // title through a HELD envelope.
        if (!isPrivate) {
          const normTitle = normalizeWorkSubject(title)
          const calHoldScope = `calendar-create:${normTitle}`
          const forceArmed = Boolean(parsed.flags.force) && (await consumeHold(me, calHoldScope)).armed
          if (!forceArmed) {
            const { rows: recentDups } = await pool.query<{
              id: string; title: string; created_by: string; created_at: Date
            }>(
              `SELECT id, title, created_by, created_at FROM calendar_events
                WHERE company_id = $1 AND created_by <> $2 AND project_id = $3
                  AND status = 'active' AND is_private = FALSE
                  AND created_at > NOW() - INTERVAL '15 minutes'
                ORDER BY created_at DESC LIMIT 50`,
              [companyId, me, projectId],
            )
            const dup = recentDups.find((d) => normalizeWorkSubject(d.title) === normTitle)
            if (dup) {
              await recordHold(me, calHoldScope)
              const ageSec = Math.max(1, Math.round((Date.now() - dup.created_at.getTime()) / 1000))
              return err(
                `HELD — event NOT created. ${dup.created_by} already scheduled "${dup.title}" (${dup.id}) ${ageSec}s ago — ` +
                `this work is DONE; a second copy double-books everyone. ` +
                `Inspect theirs instead: \`lingxiloop calendar list\` / \`lingxiloop calendar update ${dup.id} ...\` if it needs changes. ` +
                `If you GENUINELY need a separate same-title event, rerun with --force ` +
                `(--force only works after you've been shown this hold — passing it preemptively does nothing).`,
                2,
              )
            }
          }
        }
        const id = stableCalendarId ?? `ce-${randomUUID()}`
        await pool.query(
          `INSERT INTO calendar_events
             (id, company_id, project_id, created_by, kind, title, assignee_id,
              target_conversation_id, agent_prompt, start_at, recurrence,
              reminder_minutes_before, reminder_channel, status, is_private)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,'active',$14)`,
          [id, companyId, projectId, me, kind, title, assigneeId, targetConvo, agentPrompt, start,
           recurrence ? JSON.stringify(recurrence) : null,
           reminderMinutes, reminderChannel, isPrivate],
        )
        await publishCalendarCli({ companyId, kind: 'event.created', eventId: id, actorId: me })
        return ok(`scheduled ${id}: "${title}" at ${start.toISOString()}${recurrence ? ` · every ${recurrence.interval} ${recurrence.freq}` : ''}${assigneeId ? ` → @${assigneeId}` : ''}${reminderMinutes != null ? ` · remind ${reminderMinutes}m before (${reminderChannel})` : ''}${isPrivate ? ' · 🔒 private' : ''}`, [{
          event: 'calendar.event_created',
          command: 'calendar create',
          calendarEventId: id,
          actorId: me,
          companyId,
          title,
          kind,
          assigneeId,
          targetConversationId: targetConvo,
          startAt: start.toISOString(),
          recurrence,
          reminderMinutesBefore: reminderMinutes,
          reminderChannel,
          visibleToUser: true,
        }])
      } finally {
        await releaseTenantWork(companyId, me, 'calendar-create', title)
      }
    }
  
    if (op === 'update' || op === 'edit') {
      const id = parsed.positional[1]
      if (!id) return err(`usage: calendar ${op} <event_id> [--title "..."] [--at <iso>] [--status active|cancelled|done] [flags]`)
      // Privacy guard: same visibility rule as list. Callers who can't see
      // the row can't modify it. The check is folded into the UPDATE so we
      // don't pay an extra round trip.
      {
        const { rows } = await pool.query(
          `SELECT 1 FROM calendar_events
            WHERE id = $1 AND company_id = $2 AND ${cliCalendarVisibilityClause(3)}
            LIMIT 1`,
          [id, companyId, me],
        )
        if (!rows[0]) return err(`no event ${id}`)
      }
      const sets: string[] = []
      const params: unknown[] = []
      const push = (column: string, value: unknown) => {
        params.push(value)
        sets.push(`${column} = $${params.length}`)
      }
      if (parsed.flags.title !== undefined) {
        const title = String(parsed.flags.title).trim().slice(0, 200)
        if (!title) return err('--title cannot be empty')
        push('title', title)
      }
      if (parsed.flags.description !== undefined) {
        push('description', String(parsed.flags.description).slice(0, 4000) || null)
      }
      if (parsed.flags.kind !== undefined) {
        const kind = String(parsed.flags.kind)
        if (!['personal', 'agent_task'].includes(kind)) return err('--kind must be personal|agent_task')
        push('kind', kind)
      }
      if (parsed.flags.assignee !== undefined) {
        const assignee = String(parsed.flags.assignee).trim()
        push('assignee_id', !assignee || assignee === 'null' || assignee === '-' ? null : assignee)
      }
      if (parsed.flags.prompt !== undefined) {
        push('agent_prompt', String(parsed.flags.prompt).slice(0, 8000) || null)
      }
      if (parsed.flags.in !== undefined) {
        const target = String(parsed.flags.in).trim()
        push('target_conversation_id', !target || target === 'null' || target === '-' ? null : target)
      }
      if (parsed.flags.at !== undefined) {
        const start = new Date(String(parsed.flags.at))
        if (Number.isNaN(start.getTime())) return err(`invalid --at: ${parsed.flags.at}`)
        push('start_at', start)
      }
      if (parsed.flags.end !== undefined) {
        const raw = String(parsed.flags.end).trim()
        if (!raw || raw === 'null' || raw === '-') push('end_at', null)
        else {
          const end = new Date(raw)
          if (Number.isNaN(end.getTime())) return err(`invalid --end: ${raw}`)
          push('end_at', end)
        }
      }
      if (parsed.flags.status !== undefined) {
        const status = String(parsed.flags.status)
        if (!['active', 'cancelled', 'done'].includes(status)) return err('--status must be active|cancelled|done')
        push('status', status)
      }
      if (parsed.flags.remind !== undefined) {
        const raw = String(parsed.flags.remind).trim()
        if (!raw || raw === 'null' || raw === '-') push('reminder_minutes_before', null)
        else {
          const n = Math.floor(Number(raw))
          if (!Number.isFinite(n) || n < 0 || n > 14 * 24 * 60) return err(`--remind must be minutes in [0, 20160] (got: ${raw})`)
          push('reminder_minutes_before', n)
        }
      }
      if (parsed.flags['remind-channel'] !== undefined) {
        const ch = String(parsed.flags['remind-channel']).trim()
        if (!ch || ch === 'null' || ch === '-') push('reminder_channel', null)
        else {
          if (ch !== 'toast' && ch !== 'email' && ch !== 'both') return err('--remind-channel must be toast|email|both')
          push('reminder_channel', ch)
        }
      }
      // --private flips the row to private; --public flips it back. Either
      // wins if both are passed; --private takes precedence (defensive).
      if (parsed.flags.private !== undefined) push('is_private', true)
      else if (parsed.flags.public !== undefined) push('is_private', false)
      if (parsed.flags.every !== undefined || parsed.flags['clear-recurrence'] !== undefined) {
        if (parsed.flags['clear-recurrence'] !== undefined) {
          params.push(null)
          sets.push(`recurrence = $${params.length}::jsonb`)
        } else {
          const freq = String(parsed.flags.every)
          if (!['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) {
            return err(`--every must be daily|weekly|monthly|yearly (got: ${freq})`)
          }
          const interval = parsed.flags.interval ? Math.max(1, Math.floor(Number(parsed.flags.interval))) : 1
          const byweekday = parsed.flags.byweekday
            ? String(parsed.flags.byweekday).split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
            : undefined
          const until = parsed.flags.until ? String(parsed.flags.until) : null
          const count = parsed.flags.count ? Math.floor(Number(parsed.flags.count)) : null
          params.push(JSON.stringify({ freq, interval, byweekday, until, count }))
          sets.push(`recurrence = $${params.length}::jsonb`)
        }
      }
      if (sets.length === 0) return err('nothing to update — pass at least one calendar field flag')
      sets.push('updated_at = NOW()')
      params.push(id, companyId)
      const { rows } = await pool.query<{
        id: string; title: string; kind: string; status: string;
        assignee_id: string | null; target_conversation_id: string | null; start_at: Date
      }>(
        `UPDATE calendar_events SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND company_id = $${params.length}
          RETURNING id, title, kind, status, assignee_id, target_conversation_id, start_at`,
        params,
      )
      const row = rows[0]
      if (!row) return err(`no event ${id}`)
      await publishCalendarCli({ companyId, kind: 'event.updated', eventId: id, actorId: me })
      return ok(`updated ${id}: "${row.title}" at ${row.start_at.toISOString()} (${row.status})`, [{
        event: 'calendar.event_updated',
        command: `calendar ${op}`,
        calendarEventId: id,
        actorId: me,
        companyId,
        title: row.title,
        kind: row.kind,
        status: row.status,
        assigneeId: row.assignee_id,
        targetConversationId: row.target_conversation_id,
        startAt: row.start_at.toISOString(),
        visibleToUser: true,
      }])
    }
  
    if (op === 'run-now') {
      const id = parsed.positional[1]
      if (!id) return err('usage: calendar run-now <event_id>')
      // Privacy gate: only people who can see the row can dispatch it.
      const { rows } = await pool.query(
        `SELECT id,company_id,project_id,created_by,kind,title,description,assignee_id,
                target_conversation_id, agent_prompt, start_at, end_at, all_day,
                recurrence, status, last_fired_at,
                reminder_minutes_before, reminder_channel,
                is_private,
                created_at, updated_at
           FROM calendar_events
          WHERE id = $1 AND company_id = $2 AND ${cliCalendarVisibilityClause(3)}`,
        [id, companyId, me],
      )
      if (!rows[0]) return err(`no event ${id}`)
      const { dispatchEvent } = await import('../../calendar.js')
      const result = await dispatchEvent(rows[0] as import('../../calendar.js').CalendarEventRow, new Date())
      await publishCalendarCli({ companyId, kind: 'event.dispatched', eventId: id, actorId: me })
      return ok(`dispatched ${id}: ${JSON.stringify(result)}`, [{
        event: 'calendar.event_dispatched',
        command: 'calendar run-now',
        calendarEventId: id,
        actorId: me,
        companyId,
        result,
        visibleToUser: true,
      }])
    }
  
    if (op === 'dispatches') {
      const id = parsed.positional[1]
      if (!id) return err('usage: calendar dispatches <event_id>')
      const { rows } = await pool.query<{
        id: string; event_id: string; scheduled_for: Date; dispatched_at: Date;
        status: string; conversation_id: string | null; message_id: string | null; error: string | null
      }>(
        `SELECT cd.id, cd.event_id, cd.scheduled_for, cd.dispatched_at, cd.status,
                cd.conversation_id, cd.message_id, cd.error
           FROM calendar_dispatches cd
           JOIN calendar_events ce ON ce.id = cd.event_id
          WHERE cd.event_id = $1 AND ce.company_id = $2
          ORDER BY cd.scheduled_for DESC LIMIT 200`,
        [id, companyId],
      )
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      if (rows.length === 0) return ok(`(no dispatches for ${id})`)
      return ok([
        `${rows.length} dispatch(es) for ${id}:`,
        '',
        ...rows.map((r) =>
          `  [${r.status}] ${r.scheduled_for.toISOString()} → ${r.conversation_id ?? '-'} ${r.message_id ?? ''}${r.error ? ` · ${r.error}` : ''}`,
        ),
      ].join('\n'))
    }
  
    if (op === 'cancel' || op === 'delete') {
      const id = parsed.positional[1]
      if (!id) return err(`usage: calendar ${op} <event_id>`)
      // Visibility guard folded into the WHERE clause: rowCount === 0 maps
      // to "no event found" regardless of whether the row is missing or
      // privacy-filtered, so we don't leak existence to non-authorized
      // callers.
      const r = await pool.query(
        op === 'delete'
          ? `DELETE FROM calendar_events
              WHERE id = $1 AND company_id = $2 AND ${cliCalendarVisibilityClause(3)}`
          : `UPDATE calendar_events SET status = 'cancelled', updated_at = NOW()
              WHERE id = $1 AND company_id = $2 AND ${cliCalendarVisibilityClause(3)}`,
        [id, companyId, me],
      )
      if ((r.rowCount ?? 0) === 0) return err(`no event ${id}`)
      // `cancel` flips status → updated; `delete` drops the row → deleted.
      // Clients listening on calendar.changed will refetch (or drop the row
      // from local state) accordingly.
      await publishCalendarCli({
        companyId,
        workspaceId: projectId,
        kind: op === 'delete' ? 'event.deleted' : 'event.updated',
        eventId: id,
        actorId: me,
      })
      return ok(`${op === 'delete' ? 'deleted' : 'cancelled'} ${id}`, [{
        event: op === 'delete' ? 'calendar.event_deleted' : 'calendar.event_cancelled',
        command: `calendar ${op}`,
        calendarEventId: id,
        actorId: me,
        companyId,
        visibleToUser: true,
      }])
    }
  
    return err(`usage: calendar <list|create|update|run-now|dispatches|cancel|delete> [...]`)
  }
  
  return { cmdCalendar }
}
