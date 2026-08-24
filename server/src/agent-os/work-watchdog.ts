import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'

const rankSql = `(CASE lane WHEN 'learner' THEN 4 WHEN 'approval' THEN 3 WHEN 'collaboration' THEN 2 ELSE 1 END)`
const sessionSql = `(company_id || ':' || agent_id || ':' || channel_id || ':' || COALESCE(thread_root_client_msg_no, '-'))`

interface WatchdogRow { id: string; company_id: string; agent_id: string; lane: string; reason: string; preemptions: number }

async function recordWatchdogEvents(rows: WatchdogRow[], stage: 'trip' | 'force_fence'): Promise<void> {
  for (const row of rows) {
    await pool.query(
      `INSERT INTO agent_runs(id,agent_id,company_id,trigger,status,stage,reasoning_runtime)
       VALUES($1,$2,$3,$4::jsonb,'running',$5,'agent-os') ON CONFLICT(id) DO NOTHING`,
      [row.id, row.agent_id, row.company_id, JSON.stringify({ reason: row.reason }), `watchdog.${stage}`],
    )
    await pool.query(
      `INSERT INTO agent_events(id,run_id,agent_id,company_id,kind,level,title,data)
       VALUES($1,$2,$3,$4,$5,'warn',$5,$6::jsonb)`,
      [randomUUID(), row.id, row.agent_id, row.company_id, `watchdog.${stage}`,
        JSON.stringify({ lane: row.lane, reason: row.reason, preemptions: row.preemptions })],
    )
  }
}

export async function sweepAgentWorkWatchdog(now = new Date()): Promise<{ tripped: number; fenced: number }> {
  const watchdogMs = Math.max(1_000, Number(process.env.AGENT_OS_RUN_WATCHDOG_MS ?? 120_000))
  const graceMs = Math.max(1_000, Number(process.env.AGENT_OS_RUN_WATCHDOG_GRACE_MS ?? 30_000))
  const { rows: trippedRows } = await pool.query<WatchdogRow>(
    `UPDATE agent_work_items active
        SET preempt_requested_at=$1,
            preempt_grace_expires_at=$1 + ($2::text || ' milliseconds')::interval,
            updated_at=NOW()
      WHERE active.status='leased' AND active.preempt_requested_at IS NULL
        AND EXISTS (
          SELECT 1 FROM agent_work_items waiting
           WHERE waiting.status='queued' AND waiting.cancel_requested_at IS NULL
             AND waiting.available_at <= $1
             AND ${sessionSql.replaceAll(/\b(company_id|agent_id|channel_id|thread_root_client_msg_no)\b/g, 'waiting.$1')}
                 = ${sessionSql.replaceAll(/\b(company_id|agent_id|channel_id|thread_root_client_msg_no)\b/g, 'active.$1')}
             AND ${rankSql.replace('lane', 'waiting.lane')} > ${rankSql.replace('lane', 'active.lane')}
             AND GREATEST(waiting.created_at, waiting.available_at, COALESCE(active.lease_started_at,$1))
                 <= $1 - ($3::text || ' milliseconds')::interval
        )
      RETURNING active.id,active.company_id,active.agent_id,active.lane,active.reason,active.preemptions`, [now, graceMs, watchdogMs],
  )
  await recordWatchdogEvents(trippedRows, 'trip').catch(() => undefined)

  const client = await pool.connect()
  let fenced = 0
  let forcedRows: WatchdogRow[] = []
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<WatchdogRow & { fence: string }>(
      `UPDATE agent_work_items
          SET status='queued', fence=fence+1, lease_token_hash=NULL, leased_by=NULL, lease_expires_at=NULL,
              preempt_requested_at=NULL, preempt_grace_expires_at=NULL, preemptions=preemptions+1,
              available_at=NOW()+INTERVAL '1 second', updated_at=NOW()
        WHERE status='leased' AND preempt_grace_expires_at IS NOT NULL AND preempt_grace_expires_at <= $1
        RETURNING id,fence,company_id,agent_id,lane,reason,preemptions`, [now],
    )
    fenced = rows.length
    forcedRows = rows
    if (rows.length > 0) await client.query(`DELETE FROM agent_os_session_leases WHERE work_id = ANY($1::text[])`, [rows.map((row) => row.id)])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  if (forcedRows.length > 0) await recordWatchdogEvents(forcedRows, 'force_fence').catch(() => undefined)
  return { tripped: trippedRows.length, fenced }
}

export function startAgentWorkWatchdog(intervalMs = 5_000): NodeJS.Timeout {
  const tick = () => void sweepAgentWorkWatchdog().then(({ tripped, fenced }) => {
    if (tripped || fenced) console.warn(`[agent-os:watchdog] tripped=${tripped} fenced=${fenced}`)
  }).catch((error) => console.warn('[agent-os:watchdog] sweep failed:', error instanceof Error ? error.message : String(error)))
  setImmediate(tick)
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return timer
}
