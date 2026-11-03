// Run inside an existing Worker. Only its public loopback health/metrics are read;
// no control-plane startup, database connection, model call or mutation.
import { releaseVersions } from '@lyyzka/lingxios'

const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const names = ['AGENT_OS_MAX_CONCURRENT_RUNS', 'AGENT_OS_RESERVED_INTERACTIVE_RUNS', 'AGENT_OS_MODEL_CONCURRENCY',
  'AGENT_OS_MAX_MODEL_CALLS', 'AGENT_OS_MAX_MODEL_TOKENS', 'AGENT_OS_MAX_MODEL_COST_MICROS', 'AGENT_OS_MAX_WORK_MS']
const gauges = new Set(['agentos_worker_active_runs', 'agentos_queue_pending', 'agentos_queue_oldest_seconds',
  'agentos_runs_stalled', 'agentos_event_loop_delay_p95_seconds'])
const histograms = new Set(['agentos_resource_queue_wait_seconds', 'agentos_run_seconds', 'agentos_claim_recovery_seconds'])

async function boundedText(response) {
  const reader = response.body?.getReader()
  if (!reader) throw Error('body unavailable')
  const chunks = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 256 * 1024) throw Error('observation limit')
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

function metricSamples(text) {
  return text.split('\n').flatMap(line => {
    const match = /^(agentos_[a-z_]+)(?:\{([^{}]*)\})? (\S+)$/.exec(line)
    if (!match) return []
    const [, name, rawLabels, rawValue] = match, value = numeric(Number(rawValue))
    const family = name.replace(/_(bucket|sum|count)$/, '')
    if (value === null || !gauges.has(name) && !histograms.has(family)) return []
    const labels = {}
    if (rawLabels !== undefined) {
      for (const part of rawLabels.split(',')) {
        const pair = /^(resource|priority|le)="([^"]+)"$/.exec(part)
        if (!pair || Object.hasOwn(labels, pair[1])) return []
        const [, key, label] = pair
        if (key === 'resource' && label !== 'model'
          || key === 'priority' && !['foreground', 'background'].includes(label)
          || key === 'le' && label !== '+Inf' && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(label)) return []
        labels[key] = label
      }
    }
    if (gauges.has(name) && Object.keys(labels).length) return []
    return [{ name, labels, value }]
  }).slice(0, 256)
}

export async function workerCapacityObservation(env, fetchImpl = fetch) {
  const configuration = Object.fromEntries(names.map(name => [name,
    env[name]?.trim() ? integer(Number(env[name].trim())) : null]))
  const port = env.AGENT_OS_WORKER_PORT?.trim() ? Number(env.AGENT_OS_WORKER_PORT) : 5190
  const base = { observationOnly: true, runtime: releaseVersions.runtime, observedAt: new Date().toISOString(),
    configuration, configurationScope: 'container_environment_not_frozen_root_limits', providerLimits: 'unknown',
    // These public endpoints do not identify per-run model waiters or lease expiry.
    perRunModelPermitWait: 'unknown', leaseExpiry: 'unknown', generationCorrectionOccupancy: 'unknown' }
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return { ...base, status: 'partial', health: null, metrics: null }
  const get = path => fetchImpl(`http://127.0.0.1:${port}${path}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000) })
  const results = await Promise.allSettled([
    (async () => {
      const response = await get('/healthz')
      if (!response.ok && response.status !== 503) throw Error('health unavailable')
      const value = JSON.parse(await boundedText(response))
      if (typeof value.ok !== 'boolean' || typeof value.draining !== 'boolean'
        || integer(value.activeRuns) === null || integer(value.maxConcurrentRuns) === null) throw Error('invalid health')
      return { ok: value.ok, draining: value.draining, activeRuns: value.activeRuns, maxConcurrentRuns: value.maxConcurrentRuns }
    })(),
    (async () => {
      const response = await get('/metrics')
      if (!response.ok) throw Error('metrics unavailable')
      return metricSamples(await boundedText(response))
    })(),
  ])
  const [health, metrics] = results.map(result => result.status === 'fulfilled' ? result.value : null)
  return { ...base, status: results.every(result => result.status === 'fulfilled') ? 'observed' : 'partial', health, metrics }
}

if (!process.argv[1] || process.argv[1].endsWith('/worker-capacity-observe.mjs')) {
  console.log(JSON.stringify(await workerCapacityObservation(process.env)))
}
