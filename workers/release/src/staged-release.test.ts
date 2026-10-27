import { env, runInDurableObject } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { hash, type Accepted, type Manifest, type Target } from '../../../shared/release/protocol'
import { ReleaseWorkflow } from './workflow'
import { ReleaseLedger } from './ledger'
import { STAGE_REQUEST_LIMIT, forwardStages } from './stages'
import type { ReleaseEnv, ReleaseRecord } from './types'

const bindings = env as unknown as ReleaseEnv
const contract = { nativeSchema: 14, productSchema: 57, api: 'v1', worker: '3.8.12', checkpoint: '3.8.12', control: 'v1', capabilities: ['case-soft-delete-filter'] }
function fixture(id: string): Manifest {
  const artifact = { kind: 'image' as const, digest: `sha256:${'a'.repeat(64)}` }
  const target: Target = { adapter: 'main-runtime', resources: ['main-runtime', 'main-db'], dependsOn: [], fromReleaseId: 'baseline', hosts: ['a'], artifact, contract,
    configuration: { version: 'v1', secretRefs: [], volumes: { data: 'retained' } }, verification: { readiness: ['ready'], businessProbe: 'login' }, hostPlan: { mode: 'maintenance' }, recovery: { artifact, contract } }
  return { version: 1, releaseId: id, appSha: 'a'.repeat(40), opsSha: 'b'.repeat(40), sourceReleaseId: 'baseline', sequence: 2,
    createdAt: new Date().toISOString(), checks: { commit: 'a'.repeat(40), conclusion: 'success', runId: '123' }, policy: { drainSeconds: 90, retryLimit: 1 },
    targets: { 'main-runtime-a': target, 'main-runtime-b': { ...target, hosts: ['b'] } } }
}
const immediate = { do: async (_name: string, _options: unknown, callback: () => Promise<string>) => callback(), sleep: async () => {} } as unknown as WorkflowStep
async function setup(name: string, withWorker = false) {
  const stub = bindings.RELEASES.getByName(name)
  await runInDurableObject(stub, async (_instance, state) => {
    const arm = state.storage.setAlarm.bind(state.storage)
    state.storage.setAlarm = (_time, options) => arm(Date.now() + 86_400_000, options)
  })
  const call = async <T = ReleaseRecord>(path: string, body?: unknown) => {
    const response = await stub.fetch(new Request(`https://ledger${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) }))
    const value = await response.json() as T
    if (!response.ok) throw Object.assign(new Error((value as { error: string }).error), { code: (value as { error: string }).error })
    return value
  }
  const manifest = fixture(name)
  if (withWorker) {
    const artifact = { kind: 'worker' as const, workerName: 'lingxiloop-web', versionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', hash: `sha256:${'a'.repeat(64)}` }
    manifest.targets['main-frontend'] = { ...manifest.targets['main-runtime-a']!, adapter: 'web-static', resources: ['main-frontend'], hosts: [], dependsOn: ['main-runtime-a', 'main-runtime-b'], artifact, hostPlan: undefined, recovery: { artifact: { ...artifact, versionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }, contract } }
  }
  const accepted: Accepted = { releaseId: 'baseline', components: Object.fromEntries(Object.entries(manifest.targets).map(([key, value]) => [key, { ...value, releaseId: 'baseline', appSha: '0'.repeat(40), sequence: 1 }])) }
  await call('/bootstrap', { accepted, evidence: { zeroInFlight: true, receiptKey: 'handoff/verified.json', handoffId: '495', observedAt: new Date().toISOString() } })
  await call('/register', { manifest, manifestHash: await hash(manifest) })
  const runtimeEnv: ReleaseEnv = { ...bindings, ENVIRONMENT: name, CONTROLLER_OPS_SHA: manifest.opsSha,
    WORKER_NAMES_JSON: '["lingxiloop-web"]', CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_API_TOKEN: 'test-token',
    EXECUTORS_JSON: JSON.stringify({ a: 'https://host-a.test', b: 'https://host-b.test' }),
    PROBES_JSON: JSON.stringify({ ready: { url: 'https://probe.test/ready', status: 200 }, login: { url: 'https://probe.test/login', status: 200 } }) }
  const get = () => call(`/get?id=${name}`)
  const execute = async () => {
    const record = await get()
    return Reflect.apply(ReleaseWorkflow.prototype.run, { env: runtimeEnv }, [{ instanceId: record.workflowId, payload: { releaseId: name, attempt: 0 } } as WorkflowEvent<{ releaseId: string; attempt: number }>, immediate])
  }
  return { stub, call, manifest, get, execute, runtimeEnv }
}
afterEach(() => vi.restoreAllMocks())

it('explicit source recovery reuses the completed original maintenance drain without renewing deadlines',async()=>{
 const {qualifyDrainedSourceRecovery}=await import('./stages')
 const state=await setup('reuse-completed-source-drain'),first=await state.get(),owner={releaseId:first.releaseId,workflowId:first.workflowId}
 await state.call('/initialize',owner);await state.call('/claim',owner)
 await runInDurableObject(state.stub,async(_instance,storage)=>{
  const row=storage.storage.sql.exec('SELECT data FROM releases WHERE id=?',first.releaseId).toArray()[0]
  const r=JSON.parse(row.data as string) as ReleaseRecord,cp=r.checkpoint!
  r.status='blocked';cp.direction='source';cp.changed=['main-runtime-a','main-runtime-b'];cp.mutationSubmitted=false
  cp.plan=[{key:'recovery-isolate',kind:'host',targets:cp.changed,phase:'source-drain'},{key:'recover-a',kind:'host',targets:['main-runtime-a'],phase:'restore-source',recovery:true}];cp.index=0
  cp.deadlines={expired:1};cp.requests={'recovery-isolate':3}
  for(const id of cp.changed)for(const host of r.manifest.targets[id]!.hosts)r.targets[`${id}:${host}:drain`]={key:`${r.releaseId}:${id}:drain`,releaseId:r.releaseId,target:id,phase:'drain',generation:r.generation,manifestHash:r.manifestHash,status:'succeeded',operationId:'original-'+id,result:{drained:true,mode:'maintenance'},steps:[{name:'stop:worker',status:'completed',sideEffect:true}]}
  storage.storage.sql.exec('UPDATE releases SET data=? WHERE id=?',JSON.stringify(r),r.releaseId)
 })
 const before=await state.get(),cp=before.checkpoint!
 expect(qualifyDrainedSourceRecovery(before.manifest,cp,before.targets,before.manifestHash,before.generation)).toBe(true)
 for(const change of ['mutation','direction','missing-peer','unknown','identity','step']){
  const v=structuredClone(before)
  if(change==='mutation')v.checkpoint!.mutationSubmitted=true
  if(change==='direction')v.checkpoint!.direction='compatible-recovery'
  if(change==='missing-peer')delete v.targets['main-runtime-b:b:drain']
  const op=v.targets['main-runtime-a:a:drain'] as Record<string,unknown>
  if(change==='unknown')op.status='uncertain'
  if(change==='identity')op.generation=before.generation+1
  if(change==='step')op.steps=[{name:'stop:worker',status:'intent',sideEffect:true}]
  expect(qualifyDrainedSourceRecovery(v.manifest,v.checkpoint!,v.targets,v.manifestHash,v.generation)).toBe(false)
 }
 const after=await state.call('/resume',{releaseId:before.releaseId,expectedWorkflowId:before.workflowId,recover:true})
 expect(after.checkpoint!.plan[0].phase).toBe('restore-source')
 expect(after.checkpoint!.deadlines).toEqual(cp.deadlines);expect(after.checkpoint!.requests).toEqual(cp.requests)
 expect(after.checkpoint!.sourceDrainReuse).toEqual({stage:'recovery-isolate',generation:before.generation,operationKeys:[`${before.releaseId}:main-runtime-a:drain`,`${before.releaseId}:main-runtime-b:drain`]})
})

function network(mode: 'accepted' | 'recovered' | 'unknown' | 'auth' | 'source' | 'peer-unknown' = 'accepted') {
  const operations = new Map<string, Record<string, unknown>>()
  const writes: string[] = [], reads: string[] = [], workerWrites: string[] = []
  let currentWorker = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', lostWorkerReply = false
  let probeFailed = false, perInstance = 0
  const counts: number[] = []
  const nextInstance = () => { if (perInstance) counts.push(perInstance); perInstance = 0 }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (++perInstance > 50) throw new Error('Too many subrequests.')
    const url = new URL(String(input)), method = init?.method ?? 'GET'
    if (url.host === 'api.cloudflare.com') {
      if (method === 'POST') {
        currentWorker = JSON.parse(init!.body as string).versions[0].version_id
        workerWrites.push(currentWorker)
        if (!lostWorkerReply) { lostWorkerReply = true; throw new TypeError('lost deployment reply') }
      }
      return Response.json({ success: true, result: { deployments: [{ versions: [{ version_id: currentWorker, percentage: 100 }] }] } })
    }
    if (url.host === 'probe.test') {
      if (mode === 'recovered' && !probeFailed) { probeFailed = true; return new Response('', { status: 500 }) }
      return new Response('{}', { status: 200 })
    }
    if (url.pathname === '/manifests') return Response.json({ registered: true })
    if (method === 'POST') {
      const body = JSON.parse(init!.body as string), key = `${body.releaseId}:${body.target}:${body.phase}`
      if (writes.includes(key)) throw new Error(`duplicate mutation ${key}`)
      writes.push(key)
      const op = { ...body, key, operationId: `operation-${writes.length}`, status: 'running' }
      operations.set(key, op)
      return Response.json(op)
    }
    const key = url.searchParams.get('key')!; reads.push(key)
    if (mode === 'auth' && key.endsWith(':apply')) return new Response('', { status: 403 })
    const op = operations.get(key)
    if (!op) return new Response('', { status: 404 })
    if (mode === 'peer-unknown' && key.includes(':main-runtime-b:drain')) throw new TypeError('peer lost')
    if (['source', 'peer-unknown'].includes(mode) && key.includes(':main-runtime-a:drain')) { op.status = 'failed'; return Response.json(op) }
    if (mode === 'unknown' && key.endsWith(':apply')) throw new TypeError('network lost')
    op.status = 'succeeded'
    return Response.json(op)
  })
  return { writes, reads, counts, nextInstance, operations, workerWrites }
}
async function untilTerminal(state: Awaited<ReturnType<typeof setup>>, net: ReturnType<typeof network>) {
  for (let n = 0; n < 50; n++) {
    net.nextInstance()
    const result = await state.execute()
    if (['accepted', 'recovered', 'failed', 'blocked'].includes(result.status)) { net.nextInstance(); return result }
  }
  throw new Error('unbounded stage chain')
}
describe('production staged Workflow with actual SQLite ledger', () => {
  it('starts both independent preparations before either finishes, and drains only after both succeed',async()=>{
    const state=await setup('parallel-prepare'),net=network(),original=globalThis.fetch
    let prepared=0,release!:()=>void
    const bothStarted=new Promise<void>(resolve=>{release=resolve})
    vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
      if(init?.method==='POST'&&new URL(String(input)).pathname==='/operations'){
        const body=JSON.parse(init.body as string)
        if(body.phase==='prepare'){prepared++;if(prepared===2)release();await bothStarted}
        if(body.phase==='drain')expect(prepared).toBe(2)
      }
      return original(input,init)
    })
    expect((await untilTerminal(state,net)).status).toBe('accepted')
    expect(net.writes.filter(key=>key.endsWith(':prepare'))).toHaveLength(2)
    expect(Math.max(...net.counts)).toBeLessThanOrEqual(STAGE_REQUEST_LIMIT)
  })
  it('persists retry allowance and stage timing across replay and administrator resume', async () => {
    const state = await setup('retry-timing'), first = await state.get(), owner = { releaseId: first.releaseId, workflowId: first.workflowId }
    await state.call('/initialize', owner)
    const body = { ...owner, stage: 'batch', key: 'read', error: 'EXECUTOR_QUERY_UNAVAILABLE' }
    await state.call('/retry-permit', body)
    await expect(state.call('/retry-permit', body)).rejects.toMatchObject({ code: 'RETRY_BUDGET_EXHAUSTED' })
    const before = (await state.get()).checkpoint!
    expect(before.timings!.batch.startedAt).toBeGreaterThanOrEqual(before.timings!.batch.queuedAt)
    const resumed = await state.call('/resume', { releaseId: first.releaseId, expectedWorkflowId: first.workflowId })
    await state.call('/initialize', { ...owner, workflowId: resumed.workflowId })
    await expect(state.call('/retry-permit', { ...body, workflowId: resumed.workflowId })).rejects.toMatchObject({ code: 'RETRY_BUDGET_EXHAUSTED' })
    expect((await state.get()).checkpoint!.timings!.batch.startedAt).toBe(before.timings!.batch.startedAt)
    expect((await state.get()).manualInterventions).toBe(1)
  })
  it('stops a repeatedly unavailable provider with explicit unknown outcome and no replacement identity', async () => {
    const state = await setup('bounded-outbox'), first = await state.get()
    await runInDurableObject(state.stub, async (instance, storage) => {
      const holder = instance as unknown as { env: ReleaseEnv }, original = holder.env
      let creates = 0
      holder.env = { ...original, RELEASE_WORKFLOW: { create: async () => { creates++; throw Error('unavailable') }, get: async () => { throw Error('unavailable') } } as unknown as ReleaseEnv['RELEASE_WORKFLOW'] }
      try {
        for (let n = 0; n < 25; n++) await Reflect.apply(ReleaseLedger.prototype.alarm, instance, [])
        const record = JSON.parse(storage.storage.sql.exec('SELECT data FROM releases WHERE id=?',first.releaseId).toArray()[0].data as string) as ReleaseRecord
        expect(creates).toBe(20); expect(record.status).toBe('blocked'); expect(record.error).toBe('WORKFLOW_DISPATCH_BUDGET_UNKNOWN')
        expect(record.workflowId).toBe(first.workflowId); expect(record.dispatch!.attempts).toBe(20)
      } finally { holder.env = original }
    })
  })
  it('does not retry provider authorization denial or a quota exception', async () => {
    for (const error of [Object.assign(Error('denied'), { status: 403 }), Error('Too many subrequests.')]) {
      const state = await setup(`dispatch-denied-${error.message.startsWith('denied')}`)
      await runInDurableObject(state.stub, async (instance) => {
        const holder = instance as unknown as { env: ReleaseEnv }, original = holder.env
        let calls = 0
        holder.env = { ...original, RELEASE_WORKFLOW: { create: async () => { calls++; throw error }, get: async () => { throw Error('must not query after denial') } } as unknown as ReleaseEnv['RELEASE_WORKFLOW'] }
        try {
          for (let n = 0; n < 3; n++) await Reflect.apply(ReleaseLedger.prototype.alarm, instance, [])
          expect(calls).toBe(1)
        } finally { holder.env = original }
      })
      expect((await state.get()).error).toBe('WORKFLOW_DISPATCH_DENIED')
    }
  })
  it.each(['accepted', 'recovered'] as const)('reaches %s across semantic checkpoints under Free, without host replay', async mode => {
    const state = await setup(`staged-${mode}`), net = network(mode)
    const result = await untilTerminal(state, net)
    expect(result.status).toBe(mode)
    expect(net.writes).toHaveLength(mode === 'accepted' ? 10 : 16)
    expect(new Set(net.writes).size).toBe(net.writes.length)
    expect(Math.max(...net.counts)).toBeLessThanOrEqual(STAGE_REQUEST_LIMIT)
    const record = await state.get()
    expect(record.checkpoint!.completed.length).toBeGreaterThan(10)
    expect(Object.values(record.checkpoint!.requests).every(n => n <= STAGE_REQUEST_LIMIT)).toBe(true)
    expect(await bindings.ARTIFACTS.head(`releases/${state.manifest.releaseId}/${mode === 'accepted' ? 'verified' : 'recovered'}.json`)).not.toBeNull()
    await runInDurableObject(state.stub, async (_instance, storage) => expect(storage.storage.sql.exec('SELECT * FROM locks').toArray()).toHaveLength(0))
    if (mode === 'recovered') expect(record.errors.forward).toBe('BUSINESS_PROBE_FAILED')
  })
  it('automatically restores mixed Worker/host targets after a business failure and lost Worker deployment reply', async () => {
    const state = await setup('staged-mixed-recovery', true), net = network('recovered')
    expect((await untilTerminal(state, net)).status).toBe('recovered')
    expect(net.writes).toHaveLength(16)
    expect(net.workerWrites).toEqual(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'])
    const record = await state.get()
    expect(record.targets['main-frontend:activation']).toMatchObject({ versionId: net.workerWrites[0] })
    expect(record.targets['main-frontend:recovery-activation']).toMatchObject({ versionId: net.workerWrites[1] })
    expect(Math.max(...net.counts)).toBeLessThanOrEqual(STAGE_REQUEST_LIMIT)
  })
  it('restores the exact source when a known failure preceded any persistent mutation', async () => {
    const state = await setup('staged-source'), net = network('source')
    expect((await untilTerminal(state, net)).status).toBe('recovered')
    expect(net.writes.some(key => key.endsWith(':apply'))).toBe(false)
    expect(net.writes.filter(key => key.endsWith(':restore-source'))).toHaveLength(2)
    expect((await state.get()).checkpoint!.direction).toBe('source')
  })
  it('does not hide an unknown parallel drain behind its peers known failure', async () => {
    const state = await setup('staged-peer-unknown'), net = network('peer-unknown')
    expect(await untilTerminal(state, net)).toMatchObject({ status: 'blocked', error: 'EXECUTOR_QUERY_UNAVAILABLE' })
    expect(net.writes.some(key => key.includes('recover') || key.includes('source-drain') || key.endsWith(':apply'))).toBe(false)
  })
  it.each(['unknown', 'auth'] as const)('retains locks on %s with no speculative recovery', async mode => {
    const state = await setup(`staged-${mode}`), net = network(mode)
    expect((await untilTerminal(state, net)).status).toBe('blocked')
    expect(net.writes.some(key => key.includes('recover'))).toBe(false)
    await runInDurableObject(state.stub, async (_instance, storage) => expect(storage.storage.sql.exec('SELECT * FROM locks').toArray().length).toBeGreaterThan(0))
  })
  it('gives database phases a finite ten-minute window without extending service-drain budgets', async () => {
    for (const phase of ['backup','restore-verify','migrate','drain']) {
      const state=await setup(`database-budget-${phase}`),record=await state.get(),owner={releaseId:record.releaseId,workflowId:record.workflowId}
      await state.call('/initialize',owner)
      await runInDurableObject(state.stub,async (_instance,storage)=>{
        const row=storage.storage.sql.exec('SELECT data FROM releases WHERE id=?',record.releaseId).toArray()[0]
        const value=JSON.parse(String(row.data));value.checkpoint.plan[0]={key:phase,kind:'host',phase,targets:['main-runtime-a']}
        storage.storage.sql.exec('UPDATE releases SET data=? WHERE id=?',JSON.stringify(value),record.releaseId)
      })
      const before=Date.now(),budget=phase==='drain'?90000:600000
      const result=await state.call<{deadline:number}>('/deadline',{...owner,stage:phase,key:'original'})
      expect(result.deadline).toBeGreaterThanOrEqual(before+budget);expect(result.deadline).toBeLessThanOrEqual(Date.now()+budget)
      await state.call('/transition',{...owner,generation:0,status:'blocked',phase:'reconcile'})
      const resumed=await state.call('/resume',{releaseId:record.releaseId,expectedWorkflowId:owner.workflowId}),fresh={...owner,workflowId:resumed.workflowId}
      await state.call('/initialize',fresh)
      expect(await state.call('/deadline',{...fresh,stage:phase,key:'original'})).toEqual(result)
    }
  })
  it('persists the same budget and deadline across resume and fences the old owner', async () => {
    const state = await setup('staged-budget'), record = await state.get(), owner = { releaseId: record.releaseId, workflowId: record.workflowId }
    const initialized = await state.call('/initialize', owner), stage = initialized.checkpoint!.plan[0].key
    const body = { ...owner, stage }
    const deadline = await state.call('/deadline', { ...body, key: 'stable' })
    for (let n = 0; n < STAGE_REQUEST_LIMIT; n++) await state.call('/network-permit', body)
    await expect(state.call('/network-permit', body)).rejects.toMatchObject({ code: 'STAGE_REQUEST_BUDGET_EXHAUSTED' })
    await state.call('/transition', { ...owner, generation: 0, status: 'blocked', phase: 'reconcile' })
    await expect(state.call('/initialize', owner)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
    await expect(state.call('/network-permit', body)).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' })
    const resumed = await state.call('/resume', { releaseId: record.releaseId, expectedWorkflowId: owner.workflowId })
    const fresh = { ...body, workflowId: resumed.workflowId }
    await state.call('/initialize', fresh)
    expect(await state.call('/deadline', { ...fresh, key: 'stable' })).toEqual(deadline)
    await expect(state.call('/network-permit', fresh)).rejects.toMatchObject({ code: 'STAGE_REQUEST_BUDGET_EXHAUSTED' })
    await expect(state.call('/network-permit', body)).rejects.toMatchObject({ code: 'STALE_WORKFLOW_ATTEMPT' })
  })
  it('completes an old admitted release using only read-only probes and the original generation', async () => {
    const state = await setup('legacy-verify-only'), first = await state.get(), owner = { releaseId: first.releaseId, workflowId: first.workflowId }
    const claimed = await state.call('/claim', owner), observations: Record<string, unknown> = {}
    for (const [id, target] of Object.entries(state.manifest.targets)) for (const host of target.hosts) for (const phase of ['prepare', 'drain', 'apply', 'verify', 'undrain']) observations[`${id}:${host}:${phase}`] = {
      operationId: `${id}-${phase}`, key: `${first.releaseId}:${id}:${phase}`, generation: phase === 'prepare' ? 0 : claimed.generation, manifestHash: first.manifestHash, releaseId: first.releaseId, target: id, phase, status: 'succeeded' }
    await state.call('/transition', { ...owner, generation: claimed.generation, status: 'blocked', phase: 'reconcile', targets: observations, error: 'PROBE_QUERY_UNAVAILABLE' })
    state.runtimeEnv.CONTROLLER_OPS_SHA = 'c'.repeat(40)
    await state.call('/resume', { releaseId: first.releaseId, expectedWorkflowId: first.workflowId })
    const net = network()
    expect((await untilTerminal(state, net)).status).toBe('accepted')
    expect(net.writes).toEqual([]); expect(net.reads).toEqual([])
    const final = await state.get()
    expect(final.generation).toBe(claimed.generation)
    expect(final.targets).toMatchObject(observations)
    expect(final.checkpoint!.legacyVerificationOnly).toBe(true)
  })
  it('blocks a stage before the 33rd outbound request without starting a replacement or recovery', async () => {
    const state = await setup('staged-outbound-cap'), record = await state.get(), net = network()
    // Fault-inject a candidate with more named readiness probes than one phase
    // can afford. The trusted probe registry remains unchanged.
    await runInDurableObject(state.stub, async (_instance, storage) => {
      const row = storage.storage.sql.exec('SELECT data FROM releases WHERE id=?', record.releaseId).toArray()[0]
      const value = JSON.parse(row.data as string) as ReleaseRecord
      value.manifest.targets['main-runtime-a']!.verification.readiness = Array.from({ length: 40 }, () => 'ready')
      storage.storage.sql.exec('UPDATE releases SET data=? WHERE id=?', JSON.stringify(value), record.releaseId)
    })
    expect(await untilTerminal(state, net)).toMatchObject({ status: 'blocked', error: 'STAGE_REQUEST_BUDGET_EXHAUSTED' })
    const final = await state.get()
    expect(final.checkpoint!.requests['probe-main-runtime-a']).toBe(STAGE_REQUEST_LIMIT)
    expect(net.writes).toHaveLength(10)
    expect(final.checkpoint!.direction).toBe('forward')
    const workflowId = final.workflowId
    expect((await state.get()).workflowId).toBe(workflowId)
  })
  it('starts the committed successor only after the previous provider instance is terminal; reconciles a lost create', async () => {
    const state = await setup('staged-provider-handoff'), first = await state.get(), owner = { releaseId: first.releaseId, workflowId: first.workflowId }
    const initialized = await state.call('/initialize', owner)
    const next = await state.call('/advance', { ...owner, stage: initialized.checkpoint!.plan[0].key })
    let previousStatus = 'running', creates = 0
    const provider = {
      get: async (id: string) => ({ status: async () => ({ status: id === first.workflowId ? previousStatus : 'complete' }) }),
      create: async ({ id }: { id: string }) => { expect(id).toBe(next.workflowId); creates++; throw new Error('reply lost after commit') },
    }
    await runInDurableObject(state.stub, async (instance, storage) => {
      const holder = instance as unknown as { env: ReleaseEnv }, original = holder.env
      holder.env = { ...original, RELEASE_WORKFLOW: provider as unknown as ReleaseEnv['RELEASE_WORKFLOW'] }
      try {
        await Reflect.apply(ReleaseLedger.prototype.alarm, instance, [])
        expect(creates).toBe(0)
        expect(storage.storage.sql.exec('SELECT started FROM outbox').toArray()[0].started).toBe(0)
        previousStatus = 'complete'
        await Reflect.apply(ReleaseLedger.prototype.alarm, instance, [])
        expect(creates).toBe(1)
        expect(storage.storage.sql.exec('SELECT started FROM outbox').toArray()[0].started).toBe(1)
        await Reflect.apply(ReleaseLedger.prototype.alarm, instance, [])
        expect(creates).toBe(1)
      } finally { holder.env = original }
    })
  })
  it('refuses a legacy upgrade if any exact host receipt is missing', async () => {
    const state = await setup('legacy-incomplete'), first = await state.get(), owner = { releaseId: first.releaseId, workflowId: first.workflowId }
    const claimed = await state.call('/claim', owner)
    await state.call('/transition', { ...owner, generation: claimed.generation, status: 'blocked', phase: 'reconcile', error: 'PROBE_QUERY_UNAVAILABLE' })
    const net = network()
    expect(await state.execute()).toMatchObject({ status: 'blocked', error: 'LEGACY_RECONCILIATION_REQUIRED' })
    expect(net.writes).toEqual([])
  })
})

it('explicit test-data plans skip only backup and isolated restore, keeping drain, migration and verification',()=>{
  const m=fixture('test-data-stage-plan')
  m.targets['main-runtime-a']!.hostPlan!.database={rpo:'test-data-no-backup'}
  const phases=forwardStages(m).map(stage=>stage.phase).filter(Boolean)
  expect(phases).toContain('drain');expect(phases).toContain('migrate');expect(phases).toContain('verify');expect(phases).toContain('undrain')
  expect(phases).not.toContain('backup');expect(phases).not.toContain('restore-verify')
  m.targets['main-runtime-a']!.hostPlan!.database={rpo:'zero-committed-writes'}
  const strict=forwardStages(m).map(stage=>stage.phase)
  expect(strict).toContain('backup');expect(strict).toContain('restore-verify')
})

it('known pre-CAS refusal restores exact source only after the immutable failed host proof; unknown effects never qualify', async () => {
  const {qualifyPreflightSourceRecovery,recoveryStages}=await import('./stages')
  const manifest=fixture('exact-preflight-refusal'),manifestHash=`sha256:${'d'.repeat(64)}`,generation=7
  const checkpoint={protocol:2 as const,plan:[{key:'migrate-main-runtime-a',kind:'host' as const,targets:['main-runtime-a' as const],phase:'migrate'}],index:0,serial:1,changed:['main-runtime-a' as const,'main-runtime-b' as const],mutationSubmitted:true,direction:'forward' as const,requests:{},deadlines:{},completed:[]}
  const op={key:`${manifest.releaseId}:main-runtime-a:migrate`,releaseId:manifest.releaseId,target:'main-runtime-a',phase:'migrate',manifestHash,generation,status:'failed',errors:{forward:{code:'DATABASE_SOURCE_CHANGED'}},steps:[{name:'database:migrate',status:'failed-known'}],result:{complete:false,sourceRestorationOnly:true,migrationExecution:'not-attempted',manifestHash,generation,preflightRefusalObserved:true}}
  const rows={'main-runtime-a:a:migrate':op}
  expect(qualifyPreflightSourceRecovery(manifest,checkpoint,rows,manifestHash,generation)).toBe(true)
  const phases=recoveryStages(manifest,{...checkpoint,sourceRecoveryQualified:true}).map(s=>s.phase)
  expect(phases.filter(p=>p==='restore-source')).toHaveLength(2);expect(phases).not.toContain('recover')
  for(const variant of [{...op,status:'uncertain'},{...op,manifestHash:'wrong'},{...op,steps:[{name:'database:migrate',status:'intent'}]},{...op,result:{...op.result,complete:true}},{...op,result:{...op.result,preflightRefusalObserved:false}},{...op,result:{...op.result,migrationExecution:'unknown'}}])expect(qualifyPreflightSourceRecovery(manifest,checkpoint,{'main-runtime-a:a:migrate':variant},manifestHash,generation)).toBe(false)
  expect(qualifyPreflightSourceRecovery(manifest,{...checkpoint,index:1,plan:[{key:'apply',kind:'host',phase:'apply'},...checkpoint.plan]},rows,manifestHash,generation)).toBe(false)
})
