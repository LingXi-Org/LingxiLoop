import { readFile, open, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { runDocker } from './adapter.mjs'
import { canonical, fault, identifier } from './journal.mjs'

/** Stable gateway reloads only; this adapter never stops/recreates the gateway or its Compose project. */
export class NginxIngress {
  constructor({ journal,policy,run = runDocker,fetcher = fetch,wait = ms => new Promise(resolve => setTimeout(resolve,ms)) }) {
    this.journal = journal; this.policy = policy; this.run = run; this.fetcher = fetcher; this.wait = wait; this.tail = Promise.resolve()
    if (!policy || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(policy.container ?? '') || !policy.backends || Object.keys(policy.backends).some(target => !identifier(target))) throw fault('INVALID_INGRESS_POLICY','A fixed stable gateway and backend inventory are required')
    for (const backend of Object.values(policy.backends)) {
      if (!/^[a-zA-Z0-9.-]+:\d{2,5}$/.test(backend.address ?? '')) throw fault('INVALID_INGRESS_POLICY','Backend must have a fixed host:port')
      const url = new URL(backend.observedUrl)
      if (url.protocol !== 'http:' || !['127.0.0.1','[::1]','localhost'].includes(url.hostname)) throw fault('INVALID_INGRESS_POLICY','Loaded Nginx generation must be observed through a loopback-only listener')
    }
    journal.db.exec(`CREATE TABLE IF NOT EXISTS ingress_state (target TEXT PRIMARY KEY, generation INTEGER NOT NULL, enabled INTEGER NOT NULL, release_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ingress_operations (key TEXT PRIMARY KEY, status TEXT NOT NULL, body TEXT NOT NULL);`)
  }
  async observed(target) {
    const backend = this.policy.backends[target]
    if (!backend) throw fault('UNKNOWN_TARGET','Backend is not present in the trusted ingress policy',422)
    const response = await this.fetcher(backend.observedUrl,{ redirect:'error',signal:AbortSignal.timeout(3000) })
    if (!response.ok) throw fault('INGRESS_OBSERVATION_FAILED','Loaded ingress configuration is not observable',502)
    const result = await response.json()
    if (typeof result.enabled !== 'boolean' || !Number.isSafeInteger(result.generation)) throw fault('INGRESS_OBSERVATION_FAILED','Loaded ingress marker is invalid',502)
    return result
  }
  async set(request) {
    const task = this.tail.then(() => this.perform(request))
    this.tail = task.catch(() => {})
    return task
  }
  async perform({ target,generation,enabled,releaseId,phase }) {
    if (!identifier(releaseId) || !['drain','undrain','recovery-drain','recovery-undrain'].includes(phase) || !this.policy.backends[target] || !Number.isSafeInteger(generation) || generation < 1 || typeof enabled !== 'boolean') throw fault('INVALID_INGRESS_REQUEST','Target, positive generation and enabled boolean are required',422)
    const key = `${releaseId}:${target}:${generation}:${phase}:${enabled ? 'enable' : 'disable'}`
    const prior = this.journal.db.prepare('SELECT * FROM ingress_operations WHERE key=?').get(key)
    const fence = this.journal.db.prepare('SELECT generation,release_id FROM ingress_state WHERE target=?').get(target)
    if (fence && (fence.generation > generation || fence.generation === generation && fence.release_id !== releaseId)) throw fault('STALE_GENERATION','A newer generation owns this backend')
    if (prior) {
      const actual = await this.observed(target)
      if (actual.generation === generation && actual.enabled === enabled) {
        this.complete(key,target,generation,enabled)
        return actual
      }
      if (prior.status === 'succeeded') return { ...JSON.parse(prior.body), superseded:true }
      throw fault('INGRESS_OUTCOME_UNCERTAIN','Previous ingress intent has no matching loaded marker; quarantine and reconcile before another write')
    }
    for (const pending of this.journal.db.prepare("SELECT key,body FROM ingress_operations WHERE status='intent'").all()) {
      const expected = JSON.parse(pending.body), actual = await this.observed(expected.target)
      if (actual.generation === expected.generation && actual.enabled === expected.enabled) this.complete(pending.key,expected.target,expected.generation,expected.enabled)
      else throw fault('INGRESS_OUTCOME_UNCERTAIN','Another unresolved ingress intent must be observed before editing the shared gateway')
    }
    // Synchronize the entire backend set from the active listener before generating a new config.
    const states = {}
    for (const backend of Object.keys(this.policy.backends)) states[backend] = await this.observed(backend)
    if (states[target].generation > generation) throw fault('STALE_GENERATION','Loaded Nginx owns a newer generation')
    states[target] = { generation,enabled }
    this.journal.tx(() => {
      this.journal.db.prepare('INSERT INTO ingress_operations VALUES (?,?,?)').run(key,'intent',canonical({ target,generation,enabled,releaseId,phase }))
      this.journal.db.prepare('INSERT INTO ingress_state VALUES (?,?,?,?) ON CONFLICT(target) DO UPDATE SET generation=excluded.generation,enabled=excluded.enabled,release_id=excluded.release_id').run(target,generation,enabled ? 1 : 0,releaseId)
    })
    try {
      let template = await readFile(this.policy.templateFile,'utf8')
      if (!template.includes('{{LINGXI_UPSTREAMS}}') || !template.includes('{{LINGXI_INGRESS_STATES}}')) throw fault('INVALID_INGRESS_POLICY','Gateway template requires both fixed placeholders')
      const servers = Object.entries(this.policy.backends).map(([backend,spec]) => `    server ${spec.address} ${states[backend].enabled ? 'max_fails=2 fail_timeout=5s' : 'down'};`).join('\n')
      const upstreams = ['lingxiloop_web','lingxiloop_realtime'].map(name => `upstream ${name} {\n    zone ${name} 64k;\n    least_conn;\n${servers}\n    keepalive 32;\n}`).join('\n')
      const locations = Object.entries(states).map(([backend,state]) => `    location = /state/${backend} { default_type application/json; return 200 '${canonical(state)}'; }`).join('\n')
      template = template.replace('{{LINGXI_UPSTREAMS}}',upstreams).replace('{{LINGXI_INGRESS_STATES}}',locations)
      await mkdir(dirname(this.policy.outputFile),{ recursive:true,mode:0o700 })
      const path = `${this.policy.outputFile}.${process.pid}.tmp`, file = await open(path,'w',0o600)
      try { await file.writeFile(template); await file.sync() } finally { await file.close() }
      await rename(path,this.policy.outputFile)
      const directory = await open(dirname(this.policy.outputFile),'r'); try { await directory.sync() } finally { await directory.close() }
      await this.run(['exec',this.policy.container,'nginx','-t'])
      await this.run(['exec',this.policy.container,'nginx','-s','reload'])
      const deadline = Date.now() + 10000
      while (true) {
        const actual = await this.observed(target)
        if (actual.generation === generation && actual.enabled === enabled) { this.complete(key,target,generation,enabled); return actual }
        if (Date.now() >= deadline) throw fault('INGRESS_OBSERVATION_FAILED','Nginx did not expose the requested generation after reload',502)
        await this.wait(100)
      }
    } catch (error) { error.uncertain = true; throw error }
  }
  complete(key,target,generation,enabled) {
    this.journal.db.prepare('UPDATE ingress_operations SET status=?,body=? WHERE key=?').run('succeeded',canonical({ target,generation,enabled }),key)
  }
}
