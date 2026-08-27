import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import type { WorkerTaskHandle } from '../runtime/lifecycle.js'

type Schedule = { everyMinutes?: number; time?: string }

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
      instructions: string; schedule: Schedule; next_run_at: string
    }>(
      `SELECT id, company_id, agent_id, channel_id, instructions, schedule, next_run_at
         FROM agent_routines
        WHERE status='active' AND next_run_at <= $1
        ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 50`, [now],
    )
    for (const routine of rows) {
      const runId = randomUUID()
      const workId = randomUUID()
      const trigger = `routine:${routine.id}:${new Date(routine.next_run_at).toISOString()}`
      await client.query(
        `INSERT INTO agent_work_items
           (id, company_id, agent_id, channel_id, trigger_client_msg_no, reason, priority)
         VALUES ($1,$2,$3,$4,$5,'routine',80)
         ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
        [workId, routine.company_id, routine.agent_id, routine.channel_id, trigger],
      )
      await client.query(
        `INSERT INTO agent_routine_runs (id, routine_id, work_id, scheduled_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT (routine_id, scheduled_at) DO NOTHING`,
        [runId, routine.id, workId, routine.next_run_at],
      )
      await client.query(
        `UPDATE agent_routines SET next_run_at=$2, updated_at=NOW() WHERE id=$1`,
        [routine.id, nextRun(routine.schedule, now)],
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
