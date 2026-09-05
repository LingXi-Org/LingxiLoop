/**
 * In-memory store implementation. Serves three purposes: local development,
 * the test suite, and the executable specification of the lease state
 * machine that `pg-store.ts` mirrors in SQL.
 *
 * Single-process only — it relies on JavaScript's run-to-completion semantics
 * for atomicity.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { sessionKeyOf, type HostActionResult, type SessionRecord, type WorkCompletion, type WorkItem, WORK_LANE_PRIORITY } from '../protocol/types.js'
import type {
  ActionLedgerStore, EnqueueResult, EnqueueWorkInput, EventStore, HeartbeatRow,
  LeasedWork, SaveSessionResult, SessionStore, StoredRunEvent, WorkStore, WorkStoreOptions,
} from './stores.js'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

interface WorkRow {
  id: string
  fence: number
  tenantId: string
  agentId: string
  sessionId: string
  threadId?: string
  kind: string
  lane: WorkItem['lane']
  triggerRef: string
  principalId?: string
  priority: number
  status: 'queued' | 'leased' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  availableAt: string
  attempts: number
  preemptions: number
  leaseTokenHash: string | null
  leasedBy: string | null
  leaseExpiresAt: number | null
  cancelRequestedAt: string | null
  preemptRequestedAt: string | null
  steerInputs: Array<{ id: string; text: string; createdAt: string }>
  resultText: string | null
  error: string | null
  meta?: Record<string, unknown>
}

interface SessionRoute {
  workerId: string
  homeEpoch: number
}

interface SessionLease {
  workId: string
  fence: number
  expiresAt: number
}

export class MemoryWorkStore implements WorkStore {
  private readonly rows = new Map<string, WorkRow>()
  private readonly routes = new Map<string, SessionRoute>()
  private readonly sessionLeases = new Map<string, SessionLease>()
  private readonly workerLastSeen = new Map<string, number>()
  private readonly leaseTtlMs: number
  private readonly workerTimeoutMs: number

  constructor(options: WorkStoreOptions = {}, private readonly now: () => number = Date.now) {
    this.leaseTtlMs = options.leaseTtlMs ?? 45_000
    this.workerTimeoutMs = options.workerTimeoutMs ?? 90_000
  }

  async enqueue(input: EnqueueWorkInput): Promise<EnqueueResult> {
    const id = input.id ?? randomUUID()
    if (this.rows.has(id)) return { id, deduplicated: true }
    const nowIso = new Date(this.now()).toISOString()
    this.rows.set(id, {
      id,
      fence: 0,
      tenantId: input.tenantId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      kind: input.kind,
      lane: input.lane,
      triggerRef: input.triggerRef,
      ...(input.principalId ? { principalId: input.principalId } : {}),
      priority: input.priority ?? 0,
      status: 'queued',
      createdAt: nowIso,
      availableAt: input.availableAt ?? nowIso,
      attempts: 0,
      preemptions: 0,
      leaseTokenHash: null,
      leasedBy: null,
      leaseExpiresAt: null,
      cancelRequestedAt: null,
      preemptRequestedAt: null,
      steerInputs: [],
      resultText: null,
      error: null,
      ...(input.meta ? { meta: input.meta } : {}),
    })
    return { id, deduplicated: false }
  }

  private sessionKey(row: WorkRow): string {
    return sessionKeyOf(row)
  }

  private workerAlive(workerId: string, now: number): boolean {
    const seen = this.workerLastSeen.get(workerId)
    return seen !== undefined && now - seen < this.workerTimeoutMs
  }

  async claim(workerId: string): Promise<WorkItem | null> {
    const now = this.now()
    this.workerLastSeen.set(workerId, now)
    for (const [key, lease] of this.sessionLeases) {
      if (lease.expiresAt <= now) this.sessionLeases.delete(key)
    }
    const candidates = [...this.rows.values()]
      .filter((row) => {
        const claimable = row.status === 'queued'
          || (row.status === 'leased' && (row.leaseExpiresAt ?? 0) <= now)
        if (!claimable || row.cancelRequestedAt !== null) return false
        if (Date.parse(row.availableAt) > now) return false
        const sessionKey = this.sessionKey(row)
        if (this.sessionLeases.has(sessionKey)) return false
        const route = this.routes.get(sessionKey)
        if (route && route.workerId !== workerId && this.workerAlive(route.workerId, now)) return false
        return true
      })
      .sort((a, b) =>
        (WORK_LANE_PRIORITY[b.lane] - WORK_LANE_PRIORITY[a.lane])
        || (b.priority - a.priority)
        || (Date.parse(a.createdAt) - Date.parse(b.createdAt)))
    const row = candidates[0]
    if (!row) return null

    const sessionKey = this.sessionKey(row)
    const existingRoute = this.routes.get(sessionKey)
    let homeEpoch: number
    if (!existingRoute) {
      homeEpoch = 1
      this.routes.set(sessionKey, { workerId, homeEpoch })
    } else if (existingRoute.workerId === workerId) {
      homeEpoch = existingRoute.homeEpoch
    } else {
      // Taking over from a dead worker: the old filesystem home is suspect.
      homeEpoch = existingRoute.homeEpoch + 1
      this.routes.set(sessionKey, { workerId, homeEpoch })
    }

    const token = randomBytes(32).toString('base64url')
    row.status = 'leased'
    row.fence += 1
    row.leaseTokenHash = hashToken(token)
    row.leasedBy = workerId
    row.leaseExpiresAt = now + this.leaseTtlMs
    row.attempts += 1
    this.sessionLeases.set(sessionKey, { workId: row.id, fence: row.fence, expiresAt: now + this.leaseTtlMs })
    return this.toWorkItem(row, token, homeEpoch)
  }

  private toWorkItem(row: WorkRow, leaseToken: string, homeEpoch?: number): WorkItem {
    return {
      id: row.id,
      fence: row.fence,
      homeEpoch: homeEpoch ?? this.routes.get(this.sessionKey(row))?.homeEpoch ?? 1,
      tenantId: row.tenantId,
      agentId: row.agentId,
      sessionId: row.sessionId,
      ...(row.threadId ? { threadId: row.threadId } : {}),
      kind: row.kind,
      lane: row.lane,
      triggerRef: row.triggerRef,
      ...(row.principalId ? { principalId: row.principalId } : {}),
      createdAt: row.createdAt,
      availableAt: row.availableAt,
      attempts: row.attempts,
      preemptions: row.preemptions,
      leaseToken,
      ...(row.meta ? { meta: row.meta } : {}),
    }
  }

  private validLease(id: string, fence: number, leaseTokenHash: string): WorkRow | null {
    const row = this.rows.get(id)
    if (!row || row.status !== 'leased' || row.fence !== fence) return null
    if (row.leaseTokenHash !== leaseTokenHash) return null
    if ((row.leaseExpiresAt ?? 0) <= this.now()) return null
    return row
  }

  async heartbeat(id: string, fence: number, leaseTokenHash: string): Promise<HeartbeatRow | null> {
    const row = this.validLease(id, fence, leaseTokenHash)
    if (!row) return null
    const now = this.now()
    row.leaseExpiresAt = now + this.leaseTtlMs
    if (row.leasedBy) this.workerLastSeen.set(row.leasedBy, now)
    const lease = this.sessionLeases.get(this.sessionKey(row))
    if (lease && lease.workId === id && lease.fence === fence) lease.expiresAt = now + this.leaseTtlMs
    return {
      cancelRequested: row.cancelRequestedAt !== null,
      preemptRequested: row.preemptRequestedAt !== null,
      steer: [...row.steerInputs],
    }
  }

  async getLeased(id: string, fence: number, leaseTokenHash: string): Promise<LeasedWork | null> {
    const row = this.validLease(id, fence, leaseTokenHash)
    if (!row) return null
    const { leaseToken: _omit, ...work } = this.toWorkItem(row, '')
    return { work, status: 'leased', cancelRequested: row.cancelRequestedAt !== null }
  }

  async yieldWork(id: string, fence: number, leaseTokenHash: string): Promise<boolean> {
    const row = this.validLease(id, fence, leaseTokenHash)
    if (!row || row.preemptRequestedAt === null) return false
    row.status = 'queued'
    row.fence += 1
    row.leaseTokenHash = null
    row.leasedBy = null
    row.leaseExpiresAt = null
    row.preemptRequestedAt = null
    row.preemptions += 1
    row.availableAt = new Date(this.now() + 1_000).toISOString()
    this.releaseSessionLease(row, fence)
    return true
  }

  async complete(id: string, fence: number, leaseTokenHash: string, completion: WorkCompletion): Promise<boolean> {
    const row = this.validLease(id, fence, leaseTokenHash)
    if (!row) return false
    row.status = completion.status
    row.resultText = completion.resultText ?? null
    row.error = completion.error ?? null
    row.leaseTokenHash = null
    row.leaseExpiresAt = null
    this.releaseSessionLease(row, fence)
    return true
  }

  private releaseSessionLease(row: WorkRow, fence: number): void {
    const key = this.sessionKey(row)
    const lease = this.sessionLeases.get(key)
    if (lease && lease.workId === row.id && lease.fence === fence) this.sessionLeases.delete(key)
  }

  async requestCancel(id: string): Promise<boolean> {
    const row = this.rows.get(id)
    if (!row || row.status === 'completed' || row.status === 'failed' || row.status === 'cancelled') return false
    row.cancelRequestedAt = new Date(this.now()).toISOString()
    if (row.status === 'queued') {
      row.status = 'cancelled'
    }
    return true
  }

  async requestPreempt(id: string): Promise<boolean> {
    const row = this.rows.get(id)
    if (!row || row.status !== 'leased') return false
    row.preemptRequestedAt = new Date(this.now()).toISOString()
    return true
  }

  async addSteer(id: string, text: string): Promise<boolean> {
    const row = this.rows.get(id)
    if (!row || row.status !== 'leased') return false
    row.steerInputs.push({ id: randomUUID(), text, createdAt: new Date(this.now()).toISOString() })
    return true
  }

  /** Test helper: inspect a row's durable state. */
  inspect(id: string): { status: string; fence: number; attempts: number; preemptions: number; resultText: string | null; error: string | null } | null {
    const row = this.rows.get(id)
    if (!row) return null
    return {
      status: row.status, fence: row.fence, attempts: row.attempts,
      preemptions: row.preemptions, resultText: row.resultText, error: row.error,
    }
  }

  /** Test helper: force-expire the current lease. */
  expireLease(id: string): void {
    const row = this.rows.get(id)
    if (row) {
      row.leaseExpiresAt = 0
      this.sessionLeases.delete(this.sessionKey(row))
    }
  }

  /** Test helper: mark a worker dead. */
  markWorkerDead(workerId: string): void {
    this.workerLastSeen.set(workerId, 0)
  }
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionRecord>()

  async get(key: string): Promise<SessionRecord | null> {
    const stored = this.sessions.get(key)
    return stored ? structuredClone(stored) : null
  }

  async save(session: SessionRecord): Promise<SaveSessionResult> {
    const stored = this.sessions.get(session.key)
    const currentRevision = stored?.revision ?? 0
    if (stored ? session.revision !== currentRevision : session.revision !== 0) {
      return { ok: false, conflict: true }
    }
    const next = structuredClone(session)
    next.revision = currentRevision + 1
    this.sessions.set(session.key, next)
    return { ok: true, revision: next.revision }
  }
}

export class MemoryEventStore implements EventStore {
  private readonly byRun = new Map<string, Map<number, StoredRunEvent>>()

  async append(event: StoredRunEvent): Promise<boolean> {
    let run = this.byRun.get(event.runId)
    if (!run) {
      run = new Map()
      this.byRun.set(event.runId, run)
    }
    if (run.has(event.seq)) return false
    run.set(event.seq, structuredClone(event))
    return true
  }

  async listRange(runId: string, fromSeqExclusive: number, toSeqInclusive: number, kinds?: readonly string[]): Promise<StoredRunEvent[]> {
    const run = this.byRun.get(runId)
    if (!run) return []
    return [...run.values()]
      .filter((event) => event.seq > fromSeqExclusive && event.seq <= toSeqInclusive
        && (!kinds || kinds.includes(event.kind)))
      .sort((a, b) => a.seq - b.seq)
      .map((event) => structuredClone(event))
  }
}

export class MemoryActionLedger implements ActionLedgerStore {
  private readonly results = new Map<string, HostActionResult>()

  async find(idempotencyKey: string): Promise<HostActionResult | null> {
    const stored = this.results.get(idempotencyKey)
    return stored ? structuredClone(stored) : null
  }

  async record(idempotencyKey: string, result: HostActionResult): Promise<HostActionResult> {
    const existing = this.results.get(idempotencyKey)
    if (existing) return structuredClone(existing)
    this.results.set(idempotencyKey, structuredClone(result))
    return result
  }
}
