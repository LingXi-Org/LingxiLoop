import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { workerCapacityObservation } from './worker-capacity-observe.mjs'

const PRIVATE = 'PRIVATE_CREDENTIAL_PROMPT_OR_LABEL'
const env = { AGENT_OS_MAX_CONCURRENT_RUNS: '2', AGENT_OS_MODEL_CONCURRENCY: '2', AGENT_OS_RESERVED_INTERACTIVE_RUNS: '1', OPENAI_API_KEY: PRIVATE }
const healthy = { ok: true, activeRuns: 2, maxConcurrentRuns: 2, draining: false, workerId: PRIVATE }
const metrics = `agentos_worker_active_runs 2
agentos_queue_pending 5
agentos_queue_oldest_seconds 151.1
agentos_resource_queue_wait_seconds_count{resource="model",priority="foreground"} 12
agentos_resource_queue_wait_seconds_sum{resource="model",priority="foreground"} 0.25
agentos_resource_queue_wait_seconds_count{resource="${PRIVATE}",priority="foreground"} 999
agentos_private{prompt="${PRIVATE}"} 42\n`

test('read only loopback health and metrics once, filtering all non-numeric and unknown fields', async () => {
  const calls = []
  const result = await workerCapacityObservation(env, async (url, init) => {
    calls.push(url); assert.equal(init.redirect, 'error'); assert.ok(init.signal)
    assert.equal(init.method, 'GET')
    return new Response(url.endsWith('/healthz') ? JSON.stringify(healthy) : metrics)
  })
  assert.deepEqual(calls.sort(), ['http://127.0.0.1:5190/healthz', 'http://127.0.0.1:5190/metrics'])
  assert.equal(result.status, 'observed')
  assert.equal(result.health.activeRuns, 2)
  assert.equal(result.configuration.AGENT_OS_MODEL_CONCURRENCY, 2)
  assert.equal(result.metrics.find(row => row.name === 'agentos_queue_oldest_seconds').value, 151.1)
  assert.equal(result.metrics.length, 5)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(PRIVATE))
  assert.equal(result.providerLimits, 'unknown')
})

test('unavailable endpoints, absent metrics and absent configuration never become zero occupancy', async () => {
  const result = await workerCapacityObservation({}, async url => {
    if (url.endsWith('/healthz')) throw Error(PRIVATE)
    return new Response('# no samples yet\n')
  })
  assert.equal(result.status, 'partial')
  assert.equal(result.health, null)
  assert.deepEqual(result.metrics, [])
  assert.equal(result.configuration.AGENT_OS_MODEL_CONCURRENCY, null)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(PRIVATE))
})

test('an unhealthy JSON body remains readable independently of metrics failure', async () => {
  const result = await workerCapacityObservation(env, async url => url.endsWith('/healthz')
    ? new Response(JSON.stringify({ ...healthy, ok: false }), { status: 503 })
    : new Response(PRIVATE, { status: 500 }))
  assert.equal(result.status, 'partial')
  assert.equal(result.health.ok, false)
  assert.equal(result.metrics, null)
})

test('invalid configuration, oversized bodies and invalid metric samples fail closed', async () => {
  let calls = 0
  const invalid = await workerCapacityObservation({ ...env, AGENT_OS_WORKER_PORT: 'http://attacker' }, async () => { calls++ })
  assert.equal(calls, 0)
  assert.equal(invalid.status, 'partial')
  const large = await workerCapacityObservation(env, async () => new Response(PRIVATE.repeat(20000)))
  assert.equal(large.status, 'partial')
  const malformed = await workerCapacityObservation(env, async url => new Response(url.endsWith('/healthz') ? JSON.stringify(healthy)
    : 'agentos_worker_active_runs NaN\nagentos_queue_pending -1\nagentos_queue_oldest_seconds +Inf\n'))
  assert.deepEqual(malformed.metrics, [])
})

test('real CLI rejects observation arguments before credentials and has an isolated observation branch', () => {
  const child = spawnSync(process.execPath, ['deploy/cli.mjs', 'capacity-observe', 'servers'], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 5000 })
  assert.equal(child.status, 1)
  assert.match(child.stderr, /capacity-observe accepts no arguments/)
  const cli = readFileSync('deploy/cli.mjs', 'utf8')
  const entry = cli.slice(cli.indexOf("if (command === 'capacity-observe')"), cli.indexOf("if (command === 'knowledge-observe')"))
  assert.match(entry, /worker-capacity-observe.mjs/)
  assert.doesNotMatch(entry, /ensureImages|patchEntry|runtimePatch\(|servers\(|workers\(|pull\(/)
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8')
  assert.match(workflow, /options: \[[^\n]*capacity-observe[^\n]*\]/)
  assert.match(workflow, /node deploy\/cli.mjs capacity-observe/)
})
