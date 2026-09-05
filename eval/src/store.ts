import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { EvaluationError, hash, id, manifestSchema, sampleSchema, type Manifest, type Sample } from './contracts.js'
import type { Span, TelemetryBackend } from './telemetry.js'

export type { Manifest } from './contracts.js'
export interface Job { id: string; manifest: Manifest; status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'; createdAt: number; report: unknown | null }
export class Store {
  readonly db: DatabaseSync
  private depth = 0
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;`)
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    if (version.user_version > 1) throw new EvaluationError('unsupported_store_version')
    if (version.user_version === 0) this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE versions(kind TEXT NOT NULL,id TEXT NOT NULL,version TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(kind,id,version));
      CREATE TABLE jobs(id TEXT PRIMARY KEY,manifest TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,owner TEXT,lease_until INTEGER,report TEXT);
      CREATE TABLE samples(job_id TEXT NOT NULL REFERENCES jobs(id),case_id TEXT NOT NULL,idx INTEGER NOT NULL,result TEXT,started INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(job_id,case_id,idx));
      CREATE TABLE spans(job_id TEXT NOT NULL REFERENCES jobs(id),span_id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(job_id,span_id));
      CREATE TABLE baselines(name TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id),digest TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
      PRAGMA user_version=1; COMMIT;`)
  }
  transaction<T>(work: () => T): T {
    const nested = this.depth++ > 0
    const savepoint = `eval_${this.depth}`
    try {
      this.db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
      try {
        const result = work()
        this.db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT')
        return result
      } catch (error) {
        this.db.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK')
        throw error
      }
    } finally { this.depth-- }
  }
  create(manifest: Manifest, jobId: string = randomUUID()): string {
    manifest = manifestSchema.parse(manifest)
    id.parse(jobId)
    return this.transaction(() => {
      for (const [kind, value] of [['suite', manifest.suite], ['dataset', manifest.dataset]] as const) {
        const digest = hash(value)
        const existing = this.db.prepare('SELECT digest FROM versions WHERE kind=? AND id=? AND version=?').get(kind, value.id, value.version)
        if (existing && existing.digest !== digest) throw new EvaluationError('version_content_conflict')
        this.db.prepare('INSERT OR IGNORE INTO versions VALUES(?,?,?,?)').run(kind, value.id, value.version, digest)
      }
      this.db.prepare("INSERT INTO jobs(id,manifest,status,created_at) VALUES(?,?,'queued',?)").run(jobId, JSON.stringify(manifest), Date.now())
      const insert = this.db.prepare('INSERT INTO samples(job_id,case_id,idx) VALUES(?,?,?)')
      for (const c of manifest.dataset.cases) for (let i = 0; i < manifest.suite.samples; i++) insert.run(jobId, c.id, i)
      return jobId
    })
  }
  job(jobId: string): Job {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId)
    if (!row) throw new EvaluationError('job_not_found')
    return { id: jobId, manifest: manifestSchema.parse(JSON.parse(String(row.manifest))), status: row.status as Job['status'], createdAt: Number(row.created_at), report: row.report ? JSON.parse(String(row.report)) : null }
  }
  claim(jobId: string, leaseMs: number): string {
    const owner = randomUUID()
    const result = this.db.prepare("UPDATE jobs SET owner=?,lease_until=?,status='running' WHERE id=? AND (status='queued' OR (status='running' AND lease_until<?))").run(owner, Date.now() + leaseMs, jobId, Date.now())
    if (!result.changes) throw new EvaluationError('job_unavailable')
    return owner
  }
  assertOwner(jobId: string, owner: string) {
    if (!this.db.prepare("SELECT 1 FROM jobs WHERE id=? AND owner=? AND status='running' AND lease_until>=?").get(jobId, owner, Date.now())) throw new EvaluationError('lease_lost')
  }
  heartbeat(jobId: string, owner: string, leaseMs: number) {
    this.assertOwner(jobId, owner)
    this.db.prepare('UPDATE jobs SET lease_until=? WHERE id=? AND owner=?').run(Date.now() + leaseMs, jobId, owner)
  }
  pending(jobId: string) {
    return this.db.prepare('SELECT case_id,idx,started FROM samples WHERE job_id=? AND result IS NULL ORDER BY case_id,idx').all(jobId)
      .map(row => ({ caseId: String(row.case_id), index: Number(row.idx), interrupted: Boolean(row.started) }))
  }
  startSample(jobId: string, owner: string, caseId: string, index: number) {
    this.transaction(() => {
      this.assertOwner(jobId, owner)
      this.db.prepare('UPDATE samples SET started=1 WHERE job_id=? AND case_id=? AND idx=? AND result IS NULL').run(jobId, caseId, index)
    })
  }
  saveSample(jobId: string, owner: string, sample: Sample) {
    sample = sampleSchema.parse(sample)
    this.transaction(() => {
      this.assertOwner(jobId, owner)
      const result = this.db.prepare('UPDATE samples SET result=? WHERE job_id=? AND case_id=? AND idx=? AND result IS NULL').run(JSON.stringify(sample), jobId, sample.caseId, sample.index)
      if (!result.changes) throw new EvaluationError('sample_already_saved')
    })
  }
  samples(jobId: string): Sample[] {
    return this.db.prepare('SELECT result FROM samples WHERE job_id=? AND result IS NOT NULL ORDER BY case_id,idx').all(jobId).map(r => JSON.parse(String(r.result)))
  }
  finish(jobId: string, owner: string, report: unknown) {
    this.transaction(() => {
      this.assertOwner(jobId, owner)
      if (this.pending(jobId).length) throw new EvaluationError('incomplete_job')
      this.db.prepare("UPDATE jobs SET status='completed',report=?,owner=NULL,lease_until=NULL WHERE id=?").run(JSON.stringify(report), jobId)
    })
  }
  fail(jobId: string, owner: string, report: unknown) {
    this.transaction(() => {
      this.assertOwner(jobId, owner)
      this.db.prepare("UPDATE jobs SET status='failed',report=?,owner=NULL,lease_until=NULL WHERE id=?").run(JSON.stringify(report), jobId)
    })
  }
  cancel(jobId: string) {
    if (!this.db.prepare("UPDATE jobs SET status='cancelled',owner=NULL,lease_until=NULL WHERE id=? AND status IN ('queued','running')").run(jobId).changes) throw new EvaluationError('job_not_cancellable')
  }
  telemetry(jobId: string, owner: string): TelemetryBackend {
    return { emit: (event: Span) => {
      this.transaction(() => {
        this.assertOwner(jobId, owner)
        this.db.prepare('INSERT INTO spans VALUES(?,?,?)').run(jobId, event.spanId, JSON.stringify(event))
      })
    }, flush: async () => {} }
  }
  spans(jobId: string): Span[] { return this.db.prepare('SELECT data FROM spans WHERE job_id=? ORDER BY rowid').all(jobId).map(r => JSON.parse(String(r.data))) }
  baseline(name: string): Job {
    const row = this.db.prepare('SELECT job_id,digest FROM baselines WHERE name=?').get(name)
    if (!row) throw new EvaluationError('baseline_not_found')
    const job = this.job(String(row.job_id))
    if (hash(job.report) !== row.digest) throw new EvaluationError('baseline_integrity_failure')
    return job
  }
  promote(name: string, jobId: string, reason: string) {
    id.parse(name)
    if (!reason.trim() || reason.length > 500) throw new EvaluationError('baseline_reason_required')
    const job = this.job(jobId)
    const report = job.report as { eligible?: boolean } | null
    if (job.status !== 'completed' || !report?.eligible) throw new EvaluationError('baseline_not_eligible')
    this.db.prepare('INSERT INTO baselines VALUES(?,?,?,?,?)').run(name, jobId, hash(job.report), reason, Date.now())
  }
  close() { this.db.close() }
}
