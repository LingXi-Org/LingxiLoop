import { pool } from './db/pool.js'
import { CH_STATUS, publish } from './redis.js'

export const BUSY_STATUS_LEASE_MS = 90_000
export const BUSY_STATUS_HEARTBEAT_MS = 20_000

type ParticipantStatus = 'avail' | 'working' | 'thinking' | 'waiting' | 'resting'

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

/**
 * Update a participant's status in Postgres and broadcast it. Single source
 * of truth for status changes — the loop, tool executor, and WS presence
 * tracker all funnel through here.
 *
 * A participant id can map to multiple rows when a human belongs to more
 * than one company (humans share an id across tenants). We update every
 * matching row and emit one CH_STATUS broadcast per company so each
 * tenant's connected clients see the transition.
 */
export async function setStatus(participantId: string, status: ParticipantStatus): Promise<void> {
  const { rows } = await pool.query<{ company_id: string; status_updated_at: Date }>(
    `UPDATE participants
        SET status = $2,
            status_updated_at = NOW()
      WHERE id = $1
      RETURNING company_id, status_updated_at`,
    [participantId, status],
  )
  for (const r of rows) {
    await publish(CH_STATUS, {
      type: 'participants.status',
      participantId,
      status,
      statusUpdatedAt: toIso(r.status_updated_at),
      companyId: r.company_id,
    })
  }
}

/** Renew a busy status lease without changing the semantic status. */
export async function heartbeatStatus(participantId: string, status: Extract<ParticipantStatus, 'working' | 'thinking' | 'waiting'>): Promise<void> {
  const { rows } = await pool.query<{ company_id: string; status_updated_at: Date }>(
    `UPDATE participants
        SET status_updated_at = NOW()
      WHERE id = $1 AND status = $2
      RETURNING company_id, status_updated_at`,
    [participantId, status],
  )
  if (!rows[0]) return
  await publish(CH_STATUS, {
    type: 'participants.status',
    participantId,
    status,
    statusUpdatedAt: toIso(rows[0].status_updated_at),
    companyId: rows[0].company_id,
  })
}
