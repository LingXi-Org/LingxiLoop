/**
 * Postgres store implementations over an injected pg-compatible pool (any
 * object with `query` and `connect`, e.g. `pg.Pool`). Keeping the driver out
 * of this package's dependency tree lets deployments pin their own.
 *
 * Semantics mirror `memory-store.ts`, which is the executable specification;
 * the schema lives in `db/schema.sql`.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type {
  HostActionResult, SessionRecord, WorkCompletion, WorkItem,
} from '../protocol/types.js'
import type {
  ActionLedgerStore, EnqueueResult, EnqueueWorkInput, EventStore, HeartbeatRow,
  LeasedWork, SaveSessionResult, SessionStore, StoredRunEvent, WorkStore, WorkStoreOptions,
} from './stores.js'

/** The subset of `pg.Pool` this module needs. */
export interface SqlQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
}

export interface SqlPool extends SqlQueryable {
  connect(): Promise<SqlClient>
}

export interface SqlClient extends SqlQueryable {
  release(): void
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function withTransaction<T>(pool: SqlPool, body: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await body(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

const WORK_SESSION_KEY_SQL =
  `work.tenant_id || ':' || work.agent_id || ':' || work.session_id || ':' || COALESCE(work.thread_id, '-')`

function workItemFromRow(row: Record<string, unknown>, leaseToken: string, homeEpoch: number): WorkItem {
  return {
    id: String(row['id']),
    fence: Number(row['fence']),
    homeEpoch,
    tenantId: String(row['tenant_id']),
    agentId: String(row['agent_id']),
    sessionId: String(row['session_id']),
    ...(row['thread_id'] ? { threadId: String(row['thread_id']) } : {}),
    kind: String(row['kind']),
    lane: row['lane'] as WorkItem['lane'],
    triggerRef: String(row['trigger_ref']),
    ...(row['principal_id'] ? { principalId: String(row['principal_id']) } : {}),
    createdAt: new Date(row['created_at'] as string | Date).toISOString(),
    availableAt: new Date(row['available_at'] as string | Date).toISOString(),
    attempts: Number(row['attempts'] ?? 0),
    preemptions: Number(row['preemptions'] ?? 0),
    leaseToken,
    ...(row['meta'] ? { meta: row['meta'] as Record<string, unknown> } : {}),
  }
}

export class PgWorkStore implements WorkStore {
  private readonly leaseTtlSeconds: number
  private readonly workerTimeoutSeconds: number

  constructor(private readonly pool: SqlPool, options: WorkStoreOptions = {}) {
    this.leaseTtlSeconds = Math.ceil((options.leaseTtlMs ?? 45_000) / 1000)
    this.workerTimeoutSeconds = Math.ceil((options.workerTimeoutMs ?? 90_000) / 1000)
  }

  async enqueue(input: EnqueueWorkInput): Promise<EnqueueResult> {
    const id = input.id ?? randomUUID()
    const { rows } = await this.pool.query(
      `INSERT INTO agent_work_items
         (id, tenant_id, agent_id, session_id, thread_id, kind, lane, trigger_ref, principal_id, priority, available_at, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, NOW()),$12::jsonb)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [id, input.tenantId, input.agentId, input.sessionId, input.threadId ?? null, input.kind, input.lane,
        input.triggerRef, input.principalId ?? null, input.priority ?? 0, input.availableAt ?? null,
        input.meta ? JSON.stringify(input.meta) : null],
    )
    return { id, deduplicated: rows.length === 0 }
  }

  async claim(workerId: string): Promise<WorkItem | null> {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO agent_os_workers (worker_id, last_seen_at, updated_at) VALUES ($1, NOW(), NOW())
         ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = NOW(), updated_at = NOW()`,
        [workerId],
      )
      await client.query(`DELETE FROM agent_os_session_leases WHERE expires_at <= NOW()`)
      const { rows } = await client.query(
        `SELECT work.*
           FROM agent_work_items work
           LEFT JOIN agent_os_session_routes route
             ON route.session_key = ${WORK_SESSION_KEY_SQL}
           LEFT JOIN agent_os_workers route_worker ON route_worker.worker_id = route.worker_id
          WHERE (work.status = 'queued' OR (work.status = 'leased' AND work.lease_expires_at <= NOW()))
            AND work.cancel_requested_at IS NULL
            AND work.available_at <= NOW()
            AND (route.session_key IS NULL OR route.worker_id = $1
                 OR route_worker.last_seen_at IS NULL
                 OR route_worker.last_seen_at <= NOW() - make_interval(secs => $2::int))
            AND NOT EXISTS (
              SELECT 1 FROM agent_os_session_leases lease
               WHERE lease.session_key = work.tenant_id || ':' || work.agent_id || ':' || work.session_id || ':' || COALESCE(work.thread_id, '-')
                 AND lease.expires_at > NOW())
          ORDER BY CASE work.lane
                     WHEN 'interactive' THEN 4 WHEN 'approval' THEN 3
                     WHEN 'collaboration' THEN 2 ELSE 1 END DESC,
                   work.priority DESC, work.created_at ASC
          FOR UPDATE OF work SKIP LOCKED
          LIMIT 1`,
        [workerId, this.workerTimeoutSeconds],
      )
      const row = rows[0]
      if (!row) return null
      const sessionKey = [row['tenant_id'], row['agent_id'], row['session_id'], row['thread_id'] ?? '-'].join(':')
      const { rows: routes } = await client.query(
        `INSERT INTO agent_os_session_routes (session_key, worker_id, home_epoch, updated_at)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (session_key) DO UPDATE
           SET worker_id = EXCLUDED.worker_id,
               home_epoch = CASE
                 WHEN agent_os_session_routes.worker_id = EXCLUDED.worker_id THEN agent_os_session_routes.home_epoch
                 ELSE agent_os_session_routes.home_epoch + 1 END,
               updated_at = NOW()
         WHERE agent_os_session_routes.worker_id = EXCLUDED.worker_id
            OR NOT EXISTS (
              SELECT 1 FROM agent_os_workers owner
               WHERE owner.worker_id = agent_os_session_routes.worker_id
                 AND owner.last_seen_at > NOW() - make_interval(secs => $3::int))
         RETURNING home_epoch`,
        [sessionKey, workerId, this.workerTimeoutSeconds],
      )
      if (!routes[0]) return null
      const proposedFence = Number(row['fence']) + 1
      const { rows: sessionLease } = await client.query(
        `INSERT INTO agent_os_session_leases (session_key, work_id, fence, expires_at)
         VALUES ($1, $2, $3, NOW() + make_interval(secs => $4::int))
         ON CONFLICT (session_key) DO NOTHING RETURNING session_key`,
        [sessionKey, row['id'], proposedFence, this.leaseTtlSeconds],
      )
      if (!sessionLease[0]) return null
      const token = randomBytes(32).toString('base64url')
      const { rows: claimed } = await client.query(
        `UPDATE agent_work_items
            SET status = 'leased', fence = fence + 1, lease_token_hash = $2, leased_by = $3,
                lease_expires_at = NOW() + make_interval(secs => $4::int),
                attempts = attempts + 1, updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [row['id'], hashToken(token), workerId, this.leaseTtlSeconds],
      )
      return workItemFromRow(claimed[0]!, token, Number(routes[0]['home_epoch']))
    })
  }

  async heartbeat(id: string, fence: number, leaseTokenHash: string): Promise<HeartbeatRow | null> {
    const { rows } = await this.pool.query(
      `WITH renewed AS (
         UPDATE agent_work_items
            SET lease_expires_at = NOW() + make_interval(secs => $4::int), updated_at = NOW()
          WHERE id = $1 AND fence = $2 AND lease_token_hash = $3 AND status = 'leased'
            AND lease_expires_at > NOW()
          RETURNING cancel_requested_at, preempt_requested_at, steer_inputs, leased_by
       ), session_renewed AS (
         UPDATE agent_os_session_leases
            SET expires_at = NOW() + make_interval(secs => $4::int), updated_at = NOW()
          WHERE work_id = $1 AND fence = $2 AND EXISTS (SELECT 1 FROM renewed)
       ), worker_seen AS (
         INSERT INTO agent_os_workers (worker_id, last_seen_at, updated_at)
         SELECT leased_by, NOW(), NOW() FROM renewed WHERE leased_by IS NOT NULL
         ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = NOW(), updated_at = NOW()
       )
       SELECT cancel_requested_at, preempt_requested_at, steer_inputs FROM renewed`,
      [id, fence, leaseTokenHash, this.leaseTtlSeconds],
    )
    const row = rows[0]
    if (!row) return null
    return {
      cancelRequested: row['cancel_requested_at'] !== null,
      preemptRequested: row['preempt_requested_at'] !== null,
      steer: (row['steer_inputs'] ?? []) as HeartbeatRow['steer'],
    }
  }

  async getLeased(id: string, fence: number, leaseTokenHash: string): Promise<LeasedWork | null> {
    const { rows } = await this.pool.query(
      `SELECT work.*, COALESCE(route.home_epoch, 1) AS home_epoch
         FROM agent_work_items work
         LEFT JOIN agent_os_session_routes route
           ON route.session_key = work.tenant_id || ':' || work.agent_id || ':' || work.session_id || ':' || COALESCE(work.thread_id, '-')
        WHERE work.id = $1 AND work.fence = $2 AND work.lease_token_hash = $3
          AND work.status = 'leased' AND work.lease_expires_at > NOW()`,
      [id, fence, leaseTokenHash],
    )
    const row = rows[0]
    if (!row) return null
    const { leaseToken: _omit, ...work } = workItemFromRow(row, '', Number(row['home_epoch']))
    return { work, status: 'leased', cancelRequested: row['cancel_requested_at'] !== null }
  }

  async yieldWork(id: string, fence: number, leaseTokenHash: string): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query(
        `UPDATE agent_work_items
            SET status = 'queued', fence = fence + 1, lease_token_hash = NULL, leased_by = NULL,
                lease_expires_at = NULL, preempt_requested_at = NULL, preemptions = preemptions + 1,
                available_at = NOW() + INTERVAL '1 second', updated_at = NOW()
          WHERE id = $1 AND fence = $2 AND lease_token_hash = $3 AND status = 'leased'
            AND preempt_requested_at IS NOT NULL
          RETURNING id`,
        [id, fence, leaseTokenHash],
      )
      if (!rows[0]) return false
      await client.query(`DELETE FROM agent_os_session_leases WHERE work_id = $1 AND fence = $2`, [id, fence])
      return true
    })
  }

  async complete(id: string, fence: number, leaseTokenHash: string, completion: WorkCompletion): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      const { rows } = await client.query(
        `UPDATE agent_work_items
            SET status = $4, result_text = $5, error = $6, lease_token_hash = NULL,
                lease_expires_at = NULL, finished_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND fence = $2 AND lease_token_hash = $3 AND status = 'leased'
          RETURNING id`,
        [id, fence, leaseTokenHash, completion.status, completion.resultText ?? null, completion.error ?? null],
      )
      if (!rows[0]) return false
      await client.query(`DELETE FROM agent_os_session_leases WHERE work_id = $1 AND fence = $2`, [id, fence])
      return true
    })
  }

  async requestCancel(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE agent_work_items
          SET cancel_requested_at = NOW(),
              status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
              updated_at = NOW()
        WHERE id = $1 AND status IN ('queued','leased')`,
      [id],
    )
    return (rowCount ?? 0) > 0
  }

  async requestPreempt(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE agent_work_items SET preempt_requested_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'leased'`,
      [id],
    )
    return (rowCount ?? 0) > 0
  }

  async addSteer(id: string, text: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE agent_work_items
          SET steer_inputs = steer_inputs || jsonb_build_array(jsonb_build_object(
                'id', gen_random_uuid()::text, 'text', $2::text, 'createdAt', NOW())),
              updated_at = NOW()
        WHERE id = $1 AND status = 'leased'`,
      [id, text],
    )
    return (rowCount ?? 0) > 0
  }
}

export class PgSessionStore implements SessionStore {
  constructor(private readonly pool: SqlPool) {}

  async get(key: string): Promise<SessionRecord | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM agent_os_sessions WHERE session_key = $1`, [key],
    )
    const row = rows[0]
    if (!row) return null
    return {
      key: String(row['session_key']),
      tenantId: String(row['tenant_id']),
      agentId: String(row['agent_id']),
      sessionId: String(row['session_id']),
      ...(row['thread_id'] ? { threadId: String(row['thread_id']) } : {}),
      ...(row['summary'] ? { summary: String(row['summary']) } : {}),
      history: row['history'] as SessionRecord['history'],
      appliedWorkIds: (row['applied_work_ids'] ?? []) as string[],
      revision: Number(row['revision']),
      compactionEpoch: Number(row['compaction_epoch'] ?? 0),
      ...(row['prompt_context'] ? { promptContext: row['prompt_context'] as NonNullable<SessionRecord['promptContext']> } : {}),
    }
  }

  async save(session: SessionRecord): Promise<SaveSessionResult> {
    const { rows } = await this.pool.query(
      `INSERT INTO agent_os_sessions
         (session_key, tenant_id, agent_id, session_id, thread_id, summary, history,
          applied_work_ids, revision, compaction_epoch, prompt_context, updated_at)
       SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,1,$10,$11::jsonb,NOW()
        WHERE $9 = 0
       ON CONFLICT (session_key) DO UPDATE
         SET summary = EXCLUDED.summary, history = EXCLUDED.history,
             applied_work_ids = EXCLUDED.applied_work_ids,
             compaction_epoch = EXCLUDED.compaction_epoch,
             prompt_context = EXCLUDED.prompt_context,
             revision = agent_os_sessions.revision + 1, updated_at = NOW()
       WHERE agent_os_sessions.revision = $9
       RETURNING revision`,
      [session.key, session.tenantId, session.agentId, session.sessionId, session.threadId ?? null,
        session.summary ?? null, JSON.stringify(session.history), JSON.stringify(session.appliedWorkIds),
        session.revision, session.compactionEpoch,
        session.promptContext ? JSON.stringify(session.promptContext) : null],
    )
    if (!rows[0]) return { ok: false, conflict: true }
    return { ok: true, revision: Number(rows[0]['revision']) }
  }
}

export class PgEventStore implements EventStore {
  constructor(private readonly pool: SqlPool) {}

  async append(event: StoredRunEvent): Promise<boolean> {
    const { rows } = await this.pool.query(
      `INSERT INTO agent_run_events (run_id, seq, tenant_id, agent_id, kind, stage, visibility, data, recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (run_id, seq) DO NOTHING RETURNING run_id`,
      [event.runId, event.seq, event.tenantId, event.agentId, event.kind, event.stage,
        event.visibility, JSON.stringify(event.data), event.recordedAt],
    )
    return rows.length > 0
  }

  async listRange(runId: string, fromSeqExclusive: number, toSeqInclusive: number, kinds?: readonly string[]): Promise<StoredRunEvent[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM agent_run_events
        WHERE run_id = $1 AND seq > $2 AND seq <= $3
          AND ($4::text[] IS NULL OR kind = ANY($4::text[]))
        ORDER BY seq`,
      [runId, fromSeqExclusive, toSeqInclusive, kinds ? [...kinds] : null],
    )
    return rows.map((row) => ({
      runId: String(row['run_id']),
      seq: Number(row['seq']),
      tenantId: String(row['tenant_id']),
      agentId: String(row['agent_id']),
      kind: String(row['kind']),
      stage: row['stage'] as StoredRunEvent['stage'],
      visibility: row['visibility'] as StoredRunEvent['visibility'],
      data: row['data'] as Record<string, unknown>,
      recordedAt: new Date(row['recorded_at'] as string | Date).toISOString(),
    }))
  }
}

export class PgActionLedger implements ActionLedgerStore {
  constructor(private readonly pool: SqlPool) {}

  async find(idempotencyKey: string): Promise<HostActionResult | null> {
    const { rows } = await this.pool.query(
      `SELECT result FROM agent_action_ledger WHERE idempotency_key = $1`, [idempotencyKey],
    )
    return rows[0] ? rows[0]['result'] as HostActionResult : null
  }

  async record(idempotencyKey: string, result: HostActionResult): Promise<HostActionResult> {
    const { rows } = await this.pool.query(
      `INSERT INTO agent_action_ledger (idempotency_key, result) VALUES ($1, $2::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING result`,
      [idempotencyKey, JSON.stringify(result)],
    )
    if (rows[0]) return result
    const existing = await this.find(idempotencyKey)
    return existing ?? result
  }
}
