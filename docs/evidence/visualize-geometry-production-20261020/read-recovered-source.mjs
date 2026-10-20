import { open,readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import {createTransport,parseMarker,validateStateReceipt} from '/workspace/LingxiLoop-product49-host-release/scripts/schema-upgrade-komodo.mjs'
import {hash,assertCompatibleState} from '/workspace/LingxiLoop-product49-host-release/scripts/host-release.mjs'
import {releaseDescriptor} from '/workspace/LingxiLoop-product49-host-release/scripts/schema-upgrade-maintenance.mjs'
import {readAcceptedRecovery} from './recovery-evidence.mjs'
const {recoveryRaw,recovery,acceptanceRaw:recoveryAcceptanceRaw}=await readAcceptedRecovery()
assert.equal(recovery.format,'product49-interrupted-release-continuation/v1');assert.equal(recovery.execute,true);assert.equal(recovery.complete,true);assert.equal(recovery.events.at(-1)?.phase,'complete')
const historical=JSON.parse(await readFile('/workspace/LingxiLoop-release-229/docs/evidence/cli-memory-production-20261020/memory-d00e5f7b/plan.json'))
const descriptor=await releaseDescriptor('cf4a299bcfb44d7e7ed74a250ea1404588a4e901',historical.target)
const output = '/workspace/geometry-release/source/production-after.json'
const headers = { 'content-type': 'application/json', 'x-api-key': process.env.KOMODO_API_KEY, 'x-api-secret': process.env.KOMODO_API_SECRET }
if (!headers['x-api-key'] || !headers['x-api-secret']) throw Error('Existing authorization unavailable')
const allowed = new Set(['ListServers', 'GetStack', 'GetStackActionState', 'ListStackServices', 'InspectContainer', 'InspectImage', 'ListUpdates', 'GetUpdate', 'GetProcedureActionState'])
const out = { startedAt: new Date().toISOString(), mode: 'read-only-with-host-cache-refresh', candidate: 'cf4a299bcfb44d7e7ed74a250ea1404588a4e901', counts: { read: 0, write: 0, execute: 0, sql: 0, provider: 0 }, servers: [], stacks: [], containers: [], images: [], public: [], errors: [] }
const file = await open(output, 'wx', 0o600)
const sha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x) ? x : null
const digest = x => typeof x === 'string' && /^sha256:[a-f0-9]{64}$/.test(x) ? x : null
const actions = ['pulling', 'deploying', 'starting', 'restarting', 'pausing', 'unpausing', 'stopping', 'destroying']
async function read(operation, body = {}) {
  if (!allowed.has(operation)) throw Error('Read operation not allowed')
  out.counts.read++
  const r = await fetch(`https://ops.christmas1314.xyz/read/${operation}`, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) })
  if (!r.ok) { await r.body?.cancel(); throw Object.assign(Error('Read denied or failed'), { code: 'READ_HTTP', status: r.status, operation }) }
  const text = await r.text()
  if (text.length > 2000000) throw Error('Response exceeds diagnostic bound')
  return JSON.parse(text)
}
try {
  const servers = await read('ListServers', { query: {} })
  out.servers = servers.filter(x => ['manager', 'shanghai-a', 'shanghai-b'].includes(x.name)).map(x => ({ name: x.name, id: x.id, state: x.info?.state }))
  for (const side of ['a', 'b']) {
    const stack = `lingxiloop-app-${side}`, server = `shanghai-${side}`
    const detail = await read('GetStack', { stack }), before = await read('GetStackActionState', { stack })
    const cfg = detail.config
    const host = servers.filter(x => x.name === server)
    if (host.length !== 1 || !/^[a-f0-9]{24}$/.test(host[0].id ?? '') || cfg.server_id !== host[0].id) throw Error('Stack host identity mismatch')
    const entry = { stack, server, serverId: cfg.server_id, id: detail.id ?? detail._id?.$oid, source: { repo: cfg.repo, branch: cfg.branch, commit: cfg.commit, runDirectory: cfg.run_directory, files: cfg.file_paths, filesOnHost: cfg.files_on_host, reclone: cfg.reclone, autoPull: cfg.auto_pull, extraArgs: cfg.extra_args }, idleBefore: actions.every(k => before[k] === false) }
    out.stacks.push(entry)
    const services = await read('ListStackServices', { stack })
    for (const service of ['lingxiloop', 'worker']) {
      const matches = services.filter(x => x.service === service)
      if (matches.length !== 1 || !/^[a-f0-9]{64}$/.test(matches[0]?.container?.id ?? '')) throw Error('Ambiguous service container')
      const c = await read('InspectContainer', { server, container: matches[0].container.id })
      if (c.Id !== matches[0].container.id) throw Error('Inspected container identity mismatch')
      const imageSource = /^(?:accel\.way2api\.fun\/)?ghcr\.io\/lingxi-org\/lingxiloop-server:([a-f0-9]{40})$/.exec(c.Config?.Image ?? '')?.[1] ?? null
      const declaredSource = sha(c.Config?.Env?.find(x => x.startsWith('LINGXILOOP_COMMIT_SHA='))?.slice('LINGXILOOP_COMMIT_SHA='.length))
      const policy = { readOnly: c.HostConfig?.ReadonlyRootfs, privileged: c.HostConfig?.Privileged, securityOpt: c.HostConfig?.SecurityOpt, capAdd: c.HostConfig?.CapAdd, capDrop: c.HostConfig?.CapDrop, pidsLimit: c.HostConfig?.PidsLimit, user: c.Config?.User, productionMode: c.Config?.Env?.includes('NODE_ENV=production') === true }
      out.containers.push({ stack, server, serverId: cfg.server_id, service, id: c.Id, imageSource, declaredSource, imageId: digest(c.Image), running: c.State?.Running === true, restarting: c.State?.Restarting === true, healthy: c.State?.Health?.Status === 'healthy', restartCount: c.RestartCount, oomKilled: c.State?.OOMKilled === true, startedAt: c.State?.StartedAt, latestHealthAt: c.State?.Health?.Log?.at(-1)?.End, healthFailingStreak: c.State?.Health?.FailingStreak, ...(service === 'worker' ? { workerCommandMatches: JSON.stringify(c.Config?.Cmd) === JSON.stringify(['npm', 'run', 'worker:start']), workerEntrypoint: c.Config?.Entrypoint, workerEntrypointMatches: JSON.stringify(c.Config?.Entrypoint) === JSON.stringify(['/usr/bin/tini','--']), workerReadyzCheckMatches: JSON.stringify(c.Config?.Healthcheck?.Test) === JSON.stringify(['CMD','node','-e',"fetch('http://localhost:5190/readyz',{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]) } : {}), policy })
      if (!out.images.some(x => x.server === server && x.id === c.Image)) {
        const image = await read('InspectImage', { server, image: c.Image })
        out.images.push({ server, id: digest(image.Id), repoDigests: (image.RepoDigests ?? []).filter(x => /^(?:accel\.way2api\.fun\/)?ghcr\.io\/lingxi-org\/lingxiloop-server@sha256:[a-f0-9]{64}$/.test(x)), size: image.Size, architecture: image.Architecture, os: image.Os, descriptor: image.Descriptor, rootFS: image.RootFS })
      }
    }
    const after = await read('GetStackActionState', { stack })
    entry.idleAfter = actions.every(k => after[k] === false)
  }
  out.recoveryExecutionSha256=hash(recoveryRaw);out.recoveryAcceptanceSha256=hash(recoveryAcceptanceRaw)
  out.native=[];out.hostSources=[]
  const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET})
  assert.equal((await read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running,false)
  const refs=[['lingxiloop-app-a','6aa8a411b35d27bdd4e12aef','4a5513d5c8805deaeb7771f522b0426dafbfe7e2','release/conversation-visualize49-production-20261020','8b49efd64947dd2aefc422d057febc9d6bce52586261e340063b705a45dfb32f'],['lingxiloop-app-b','6aa8a414b35d27bdd4e12af1','4a5513d5c8805deaeb7771f522b0426dafbfe7e2','release/conversation-visualize49-production-20261020','e4ea3d1c635f9fe39356ea8b1dea5e7a004cba1edb160aeba3acfe326c119785'],['lingxiloop-core-state','6aa8a3e8b35d27bdd4e12ae0','f56db73dabbaec1e92a421bbad76c239ed8d1ae2','release/production-358-20261020','dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab']]
  for(const [stack,id,commit,branch,composeHash] of refs){
    const before=await read('GetStack',{stack}),c=before.config,core=stack==='lingxiloop-core-state'
    assert.equal(before._id?.$oid,id);assert.equal(c.commit,commit);assert.equal(c.branch,branch);assert.equal(c.server_id,stack==='lingxiloop-app-b'?'6aa8a1b9b35d27bdd4e12a24':'6aa8a1bcb35d27bdd4e12a26');assert.equal(c.git_account,'');assert.equal(c.registry_account,'');assert.equal(c.files_on_host,true);assert.equal(c.reclone,false);assert.equal(c.repo,'LingXi-Org/LingxiLoop');assert.equal(c.run_directory,'deploy/komodo/'+stack);assert.deepEqual(c.file_paths,['compose.yml']);assert.equal(c.auto_pull,core);assert.deepEqual(c.extra_args,core?[]:['--no-deps','--pull','never']);assert.equal(c.auto_update,false);assert.equal(c.auto_update_all_services,false);assert.equal(c.poll_for_updates,false)
    const state=await read('GetStackActionState',{stack});assert.ok(actions.every(k=>state[k]===false))
    await t.refreshStackCache(stack);out.counts.write++;out.counts.cacheRefresh=(out.counts.cacheRefresh??0)+1
    const fresh=await read('GetStack',{stack});assert.deepEqual(fresh.config,c);assert.deepEqual(fresh.info?.remote_errors,[]);assert.deepEqual(fresh.info?.missing_files,[]);assert.equal(fresh.info.remote_contents.length,1);assert.equal(fresh.info.remote_contents[0].path,'compose.yml');assert.equal(hash(fresh.info.remote_contents[0].contents),composeHash)
    out.hostSources.push({stack,id,server:stack==='lingxiloop-app-b'?'shanghai-b':'shanghai-a',source:{commit,branch,sha256:composeHash,autoPull:core,extraArgs:core?[]:['--no-deps','--pull','never']},configSha256:hash(JSON.stringify(c))})
  }
  const native=[{id:'6ad7a8b8e06d5e1f798378e2',operation:'RunStackService',stackId:refs[0][1],kind:'metadata'},{id:'6ad7a8bde06d5e1f798378e6',operation:'RunStackService',stackId:refs[1][1],kind:'metadata'},{id:'6ad7a927e06d5e1f79837905',operation:'DeployStackService',stackId:refs[0][1],kind:'original-web-a'}]
  for(const e of recovery.events.filter(e=>e.receipt))native.push({id:e.receipt.id,operation:e.receipt.operation,stackId:e.receipt.target.id,kind:e.phase==='state'?'state':e.phase==='original-migration-confirmed'?'migration':'recovery-deploy'})
  for(const r of native.filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i)){
    const u=await read('GetUpdate',{id:r.id});assert.equal(u._id?.$oid,r.id);assert.equal(u.operation,r.operation);assert.deepEqual(u.target,{type:'Stack',id:r.stackId});assert.equal(u.status,'Complete');assert.equal(u.success,true);assert.ok(Number.isFinite(u.start_ts)&&Number.isFinite(u.end_ts)&&u.end_ts>=u.start_ts)
    const n={...r,target:u.target,status:u.status,success:u.success,start:u.start_ts,end:u.end_ts}
    if(r.kind==='metadata'){n.metadata=parseMarker(u,'METADATA');assert.deepEqual(n.metadata,descriptor)}
    if(r.kind==='migration'){n.migration=parseMarker(u,'MIGRATED');assert.deepEqual(n.migration,{sha:descriptor.sha,schema:13,product:49})}
    if(r.kind==='state'){n.state=validateStateReceipt(parseMarker(u,'STATE'));assertCompatibleState(n.state,descriptor)}
    out.native.push(n)
  }
  const updates = await read('ListUpdates', {})
  out.recentUpdates = (updates.updates ?? []).slice(0, 15).map(x => ({ id: x.id ?? x._id?.$oid, operation: x.operation, status: x.status, success: x.success, startTs: x.start_ts, endTs: x.end_ts }))
  for (const path of ['/api/health', '/readyz', '/api/health/dependencies', '/api/meta']) {
    const r = await fetch(`https://loop.lingxilearn.cn${path}`, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const body = await r.json()
    const row = { path, status: r.status, ok: r.ok && (path === '/api/meta' || body.ok === true) }
    if (path === '/api/meta') row.meta = { product: body.product, version: body.version, commitSha: body.commitSha, reasoningRuntime: body.reasoningRuntime }
    if (path === '/api/health/dependencies') row.dependencies = Object.fromEntries(['database', 'redis', 'openNotebook'].map(k => [k, body.dependencies?.[k] === true]))
    out.public.push(row)
  }
  out.summary = { healthyContainers: out.containers.filter(c => c.running && c.healthy && !c.restarting && !c.oomKilled).length, healthyServers: out.servers.filter(s => s.state === 'Ok').length, stacksIdle: out.stacks.every(s => s.idleBefore && s.idleAfter), matchingSourceOnBothNodes: new Set(out.containers.map(c => c.imageSource)).size === 1 && out.containers.every(c => c.imageSource && c.imageSource === c.declaredSource), targetImageIdentified: out.images.length === 2 && out.images.every(x => x.id && x.repoDigests.length > 0), publicPassed: out.public.every(x => x.ok) }
  out.verified = out.summary.healthyContainers === 4 && out.summary.healthyServers === 3 && out.summary.stacksIdle && out.summary.matchingSourceOnBothNodes && out.summary.targetImageIdentified && out.summary.publicPassed
} catch (e) {
  out.errors.push({ code: e.code ?? 'READ_FAILED', status: Number.isInteger(e.status) ? e.status : null, operation: allowed.has(e.operation) ? e.operation : null })
  out.verified = false
}
out.finishedAt = new Date().toISOString()
await file.writeFile(JSON.stringify(out, null, 2) + '\n')
await file.close()
console.log(JSON.stringify({ output, verified: out.verified, summary: out.summary, counts: out.counts, errors: out.errors }))
if (!out.verified) process.exitCode = 1
