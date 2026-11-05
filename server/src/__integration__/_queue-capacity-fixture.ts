import assert from 'node:assert/strict'
import { after, before, mock, type TestContext } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createLingxiOS, createLogger, releaseVersions, type ModelCallObservation, type RunIdentity, type RunRecord, type WorkItem } from '@lyyzka/lingxios'
import { createWorker, type HostPort } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { createPermissionService } from '../modules/access/public.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { recordModelCall, runtimeModelConfiguration } from '../agent-runtime/runtime.js'
import { loadLockedRuntimePackage } from '../db/runtime-profile.js'
import { retrieveKnowledgeState } from '../modules/knowledge/runtime.js'
import { OpenNotebookClient, openNotebookClient } from '../modules/knowledge/provider.js'
import { readAdminModelStageCalls, runStageTiming } from '../modules/platform-operations/model-stage-timing.js'
import { agentRunTiming } from '../modules/platform-operations/agent-run-timing.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

// Real PG control/leases, public SDK Worker/quota and product retrieval/ledger.
// HTTP is a loopback provider, not a live model or embedding service. No clock scaling.
const logger = createLogger({ level: 'error', sink: () => {} })
const limit = { maxModelCalls: 4, maxTokens: 100_000, maxCostMicros: 100_000, wallClockMs: 60_000,
  inputCostMicrosPerMillion: 1_000_000, outputCostMicrosPerMillion: 1_000_000 }
let api: Awaited<ReturnType<typeof createLingxiOS>>
let provider: Server, providerUrl: string, homesRoot: string
let scope: { companyId: string; projectId: string; agentId: string }
const principalId = 'test-owner', room = 'capacity-room', sourceId = 'capacity-source'
const originalFetch = globalThis.fetch, oldNotebook = process.env.OPEN_NOTEBOOK_ENABLED
let activeModels = 0, peakModels = 0, searches = 0, abortedSearches = 0
const observations = new Map<string, ModelCallObservation>()
const identities = new Map<string, RunIdentity>()
const workers = new Set<ReturnType<typeof createWorker>>()
const claimsPerRoot = new Map<string, number>()
const retrievalMs = new Map<string, number>()
const firstDurableTextAckAt = new Map<string,number>()
const claimedAt = new Map<string, { at: number; rpcMs: number; worker: string; work: WorkItem }>()
const searchDelayMs = 6_100

before(async () => {
  assert.equal(releaseVersions.runtime, (await loadLockedRuntimePackage()).runtime)
  await ensureSchemaOnce(); await resetAllTables()
  scope = await seedCompanyWithAgent({ companyId: 'capacity-company', agentId: 'capacity-agent' })
  homesRoot = await mkdtemp(join(tmpdir(), 'durable-capacity-653-'))
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group','Synthetic capacity',$4::jsonb)`, [room,scope.companyId,scope.projectId,JSON.stringify([principalId,scope.agentId])])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [room,scope.companyId,JSON.stringify({channelType:2,members:[principalId,scope.agentId]})])
  await pool.query(`INSERT INTO knowledge_notebook_bindings(project_id,company_id,external_key,external_notebook_id,state)
    VALUES($1,$2,'capacity-notebook','capacity-notebook','ready')`, [scope.projectId,scope.companyId])
  await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,conversation_id,title,kind,status,
    visibility_scope,owner_user_id,created_by_user_id,created_via,external_source_id)
    VALUES($1,$2,$3,$4,'Synthetic TCP notes','text','ready','PROJECT',$5,$5,'USER','capacity-external')`,
  [sourceId,scope.companyId,scope.projectId,room,principalId])
  provider = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk
    const input = JSON.parse(body)
    if (request.url === '/v1/chat/completions') {
      const hasEvidence=JSON.stringify(input.messages).includes('CAPACITY_EVIDENCE_PRESENT')
      activeModels++; peakModels = Math.max(peakModels, activeModels)
      try {
        await delay(hasEvidence?80:250)
        assert.ok(input.tools.some((tool:{function:{name:string}})=>tool.function.name==='public_answer'))
        assert.equal(input.tool_choice,'required')
        const call={index:0,id:'capacity-answer',type:'function',function:{name:'public_answer',arguments:JSON.stringify({operation:{kind:'append',supersedes:[]},commentary:'',
          answer:hasEvidence?'[TCP retransmits lost segments.](#cite-S1)':'Synthetic permit result.',outcome:{status:'satisfied',gaps:[]}})}}
        const choice={index:0,...(input.stream?{delta:{role:'assistant',tool_calls:[call]}}:{message:{role:'assistant',tool_calls:[call]}}),finish_reason:'tool_calls'}
        const usage={prompt_tokens:16,completion_tokens:8}
        response.setHeader('content-type',input.stream?'text/event-stream':'application/json')
        response.end(input.stream?`data: ${JSON.stringify({choices:[choice]})}\n\ndata: ${JSON.stringify({choices:[],usage})}\n\ndata: [DONE]\n\n`:JSON.stringify({choices:[choice],usage}))
      } finally { activeModels-- }
      return
    }
    assert.equal(request.url, '/api/search')
    assert.equal(input.company_id, scope.companyId)
    assert.deepEqual(input.source_ids, ['capacity-external'])
    searches++
    const cancelled = new AbortController()
    response.on('close', () => { if (!response.writableFinished) { abortedSearches++; cancelled.abort() } })
    try { await delay(input.type === 'vector' ? searchDelayMs : 10, undefined, { signal: cancelled.signal }) }
    catch { return }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ results: [{ id: 'capacity-chunk', parent_id: 'capacity-external', content: 'TCP retransmits lost segments.' },
      { id: 'private-chunk', parent_id: 'foreign-source', content: 'PRIVATE' }] }))
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  providerUrl = `http://127.0.0.1:${address.port}`
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    assert.equal(url.hostname, '127.0.0.1', 'fixture must never contact a real provider')
    return originalFetch(input, init)
  }
  const notebook = new OpenNotebookClient({ baseUrl: providerUrl, password: 'synthetic-notebook' })
  mock.method(openNotebookClient, 'search', (input: Parameters<OpenNotebookClient['search']>[0]) => notebook.search(input))
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  api = await createLingxiOS({ database: pool, homesRoot, logger, performance: { notifications: true }, modelBudget: limit, responsePolicy:'deep',
    realtime:{async allowPublicText(work,_version,context){
      context.signal.throwIfAborted()
      assert.equal(work.tenantId,scope.companyId);assert.equal(work.principalId,principalId)
      await createPermissionService(context.database as Queryable).assertCan({actorUserId:principalId,companyId:scope.companyId,
        action:'conversation:read',resource:{type:'conversation',id:room}})
      return true
    }},
    contextProvider:{async loadContext(work,signal,options){
      const modelOnly=work.meta?.modelOnly===true
      const frozen=options?.frozenEvidence?.workId===work.id&&options.frozenEvidence.requestVersion===1
      let evidence: Array<{marker:string;sourceId:string;sourceVersion:string;chunkId:string;title:string;excerpt:string;truncated:true}>=[]
      if(!modelOnly&&!frozen){
        const started=performance.now(),searchTimeoutMs=typeof work.meta?.searchTimeoutMs==='number'?work.meta.searchTimeoutMs:undefined
        const retrieval=await retrieveKnowledgeState({companyId:scope.companyId,conversationId:room,authorizationUserId:principalId,
          query:'TCP retransmission',signal,...(searchTimeoutMs===undefined?{}:{searchTimeoutMs})})
        retrievalMs.set(work.id,performance.now()-started)
        assert.equal(retrieval.status,searchTimeoutMs===undefined?'degraded':'matched')
        assert.deepEqual(retrieval.citations.map(c=>[c.sourceId,c.chunkId,c.marker]),[[sourceId,'capacity-chunk','S1']])
        if(searchTimeoutMs===undefined)assert.deepEqual(retrieval.searchFailures,[{type:'vector',code:'search_timeout'}])
        const version=(await pool.query<{version:string}>('SELECT updated_at::text AS version FROM knowledge_sources WHERE id=$1',[sourceId])).rows[0].version
        evidence=retrieval.citations.map(c=>({marker:c.marker,sourceId:c.sourceId,sourceVersion:c.sourceVersion??version,
          chunkId:c.chunkId,title:c.sourceTitle,excerpt:c.excerpt,truncated:true}))
      }
      return{persona:{name:'Synthetic capacity agent',role:'qualification',instructions:modelOnly?'CAPACITY_PERMIT_ONLY':'CAPACITY_EVIDENCE_PRESENT'},
        capabilities:[],evidence,messages:[{ref:work.triggerRef,authorId:principalId,authorName:'Synthetic principal',authorKind:'human' as const,
          body:'Synthetic queue qualification',createdAt:work.createdAt??''}]}
    }},
    onModelCall: async (observation, context) => { await recordModelCall(observation, context); observations.set(observation.callId, observation) } })
})
after(async () => {
  try {
    for (const worker of workers) await worker.stop()
    await api?.stop()
    provider?.closeAllConnections()
    if (provider) await new Promise<void>(resolve => provider.close(() => resolve()))
    await teardownAll()
  } finally {
    mock.restoreAll(); globalThis.fetch = originalFetch
    if (oldNotebook === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = oldNotebook
    if (homesRoot) await rm(homesRoot, { recursive: true, force: true })
  }
})

async function enqueue(id: string, lane: WorkItem['lane'], availableAt?: string, searchTimeoutMs?:number,modelOnly=false) {
  const identity = { runId: id, tenantId: scope.companyId, agentId: scope.agentId, principalId, sessionId: `session-${id}` }
  identities.set(id, identity)
  await api.enqueueJob({ ...identity, id, kind: 'capacity_probe', lane, text: 'Synthetic queue qualification',
    executionClass: lane === 'interactive' ? 'conversation' : 'operation', codeExecution: 'disabled', mode: 'chat',
    meta:{modelOnly,...(searchTimeoutMs===undefined?{}:{searchTimeoutMs})},
    ...(availableAt ? { availableAt } : {}) })
  await bindProductRun(pool, identity, room)
  return identity
}
async function until(check: () => Promise<boolean>, timeout = 10_000) {
  const deadline = performance.now() + timeout
  while (!await check()) { assert.ok(performance.now() < deadline, 'bounded fixture progress'); await delay(50) }
}
const percentile = (values: number[], p: number) => [...values].sort((a,b) => a-b)[Math.ceil(values.length*p)-1]
const distribution = (values: number[]) => ({ n: values.length, p50Ms: percentile(values,.5), p95Ms: percentile(values,.95), maxMs: Math.max(...values) })

function workerFor(name: string, modelSlots = 2, firstClaim?:WorkItem) {
  const claimedUncommitted = new Set<string>()
  let maxClaimedUncommitted = 0, maxClaimedUncommittedBackground = 0
  const worker = createWorker({ controlPlane: { connectWorker(input) {
    const host = api.connectWorker(input)
    const wrapped: HostPort = { ...host, async claimWork(...args) {
      const start = performance.now()
      // The recovery probe hands the same worker its already acquired public
      // lease through runNext; it must not consume a reserved polling slot.
      if(firstClaim){assert.equal(args[1],undefined);assert.equal(args[2],undefined)}
      const work = firstClaim??await host.claimWork(...args)
      firstClaim=undefined
      if (work) {
        claimedAt.set(work.id, { at: Date.now(), rpcMs: performance.now()-start, worker: name, work })
        claimsPerRoot.set(work.id,(claimsPerRoot.get(work.id)??0)+1)
        claimedUncommitted.add(work.id); maxClaimedUncommitted = Math.max(maxClaimedUncommitted,claimedUncommitted.size)
        maxClaimedUncommittedBackground = Math.max(maxClaimedUncommittedBackground,[...claimedUncommitted].filter(id => claimedAt.get(id)?.work.lane === 'background').length)
      }
      return work
    },async emitEvent(work,event,signal){
      await host.emitEvent(work,event,signal)
      if(event.kind==='public.text.delta'&&typeof event.data.text==='string'&&event.data.text.trim()&&!firstDurableTextAckAt.has(work.id)){
        firstDurableTextAckAt.set(work.id,Date.now())
      }
    }, async completeWork(work, result, signal) { await host.completeWork(work,result,signal); claimedUncommitted.delete(work.id) },
    async commitResult(work,message,signal){await host.commitResult(work,message,signal);claimedUncommitted.delete(work.id)} }
    return wrapped
  } }, model:{...runtimeModelConfiguration({id:'deepseek-ai/DeepSeek-V4.1-Flash',apiKey:'synthetic-capacity-key',baseUrl:'https://api.siliconflow.cn/v1'},90_000),
    baseUrl:providerUrl+'/v1',recovery:{maxAttempts:1,totalTimeoutMs:5_000}}, modelBudget: limit, logger, heartbeatMs: 100, resources: { model: modelSlots },
  worker: { id: name, concurrency: 2, reservedInteractiveRuns: 1, pollIdleMs: 10, shutdownGraceMs: 5_000 },
  kernelFactory: () => ({ size: 0, close: () => {}, execute: async () => { throw Error('no Python') } }),
  processors: { capacity_probe:'conversation' } })
  workers.add(worker)
  return { worker, occupancy: () => ({ maxClaimedUncommitted,maxClaimedUncommittedBackground }) }
}

async function load(profile: 'interactive'|'background'|'mixed', variant: 'baseline'|'candidate') {
  const ids: string[] = [], submissionStarted = new Map<string,number>(), terminal = new Map<string,number>()
  for (let i=0;i<20;i++) {
    const id = `${profile}-${variant}-${i}`
    submissionStarted.set(id,Date.now())
    await enqueue(id, profile === 'mixed' ? i%2 ? 'interactive' : 'background' : profile,undefined,variant==='baseline'?90_000:undefined)
    ids.push(id)
  }
  const selected = new Set(ids)
  const pair = [0,1].map(i => workerFor(`${profile}-${variant}-worker-${i}`))
  const initial = (await api.listRuns({ tenantId: scope.companyId, limit: 100 })).items.filter(run => selected.has(run.id))
  assert.equal(initial.filter(run => run.status === 'queued').length,20)
  const started = performance.now()
  let peakEligible = 20, sampledOldestEligibleMs = 0, observedLeased = 0
  const maxObservedActiveRuns=[0,0]
  await Promise.all(pair.map(p => p.worker.start()))
  let rows: RunRecord[] = []
  try {
    await until(async () => {
      pair.forEach((p,i)=>{
        assert.ok(p.worker.activeRuns<=2)
        if(profile==='background')assert.ok(p.worker.activeRuns<=1)
        maxObservedActiveRuns[i]=Math.max(maxObservedActiveRuns[i],p.worker.activeRuns)
      })
      rows = (await api.listRuns({ tenantId: scope.companyId, limit: 100 })).items.filter(run => selected.has(run.id))
      const now = Date.now()
      const eligible = rows.filter(run => run.status === 'queued' && Date.parse(run.availableAt) <= now)
      peakEligible = Math.max(peakEligible,eligible.length)
      sampledOldestEligibleMs = Math.max(sampledOldestEligibleMs,...eligible.map(run => now-Date.parse(run.availableAt)))
      observedLeased = Math.max(observedLeased,rows.filter(run => run.status === 'leased').length)
      for (const run of rows) if (['succeeded','failed','cancelled'].includes(run.status) && !terminal.has(run.id)) terminal.set(run.id,now)
      return terminal.size === 20
    }, 180_000)
    assert.ok(rows.every(run => run.status === 'succeeded'))
  } finally {
    for (const p of pair) { assert.equal((await p.worker.stop()).timedOut,false); workers.delete(p.worker) }
  }
  const samples = []
  await until(async()=> (await pool.query<{n:number}>('SELECT COUNT(*)::int AS n FROM llm_calls WHERE company_id=$1 AND run_id=ANY($2::text[])',[scope.companyId,ids])).rows[0].n===20)
  for (const run of rows) {
    assert.equal(claimsPerRoot.get(run.id),1, 'one native claim per ordinary durable root')
    assert.equal(run.attempts,1)
    const events = await api.readEvents(identities.get(run.id)!,0)
    const state=await api.readRunState(identities.get(run.id)!)
    assert.equal(state?.run.goalOutcome?.status,'satisfied')
    assert.ok(state?.run.resultId)
    assert.match(state?.message?.body??'',/TCP retransmits lost segments/)
    assert.equal((state?.message?.body.match(/TCP retransmits lost segments\./g)??[]).length,1,'one committed substantive answer per root')
    assert.equal(state?.message?.envelope.citations[0]?.sources[0]?.sourceId,sourceId)
    assert.ok(firstDurableTextAckAt.has(run.id),'observe acknowledged public text, not HTTP first byte')
    const model=await readAdminModelStageCalls(pool,identities.get(run.id)!,1)
    assert.equal(model.calls.length,1)
    const stages=runStageTiming(identities.get(run.id)!,1,model,await api.readDiagnostics(identities.get(run.id)!))
    const timing = agentRunTiming(run,{events:events.events,afterSeq:0})
    assert.notEqual(timing.initialEligibleToStartedMs,null)
    assert.equal(timing.endToEndMs,null, 'fixture observation must not become an invented product completion time')
    const claim = claimedAt.get(run.id)!
    samples.push({ lane:claim.work.lane, eligibleToStartedMs:timing.initialEligibleToStartedMs!,
      eligibleToClaimObservedUpperMs:Math.max(0,claim.at-Date.parse(run.availableAt)),claimRpcMs:claim.rpcMs,
      executionMs:run.executionMs, retrievalMs:retrievalMs.get(run.id)!,
      modelPermitWaitMs:stages.calls[0].stages.modelPermitWaitMs??null,modelObservedTotalMs:stages.calls[0].stages.totalMs??null,
      publicationWaitMs:stages.publicationTimings.length===1?stages.publicationTimings[0].publicationWaitMs:null,
      submissionStartedToFirstDurableTextAckMs:firstDurableTextAckAt.get(run.id)!-submissionStarted.get(run.id)!,
      submissionStartedToTerminalObservedMs:terminal.get(run.id)!-submissionStarted.get(run.id)! })
  }
  const observedTotals=samples.flatMap(s=>typeof s.modelObservedTotalMs==='number'?[s.modelObservedTotalMs]:[])
  const summary = { profile,variant,n:20,durationMs:performance.now()-started,
    queue:distribution(samples.map(s=>s.eligibleToStartedMs)),execution:distribution(samples.map(s=>s.executionMs)),
    submissionToTerminalObserved:distribution(samples.map(s=>s.submissionStartedToTerminalObservedMs)),retrieval:distribution(samples.map(s=>s.retrievalMs)),
    submissionToFirstDurableTextAck:distribution(samples.map(s=>s.submissionStartedToFirstDurableTextAckMs)),
    modelObservedTotal:observedTotals.length?distribution(observedTotals):null,
    peakEligible,sampledOldestEligibleMs,observedLeased,tokens:rows.reduce((n,r)=>n+r.tokens,0),
    costMicros:rows.reduce((n,r)=>n+r.costMicros,0),maxObservedActiveRuns,occupancy:pair.map(p=>p.occupancy()),samples }
  assert.ok(summary.occupancy.every(p=>p.maxClaimedUncommitted<=2 && p.maxClaimedUncommittedBackground<=1))
  assert.ok(observedLeased<=4)
  return summary
}

export async function runProfile(profile: 'interactive'|'background'|'mixed', context: TestContext) {
  const baseline = await load(profile,'baseline')
  // Freeze numeric gates after baseline and BEFORE candidate execution.
  // This budget qualifies only the declared 20-root burst and loopback provider.
  const budget = { queueP95Ms:Math.ceil(baseline.queue.p95Ms*.95), submissionToTerminalObservedP95Ms:Math.ceil(baseline.submissionToTerminalObserved.p95Ms*.95),
    executionP95Ms:6_000, successRate:1, maxProviderCallsPerRoot:1 }
  context.diagnostic('durable-capacity-budget/v1 '+JSON.stringify({profile,baseline,budget}))
  const candidate = await load(profile,'candidate')
  assert.ok(candidate.queue.p95Ms<=budget.queueP95Ms,`${profile} queue budget`)
  assert.ok(candidate.execution.p95Ms<=budget.executionP95Ms,`${profile} execution budget`)
  assert.ok(candidate.submissionToTerminalObserved.p95Ms<=budget.submissionToTerminalObservedP95Ms,`${profile} observed terminal budget`)
  await until(async()=>observations.size===40)
  const ledger = (await pool.query<{calls:number;unique_calls:number;corrections:number}>(`SELECT COUNT(*)::int AS calls,
    COUNT(DISTINCT extras->>'callId')::int AS unique_calls,
    COUNT(*) FILTER (WHERE extras->>'operation'='correction')::int AS corrections FROM llm_calls WHERE company_id=$1 AND source='agent-os'`,[scope.companyId])).rows[0]
  assert.deepEqual(ledger,{calls:40,unique_calls:40,corrections:0})
  const perRoot=(await pool.query<{calls:number}>('SELECT COUNT(*)::int AS calls FROM llm_calls WHERE company_id=$1 GROUP BY run_id',[scope.companyId])).rows
  assert.equal(perRoot.length,40)
  assert.ok(perRoot.every(row=>row.calls===1))
  assert.equal(baseline.tokens,candidate.tokens)
  assert.equal(baseline.costMicros,candidate.costMicros)
  assert.ok(peakModels<=4)
  assert.equal(searches,80)
  assert.equal(abortedSearches,20)
  // At-least-once callback delivery cannot double bill a call.
  await recordModelCall(observations.values().next().value!)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM llm_calls WHERE company_id=$1',[scope.companyId])).rows[0].n,40)
  context.diagnostic('durable-capacity/v1 '+JSON.stringify({runtime:releaseVersions.runtime,syntheticProvider:true,persistentPostgres:true,
    profile,clockScale:1,arrival:'20 submitted before workers start per profile/variant',workers:2,taskSlotsPerWorker:2,modelSlotsPerWorker:2,
    reservedInteractivePerWorker:1,terminalObservationPollMs:50,modelCalls:40,corrections:0,searchRequests:searches,abortedSearches,
    provider429:0,providerCircuitFailures:0,realProviderCalls:0,productionWrites:0,originalT15Reproduced:false,budget,baseline,candidate}))
}

export async function permitProbe() {
  const ids = [await enqueue('permit-0','interactive',undefined,undefined,true),await enqueue('permit-1','interactive',undefined,undefined,true)]
  const {worker} = workerFor('permit-worker',1)
  try {
    await worker.start()
    await until(async()=> (await Promise.all(ids.map(id=>api.readRun(id)))).every(run=>run?.status==='succeeded'))
    await until(async()=> (await Promise.all(ids.map(id=>readAdminModelStageCalls(pool,id,1)))).every(value=>value.calls.length===1))
    const calls = (await Promise.all(ids.map(id=>readAdminModelStageCalls(pool,id,1)))).flatMap(value=>value.calls)
    assert.equal(calls.length,2)
    assert.ok(calls.some(call=>(call.stages.modelPermitWaitMs??0)>40),'model permit wait persists separately from queue/attempt duration')
  } finally { await worker.stop();workers.delete(worker) }
}

export async function delayedProbe() {
  const delayed = await enqueue('delayed-0','interactive',new Date(Date.now()+600).toISOString())
  const cancelled = await enqueue('cancelled-0','interactive')
  await api.cancel(cancelled)
  const row = (await api.listRuns({id:delayed.runId})).items[0]
  assert.equal(agentRunTiming(row).queueState,'delayed')
  const host = api.connectWorker({workerId:'delayed-claim',workKinds:['capacity_probe']})
  assert.equal(await host.claimWork(),null)
  await delay(650)
  const work = await host.claimWork();assert.equal(work?.id,delayed.runId)
  await host.completeWork(work!,{status:'failed',error:'Synthetic delayed-claim probe ended without a generated answer'})
  assert.equal((await api.readRun(cancelled))?.status,'cancelled')
  assert.equal(claimsPerRoot.has(cancelled.runId),false)
}

export async function leaseProbe(context:TestContext) {
  const identity = await enqueue('expired-0','background',undefined,undefined,true)
  const oldHost = api.connectWorker({workerId:'abandoned-worker',workKinds:['capacity_probe']})
  const claimed=performance.now()
  const old = await oldHost.claimWork();assert.equal(old?.id,identity.runId)
  const newHost = api.connectWorker({workerId:'replacement-worker',workKinds:['capacity_probe']})
  assert.equal((await oldHost.heartbeat(old!)).ok,true)
  assert.equal(await newHost.claimWork(),null,'a live lease cannot be stolen immediately')
  await delay(1_000)
  assert.equal(await newHost.claimWork(),null,'the observed live lease remains protected')
  let renewed:WorkItem|null = null
  await until(async()=>{renewed=await newHost.claimWork();return renewed!==null},65_000)
  const replacement=renewed as unknown as WorkItem
  const observedClaimToReclaimMs=performance.now()-claimed
  assert.ok(replacement.fence>old!.fence)
  assert.equal(replacement.attempts,2)
  assert.equal((await oldHost.heartbeat(old!)).ok,false)
  await assert.rejects(oldHost.completeWork(old!,{status:'failed',error:'Synthetic stale owner termination probe'}),
    error=>error instanceof Error&&Reflect.get(error,'code')==='lease_lost')
  const {worker}=workerFor('replacement-worker',2,replacement)
  try{assert.equal(await worker.runNext(),true)}finally{await worker.stop();workers.delete(worker)}
  const record=(await api.listRuns({id:identity.runId})).items[0]
  assert.equal(record.status,'succeeded')
  await until(async()=>[...observations.values()].some(value=>value.workId===identity.runId))
  assert.equal(agentRunTiming(record).initialEligibleToStartedMs,null,'recovered attempt cannot inherit an invented first queue wait')
  context.diagnostic('durable-lease/v1 '+JSON.stringify({observedClaimToReclaimMs,protectedObservationWindowMs:1_000,
    exactPublicLeaseTtlMs:null,oldHeartbeatRejected:true,oldCompletionRejected:true,expiryAttempts:replacement.attempts,finalAttempts:record.attempts,
    finalStatus:record.status,clockScale:1,privateRuntimeSql:false}))
}

