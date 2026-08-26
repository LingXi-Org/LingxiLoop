/**
 * Minimal in-process metrics counter store + Prometheus text exposition.
 *
 * Why home-rolled instead of pulling in `prom-client`:
 *   - Surface area is tiny (counters only — no histograms / summaries
 *     yet) so the dep saves <100 lines.
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
 * Prom-compatible text. Endpoint is 404 when the env var is unset so we
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
  | 'knowledge.retrieval.generic_fallback'
  | 'learning.mission.created'
  | 'learning.mission.deduplicated'
  | 'learning.mission.planning_completed'
  | 'learning.attempt.accepted'
  | 'learning.evaluation.proposed'
  | 'learning.mastery.changed'
  | 'learning.review.due'
  | 'learning.notification.delivered'
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
  'email.send.ok':                       { help: 'Outbound emails accepted by the provider.', labels: ['mock'] },
  'email.send.fail':                     { help: 'Outbound emails the provider rejected.', labels: ['mock'] },
  'email.inbound.delivered':             { help: 'Inbound emails persisted to at least one recipient.', labels: ['auto_submitted'] },
  'email.inbound.dedup':                 { help: 'Inbound deliveries deduplicated by smtp_message_id.', labels: [] },
  'email.inbound.no_recipient':          { help: 'Inbound deliveries dropped — no resolved recipient.', labels: [] },
  'email.inbound.bad_signature':         { help: 'Inbound POSTs rejected for HMAC mismatch.', labels: [] },
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
  'knowledge.retrieval.generic_fallback':{ help: 'Agent turns with ready sources but no sufficient retrieval hit.', labels: [] },
  'learning.mission.created':             { help: 'Learning Missions created.', labels: ['mode'] },
  'learning.mission.deduplicated':        { help: 'Duplicate Mission creation attempts returned the existing Mission.', labels: [] },
  'learning.mission.planning_completed':  { help: 'Mission boards that passed the explicit planning gate.', labels: ['mode'] },
  'learning.attempt.accepted':            { help: 'Host-verified learning attempts accepted.', labels: ['source'] },
  'learning.evaluation.proposed':         { help: 'Learning evaluations proposed by status.', labels: ['status'] },
  'learning.mastery.changed':             { help: 'Deterministic mastery projection changes.', labels: ['status'] },
  'learning.review.due':                  { help: 'Mastery reviews found due by the digest scheduler.', labels: [] },
  'learning.notification.delivered':      { help: 'Learning digest delivery results.', labels: ['channel', 'status'] },
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
  // Allow extra labels (future-proof) but emit a warn so we can clean up.
  if (labels) {
    for (const k of Object.keys(labels)) {
      if (!def.labels.includes(k)) {
        console.warn(`[metrics] counter ${name} got unexpected label "${k}" (registered: [${def.labels.join(',')}])`)
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
  return lines.join('\n') + '\n'
}

/** Test-only: zero every counter. Production code never calls this. */
export function resetForTesting(): void {
  STORE.clear()
}
