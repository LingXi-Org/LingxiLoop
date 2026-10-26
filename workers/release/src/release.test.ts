import { env, runInDurableObject, runDurableObjectAlarm, introspectWorkflowInstance, fetchMock } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import { assertSource, canRecover, canSupersede, hash, validateManifest, type Accepted, type Manifest, type Target } from '../../../shared/release/protocol'
import type { ReleaseEnv, ReleaseRecord } from './types'
import api from './index'
import { ReleaseWorkflow } from './workflow'
import { ReleaseLedger } from './ledger'
import { prepareWorker } from './adapters'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

const bindings = env as unknown as ReleaseEnv
async function controlledLedger(name: string) {
  const stub = bindings.RELEASES.getByName(name)
  // These tests dispatch Workflow steps manually. Keep the real durable alarm
  // armed, but prevent its wall-clock dispatcher from racing manual execution
  // or isolated-storage teardown on a loaded CI runner.
  await runInDurableObject(stub, async (_instance, state) => {
    const setAlarm = state.storage.setAlarm.bind(state.storage)
    state.storage.setAlarm = (_time, options) => setAlarm(Date.now() + 86_400_000, options)
  })
  return stub
}
const contract = { nativeSchema: 14, productSchema: 57, api: 'v1', worker: '3.8.12', checkpoint: '3.8.12', control: 'v1', capabilities: ['case-soft-delete-filter'] }
function target(): Target {
  return { adapter: 'web-static', resources: ['main-frontend'], dependsOn: [], fromReleaseId: 'baseline', hosts: [],
    artifact: { kind: 'worker', workerName: 'lingxiloop-web', versionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', hash: `sha256:${'a'.repeat(64)}` },
    contract, configuration: { version: 'v1', secretRefs: [], volumes: {} }, verification: { readiness: ['ready'], businessProbe: 'login' } }
}
function manifest(id = 'release-1', sequence = 2): Manifest {
  return { version: 1, releaseId: id, appSha: 'a'.repeat(40), opsSha: 'b'.repeat(40), sourceReleaseId: 'baseline', sequence,
    createdAt: new Date().toISOString(), checks: { commit: 'a'.repeat(40), conclusion: 'success', runId: '123' }, policy: { drainSeconds: 30, retryLimit: 1 }, targets: { 'main-frontend': target() } }
}
const accepted = (): Accepted => ({ releaseId: 'baseline', components: { 'main-frontend': { ...target(), releaseId: 'baseline', appSha: '0'.repeat(40), sequence: 1 } } })
async function setup(name: string) {
  const stub = await controlledLedger(name)
  const call = async <T = ReleaseRecord>(path: string, body?: unknown) => {
    const response = await stub.fetch(new Request(`https://ledger${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }))
    return { status: response.status, body: await response.json() as T }
  }
  expect((await call('/bootstrap', { accepted: accepted(), evidence: { zeroInFlight: true, receiptKey: 'handoff/verified.json', handoffId: 'handoff-495', observedAt: new Date().toISOString() } })).status).toBe(200)
  return { stub, call }
}
describe('release protocol', () => {
  it('requires runtime conflict resources and exact immutable identity', () => {
    const m = manifest(); const t = target()
    m.targets = { 'main-runtime-a': { ...t, adapter: 'main-runtime', resources: ['main-runtime'], hosts: ['a'], artifact: { kind: 'image', digest: `sha256:${'a'.repeat(64)}` }, hostPlan: {} } }
    expect(() => validateManifest(m)).toThrow('MISSING_CONFLICT_RESOURCE')
    m.targets['main-runtime-a']!.resources.push('main-db')
    expect(validateManifest(m)).toBe(m)
  })
  it('refuses a schema/capability downgrade and preserves required intermediate migrations', () => {
    expect(canRecover(contract, { ...contract, capabilities: [] })).toBe(false)
    expect(canRecover(contract, { ...contract, productSchema: 56 })).toBe(false)
    const older = manifest(); older.targets['main-frontend']!.contract = { ...contract, migrations: [{ version: 57, checksum: 'a'.repeat(64) }] }
    const newer = manifest('release-2', 3)
    expect(canSupersede(older, newer)).toBe(false)
    newer.targets['main-frontend']!.contract = older.targets['main-frontend']!.contract
    expect(canSupersede(older, newer)).toBe(true)
    const baseline = accepted(); baseline.components['main-frontend']!.sequence = 3
    expect(() => assertSource(newer, baseline)).toThrow('STALE_CANDIDATE')
  })
  it('requires a complete zero-write-loss maintenance plan for a forward migration', () => {
    const m = manifest()
    const migrations = Array.from({ length: 58 }, (_, n) => ({ version: n + 1, checksum: 'a'.repeat(64) }))
    const current = { ...contract, migrations: migrations.slice(0, 57) }
    const next = { ...contract, productSchema: 58, migrations }
    const runtime: Target = { ...target(), adapter: 'main-runtime', resources: ['main-runtime', 'main-db'], artifact: { kind: 'image' as const, digest: `sha256:${'a'.repeat(64)}` }, contract: next, hosts: ['a'], hostPlan: { mode: 'maintenance' } }
    m.targets = { 'main-runtime-a': runtime, 'main-runtime-b': { ...runtime, hosts: ['b'] } }
    const baseline: Accepted = { releaseId: 'baseline', components: {
      'main-runtime-a': { ...runtime, contract: current, sequence: 1, releaseId: 'baseline', appSha: '0'.repeat(40) },
      'main-runtime-b': { ...runtime, contract: current, sequence: 1, releaseId: 'baseline', appSha: '0'.repeat(40) },
    } }
    expect(() => assertSource(m, baseline)).toThrow('SCHEMA_CHANGE_REQUIRES_MAINTENANCE_ADAPTER')
    runtime.hostPlan = { mode: 'maintenance', database: { from: { nativeSchema: 14, productSchema: 57 }, to: { nativeSchema: 14, productSchema: 58 }, strategy: 'maintenance', rpo: 'zero-committed-writes', migrations } }
    expect(() => assertSource(m, baseline)).not.toThrow()
    const database = runtime.hostPlan!.database as { migrations: unknown[] }
    database.migrations = migrations.slice(1)
    expect(() => assertSource(m, baseline)).toThrow('SCHEMA_CHANGE_REQUIRES_MAINTENANCE_ADAPTER')
  })
})
describe('actual SQLite Durable Object', () => {
  it('deduplicates requests and rejects a same-key different manifest', async () => {
    const { call } = await setup('idempotency')
    const m = manifest(); const body = { manifest: m, manifestHash: await hash(m) }
    const first = await call('/register', body)
    const duplicate = await call('/register', body)
    expect(first.status).toBe(200); expect(duplicate.body.releaseId).toBe(first.body.releaseId)
    m.opsSha = 'c'.repeat(40)
    expect((await call('/register', { manifest: m, manifestHash: await hash(m) })).body).toMatchObject({ error: 'IDEMPOTENCY_CONFLICT' })
  })
  it('atomically locks conflicts, retains unknown ownership and fences stale transitions', async () => {
    const { call } = await setup('fencing')
    const m = manifest(); await call('/register', { manifest: m, manifestHash: await hash(m) })
    const first = await call('/claim', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0` })
    expect(first.body.generation).toBe(1)
    const later = manifest('release-2', 3); await call('/register', { manifest: later, manifestHash: await hash(later) })
    expect((await call('/claim', { releaseId: later.releaseId, workflowId: `${later.releaseId}-0` })).status).toBe(423)
    expect((await call('/transition', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0`, generation: 0, status: 'blocked' })).body).toMatchObject({ error: 'STALE_GENERATION' })
    await call('/transition', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0`, generation: 1, status: 'blocked', phase: 'reconcile', error: 'UNKNOWN' })
    expect((await call('/claim', { releaseId: later.releaseId, workflowId: `${later.releaseId}-0` })).status).toBe(423)
    expect((await call('/transition', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0`, generation: 1, status: 'failed', effectsSettled: true })).body).toMatchObject({ error: 'RECONCILIATION_REQUIRED' })
    await call('/transition', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0`, generation: 1, status: 'recovering' })
    await call('/transition', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0`, generation: 1, status: 'recovered', effectsSettled: true })
    expect((await call('/claim', { releaseId: later.releaseId, workflowId: `${later.releaseId}-0` })).body.generation).toBe(2)
  })
  it('rejects late old builds and supersedes only before production effects', async () => {
    const { call } = await setup('batch')
    const old = manifest(); const next = manifest('release-2', 3)
    await call('/register', { manifest: old, manifestHash: await hash(old) })
    await call('/register', { manifest: next, manifestHash: await hash(next) })
    expect((await call(`/get?id=${old.releaseId}`)).body.status).toBe('superseded')
    const late = manifest('late', 2)
    expect((await call('/register', { manifest: late, manifestHash: await hash(late) })).body).toMatchObject({ error: 'LATE_OLD_BUILD' })
  })
  it('durably stores a pending Workflow start before an alarm runs', async () => {
    const { stub, call } = await setup('outbox')
    const m = manifest(); await call('/register', { manifest: m, manifestHash: await hash(m) })
    await runInDurableObject(stub, async (_instance, state) => {
      const rows = state.storage.sql.exec('SELECT id,started FROM outbox').toArray()
      expect(rows).toEqual([{ id: 'release-1', started: 0 }])
      expect(await state.storage.getAlarm()).not.toBeNull()
    })
    const instance = await introspectWorkflowInstance(bindings.RELEASE_WORKFLOW, 'release-1-0')
    await runDurableObjectAlarm(stub)
    await instance.dispose()
    await runInDurableObject(stub, async (_instance, state) => {
      expect(state.storage.sql.exec('SELECT started FROM outbox').toArray()[0].started).toBe(1)
    })
  })
  it('CAS-fences concurrent resume/recover requests and rejects an old attempt', async () => {
    const { call } = await setup('resume-cas')
    const m = manifest(); await call('/register', { manifest: m, manifestHash: await hash(m) })
    const expectedWorkflowId = `${m.releaseId}-0`
    const outcomes = await Promise.all([
      call('/resume', { releaseId: m.releaseId, expectedWorkflowId }),
      call('/resume', { releaseId: m.releaseId, expectedWorkflowId, recover: true }),
    ])
    expect(outcomes.map(o => o.status).sort()).toEqual([200, 409])
    expect((await call('/claim', { releaseId: m.releaseId, workflowId: expectedWorkflowId })).body).toMatchObject({ error: 'STALE_WORKFLOW_ATTEMPT' })
  })
})
it('requires auth before releasing any production state', async () => {
  const response = await api.fetch(new Request('https://release/v1/accepted'), bindings)
  expect(response.status).toBe(401)
})
it('keeps submission, recovery and executor credentials in separate API roles', async () => {
  const name = 'api-role-isolation', { call } = await setup(name), m = manifest()
  await call('/register', { manifest: m, manifestHash: await hash(m) })
  const configured = { ...bindings, ENVIRONMENT: name, RELEASE_API_TOKEN: 'submission-only', RELEASE_ADMIN_TOKEN: 'recovery-only', EXECUTOR_TOKEN: 'executor-only' }
  const request = (path: string, token: string, method = 'POST') => api.fetch(new Request(`https://release${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) }), configured)
  for (const action of ['resume', 'recover']) {
    const response = await request(`/v1/releases/${m.releaseId}/${action}`, 'submission-only')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: 'ADMIN_REQUIRED' })
    expect((await request(`/v1/releases/not-yet-registered/${action}`, 'submission-only')).status).toBe(403)
  }
  expect((await request('/v1/bootstrap', 'submission-only')).status).toBe(403)
  for (const role of ['submission-only','executor-only']) expect((await request('/v1/bootstrap/mihomo/provider-fetch', role)).status).toBe(403)
  expect((await request(`/v1/releases/${m.releaseId}/backups/main-runtime-a`, 'submission-only', 'GET')).status).toBe(401)
  expect((await request('/v1/accepted', 'executor-only', 'GET')).status).toBe(401)
  expect((await request('/v1/accepted', 'submission-only', 'GET')).status).toBe(200)
  for (const artifact of ['/v1/bootstrap/cloudflared/2026.10.3/linux-amd64', '/v1/bootstrap/mihomo/v1.19.33/linux-amd64-compatible.gz']) {
  expect((await request(artifact, 'submission-only', 'GET')).status).toBe(401)
  expect((await request(artifact, 'submission-only', 'PUT')).status).toBe(403)
  expect((await request(artifact, 'executor-only', 'PUT')).status).toBe(403)
  }
  expect((await call(`/get?id=${m.releaseId}`)).body).toMatchObject({ workflowId: `${m.releaseId}-0`, generation: 0, status: 'queued' })
})
it('never commits an outbox intent if its durable alarm could not be armed', async () => {
  let committed = false
  const context = { ctx: { storage: {
    setAlarm: async () => { throw new Error('injected storage failure') },
    transactionSync: () => { committed = true },
  } } }
  const response = await Reflect.apply(ReleaseLedger.prototype.fetch, context, [new Request('https://ledger/register', { method: 'POST', body: JSON.stringify({ manifest: manifest() }) })])
  expect(response.status).toBe(500)
  expect(committed).toBe(false)
})
it('classifies a real transport authentication response without retrying it', async () => {
  fetchMock.activate(); fetchMock.disableNetConnect()
  fetchMock.get('https://api.cloudflare.com').intercept({ path: '/client/v4/accounts/test-account/workers/scripts/lingxiloop-web/versions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', method: 'GET' }).reply(403, '{}')
  try {
    await expect(prepareWorker({ ...bindings, WORKER_NAMES_JSON: '["lingxiloop-web"]', CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_API_TOKEN: 'test-token' }, target())).rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
    fetchMock.assertNoPendingInterceptors()
  } finally { fetchMock.deactivate() }
})
it('rejects a credential-bearing upstream redirect instead of following it', async () => {
  fetchMock.activate(); fetchMock.disableNetConnect()
  fetchMock.get('https://api.cloudflare.com').intercept({ path: /\/versions\//, method: 'GET' }).reply(302, '', { headers: { location: 'https://untrusted.invalid/' } })
  try {
    await expect(prepareWorker({ ...bindings, WORKER_NAMES_JSON: '["lingxiloop-web"]', CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_API_TOKEN: 'test-token' }, target())).rejects.toMatchObject({ code: 'REMOTE_HTTP_302' })
    fetchMock.assertNoPendingInterceptors()
  } finally { fetchMock.deactivate() }
})

// Exercise the actual Workflow control code with real DO persistence while
// making waits immediate. Remote responses are fault-injected, not claimed as
// live Cloudflare or host qualification.
const immediateSteps = {
  do: async (_name: string, _config: unknown, callback: () => Promise<string>) => callback(),
  sleep: async () => {},
} as unknown as WorkflowStep
async function execute(name: string, releaseId: string, attempt = 0, overrides: Partial<ReleaseEnv> = {}, steps = immediateSteps) {
  const context = { env: { ...bindings, ENVIRONMENT: name, ...overrides } }
  const event = { instanceId: `${releaseId}-${attempt}`, payload: { releaseId, attempt } } as WorkflowEvent<{ releaseId: string; attempt: number }>
  return Reflect.apply(ReleaseWorkflow.prototype.run, context, [event, steps])
}
it('retains the previous generation when resumed preparation gets an auth failure', async () => {
  const { call } = await setup('resumed-auth-failure')
  const m = manifest(); await call('/register', { manifest: m, manifestHash: await hash(m) })
  await call('/claim', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0` })
  await call('/transition', { releaseId: m.releaseId, workflowId: `${m.releaseId}-0`, generation: 1, status: 'blocked', phase: 'reconcile' })
  await call('/resume', { releaseId: m.releaseId, expectedWorkflowId: `${m.releaseId}-0` })
  fetchMock.activate(); fetchMock.disableNetConnect()
  fetchMock.get('https://api.cloudflare.com').intercept({ path: /\/versions\// }).reply(403, '{}')
  try {
    const result = await execute('resumed-auth-failure', m.releaseId, 1, { WORKER_NAMES_JSON: '["lingxiloop-web"]' })
    expect(result, JSON.stringify(result)).toMatchObject({ status: 'blocked', error: 'AUTHENTICATION_FAILED' })
    expect((await call(`/get?id=${m.releaseId}`)).body).toMatchObject({ generation: 1, status: 'blocked' })
  } finally { fetchMock.deactivate() }
})
it('reconciles a committed claim whose response was lost without unlocking it', async () => {
  const name = 'lost-claim-response'; const { stub, call } = await setup(name)
  const m = manifest(); await call('/register', { manifest: m, manifestHash: await hash(m) })
  const wrapped = { getByName: () => ({ fetch: async (request: Request) => {
    const response = await stub.fetch(request)
    if (new URL(request.url).pathname === '/claim') { await response.body?.cancel(); return Response.json({ error: 'OPERATION_OUTCOME_UNKNOWN' }, { status: 503 }) }
    return response
  } }) } as unknown as DurableObjectNamespace
  // This case starts after successful online preparation. The network
  // failure under test is exclusively the committed claim response.
  const steps = { ...immediateSteps, do: async (stepName: string, _config: unknown, callback: () => Promise<string>) => stepName === 'prepare-main-frontend' ? JSON.stringify({ ok: true, value: {} }) : callback() } as unknown as WorkflowStep
  const result = await execute(name, m.releaseId, 0, { RELEASES: wrapped }, steps)
  expect(result, JSON.stringify(result)).toMatchObject({ status: 'blocked' })
  expect((await call(`/get?id=${m.releaseId}`)).body).toMatchObject({ generation: 1, status: 'blocked' })
})

it.each(['drain', 'apply'] as const)('uses exact-source recovery only before a %s failure can have changed artifacts', async failure => {
  const name = `source-abort-${failure}`, stub = await controlledLedger(name)
  const call = async (path: string, body?: unknown) => {
    const response = await stub.fetch(new Request(`https://ledger${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }))
    expect(response.ok).toBe(true)
    return response.json() as Promise<ReleaseRecord>
  }
  const runtime = { ...target(), adapter: 'main-runtime' as const, resources: ['main-runtime', 'main-db'],
    artifact: { kind: 'image' as const, digest: `sha256:${'a'.repeat(64)}` }, hostPlan: { mode: 'maintenance' } }
  const m = manifest(`abort-${failure}`)
  m.targets = { 'main-runtime-a': { ...runtime, hosts: ['a'] }, 'main-runtime-b': { ...runtime, hosts: ['b'] } }
  await call('/bootstrap', { accepted: { releaseId: 'baseline', components: Object.fromEntries(Object.entries(m.targets).map(([id, t]) => [id, { ...t, releaseId: 'baseline', appSha: '0'.repeat(40), sequence: 1 }])) },
    evidence: { zeroInFlight: true, receiptKey: 'handoff/verified.json', handoffId: 'handoff-495', observedAt: new Date().toISOString() } })
  await call('/register', { manifest: m, manifestHash: await hash(m) })
  const phases: string[] = []
  const steps = { ...immediateSteps, do: async (stepName: string, _config: unknown, callback: () => Promise<string>) => {
    if (/^manifest-/.test(stepName) || /^verify-recovery-/.test(stepName)) return JSON.stringify({ ok: true, value: {} })
    const phase = /^main-runtime-[ab]-[ab]-(.+)-submit$/.exec(stepName)?.[1]
    if (phase) {
      phases.push(phase)
      return JSON.stringify({ ok: true, value: { operation: { status: phase === failure ? 'failed' : 'succeeded' }, deadline: Date.now() + 30_000 } })
    }
    return callback()
  } } as unknown as WorkflowStep
  const result = await execute(name, m.releaseId, 0, {}, steps)
  expect(result).toMatchObject({ status: 'recovered' })
  const source = failure === 'drain'
  expect(phases).toContain(source ? 'restore-source' : 'recover')
  expect(phases).toContain(source ? 'source-undrain' : 'recovery-undrain')
  expect(phases).not.toContain(source ? 'recover' : 'restore-source')
  if (source) expect(phases).not.toContain('apply')
  expect((await call(`/get?id=${m.releaseId}`)).targets.recovery).toEqual({ direction: source ? 'source' : 'compatible-recovery' })
})

it('retries a sanitized read-only probe body failure within its fixed budget without repeating completed host mutations', async () => {
  const name = 'readonly-probe-retry', stub = await controlledLedger(name)
  const call = async (path: string, body?: unknown) => {
    const response = await stub.fetch(new Request(`https://ledger${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }))
    expect(response.ok).toBe(true); return response.json() as Promise<ReleaseRecord>
  }
  const runtime = { ...target(), adapter: 'main-runtime' as const, resources: ['main-runtime', 'main-db'], artifact: { kind: 'image' as const, digest: `sha256:${'a'.repeat(64)}` }, hostPlan: { mode: 'maintenance' } }
  const m = manifest('readonly-probe-retry'); m.targets = { 'main-runtime-a': { ...runtime, hosts: ['a'] }, 'main-runtime-b': { ...runtime, hosts: ['b'] } }
  await call('/bootstrap', { accepted: { releaseId: 'baseline', components: Object.fromEntries(Object.entries(m.targets).map(([id, t]) => [id, { ...t, releaseId: 'baseline', appSha: '0'.repeat(40), sequence: 1 }])) }, evidence: { zeroInFlight: true, receiptKey: 'handoff/verified.json', handoffId: 'handoff-495', observedAt: new Date().toISOString() } })
  await call('/register', { manifest: m, manifestHash: await hash(m) })
  const phases: string[] = [], steps = { ...immediateSteps, do: async (stepName: string, _config: unknown, callback: () => Promise<string>) => {
    if (/^manifest-/.test(stepName)) return JSON.stringify({ ok: true, value: {} })
    if (/^main-runtime-[ab]-[ab]-.+-submit$/.test(stepName)) { phases.push(stepName); return JSON.stringify({ ok: true, value: { operation: { status: 'succeeded' }, deadline: Date.now() + 30_000 } }) }
    return callback()
  } } as unknown as WorkflowStep
  fetchMock.activate(); fetchMock.disableNetConnect()
  const probes = fetchMock.get('https://readonly-probe.example')
  probes.intercept({ path: '/ready', method: 'GET' }).reply(200, 'lost/truncated JSON')
  probes.intercept({ path: '/ready', method: 'GET' }).reply(200, { ready: true }).times(2)
  probes.intercept({ path: '/business', method: 'GET' }).reply(200, '{}').times(2)
  try {
    const result = await execute(name, m.releaseId, 0, { PROBES_JSON: JSON.stringify({ ready: { url: 'https://readonly-probe.example/ready', status: 200, json: { ready: true } }, login: { url: 'https://readonly-probe.example/business', status: 200 } }) }, steps)
    expect(result).toMatchObject({ status: 'accepted' }); expect(phases).toHaveLength(10); expect(new Set(phases).size).toBe(10)
    fetchMock.assertNoPendingInterceptors()
  } finally { fetchMock.deactivate() }
})

it.each(['accepted', 'recovered', 'capacity', 'pending', 'expired'] as const)('bounded host waiting preserves %s execution and the existing lock/mutation rules', async mode => {
  const name = `host-wait-${mode}`, stub = await controlledLedger(name)
  const call = async (path: string, body?: unknown) => {
    const response = await stub.fetch(new Request(`https://ledger${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }))
    expect(response.ok).toBe(true); return response.json() as Promise<ReleaseRecord>
  }
  const runtime = { ...target(), adapter: 'main-runtime' as const, resources: ['main-runtime', 'main-db'], artifact: { kind: 'image' as const, digest: `sha256:${'a'.repeat(64)}` }, hostPlan: { mode: 'maintenance' } }
  const m = manifest(name); m.policy = { drainSeconds: 90, retryLimit: 2 }; m.targets = { 'main-runtime-a': { ...runtime, hosts: ['a'] }, 'main-runtime-b': { ...runtime, hosts: ['b'] } }
  await call('/bootstrap', { accepted: { releaseId: 'baseline', components: Object.fromEntries(Object.entries(m.targets).map(([id, t]) => [id, { ...t, releaseId: 'baseline', appSha: '0'.repeat(40), sequence: 1 }])) }, evidence: { zeroInFlight: true, receiptKey: 'handoff/verified.json', handoffId: 'handoff-495', observedAt: new Date().toISOString() } })
  await call('/register', { manifest: m, manifestHash: await hash(m) })
  const operations = new Map<string, { key: string; status: string }>(), writes: string[] = [], waits: { key: string; seconds: number }[] = [], sleeps: string[] = []
  let recovering = false, capacityAttempts = 0
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === 'probe.test') {
      if (mode === 'capacity') { capacityAttempts++; throw Error('Too many subrequests.') }
      if (mode === 'recovered' && !recovering && url.pathname === '/business') return new Response(null, { status: 500 })
      return Response.json({ ready: true })
    }
    if (url.pathname === '/manifests') return Response.json({ registered: true })
    expect(url.pathname).toBe('/operations')
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)), key = `${body.releaseId}:${body.target}:${body.phase}`
      expect(operations.has(key)).toBe(false); expect(body.generation).toBe(body.phase === 'prepare' ? 0 : 1)
      writes.push(key); recovering ||= body.phase === 'recovery-drain'; const op = { key, status: 'running' }; operations.set(key, op); return Response.json(op)
    }
    const key = url.searchParams.get('key')!, op = operations.get(key)
    if (!op) return new Response(null, { status: 404 })
    if (url.searchParams.has('waitSeconds')) {
      const seconds = Number(url.searchParams.get('waitSeconds')); expect(seconds).toBeGreaterThan(0); expect(seconds).toBeLessThanOrEqual(45); waits.push({ key, seconds })
      if (!(mode === 'pending' && key.endsWith(':apply'))) op.status = 'succeeded'
    }
    return Response.json(op)
  })
  const steps = { ...immediateSteps, sleep: async (stepName: string) => { sleeps.push(stepName) }, do: async (stepName: string, _config: unknown, callback: () => Promise<string>) => {
    const output = await callback()
    if (mode === 'expired' && stepName.endsWith('-apply-submit')) { const body = JSON.parse(output); body.value.deadline = Date.now() - 1; return JSON.stringify(body) }
    return output
  } } as unknown as WorkflowStep
  try {
    const result = await execute(name, m.releaseId, 0, { EXECUTORS_JSON: JSON.stringify({ a: 'https://host-a.test', b: 'https://host-b.test' }), PROBES_JSON: JSON.stringify({ ready: { url: 'https://probe.test/ready', status: 200 }, login: { url: 'https://probe.test/business', status: 200 } }) }, steps)
    expect(result).toMatchObject({ status: mode === 'accepted' || mode === 'recovered' ? mode : 'blocked' })
    expect(new Set(writes).size).toBe(writes.length); expect(sleeps).toEqual(['bounded-candidate-batch'])
    if (mode === 'accepted' || mode === 'recovered' || mode === 'capacity') { expect(writes).toHaveLength(mode === 'recovered' ? 16 : 10); expect(waits).toHaveLength(writes.length) }
    if (mode === 'capacity') { expect(result).toMatchObject({ error: 'WORKFLOW_SUBREQUEST_LIMIT' }); expect(capacityAttempts).toBe(1); expect(recovering).toBe(false) }
    if (mode === 'pending') expect(waits.filter(w => w.key.endsWith(':apply'))).toHaveLength(2)
    if (mode === 'expired') { expect(waits.some(w => w.key.endsWith(':apply'))).toBe(false); expect(result).toMatchObject({ error: 'OPERATION_WAIT_BUDGET_UNKNOWN' }) }
    if (['capacity', 'pending', 'expired'].includes(mode)) {
      const record = await call(`/get?id=${m.releaseId}`); expect(record.generation).toBe(1); expect(record.status).toBe('blocked'); expect(recovering).toBe(false)
      await runInDurableObject(stub, async (_instance, state) => { expect(state.storage.sql.exec('SELECT * FROM locks').toArray().length).toBeGreaterThan(0) })
    }
  } finally { spy.mockRestore() }
})
