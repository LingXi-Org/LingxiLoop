import { open } from 'node:fs/promises'
const output = '/tmp/lingxi-canvas-release-20261020/production-after.json'
const headers = { 'content-type': 'application/json', 'x-api-key': process.env.KOMODO_API_KEY, 'x-api-secret': process.env.KOMODO_API_SECRET }
if (!headers['x-api-key'] || !headers['x-api-secret']) throw Error('Existing authorization unavailable')
const allowed = new Set(['ListServers', 'GetStack', 'GetStackActionState', 'ListStackServices', 'InspectContainer', 'InspectImage', 'ListUpdates'])
const out = { startedAt: new Date().toISOString(), mode: 'read-only', candidate: '9a5cfda82ad105d666bf0452df1d615daf6c6a28', counts: { read: 0, write: 0, execute: 0, sql: 0, provider: 0 }, servers: [], stacks: [], containers: [], images: [], public: [], errors: [] }
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
