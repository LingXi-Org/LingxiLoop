import { DurableObject } from 'cloudflare:workers'
import { assertSource, canSupersede, canonical, ReleaseError, requireThat, validateManifest, type Accepted, type Component, type Manifest, type TargetId } from '../../../shared/release/protocol'
import { forwardStages, recoveryStages, qualifyPreflightSourceRecovery, qualifyDrainedSourceRecovery, stageWorkflowId, STAGE_REQUEST_LIMIT, verificationStages } from './stages'
import type { Bootstrap, ReleaseEnv, ReleaseRecord, ReleaseStatus } from './types'

const terminal = new Set(['accepted', 'failed', 'recovered', 'superseded'])
const dispatchWindow = () => ({ queuedAt: Date.now(), deadline: Date.now() + 300_000, attempts: 0 })
const dispatchDenied = (error: unknown) => {
  const value = error as { status?: number; code?: string }
  return value?.status === 401 || value?.status === 403 || /^(UNAUTHORIZED|FORBIDDEN|AUTHENTICATION_FAILED|WORKFLOW_SUBREQUEST_LIMIT)$/.test(value?.code ?? '') || error instanceof Error && error.message === 'Too many subrequests.'
}
type Row = { id: string; data: string; [key: string]: string }

// A single SQLite DO owns the whole environment. Locks never expire on a timer:
// an unknown external effect retains ownership until reconciliation proves it.
export class ReleaseLedger extends DurableObject<ReleaseEnv> {
  constructor(ctx: DurableObjectState, env: ReleaseEnv) {
    super(ctx, env)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS locks (resource TEXT PRIMARY KEY, release_id TEXT NOT NULL, generation INTEGER NOT NULL)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, attempt INTEGER NOT NULL DEFAULT 0, started INTEGER NOT NULL DEFAULT 0)`)
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, release_id TEXT NOT NULL, data TEXT NOT NULL)`)
  }
  private get(id: string): ReleaseRecord | undefined {
    const row = this.ctx.storage.sql.exec<Row>('SELECT id,data FROM releases WHERE id=?', id).toArray()[0]
    return row ? JSON.parse(row.data) : undefined
  }
  private all() { return this.ctx.storage.sql.exec<Row>('SELECT id,data FROM releases').toArray().map(row => JSON.parse(row.data) as ReleaseRecord) }
  private meta<T>(id: string, fallback: T): T {
    const row = this.ctx.storage.sql.exec<Row>('SELECT id,data FROM meta WHERE id=?', id).toArray()[0]
    return row ? JSON.parse(row.data) : fallback
  }
  private putMeta(id: string, value: unknown) { this.ctx.storage.sql.exec('INSERT OR REPLACE INTO meta(id,data) VALUES (?,?)', id, JSON.stringify(value)) }
  private accepted(): Accepted { return this.meta('accepted', { releaseId: null, components: {} }) }
  private save(record: ReleaseRecord) {
    record.updatedAt = Date.now()
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO releases(id,data) VALUES (?,?)', record.releaseId, JSON.stringify(record))
    this.ctx.storage.sql.exec('INSERT INTO events(release_id,data) VALUES (?,?)', record.releaseId, JSON.stringify({ ...record, manifest: undefined }))
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url); const body = request.method === 'POST' ? await request.json() as Record<string, unknown> : {}
      // Arm before committing the start intent: a crash after the SQLite
      // commit must not leave an outbox row with no future wake-up.
      if (['/register', '/resume', '/advance', '/begin-recovery'].includes(url.pathname)) await this.ctx.storage.setAlarm(Date.now() + 1000)
      let result: unknown
      // No external await is allowed inside this transaction.
      result = this.ctx.storage.transactionSync(() => {
        if (url.pathname === '/accepted') return this.accepted()
        if (url.pathname === '/events') return this.ctx.storage.sql.exec('SELECT seq,data FROM events WHERE release_id=? AND seq>? ORDER BY seq LIMIT 100', url.searchParams.get('id'), Number(url.searchParams.get('after') ?? 0)).toArray().map(row => ({ seq: row.seq, ...JSON.parse(row.data as string) }))
        if (url.pathname === '/bootstrap') return this.bootstrap(body as unknown as Bootstrap)
        if (url.pathname === '/register') return this.register(body.manifest as Manifest, body.manifestHash as string)
        const releaseId = (body.releaseId ?? url.searchParams.get('id')) as string
        const record = this.get(releaseId)
        requireThat(record, 'RELEASE_NOT_FOUND', 404)
        if (url.pathname === '/get') return record
        if (['/claim', '/transition', '/authorize', '/note', '/initialize', '/network-permit', '/retry-permit', '/deadline', '/observe', '/mark-effect', '/advance', '/begin-recovery'].includes(url.pathname)) requireThat(body.workflowId === record.workflowId, 'STALE_WORKFLOW_ATTEMPT')
        if (['/initialize', '/network-permit', '/retry-permit', '/deadline', '/observe', '/mark-effect', '/advance', '/begin-recovery'].includes(url.pathname)) return this.stage(record, url.pathname, body)
        if (url.pathname === '/note') { record.errors.cleanup = String(body.cleanup); this.save(record); return record }
        if (url.pathname === '/authorize') { requireThat(!terminal.has(record.status), 'RELEASE_ALREADY_TERMINAL'); return { authorized: true, generation: record.generation } }
        if (url.pathname === '/claim') return this.claim(record)
        if (url.pathname === '/transition') return this.transition(record, body)
        if (url.pathname === '/resume') {
          requireThat(!terminal.has(record.status), 'RELEASE_ALREADY_TERMINAL')
          requireThat(body.expectedWorkflowId === record.workflowId, 'STALE_WORKFLOW_ATTEMPT')
          const out = this.ctx.storage.sql.exec('SELECT attempt FROM outbox WHERE id=?', releaseId).toArray()[0]
          const attempt = Number(out?.attempt ?? 0) + 1
          // Restart only the durable Workflow; host operation keys remain stable.
          this.ctx.storage.sql.exec('INSERT OR REPLACE INTO outbox(id,attempt,started) VALUES (?,?,0)', releaseId, attempt)
          record.resumeMode = body.recover === true ? 'recover' : 'resume'
          record.manualInterventions = (record.manualInterventions ?? 0) + 1
          record.dispatch = dispatchWindow()
          if (record.checkpoint) {
            if(body.recover===true&&qualifyDrainedSourceRecovery(record.manifest,record.checkpoint,record.targets,record.manifestHash,record.generation)){
              const cp=record.checkpoint
              // Reuse verified maintenance isolation before any data/application mutation; retain all old budgets and host keys.
              cp.sourceDrainReuse={stage:cp.plan[cp.index].key,generation:record.generation,operationKeys:cp.changed.flatMap(id=>record.manifest.targets[id]!.hosts.map(()=>`${record.releaseId}:${id}:drain`))}
              cp.plan.splice(cp.index,1)
            }
            record.checkpoint.previousWorkflowId = record.workflowId
            record.checkpoint.serial++
            record.workflowId = stageWorkflowId(record.manifestHash, record.checkpoint.serial)
          } else record.workflowId = `${releaseId}-${attempt}`
          this.save(record)
          return record
        }
        throw new ReleaseError('NOT_FOUND', 404)
      })
      if (['/register', '/resume', '/transition', '/advance', '/begin-recovery'].includes(url.pathname)) await this.ctx.storage.setAlarm(Date.now() + 1000)
      return Response.json(result)
    } catch (error) {
      return Response.json({ error: error instanceof ReleaseError ? error.code : 'LEDGER_INTERNAL_ERROR' }, { status: error instanceof ReleaseError ? error.status : 500 })
    }
  }
  private stage(record: ReleaseRecord, path: string, body: Record<string, unknown>) {
    requireThat(!terminal.has(record.status), 'RELEASE_ALREADY_TERMINAL')
    if (path === '/initialize') {
      if (record.checkpoint) {
        const cp = record.checkpoint, key = cp.plan[cp.index].key
        cp.timings ??= {}; cp.timings[key] ??= { queuedAt: record.dispatch?.queuedAt ?? record.updatedAt }
        cp.timings[key].startedAt ??= Date.now()
        if (record.status === 'blocked') { requireThat(record.checkpoint.initializedWorkflowId !== record.workflowId, 'RECONCILIATION_REQUIRED'); record.status = record.checkpoint.direction === 'forward' ? (record.generation ? 'active' : 'preparing') : 'recovering'; this.save(record) }
        if (record.checkpoint.initializedWorkflowId !== record.workflowId) { record.checkpoint.initializedWorkflowId = record.workflowId; this.save(record) }
        this.save(record); return record
      }
      const legacy = record.generation > 0
      if (legacy) {
        // A controller upgrade may finish ONLY the fresh verification of an
        // already admitted release. Never infer host success from a timeout.
        requireThat(['PROBE_QUERY_UNAVAILABLE', 'STEP_OUTCOME_UNKNOWN'].includes(record.error ?? ''), 'LEGACY_RECONCILIATION_REQUIRED')
        for (const [id, target] of Object.entries(record.manifest.targets)) {
          requireThat(target.artifact.kind === 'image', 'LEGACY_RECONCILIATION_REQUIRED')
          for (const host of target.hosts) for (const phase of ['prepare', 'drain', 'apply', 'verify', 'undrain']) {
            const op = record.targets[`${id}:${host}:${phase}`] as { key?: string; status?: string; operationId?: string; manifestHash?: string; generation?: number; releaseId?: string; target?: string; phase?: string } | undefined
            requireThat(op && ['succeeded', 'complete', 'success'].includes(op.status ?? '') && op.key === `${record.releaseId}:${id}:${phase}` && !!op.operationId && op.manifestHash === record.manifestHash && op.generation === (phase === 'prepare' ? 0 : record.generation) && op.releaseId === record.releaseId && op.target === id && op.phase === phase, 'LEGACY_RECONCILIATION_REQUIRED')
          }
        }
      } else requireThat(!this.env.CONTROLLER_OPS_SHA || record.manifest.opsSha === this.env.CONTROLLER_OPS_SHA, 'CONTROLLER_VERSION_MISMATCH')
      record.checkpoint = { protocol: 2, plan: legacy ? verificationStages(record.manifest) : forwardStages(record.manifest), index: 0, serial: 0,
        changed: [], mutationSubmitted: false, direction: 'forward', requests: {}, deadlines: {}, completed: [], initializedWorkflowId: record.workflowId, ...(legacy ? { legacyVerificationOnly: true } : {}) }
      const key = record.checkpoint.plan[0].key
      record.checkpoint.timings = { [key]: { queuedAt: record.createdAt, startedAt: Date.now() } }
      record.status = legacy ? 'active' : 'preparing'; this.save(record); return record
    }
    const cp = record.checkpoint
    requireThat(cp?.protocol === 2, 'CHECKPOINT_REQUIRED')
    const current = cp.plan[cp.index]
    requireThat(current && body.stage === current.key, 'STALE_RELEASE_STAGE')
    if (path === '/retry-permit') {
      requireThat(record.status !== 'blocked', 'RECONCILIATION_REQUIRED')
      const key = `${current.key}:${String(body.key)}`
      cp.retries ??= {}
      requireThat((cp.retries[key] ?? 0) < record.manifest.policy.retryLimit, 'RETRY_BUDGET_EXHAUSTED')
      cp.retries[key] = (cp.retries[key] ?? 0) + 1
      cp.timings ??= {}; cp.timings[current.key] ??= { queuedAt: record.updatedAt }
      cp.timings[current.key].lastError = String(body.error)
      this.save(record); return { used: cp.retries[key] }
    }
    if (path === '/network-permit') {
      requireThat(record.status !== 'blocked', 'RECONCILIATION_REQUIRED')
      const used = cp.requests[current.key] ?? 0
      requireThat(used < STAGE_REQUEST_LIMIT, 'STAGE_REQUEST_BUDGET_EXHAUSTED')
      cp.requests[current.key] = used + 1
      // The allowance survives resumes; do not emit the full record per GET.
      record.updatedAt = Date.now()
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO releases(id,data) VALUES (?,?)', record.releaseId, JSON.stringify(record))
      return { used: used + 1, limit: STAGE_REQUEST_LIMIT }
    }
    if (path === '/deadline') {
      const key = String(body.key)
      // Database backup includes a final dump plus a bounded 300s upload and short metadata reads.
      // Do not truncate it with the unrelated service-drain budget. Preserve the persisted deadline.
      const databasePhase = current.kind === 'host' && ['backup','restore-verify','migrate'].includes(current.phase ?? '')
      const seconds = current.kind === 'prepare' ? 900 : current.kind === 'claim' ? 1800 : databasePhase ? Math.max(600,record.manifest.policy.drainSeconds) : record.manifest.policy.drainSeconds
      cp.deadlines[key] ??= Date.now() + seconds * 1000
      this.save(record); return { deadline: cp.deadlines[key] }
    }
    if (path === '/observe') {
      record.targets[String(body.key)] = body.value
      this.save(record); return record
    }
    if (path === '/mark-effect') {
      requireThat(!cp.legacyVerificationOnly, 'LEGACY_VERIFICATION_ONLY')
      for (const target of current.targets ?? []) if (!cp.changed.includes(target)) cp.changed.push(target)
      cp.mutationSubmitted ||= body.mutation === true
      this.save(record); return record
    }
    if (path === '/begin-recovery') {
      requireThat(cp.direction === 'forward' && !cp.legacyVerificationOnly && cp.changed.length > 0, 'RECOVERY_NOT_AUTHORIZED')
      cp.sourceRecoveryQualified=qualifyPreflightSourceRecovery(record.manifest,cp,record.targets,record.manifestHash,record.generation)
      const plan = recoveryStages(record.manifest, cp)
      cp.direction = (!cp.mutationSubmitted || cp.sourceRecoveryQualified===true) && cp.changed.every(id => record.manifest.targets[id]!.artifact.kind === 'image') ? 'source' : 'compatible-recovery'
      cp.plan = [...cp.plan.slice(0, cp.index), ...plan]
      record.status = 'recovering'; record.errors.forward = String(body.error); record.error = String(body.error)
    } else {
      requireThat(path === '/advance' && current.kind !== 'finish', 'INVALID_STAGE_ADVANCE')
      cp.completed.push({ key: current.key, workflowId: record.workflowId, requests: cp.requests[current.key] ?? 0 })
      cp.index++
    }
    if (cp.timings?.[current.key]) cp.timings[current.key].completedAt = Date.now()
    requireThat(cp.plan[cp.index], 'INVALID_STAGE_ADVANCE')
    cp.previousWorkflowId = record.workflowId; cp.serial++
    record.workflowId = stageWorkflowId(record.manifestHash, cp.serial)
    record.phase = cp.plan[cp.index].key
    record.dispatch = dispatchWindow()
    cp.timings ??= {}; cp.timings[record.phase] ??= { queuedAt: record.dispatch.queuedAt }
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO outbox(id,attempt,started) VALUES (?,?,0)', record.releaseId, cp.serial)
    this.save(record); return record
  }
  private bootstrap(data: Bootstrap) {
    requireThat(this.env.BOOTSTRAP_ENABLED === 'true' && !this.accepted().releaseId && this.all().length === 0, 'BOOTSTRAP_DISABLED')
    requireThat(data.evidence?.zeroInFlight === true && /^[a-zA-Z0-9._/-]+$/.test(data.evidence.receiptKey) && data.evidence.handoffId && Number.isFinite(Date.parse(data.evidence.observedAt)), 'HANDOFF_EVIDENCE_REQUIRED')
    requireThat(data.accepted?.releaseId && Object.keys(data.accepted.components).length > 0, 'INVENTORY_REQUIRED')
    for (const c of Object.values(data.accepted.components)) requireThat(c?.releaseId && /^[a-f0-9]{40}$/.test(c.appSha) && Number.isSafeInteger(c.sequence), 'INVALID_INVENTORY')
    this.putMeta('accepted', data.accepted); this.putMeta('bootstrap', data.evidence)
    this.putMeta('generation', 0)
    return data.accepted
  }
  private register(manifest: Manifest, manifestHash: string) {
    validateManifest(manifest)
    requireThat(/^sha256:[a-f0-9]{64}$/.test(manifestHash), 'INVALID_MANIFEST_HASH', 400)
    const existing = this.get(manifest.releaseId)
    if (existing) { requireThat(existing.manifestHash === manifestHash && canonical(existing.manifest) === canonical(manifest), 'IDEMPOTENCY_CONFLICT'); return existing }
    assertSource(manifest, this.accepted())
    for (const record of this.all()) {
      if (['queued', 'preparing', 'waiting'].includes(record.status) && canSupersede(record.manifest, manifest)) {
        record.status = 'superseded'; record.supersededBy = manifest.releaseId; this.save(record)
      }
      requireThat(!(record.manifest.sequence > manifest.sequence && canSupersede(manifest, record.manifest) && record.status !== 'failed'), 'LATE_OLD_BUILD')
    }
    const record: ReleaseRecord = { releaseId: manifest.releaseId, manifest, manifestHash, status: 'queued', phase: 'batch', generation: 0,
      createdAt: Date.now(), updatedAt: Date.now(), error: null, supersededBy: null, workflowId: `${manifest.releaseId}-0`, targets: {}, errors: {}, dispatch: dispatchWindow(), manualInterventions: 0 }
    this.save(record)
    this.ctx.storage.sql.exec('INSERT INTO outbox(id) VALUES (?)', manifest.releaseId)
    this.putMeta('desired', manifest.releaseId)
    return record
  }
  private claim(record: ReleaseRecord) {
    requireThat(!terminal.has(record.status) && record.status !== 'blocked', 'RELEASE_NOT_CLAIMABLE')
    if (record.generation) return record
    assertSource(record.manifest, this.accepted())
    const resources = [...new Set(Object.values(record.manifest.targets).flatMap(t => t.resources))].sort()
    for (const resource of resources) requireThat(!this.ctx.storage.sql.exec('SELECT resource FROM locks WHERE resource=?', resource).toArray().length, 'RESOURCE_BUSY', 423)
    const generation = this.meta('generation', 0) + 1
    this.putMeta('generation', generation)
    for (const resource of resources) this.ctx.storage.sql.exec('INSERT INTO locks(resource,release_id,generation) VALUES (?,?,?)', resource, record.releaseId, generation)
    record.generation = generation; record.status = 'active'; record.phase = 'claimed'; this.save(record)
    return record
  }
  private transition(record: ReleaseRecord, body: Record<string, unknown>) {
    if (terminal.has(record.status) && record.status === body.status && record.phase === body.phase && record.generation === body.generation) return record
    requireThat(!terminal.has(record.status), 'RELEASE_ALREADY_TERMINAL')
    const status = body.status as ReleaseStatus
    requireThat(['preparing', 'waiting', 'active', 'accepted', 'failed', 'recovering', 'recovered', 'blocked'].includes(status), 'INVALID_STATUS')
    if (record.generation) requireThat(body.generation === record.generation, 'STALE_GENERATION')
    requireThat(!(record.status === 'blocked' && status !== 'recovering' && status !== 'active' && status !== 'blocked'), 'RECONCILIATION_REQUIRED')
    if (status === 'accepted') {
      requireThat(record.generation && body.phase === 'verified', 'VERIFICATION_REQUIRED')
      const accepted = this.accepted()
      assertSource(record.manifest, accepted)
      for (const [id, t] of Object.entries(record.manifest.targets) as [TargetId, Component][]) accepted.components[id] = { ...t, releaseId: record.releaseId, appSha: record.manifest.appSha, sequence: record.manifest.sequence }
      accepted.releaseId = record.releaseId; this.putMeta('accepted', accepted)
    }
    // Only known terminal outcomes release locks. 'blocked' deliberately keeps
    // its locks even after the Workflow errors or an operator disappears.
    if (terminal.has(status)) {
      requireThat(!record.generation || status === 'accepted' || body.effectsSettled === true, 'UNKNOWN_EFFECTS_RETAIN_LOCK')
      this.ctx.storage.sql.exec('DELETE FROM locks WHERE release_id=? AND generation=?', record.releaseId, record.generation)
    }
    record.status = status; record.phase = String(body.phase ?? record.phase)
    record.error = typeof body.error === 'string' ? body.error : null
    if (record.checkpoint) {
      const cp = record.checkpoint, timing = cp.timings?.[cp.plan[cp.index]?.key]
      if (timing && ['accepted','failed','recovered','blocked'].includes(status)) { timing.completedAt = Date.now(); if (record.error) timing.lastError = record.error }
    }
    if (body.targets) record.targets = body.targets as Record<string, unknown>
    if (body.errors) record.errors = { ...record.errors, ...body.errors as object }
    this.save(record); return record
  }
  async alarm() {
    const pending = this.ctx.storage.sql.exec('SELECT id,attempt FROM outbox WHERE started=0').toArray()
    let retry = false
    for (const row of pending) {
      const record = this.get(String(row.id))
      if (!record || terminal.has(record.status)) { this.ctx.storage.sql.exec('UPDATE outbox SET started=1 WHERE id=?', row.id); continue }
      record.dispatch ??= dispatchWindow()
      if (record.dispatch.attempts >= 20 || Date.now() >= record.dispatch.deadline) {
        // A missing create response may have started a Workflow. Keep its exact
        // identity and all locks; stopping dispatch never proves absence/effects.
        record.status = 'blocked'; record.phase = 'dispatch'; record.error = 'WORKFLOW_DISPATCH_BUDGET_UNKNOWN'
        record.errors.cleanup = record.error
        this.ctx.storage.sql.exec('UPDATE outbox SET started=2 WHERE id=? AND attempt=?',row.id,row.attempt)
        this.save(record); continue
      }
      record.dispatch.attempts++; this.save(record)
      try {
        const workflowId = record.workflowId
        if (record.checkpoint?.previousWorkflowId) {
          const previous = await (await this.env.RELEASE_WORKFLOW.get(record.checkpoint.previousWorkflowId)).status()
          requireThat(['complete', 'errored', 'terminated'].includes(previous.status), 'PREVIOUS_STAGE_NOT_TERMINAL')
        }
        try { await this.env.RELEASE_WORKFLOW.create({ id: workflowId, params: { releaseId: String(row.id), attempt: Number(row.attempt) } }) }
        catch (error) {
          if (dispatchDenied(error)) throw error
          // A create timeout may have succeeded. Only an observed existing
          // instance counts as delivered; otherwise retain the outbox item.
          const observed = await (await this.env.RELEASE_WORKFLOW.get(workflowId)).status()
          requireThat(observed.status !== 'unknown', 'WORKFLOW_START_UNCONFIRMED')
        }
        const latest = this.get(String(row.id))
        if (latest?.workflowId === workflowId) {
          this.ctx.storage.sql.exec('UPDATE outbox SET started=1 WHERE id=? AND attempt=?', row.id, row.attempt)
          latest.dispatch!.deliveredAt = Date.now(); this.save(latest)
        }
      } catch (error) {
        const latest = this.get(String(row.id))
        if (latest?.workflowId === record.workflowId) {
          latest.dispatch!.lastError = error instanceof ReleaseError ? error.code : 'WORKFLOW_PROVIDER_UNAVAILABLE'
          if (dispatchDenied(error)) {
            latest.status = 'blocked'; latest.phase = 'dispatch'; latest.error = 'WORKFLOW_DISPATCH_DENIED'
            latest.errors.cleanup = latest.error
            this.ctx.storage.sql.exec('UPDATE outbox SET started=2 WHERE id=? AND attempt=?',row.id,row.attempt)
          } else retry = true
          this.save(latest)
        }
      }
    }
    if (retry) await this.ctx.storage.setAlarm(Date.now() + 15_000)
  }
}
