import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ComposeAdapter, configurationFingerprint } from '../adapter.mjs'
import { Executor, Journal } from '../executor.mjs'
import { hash, fault } from '../journal.mjs'

export const digest = character => `sha256:${character.repeat(64)}`
export const contract = { nativeSchema:14,productSchema:57,api:'api-v1',worker:'worker-v1',checkpoint:'checkpoint-v1',control:'11',capabilities:['case.soft-delete-filter'] }
export function image(character) { return { ref:`ghcr.io/lingxi-org/lingxiloop-server@${digest(character)}`,indexDigest:digest(character),platformDigest:digest(character === 'a' ? 'b' : 'd'),configDigest:digest(character === 'a' ? 'c' : 'e'),diffIds:[digest('f')],os:'linux',architecture:'amd64' } }
export const oldImage = image('1'), newImage = image('a')
export function policy(directory) {
  return { version:1,acceptedOpsShas:['b'.repeat(40)],stateDirectory:directory,listen:{ host:'127.0.0.1',port:0 },pollIntervalMs:1,startupTimeoutMs:0,drainTimeoutMs:20,targets:{ 'main-runtime-a':{ adapter:'main-runtime',project:'original-project',composeFile:'/fixed/compose.yml',envFile:'/fixed/secrets.env',databaseOwner:true,
    services:{ web:{ role:'web',mounts:[] },worker:{ role:'worker',mounts:[{ type:'volume',source:'original-homes',target:'/homes',readOnly:false }] } },
    controls:Object.fromEntries(['state','barrier','drain','undrain','readiness','ingress','ingressState'].map(action => [action,{ url:`http://127.0.0.1/${action}` }])) } } }
}
export function baseConfig(images = { web:oldImage,worker:oldImage }) {
  return { name:'original-project',services:{ web:{ image:images.web.ref,pull_policy:'never',command:['npm','run','server:start'],ports:[{ target:5181,published:'5183' }] },worker:{ image:images.worker.ref,pull_policy:'never',command:['npm','run','worker:start'],volumes:[{ type:'volume',source:'homes',target:'/homes',read_only:false }] } },volumes:{ homes:{ name:'original-homes',external:true } } }
}
export function manifest(directory) {
  const configurationHash = configurationFingerprint(baseConfig(),policy(directory).targets['main-runtime-a'])
  return { version:1,releaseId:'release-495',appSha:'a'.repeat(40),opsSha:'b'.repeat(40),sourceReleaseId:'accepted-source',sequence:2,checks:{ commit:'a'.repeat(40),conclusion:'success',runId:'42' },createdAt:'2026-10-25T00:00:00Z',policy:{ drainSeconds:1,retryLimit:0 },targets:{ 'main-runtime-a':{ adapter:'main-runtime',resources:['main-runtime'],dependsOn:[],fromReleaseId:'accepted-source',hosts:['a'],artifact:{ kind:'image' },contract,configuration:{ version:'1',secretRefs:[],volumes:{} },hostPlan:{ version:1,sourceMode:'image',mode:'maintenance',images:{ web:newImage,worker:newImage },contract,configurationHash,recovery:{ images:{ web:oldImage,worker:oldImage },contract,configurationHash } } } } }
}
const container = (service,image) => ({ Id:(service === 'web' ? '2' : '3').repeat(64),Image:image.configDigest,State:{ Running:true,Pid:123,Restarting:false,Health:{ Status:'healthy' } },Mounts:service === 'worker' ? [{ Type:'volume',Name:'original-homes',Destination:'/homes',RW:true }] : [] })
export class FakeHost {
  constructor(directory,options = {}) {
    this.directory = directory; this.options = options
    try { this.data = JSON.parse(readFileSync(join(directory,'fake-host.json'),'utf8')) } catch { this.data = { calls:[],cache:[oldImage.ref,newImage.ref],containers:{ web:container('web',oldImage),worker:container('worker',oldImage) },ingress:{ enabled:true,generation:1 } } }
  }
  save() { writeFileSync(join(this.directory,'fake-host.json'),JSON.stringify(this.data)) }
  async run(args) {
    this.data.calls.push(args); this.save()
    if (args[0] === 'image' && args[1] === 'inspect') {
      if (!this.data.cache.includes(args[2])) throw fault('IMAGE_NOT_FOUND','Missing image')
      const image = args[2] === oldImage.ref ? oldImage : newImage
      return JSON.stringify([{ Id:image.configDigest,RepoDigests:[image.ref],Os:'linux',Architecture:'amd64',RootFS:{ Type:'layers',Layers:this.options.corruptCache ? [] : image.diffIds } }])
    }
    if (args[0] === 'image' && args[1] === 'pull') {
      if (this.options.offline) throw fault('NETWORK_UNAVAILABLE','Offline')
      this.data.cache.push(args.at(-1)); this.save(); return ''
    }
    if (args[0] === 'ps') return (args.at(-1).endsWith('=web') ? '2' : '3').repeat(64)
    if (args[0] === 'container') return JSON.stringify([this.data.containers[args[2][0] === '2' ? 'web' : 'worker']])
    if (args[0] === 'volume') return JSON.stringify([{ Name:'original-homes' }])
    if (args[0] === 'compose') {
      const files = args.flatMap((arg,index) => arg === '--file' ? [args[index+1]] : []), overlay = JSON.parse(readFileSync(files.at(-1),'utf8'))
      if (args.includes('config')) { const config = baseConfig(); for (const [service,spec] of Object.entries(overlay.services)) config.services[service] = { ...config.services[service],...spec }; return JSON.stringify(config) }
      const service = args.at(-1)
      if (args.includes('stop')) { this.data.containers[service].State.Running = false; this.data.containers[service].State.Pid = 0 }
      if (args.includes('up')) {
        const image = overlay.services[service].image === oldImage.ref ? oldImage : newImage
        this.data.containers[service] = container(service,image)
        if (this.options.unhealthyTarget && image === newImage) this.data.containers[service].State.Health.Status = 'unhealthy'
        if (this.options.failRecovery && image === oldImage) throw Object.assign(fault('DOCKER_COMMAND_FAILED','Recovery daemon response lost'),{ uncertain:true })
      }
      this.save(); return ''
    }
    throw Error(`Unexpected fake Docker argv ${JSON.stringify(args)}`)
  }
  async fetcher(url,options) {
    const action = new URL(url).pathname.slice(1), body = options.body ? JSON.parse(options.body) : {}
    if (action === 'ingress') this.data.ingress = { enabled:body.enabled,generation:body.generation }
    this.save()
    let result = action === 'state' ? { ...contract,verified:true,requiredCapabilities:this.options.requiredCapabilities ?? contract.capabilities } :
      action === 'barrier' ? { fullVisibility:true,drained:!this.options.busy,liveWork:this.options.busy ? 1 : 0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0 } :
      action === 'readiness' ? { ready:true,contract } : action === 'drain' ? { admissionClosed:true,writesStopped:true } : this.data.ingress
    return new Response(JSON.stringify(result),{ status:200,headers:{ 'content-type':'application/json' } })
  }
}
export function fixture(directory,options = {}) {
  const local = policy(directory), host = new FakeHost(directory,options), adapter = new ComposeAdapter(local,{ run:args => host.run(args),fetcher:(url,options) => host.fetcher(url,options),wait:async()=>{} }),journal = new Journal(join(directory,'journal.sqlite'))
  const executor = new Executor({ journal,adapter,afterSideEffect:options.afterSideEffect })
  const release = manifest(directory), manifestHash = hash(release)
  executor.register(release,manifestHash)
  const request = (phase,generation = phase === 'prepare' ? 0 : 1,changes = {}) => ({ releaseId:release.releaseId,target:'main-runtime-a',phase,generation,manifestHash,parameters:{},...changes })
  const run = async phase => { const submitted = executor.submit(request(phase)); return executor.run(submitted.operation.key) }
  return { local,host,adapter,journal,executor,release,manifestHash,request,run }
}
