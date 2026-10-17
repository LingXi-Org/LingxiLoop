import { monitorEventLoopDelay, PerformanceObserver, performance } from 'node:perf_hooks'
import { getHeapStatistics } from 'node:v8'

/**
 * Minimal in-process metrics store + Prometheus text exposition.
 *
 * Why home-rolled instead of pulling in `prom-client`:
 *   - Surface area is small (typed counters and bounded infrastructure metrics) so the dep saves <100 lines.
 *   - Prom-client's reset semantics + global registry don't compose
 *     cleanly with the rest of lingxiloop's module-level singletons.
 *   - We can keep all metric names + labels strictly typed in one file,
 *     which makes "which counters exist" greppable.
 *
 * Add a new counter:
 *   1. Add to the COUNTER_NAMES union below + Counter row in REGISTRY.
 *   2. Call `metrics.inc('email.send.ok', { tenant })` at the event site.
 *   3. Restart — counters reset on each process boot, which is fine for
 *      Prometheus (scrape interval re-derives rates).
 *
 * Exposition: GET /api/metrics?token=<METRICS_BEARER_TOKEN> returns
 * Prometheus text. Endpoint is 404 when the env var is unset so we
 * don't accidentally expose internal counts in unauthenticated deploys.
 */

/** Every counter the server is allowed to write. Adding a new event?
 *  Add the name here and to REGISTRY below. */
export type CounterName =
  | 'email.send.ok'
  | 'email.send.fail'
  | 'email.inbound.delivered'
  | 'email.inbound.dedup'
  | 'email.inbound.no_recipient'
  | 'email.inbound.bad_signature'
  | 'email.inbound.attachment_upload_fail'
  | 'email.retry.ok'
  | 'email.retry.fail'
  | 'email.retry.terminal'
  | 'email.gc.deleted'
  | 'email.gc.failed'
  | 'db.gc.deleted'
  | 'db.gc.failed'
  | 'knowledge.source.processed'
  | 'knowledge.source.processing_ms'
  | 'knowledge.notebook.provisioned'
  | 'knowledge.notebook.provision_failed'
  | 'knowledge.attachment.agent_wake'
  | 'knowledge.retrieval.queries'
  | 'knowledge.retrieval.hits'
  | 'knowledge.retrieval.errors'
  | 'knowledge.retrieval.latency_ms'
  | 'knowledge.retrieval.miss'
  | 'learning.attempt.accepted'
  | 'learning.evaluation.proposed'
  | 'learning.state.changed'
  | 'learning.review.due'
  | 'learning.notification.delivered'
  | 'notification.delivered'
  | 'learning.authorization.denied'
  | 'learning.teacher_agent.authorization_denied'
  | 'learning.teacher_agent.provisioned'
  | 'learning.teacher_agent.summary_generated'
  | 'learning.teacher_agent.learner_drilldown'
  | 'learning.teacher_agent.evidence_accessed'
  | 'learning.teacher_agent.digest_configured'

interface CounterDef {
  help: string
  /** Allowed label keys; values are stringified verbatim. Keep label
   *  cardinality bounded — never put unbounded ids (message_id, etc.)
   *  here; tenant + status are fine. */
  labels: readonly string[]
}

/** All known counters. The `help` text becomes `# HELP <name> ...` in
 *  the exposition; the label list constrains what callers may pass. */
const REGISTRY: Readonly<Record<CounterName, CounterDef>> = {
  'email.send.ok':                       { help: 'Outbound emails accepted by the provider.', labels: [] },
  'email.send.fail':                     { help: 'Outbound emails the provider rejected.', labels: [] },
  'email.inbound.delivered':             { help: 'Inbound emails persisted to at least one recipient.', labels: ['auto_submitted'] },
  'email.inbound.dedup':                 { help: 'Inbound deliveries deduplicated by smtp_message_id.', labels: [] },
  'email.inbound.no_recipient':          { help: 'Inbound deliveries dropped — no resolved recipient.', labels: [] },
  'email.inbound.bad_signature':         { help: 'Inbound POSTs rejected for provider signature mismatch.', labels: [] },
  'email.inbound.attachment_upload_fail':{ help: 'Inbound attachments that failed to upload to storage.', labels: [] },
  'email.retry.ok':                      { help: 'Retry-worker resends that succeeded.', labels: [] },
  'email.retry.fail':                    { help: 'Retry-worker resends that failed (will try again).', labels: [] },
  'email.retry.terminal':                { help: 'Retry-worker resends that hit the backoff cap (gave up).', labels: [] },
  'email.gc.deleted':                    { help: 'Storage objects deleted by the attachment GC sweep.', labels: [] },
  'email.gc.failed':                     { help: 'GC delete attempts that failed at the storage layer.', labels: [] },
  'db.gc.deleted':                       { help: 'Rows deleted by the DB retention sweep.', labels: ['table'] },
  'db.gc.failed':                        { help: 'DB retention sweeps that failed (per table, will retry).', labels: ['table'] },
  'knowledge.source.processed':          { help: 'Knowledge-source processing attempts by outcome.', labels: ['status'] },
  'knowledge.source.processing_ms':      { help: 'Cumulative knowledge-source processing milliseconds.', labels: [] },
  'knowledge.notebook.provisioned':      { help: 'Project notebooks provisioned in Open Notebook.', labels: [] },
  'knowledge.notebook.provision_failed': { help: 'Project notebook provisioning failures.', labels: [] },
  'knowledge.attachment.agent_wake':     { help: 'Deferred attachment Agent turns released after ingestion.', labels: ['status'] },
  'knowledge.retrieval.queries':         { help: 'Knowledge retrieval queries.', labels: [] },
  'knowledge.retrieval.hits':            { help: 'Knowledge chunks injected into Agent turns.', labels: [] },
  'knowledge.retrieval.errors':          { help: 'Open Notebook retrieval requests that failed.', labels: [] },
  'knowledge.retrieval.latency_ms':      { help: 'Cumulative Open Notebook retrieval latency in milliseconds.', labels: [] },
  'knowledge.retrieval.miss':            { help: 'Agent turns with ready sources but no sufficient retrieval hit.', labels: [] },
  'learning.attempt.accepted':            { help: 'Host-verified learning attempts accepted.', labels: ['source'] },
  'learning.evaluation.proposed':         { help: 'Learning evaluations proposed by status.', labels: ['status'] },
  'learning.state.changed':               { help: 'Deterministic LearningState projection changes.', labels: ['status'] },
  'learning.review.due':                  { help: 'LearningState reviews found due by the digest scheduler.', labels: [] },
  'learning.notification.delivered':      { help: 'Learning digest delivery results.', labels: ['channel', 'status'] },
  'notification.delivered':               { help: 'Notification delivery results.', labels: ['channel', 'status'] },
  'learning.authorization.denied':        { help: 'Learning course authorization denials.', labels: ['role'] },
  'learning.teacher_agent.authorization_denied': { help: 'Teacher-agent authorization denials.', labels: ['reason'] },
  'learning.teacher_agent.provisioned':   { help: 'Project-scoped Pulse teacher agents provisioned.', labels: [] },
  'learning.teacher_agent.summary_generated': { help: 'Teacher-agent aggregate summaries generated.', labels: [] },
  'learning.teacher_agent.learner_drilldown': { help: 'Teacher-agent learner drill-down reads.', labels: [] },
  'learning.teacher_agent.evidence_accessed': { help: 'Teacher-agent raw attempt evidence reads.', labels: [] },
  'learning.teacher_agent.digest_configured': { help: 'Teacher-agent digest schedules configured.', labels: ['frequency'] },
}

/** Storage: nested map keyed by counter name, then by serialized labels. */
const STORE: Map<CounterName, Map<string, number>> = new Map()

/** Stable serialization of a label object, so {a:1,b:2} and {b:2,a:1}
 *  bucket to the same counter. Empty labels collapse to ''. */
function serializeLabels(labels: Record<string, string | number | boolean> | undefined): string {
  if (!labels) return ''
  const keys = Object.keys(labels).sort()
  return keys.map((k) => `${k}=${String(labels[k])}`).join(',')
}

/** Increment a counter by 1 (or `by`). Throws on unknown counter — keeps
 *  the registry honest at runtime in case a new label sneaks in via a
 *  string concat somewhere. */
export function inc(
  name: CounterName,
  labels?: Record<string, string | number | boolean>,
  by = 1,
): void {
  const def = REGISTRY[name]
  if (!def) throw new Error(`metrics.inc: unknown counter ${name}`)
  // Metric identity is an immutable contract. Reject undeclared labels so a
  // retired product mode cannot survive as an accidental time-series split.
  if (labels) {
    for (const k of Object.keys(labels)) {
      if (!def.labels.includes(k)) {
        throw new Error(`metrics.inc: counter ${name} got unexpected label "${k}"`)
      }
    }
  }
  const key = serializeLabels(labels)
  let bucket = STORE.get(name)
  if (!bucket) { bucket = new Map(); STORE.set(name, bucket) }
  bucket.set(key, (bucket.get(key) ?? 0) + by)
}

/** Snapshot all counters in Prometheus text exposition format. Each
 *  registered counter gets a `# HELP` + `# TYPE counter` header followed
 *  by one line per labelset. Unobserved counters still emit a zero row
 *  with empty labels so a graph doesn't disappear before the first
 *  event fires. */
export function renderProm(): string {
  const lines: string[] = []
  for (const [name, def] of Object.entries(REGISTRY) as Array<[CounterName, CounterDef]>) {
    lines.push(`# HELP ${name.replace(/\./g, '_')} ${def.help}`)
    lines.push(`# TYPE ${name.replace(/\./g, '_')} counter`)
    const bucket = STORE.get(name)
    if (!bucket || bucket.size === 0) {
      lines.push(`${name.replace(/\./g, '_')} 0`)
      continue
    }
    for (const [labelKey, value] of bucket) {
      const labelPart = labelKey
        ? '{' + labelKey.split(',').map((kv) => {
            const [k, v] = kv.split('=')
            // Escape per Prom text format: \, ", \n inside label values.
            const escaped = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
            return `${k}="${escaped}"`
          }).join(',') + '}'
        : ''
      lines.push(`${name.replace(/\./g, '_')}${labelPart} ${value}`)
    }
  }
  lines.push(...renderInfrastructureMetrics())
  return lines.join('\n') + '\n'
}

/** Test-only: zero every counter. Production code never calls this. */
export function resetForTesting(): void {
  STORE.clear()
  acquireCounts.ok = acquireCounts.error = sqlSubmitted = acquireSum = 0
  acquireBuckets.fill(0)
}

// Bounded infrastructure series: no SQL text, URLs, IDs or error labels.
const acquireBounds = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
const acquireBuckets = acquireBounds.map(() => 0)
const acquireCounts = { ok: 0, error: 0 }
let acquireSum = 0
let sqlSubmitted = 0
let poolSnapshot: (() => { total: number; idle: number; waiting: number; max: number }) | undefined
let gcCount = 0
let gcSeconds = 0
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) { gcCount++; gcSeconds += entry.duration / 1_000 }
})
gcObserver.observe({ entryTypes: ['gc'] })
const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
eventLoopDelay.enable() // Node's delay monitor does not keep the process alive.

export function registerPoolMetrics(snapshot: NonNullable<typeof poolSnapshot>): void {
  poolSnapshot = snapshot
}

export function observePoolAcquire(milliseconds: number, status: 'ok' | 'error'): void {
  const seconds = Math.max(0, milliseconds / 1_000)
  acquireCounts[status]++
  acquireSum += seconds
  acquireBounds.forEach((bound, index) => { if (seconds <= bound) acquireBuckets[index]++ })
}

/** Count client.query submissions once, including failed queries and BEGIN/COMMIT. */
export function observeSqlSubmission(): void { sqlSubmitted++ }

function renderInfrastructureMetrics(): string[] {
  const lines: string[] = []
  const sample = (name: string, help: string, value: number, type = 'gauge') => {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name} ${Number.isFinite(value) ? value : 0}`)
  }
  sample('db_sql_submitted_total', 'SQL submissions on application pool clients, including failed SQL and transactions.', sqlSubmitted, 'counter')
  lines.push('# HELP db_pool_acquire_total Application pool acquisition attempts by outcome.', '# TYPE db_pool_acquire_total counter')
  for (const status of ['ok', 'error'] as const) lines.push(`db_pool_acquire_total{status="${status}"} ${acquireCounts[status]}`)
  lines.push('# HELP db_pool_acquire_duration_seconds Pool acquisition latency including connection creation and failed attempts.',
    '# TYPE db_pool_acquire_duration_seconds histogram')
  acquireBounds.forEach((bound, index) => { lines.push(`db_pool_acquire_duration_seconds_bucket{le="${bound}"} ${acquireBuckets[index]}`) })
  const count = acquireCounts.ok + acquireCounts.error
  lines.push(`db_pool_acquire_duration_seconds_bucket{le="+Inf"} ${count}`,
    `db_pool_acquire_duration_seconds_sum ${acquireSum}`, `db_pool_acquire_duration_seconds_count ${count}`)
  if (poolSnapshot) {
    const pool = poolSnapshot()
    sample('db_pool_total', 'Connected application pool clients.', pool.total)
    sample('db_pool_idle', 'Idle application pool clients.', pool.idle)
    sample('db_pool_active', 'Checked-out application pool clients, including listeners.', pool.total - pool.idle)
    sample('db_pool_waiting', 'Queued application pool acquisitions.', pool.waiting)
    sample('db_pool_max', 'Configured application pool maximum.', pool.max)
  }
  const memory = process.memoryUsage()
  const heap = getHeapStatistics()
  sample('process_heap_used_bytes', 'V8 heap used bytes.', memory.heapUsed)
  sample('process_heap_total_bytes', 'V8 committed heap bytes.', memory.heapTotal)
  sample('process_heap_limit_bytes', 'V8 heap size limit bytes.', heap.heap_size_limit)
  sample('process_rss_bytes', 'Process resident set bytes.', memory.rss)
  sample('process_external_bytes', 'External memory bytes including ArrayBuffers.', memory.external)
  sample('process_array_buffers_bytes', 'ArrayBuffer bytes, a subset of external memory.', memory.arrayBuffers)
  sample('process_gc_total', 'Observed garbage collection cycles since process start.', gcCount, 'counter')
  sample('process_gc_duration_seconds_total', 'Observed garbage collection duration in seconds since process start.', gcSeconds, 'counter')
  sample('process_event_loop_utilization', 'Event-loop utilization since process start.', performance.eventLoopUtilization().utilization)
  sample('process_uptime_seconds', 'Process uptime in seconds.', process.uptime())
  const cpu = process.cpuUsage()
  sample('process_cpu_user_seconds_total', 'Cumulative process user CPU seconds.', cpu.user / 1e6, 'counter')
  sample('process_cpu_system_seconds_total', 'Cumulative process system CPU seconds.', cpu.system / 1e6, 'counter')
  sample('process_event_loop_delay_mean_seconds', 'Mean event-loop delay since process start.', eventLoopDelay.mean / 1e9)
  sample('process_event_loop_delay_max_seconds', 'Maximum event-loop delay since process start.', eventLoopDelay.max / 1e9)
  return lines
}
