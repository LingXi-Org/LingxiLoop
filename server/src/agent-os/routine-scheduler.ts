import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { createPermissionService } from '../modules/access/public.js'
import { nextTeacherDigestRun } from '../modules/learning/runtime.js'
import type { WorkerTaskHandle } from '../runtime/lifecycle.js'

type Schedule = {
  everyMinutes?: number
  time?: string
  frequency?: 'daily' | 'weekly'
  localTime?: string
  weekday?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
}

function nextRun(schedule: Schedule, from: Date): Date {
  const every = Number(schedule.everyMinutes)
  if (Number.isFinite(every) && every >= 5) return new Date(from.getTime() + every * 60_000)
  const match = typeof schedule.time === 'string' ? /^(\d{2}):(\d{2})$/.exec(schedule.time) : null
  const next = new Date(from)
  next.setUTCSeconds(0, 0)
  next.setUTCHours(match ? Number(match[1]) : 9, match ? Number(match[2]) : 0)
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1)
  return next
}

export async function scheduleDueLearningRoutines(now = new Date()): Promise<number> {
  const client = await pool.connect()
  let count = 0
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      id: string; company_id: string; agent_id: string; channel_id: string
      instructions: string; schedule: Schedule; next_run_at: string; timezone: string; kind: string; created_by: string
    }>(
      `SELECT id, company_id, agent_id, channel_id, instructions, schedule, next_run_at, timezone, kind, created_by
         FROM agent_routines
        WHERE status='active' AND next_run_at <= $1
        ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 50`, [now],
    )
    for (const routine of rows) {
      if (routine.kind === 'teacher_project_digest') {
        const { rows: projects } = await client.query<{ project_id: string }>(
          `SELECT project.id AS project_id
             FROM learning_course_teacher_rooms room
             JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
             JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
            WHERE room.conversation_id=$1 AND room.company_id=$2
              AND room.status='active' AND project.status='ACTIVE'
            LIMIT 1`,
          [routine.channel_id, routine.company_id],
        )
        const authorized = projects[0] && (await createPermissionService(client).can({
          actorUserId: routine.created_by,
          action: 'learning:manage',
          companyId: routine.company_id,
          projectId: projects[0].project_id,
        })).allowed
        if (!authorized) {
          await client.query(
            `UPDATE agent_routines SET status='paused',next_run_at=NULL,updated_at=NOW() WHERE id=$1`,
            [routine.id],
          )
          continue
        }
      }
      const runId = randomUUID()
      const workId = randomUUID()
      const trigger = `routine:${routine.id}:${new Date(routine.next_run_at).toISOString()}`
      await client.query(
        `INSERT INTO agent_work_items
           (id, company_id, authorization_user_id, agent_id, channel_id, trigger_client_msg_no, reason, priority, execution_role)
         VALUES ($1,$2,$3,$4,$5,$6,'routine',80,'coordinator')
         ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
        [workId, routine.company_id, routine.created_by, routine.agent_id, routine.channel_id, trigger],
      )
      await client.query(
        `INSERT INTO agent_routine_runs (id, routine_id, work_id, scheduled_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT (routine_id, scheduled_at) DO NOTHING`,
        [runId, routine.id, workId, routine.next_run_at],
      )
      await client.query(
        `UPDATE agent_routines SET next_run_at=$2, updated_at=NOW() WHERE id=$1`,
        [routine.id, routine.kind === 'teacher_project_digest'
          ? await nextTeacherDigestRun({
              frequency: routine.schedule.frequency === 'weekly' ? 'weekly' : 'daily',
              localTime: routine.schedule.localTime ?? '09:00',
              ...(routine.schedule.weekday ? { weekday: routine.schedule.weekday } : {}),
            }, routine.timezone, now, client)
          : nextRun(routine.schedule, now)],
      )
      count++
    }
    await client.query('COMMIT')
    return count
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

export function startLearningRoutineScheduler(intervalMs = 60_000): WorkerTaskHandle {
  const tick = () => void scheduleDueLearningRoutines().catch((error) =>
    console.warn('[agent-os:routines] scheduler failed:', error instanceof Error ? error.message : String(error)),
  )
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
