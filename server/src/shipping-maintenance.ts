import { randomUUID } from 'node:crypto'
import { pool } from './db/pool.js'

const DEFAULT_INTERVAL_MS = 5 * 60_000

/** Durable housekeeping for the shipping loop.
 *
 * 1. Turns missed production readbacks into an explicit overdue state and
 *    friction report instead of letting a successful deploy disappear.
 * 2. Mines repeated completion/protocol failures from agent observability
 *    into a deduplicated workspace friction inbox. This is deliberately a
 *    signal, not an auto-created feature: a human still decides whether the
 *    repeated pain deserves product work.
 *
 * The transaction-scoped advisory lock makes every tick safe when multiple
 * server replicas run the same interval. */
export async function runShippingMaintenance(): Promise<{ overdue: number; frictionSignals: number }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: locks } = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtext('lingxiloop.shipping-maintenance')) AS locked`,
    )
    if (!locks[0]?.locked) {
      await client.query('ROLLBACK')
      return { overdue: 0, frictionSignals: 0 }
    }

    const { rows: overdue } = await client.query<{
      id: string; feature_id: string; company_id: string; title: string; readback_due_at: string
    }>(
      `UPDATE shipping_releases r
          SET readback_status = 'overdue', updated_at = NOW()
         FROM shipping_features f
        WHERE r.feature_id = f.id
          AND r.environment = 'production' AND r.status = 'succeeded'
          AND r.readback_status = 'pending' AND r.readback_due_at < NOW()
      RETURNING r.id, r.feature_id, f.company_id, f.title, r.readback_due_at`,
    )
    for (const release of overdue) {
      await client.query(
        `INSERT INTO shipping_friction_reports
          (id, company_id, feature_id, source, source_key, title, description,
           severity, frequency, status, evidence)
         VALUES ($1,$2,$3,'readback','release-readback:' || $4,
                 'Production readback is overdue', $5, 'high', 'once', 'open', $6::jsonb)
         ON CONFLICT (company_id, source_key) WHERE source_key IS NOT NULL
         DO UPDATE SET last_seen_at=NOW(), updated_at=NOW(), status='open'`,
        [`fr-${randomUUID()}`, release.company_id, release.feature_id, release.id,
          `“${release.title}” shipped, but its production readback was not completed by ${release.readback_due_at}.`,
          JSON.stringify([{ releaseId: release.id, dueAt: release.readback_due_at }])],
      )
      await client.query(
        `INSERT INTO shipping_events (id, company_id, feature_id, kind, data)
         VALUES ($1,$2,$3,'release.readback_overdue',$4::jsonb)`,
        [`se-${randomUUID()}`, release.company_id, release.feature_id,
          JSON.stringify({ releaseId: release.id, dueAt: release.readback_due_at })],
      )
    }

    const { rows: signals } = await client.query<{
      company_id: string; agent_id: string; kind: string; occurrences: number; last_seen_at: string
    }>(
      `SELECT company_id, agent_id, kind, count(*)::int AS occurrences,
              max(created_at) AS last_seen_at
         FROM agent_events
        WHERE company_id IS NOT NULL
          AND kind IN ('turn.completion_rejected', 'turn.protocol_violation')
          AND created_at > NOW() - INTERVAL '24 hours'
        GROUP BY company_id, agent_id, kind
       HAVING count(*) >= 3`,
    )
    for (const signal of signals) {
      const sourceKey = `agent-loop:${signal.agent_id}:${signal.kind}`
      const label = signal.kind === 'turn.completion_rejected'
        ? 'Agent repeatedly declared completion without sufficient evidence'
        : 'Agent repeatedly missed the turn completion protocol'
      await client.query(
        `INSERT INTO shipping_friction_reports
          (id, company_id, reporter_id, source, source_key, title, description,
           severity, frequency, status, evidence, occurrence_count, last_seen_at)
         VALUES ($1,$2,$3,'agent-observability',$4,$5,$6,'medium','frequent','open',$7::jsonb,$8,$9)
         ON CONFLICT (company_id, source_key) WHERE source_key IS NOT NULL
         DO UPDATE SET occurrence_count=GREATEST(shipping_friction_reports.occurrence_count, EXCLUDED.occurrence_count),
                       last_seen_at=EXCLUDED.last_seen_at, updated_at=NOW(),
                       evidence=EXCLUDED.evidence,
                       status=CASE WHEN shipping_friction_reports.status='dismissed' THEN 'dismissed' ELSE 'open' END`,
        [`fr-${randomUUID()}`, signal.company_id, signal.agent_id, sourceKey, label,
          `@${signal.agent_id} produced ${signal.occurrences} ${signal.kind} events in the last 24 hours. Review the prompt, tool ergonomics, or verification contract.`,
          JSON.stringify([{ agentId: signal.agent_id, eventKind: signal.kind, windowHours: 24, occurrences: signal.occurrences }]),
          signal.occurrences, signal.last_seen_at],
      )
    }
    await client.query('COMMIT')
    return { overdue: overdue.length, frictionSignals: signals.length }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export function startShippingMaintenance(intervalMs = DEFAULT_INTERVAL_MS): NodeJS.Timeout {
  const tick = () => void runShippingMaintenance().then((result) => {
    if (result.overdue || result.frictionSignals) {
      console.log(`[shipping] maintenance: overdue=${result.overdue} friction-signals=${result.frictionSignals}`)
    }
  }).catch((error) => console.warn('[shipping] maintenance failed', error instanceof Error ? error.message : String(error)))
  tick()
  const handle = setInterval(tick, Math.max(60_000, intervalMs))
  handle.unref()
  return handle
}
