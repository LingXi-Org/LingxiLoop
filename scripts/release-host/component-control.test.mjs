import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ComposeAdapter,configurationFingerprint } from './adapter.mjs'
import { Executor,Journal } from './executor.mjs'
import {imageProfileKey} from './image-identity.mjs'
import { componentControl } from './component-control.mjs'
import { hash,fault } from './journal.mjs'
const exec=promisify(execFile),rawHash=value=>createHash('sha256').update(value).digest('hex'),digest=value=>`sha256:${rawHash(value)}`
function registry(name){return{ref:`ghcr.io/lingxi-org/${name}@${digest('index:'+name)}`,indexDigest:digest('index:'+name),platformDigest:digest('platform:'+name),configDigest:digest('config:'+name),diffIds:[digest('layer:'+name)],os:'linux',architecture:'amd64'}}
const sourceText='"""Qualified synthetic Notebook RAG source."""\n',sourceHash=rawHash(sourceText),binaryHash=rawHash('synthetic wukong binary'),upstream='a'.repeat(40),fix='b'.repeat(40),buildInfo=`upstream_commit=${upstream}\nraftstore_fix_commit=${fix}\nplatform=linux/amd64\n`,surrealVersion='surreal 2.3.10 for linux on x86_64\n'
const contract=adapter=>({nativeSchema:0,productSchema:1,api:`${adapter}-api-v1`,worker:`${adapter}-worker-v1`,checkpoint:`${adapter}-durability-v1`,control:`${adapter}-health-v1`,capabilities:[`${adapter}.storage-v1`]})
const mount=(source,target)=>({type:'volume',source,target,readOnly:false})
const actualMount=spec=>({Type:spec.type,Name:spec.source,Destination:spec.target,RW:!spec.readOnly})
async function setup(t,{adapter='open-notebook',unchanged=false}={}){
  const directory=await mkdtemp(join(tmpdir(),'release-component-')),repo=join(directory,'repo'),target=adapter==='open-notebook'?'notebook':'wukongim',service=adapter==='open-notebook'?'open-notebook':'wukongim'
  await mkdir(join(repo,'third_party/open-notebook/open_notebook/rag'),{recursive:true});await writeFile(join(repo,'third_party/open-notebook/open_notebook/rag/runtime.py'),sourceText)
  const git=async args=>(await exec('/usr/bin/git',args,{encoding:'utf8'})).stdout
  await git(['-C',repo,'init','--quiet']);await git(['-C',repo,'remote','add','origin','https://github.com/LingXi-Org/LingxiLoop.git']);await git(['-C',repo,'add','.']);await git(['-C',repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','qualified source'])
  const commit=(await git(['-C',repo,'rev-parse','HEAD'])).trim(),evidence={mode:'repo',repository:'https://github.com/LingXi-Org/LingxiLoop.git',commit}
  let old=registry(`${target}-old`),next=registry(`${target}-new`),surreal=registry('surreal-storage')
  if(adapter==='open-notebook')old={kind:'local-qualified',ref:old.configDigest,localImageId:old.configDigest,localIdKind:'config',diffIds:old.diffIds,os:'linux',architecture:'amd64',sourceEvidence:evidence}
  if(unchanged)next=old
  const dataMounts=adapter==='open-notebook'?[mount('original-notebook-data','/app/data')]:[mount('original-im-data','/var/lib/wukongim')]
  const surrealMounts=[mount('original-surreal-data','/home/nonroot'),mount('8'.repeat(64),'/data'),mount('9'.repeat(64),'/logs')],dbInfo={tables:{command:'DEFINE TABLE command SCHEMALESS',open_notebook:'DEFINE TABLE open_notebook SCHEMALESS'}}
  const storage=adapter==='open-notebook'?{kind:'notebook-rag-surreal-v2',schemaVersion:1,namespace:'open_notebook',database:'retained_active',databaseInfoHash:hash(dbInfo)}:{kind:'wukongim-raft-wal-v1',format:'reviewed-raftstore-fix',nodeId:1}
  const profile=image=>({kind:adapter==='open-notebook'?'notebook-rag':'wukongim',contract:contract(adapter),storage,allowedStopExitCodes:[0],metadata:adapter==='open-notebook'?{files:[{path:'/app/open_notebook/rag/runtime.py',sha256:sourceHash}]}:{buildInfoSha256:rawHash(buildInfo),upstreamCommit:upstream,raftstoreFixCommit:fix,binarySha256:binaryHash},...(image.kind==='local-qualified'?{sourceEvidence:evidence,localImageId:image.localImageId,localIdKind:image.localIdKind,repository:{directory:repo,files:[{repositoryPath:'third_party/open-notebook/open_notebook/rag/runtime.py',containerPath:'/app/open_notebook/rag/runtime.py',sha256:sourceHash}]}}:{})})
  const local={adapter,project:adapter==='open-notebook'?'original-knowledge':'original-core',composeFile:'/fixed/component-compose.yml',envFile:'/fixed/component.env',services:{[service]:{role:'component',mounts:dataMounts}},component:{imageProfiles:{[imageProfileKey(old)]:profile(old),[imageProfileKey(next)]:profile(next)},dependencies:adapter==='open-notebook'?{surrealdb:{project:'original-knowledge',service:'surrealdb',image:surreal,mounts:surrealMounts,version:'2.3.10',versionOutputSha256:rawHash(surrealVersion)}}:{},...(adapter==='open-notebook'?{surreal:{dependency:'surrealdb',network:'retained-network'}}:{})}}
  const policy={version:1,acceptedOpsShas:['f'.repeat(40)],stateDirectory:directory,drainTimeoutMs:10,pollIntervalMs:1,startupTimeoutMs:0,targets:{[target]:local}}
  const config={name:local.project,services:{[service]:{image:old.ref,pull_policy:'never',command:adapter==='open-notebook'?['/app/.venv/bin/python','-m','open_notebook.rag.generation']:['/usr/local/bin/wukongim'],volumes:[{type:'volume',source:'data',target:dataMounts[0].target,read_only:false}]}},volumes:{data:{name:dataMounts[0].source,external:true}}}
  if(adapter==='open-notebook')config.services.surrealdb={image:surreal.ref,pull_policy:'never'}
  const fingerprint=configurationFingerprint(config,local),images={[service]:next},source={images:{[service]:old},contract:contract(adapter),configurationHash:fingerprint}
  const release={version:1,releaseId:`component-${target}`,appSha:'e'.repeat(40),opsSha:'f'.repeat(40),sequence:1,checks:{commit:'e'.repeat(40),conclusion:'success'},createdAt:'2026-10-25T00:00:00Z',targets:{[target]:{adapter,contract:contract(adapter),hostPlan:{version:1,sourceMode:adapter==='open-notebook'?'repo-adopted-image':'image',mode:'maintenance',images,contract:contract(adapter),configurationHash:fingerprint,source,recovery:source}}}}
  const container=(id,image,mounts)=>({Id:id.repeat(64),Image:image.localImageId??image.configDigest,State:{Running:true,Pid:123,Status:'running',ExitCode:0,Restarting:false,Health:{Status:'healthy'}},Mounts:mounts.map(actualMount),Config:{Env:[]}})
  const containers={[service]:container('4',old,dataMounts),surrealdb:container('5',surreal,surrealMounts),mainWeb:container('6',registry('main-web'),[]),mainWorker:container('7',registry('main-worker'),[])}
  containers.surrealdb.Config.Env=['SURREAL_USER=fixture-user','SURREAL_PASS=fixture-private-password'];containers.surrealdb.NetworkSettings={Networks:{'retained-network':{IPAddress:'172.20.0.8'}}}
  const calls=[],queries=[],allImages=[old,next,surreal];let pending=0,corruptMetadata=false,schemaVersion=1
  const run=async args=>{
    calls.push(args)
    if(args[0]==='image'){const image=allImages.find(image=>[image.ref,image.localImageId,image.indexDigest,image.platformDigest,image.configDigest].includes(args[2]));if(!image)throw fault('IMAGE_NOT_FOUND','Missing fixture');return JSON.stringify([{Id:image.localImageId??image.configDigest,RepoDigests:image.kind==='local-qualified'?[]:[image.ref],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:image.diffIds}}])}
    if(args[0]==='ps'){const name=args.at(-1).split('=').at(-1);assert.ok(containers[name]);return containers[name].Id}
    if(args[0]==='container')return JSON.stringify([Object.values(containers).find(value=>value.Id===args[2])])
    if(args[0]==='volume')return JSON.stringify([{Name:args[2]}])
    if(args[0]==='exec'){
      if(args[2]==='/surreal')return surrealVersion
      if(args[2]==='sha256sum')return `${args[3]==='/usr/local/bin/wukongim'?binaryHash:corruptMetadata?'0'.repeat(64):sourceHash}  ${args[3]}\n`
      if(args[2]==='cat')return buildInfo
      if(args[2]?.endsWith('/supervisorctl'))return args.includes('status')?'rag-api RUNNING pid 10\n':'rag-api: stopped\n'
      if(args[2]==='curl')return JSON.stringify({status:'ready',profile:'rag',schema_version:1,embedding_dimensions:1024})
      if(args[2]==='wget')return ''
    }
    if(args[0]==='compose'){
      const files=args.flatMap((value,index)=>value==='--file'?[args[index+1]]:[]),overlay=JSON.parse(await readFile(files.at(-1),'utf8'))
      if(args.includes('config')){const result=structuredClone(config);for(const[name,spec]of Object.entries(overlay.services))result.services[name]={...result.services[name],...spec};return JSON.stringify(result)}
      const name=args.at(-1);assert.equal(name,service,'Only the component service may be changed')
      if(args.includes('stop'))containers[name].State={...containers[name].State,Running:false,Pid:0,Status:'exited',ExitCode:0}
      if(args.includes('up')){containers[name].Image=imageProfileKey(allImages.find(image=>[image.ref,image.localImageId,image.configDigest].includes(overlay.services[name].image)));containers[name].State={...containers[name].State,Running:true,Pid:456,Status:'running',Health:{Status:'healthy'}}}
      return ''
    }
    throw Error(`Unexpected fixed argv ${JSON.stringify(args)}`)
  }
  const fetcher=async(url,options)=>{assert.match(String(url),/^http:\/\/172\.20\.0\.8:8000\/sql$/);queries.push(options.body);return new Response(JSON.stringify([{status:'OK',result:[{version:schemaVersion}]},{status:'OK',result:pending?[{count:pending}]:[]},{status:'OK',result:dbInfo}]),{status:200})}
  const journal=new Journal(join(directory,'journal.sqlite')),adapterInstance=new ComposeAdapter(policy,{run,fetcher,wait:async()=>{}}),executor=new Executor({journal,adapter:adapterInstance}),manifestHash=hash(release);executor.register(release,manifestHash)
  t.after(async()=>{journal.close();await rm(directory,{recursive:true,force:true})})
  const op=phase=>({releaseId:release.releaseId,target,phase,generation:phase==='prepare'?0:1,manifestHash,parameters:{}})
  const phase=async phase=>{const accepted=executor.submit(op(phase));return executor.run(accepted.operation.key)}
  return {directory,repo,policy,local,release,target,service,old,next,surreal,containers,calls,queries,journal,executor,adapter:adapterInstance,op,phase,setPending:value=>pending=value,setCorrupt:value=>corruptMetadata=value,setSchema:value=>schemaVersion=value}
}
for(const adapter of ['open-notebook','wukongim'])test(`${adapter} updates only its own service, preserving main runtime and every storage mount`,async t=>{
  const f=await setup(t,{adapter}),before=structuredClone(f.containers),mainBefore=JSON.stringify({web:f.containers.mainWeb,worker:f.containers.mainWorker})
  for(const phase of ['prepare','drain','apply','verify','undrain']){const result=await f.phase(phase);assert.equal(result.status,'succeeded',JSON.stringify(result))}
  assert.equal(f.containers[f.service].Image,imageProfileKey(f.next));assert.deepEqual(f.containers[f.service].Mounts,before[f.service].Mounts)
  assert.equal(JSON.stringify({web:f.containers.mainWeb,worker:f.containers.mainWorker}),mainBefore)
  assert.deepEqual(f.containers.surrealdb,before.surrealdb)
  const updates=f.calls.filter(args=>args[0]==='compose'&&(args.includes('up')||args.includes('stop')));assert.ok(updates.length>0);assert.ok(updates.every(args=>args.at(-1)===f.service))
  assert.equal(f.calls.some(args=>args.includes('psql')||args.includes('pg_dump')||args.includes('db-migrate')||args.includes('ingress')),false)
})
test('unchanged repo-mode Notebook adopts its exact local config/layers/source commit without rebuild or recreation',async t=>{
  const f=await setup(t,{unchanged:true})
  for(const phase of ['prepare','drain','apply','verify','undrain'])assert.equal((await f.phase(phase)).status,'succeeded')
  assert.equal(f.calls.some(args=>args.includes('up')||args.includes('stop')||args.includes('pull')||args.includes('build')||args.includes('supervisorctl')),false)
  const overlay=JSON.parse(await readFile(join(f.directory,f.release.releaseId,'notebook-forward.json'),'utf8'));assert.equal(overlay.services['open-notebook'].image,imageProfileKey(f.old))
  assert.equal(f.old.indexDigest,undefined);assert.equal(f.old.platformDigest,undefined)
  const ready=await componentControl(f.policy,'readiness',f.op('verify'),{run:f.adapter.run,fetcher:f.adapter.fetcher})
  assert.equal(ready.sourceModeEvidence[0].commit,f.old.sourceEvidence.commit)
})
test('Surreal anonymous /data and /logs binding drift rejects prepare before any service stop',async t=>{
  const f=await setup(t);f.containers.surrealdb.Mounts.find(mount=>mount.Destination==='/logs').Name='silently-new-empty-volume'
  const result=await f.phase('prepare');assert.equal(result.status,'failed');assert.equal(result.errors.forward.code,'COMPONENT_VOLUME_DRIFT');assert.equal(f.calls.some(args=>args.includes('stop')||args.includes('up')),false)
})
test('Notebook source checkout drift or running source hash mismatch cannot be adopted',async t=>{
  const f=await setup(t,{unchanged:true});await writeFile(join(f.repo,'third_party/open-notebook/open_notebook/rag/runtime.py'),'uncommitted different source\n')
  const result=await f.phase('prepare');assert.equal(result.status,'failed');assert.equal(result.errors.forward.code,'LOCAL_SOURCE_EVIDENCE_MISMATCH')
})
test('component schema/storage transition is refused rather than borrowing main database migration claims',async t=>{
  const f=await setup(t),changed=structuredClone(f.release);changed.releaseId='unqualified-component-storage';f.local.component.imageProfiles[imageProfileKey(f.next)].storage={...f.local.component.imageProfiles[imageProfileKey(f.next)].storage,schemaVersion:2}
  assert.throws(()=>f.executor.register(changed,hash(changed)),{code:'COMPONENT_STORAGE_CHANGE_REQUIRES_MIGRATION'})
})
test('Notebook unsettled commands block replacement after only Notebook admission closes, with storage/main left running',async t=>{
  const f=await setup(t);assert.equal((await f.phase('prepare')).status,'succeeded');f.setPending(1)
  const result=await f.phase('drain');assert.equal(result.status,'failed');assert.equal(result.errors.forward.code,'COMPONENT_DRAIN_TIMEOUT')
  assert.equal(f.calls.some(args=>args[0]==='compose'&&(args.includes('stop')||args.includes('up'))),false);assert.ok(f.containers.surrealdb.State.Running&&f.containers.mainWorker.State.Running)
})
test('component recovery drains the running forward image and restores only its compatible cached source',async t=>{
  const f=await setup(t)
  for(const phase of ['prepare','drain','apply','verify','undrain','recovery-drain','recover','recovery-undrain'])assert.equal((await f.phase(phase)).status,'succeeded',phase)
  assert.equal(f.containers[f.service].Image,imageProfileKey(f.old))
  assert.equal(f.calls.filter(args=>args[0]==='compose'&&args.includes('up')).length,2)
  assert.equal(f.containers.surrealdb.State.Running,true);assert.equal(f.containers.mainWorker.State.Running,true)
})
