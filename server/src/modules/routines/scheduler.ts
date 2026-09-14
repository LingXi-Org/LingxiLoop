import { productConversationId } from '../../agent-runtime/identity.js'
import { createHash } from 'node:crypto'
import { NoEffectError, type WorkItem } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { routineInputSchema, type RoutineRow, type RoutineRunRow } from './contracts.js'
import { authorizeRoutine, nextRoutineRun, routineIdentity, type RoutineControl } from './application.js'
import { nextTeacherDigestRun, resolveTeacherScope } from '../learning/teacher-agent-application.js'
import { teacherAgentSchemas } from '../learning/agent-contracts.js'

export async function assertRoutineRun(db: Queryable, work: Omit<WorkItem, 'leaseToken'>) {
  const { rows } = await db.query<RoutineRow>(`SELECT routine.* FROM agent_routines routine JOIN agent_routine_runs run ON run.routine_id=routine.id
    WHERE run.work_id=$1 AND routine.company_id=$2 AND run.agent_id=$3 AND run.principal_id=$4 AND run.channel_id=$5
      AND run.thread_id IS NOT DISTINCT FROM $6 AND routine.version=run.routine_version AND routine.status='active'`,
    [work.id,work.tenantId,work.agentId,work.principalId,productConversationId(work),work.threadId ?? null])
  const row = rows[0]
  if (!row) throw new NoEffectError('routine was paused, revised or revoked', 'routine_inactive')
  await prepare(db, row, new Date())
  return row
}
async function prepare(db: Queryable, row: RoutineRow, now: Date) {
  if (row.kind === 'teacher_project_digest') {
    const scope = await resolveTeacherScope({ companyId: row.company_id, agentId: row.agent_id, channelId: row.channel_id,
      authorizationUserId: row.created_by, reason: 'routine' }, db)
    if (row.project_id !== scope.projectId) throw new NoEffectError('teacher routine project changed', 'forbidden')
    const checked = teacherAgentSchemas.configure_digest.safeParse({ ...row.schedule, timezone: row.timezone })
    if (!checked.success || checked.data.frequency === 'off' || !checked.data.localTime
      || checked.data.frequency === 'weekly' && !checked.data.weekday) {
      throw new NoEffectError('invalid teacher digest schedule', 'invalid_schedule')
    }
    return nextTeacherDigestRun({ frequency: checked.data.frequency, localTime: checked.data.localTime,
      ...(checked.data.weekday ? { weekday: checked.data.weekday } : {}) }, row.timezone, now, db)
  }
  const projectId = await authorizeRoutine(db, { companyId: row.company_id, channelId: row.channel_id, agentId: row.agent_id, principalId: row.created_by })
  if (projectId !== row.project_id) throw new NoEffectError('routine project changed', 'forbidden')
  const checked = routineInputSchema.safeParse({ kind: row.kind, title: row.title, instructions: row.instructions, schedule: row.schedule, timezone: row.timezone })
  if (!checked.success) throw new NoEffectError('invalid routine schedule', 'invalid_schedule')
  return nextRoutineRun(db, checked.data.schedule, checked.data.timezone, now)
}

/** Product scheduling and the public enqueue call share one transaction. */
export async function scheduleRoutines(transaction: <T>(run: (db: Queryable) => Promise<T>) => Promise<T>, control: RoutineControl) {
  return transaction(async db => {
    await db.query("SET LOCAL statement_timeout='5s'")
    const api = await control()
    const outstanding = await db.query<RoutineRunRow & { status: string; version: number; created_by: string }>(`SELECT run.*,routine.status,routine.version,routine.created_by
      FROM agent_routine_runs run JOIN agent_routines routine ON routine.id=run.routine_id WHERE run.settled_at IS NULL
      ORDER BY run.scheduled_at LIMIT 32 FOR UPDATE OF run SKIP LOCKED`)
    for (const run of outstanding.rows) {
      const identity = await routineIdentity(db,run)
      if (run.status !== 'active' || run.routine_version !== run.version || run.created_by !== run.principal_id) await api.cancel(identity, db)
      const state = await api.readRun(identity, db)
      if (!state || !['queued','leased','waiting'].includes(state.status)) {
        const delivery = await api.readDelivery(identity)
        if (delivery !== 'pending' && delivery !== 'failed') await db.query('UPDATE agent_routine_runs SET settled_at=NOW() WHERE work_id=$1', [run.work_id])
      }
    }
    const { rows } = await db.query<RoutineRow & { clock: Date }>(`SELECT *,NOW() AS clock FROM agent_routines WHERE status='active' AND next_run_at<=NOW()
      ORDER BY next_run_at,id LIMIT 8 FOR UPDATE SKIP LOCKED`)
    let enqueued = 0
    for (const row of rows) {
      let next: string
      try { next = await prepare(db, row, row.clock) }
      catch (error) {
        if (!(error instanceof NoEffectError) && !(error instanceof Error &&
          ('reason' in error || Reflect.get(error,'code') === 'teacher_scope_revoked'))) throw error
        await db.query("UPDATE agent_routines SET status='paused',next_run_at=NULL,version=version+1,pause_reason=$2,updated_at=NOW() WHERE id=$1",
          [row.id,error instanceof NoEffectError ? error.code : 'authorization_changed'])
        continue
      }
      const pending = await db.query('SELECT 1 FROM agent_routine_runs WHERE routine_id=$1 AND settled_at IS NULL LIMIT 1', [row.id])
      if (!pending.rows.length) {
        const scheduledAt = new Date(row.next_run_at!).toISOString()
        const id = 'routine-run-' + createHash('sha256').update(JSON.stringify([row.id,row.version,scheduledAt])).digest('hex')
        await api.enqueueJob({ id, tenantId: row.company_id, agentId: row.agent_id, sessionId: id, principalId: row.created_by,
          ...(row.thread_id ? { threadId: row.thread_id } : {}), kind: row.kind === 'teacher_project_digest' ? 'teacher_digest' : 'routine',
          lane: 'background', sourceRef: id, text: row.instructions, authorName: row.title,
          meta: { conversationId: row.channel_id, routineId: row.id, routineVersion: row.version, scheduledAt } }, db)
        await db.query(`INSERT INTO agent_routine_runs(id,routine_id,routine_version,scheduled_at,work_id,company_id,agent_id,channel_id,principal_id,thread_id)
          VALUES($4,$1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [row.id,row.version,scheduledAt,id,row.company_id,row.agent_id,row.channel_id,row.created_by,row.thread_id])
        enqueued++
      }
      await db.query('UPDATE agent_routines SET next_run_at=$2,updated_at=NOW() WHERE id=$1', [row.id,next])
    }
    return enqueued
  })
}
