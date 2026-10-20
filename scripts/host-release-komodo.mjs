// Native Komodo2.3.3 calls. Only an explicit reviewed product plan may migrate.
// No Git/private API, secret or env writes.
import {isDeepStrictEqual as equal} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
import {createTransport,parseMarker,validateStateReceipt,stateCommand,METADATA_CODE} from './schema-upgrade-komodo.mjs'
import {APPS,CORE,IMAGE,RELEASE_ARGS,PRODUCT_SCHEMA_FORMAT,metadataKeys,check,hash,validateHostPlanShape,assertImageIdentity} from './host-release.mjs'
const actions=['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying']
const id=/^[a-f0-9]{24}$/,hex=/^[a-f0-9]{64}$/
const oneOff=(stack,service,extra)=>({stack,service,no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,...extra})
export function createHostReleaseOperations({plan,files,apiKey,apiSecret,signal,onProgress=async()=>{},transport,wait=delay}){
 validateHostPlanShape(plan)
 const t=transport??createTransport({apiKey,apiSecret,signal,onProgress})
 const phases=new Map(plan.stacks.map(r=>[r.stack,'source'])),configs=new Map(),identities=new Map(),images=new Map(),containerPolicies=new Map()
 const stoppedWorkers=new Set()
 let migrationSubmitted=false
 const rowFor=stack=>{const r=plan.stacks.find(r=>r.stack===stack);check(r,'Unexpected stack');return r}
 const imageKey=(which,server)=>which+':'+server
 async function hosts(){
  const result=await t.read('ListServers',{});check(Array.isArray(result),'Server inventory unavailable')
  for(const name of ['manager','shanghai-a','shanghai-b'])check(result.filter(r=>r.name===name&&r.info?.state==='Ok'&&id.test(r.id??'')).length===1,'Required host unavailable')
  return result
 }
 function assertConfig(detail,row,serverId){
  const c=detail?.config,phase=phases.get(row.stack),ref=phase==='target'?row.target:row.source,emptyHook={path:'',command:'',shell_mode:false}
  check(id.test(detail?._id?.$oid??'')&&c&&c.server_id===serverId&&c.swarm_id===''&&c.repo==='LingXi-Org/LingxiLoop'
   &&c.branch===ref.branch&&c.commit===ref.commit&&c.files_on_host===true&&c.reclone===false&&c.clone_path===''
   &&c.git_account===''&&c.registry_account===''&&c.linked_repo===''&&c.file_contents===''
   &&c.run_directory===`deploy/komodo/${row.stack}`&&c.env_file_path==='.env'&&equal(c.file_paths,['compose.yml'])
   &&equal(c.additional_env_files,[])&&equal(c.config_files,[])&&c.auto_update===false&&c.auto_update_all_services===false
   &&c.poll_for_updates===false&&c.auto_pull===ref.autoPull&&equal(c.extra_args,ref.extraArgs)&&c.run_build===false
   &&c.destroy_before_deploy===false&&c.project_name===''&&c.compose_cmd_wrapper===''&&equal(c.build_extra_args,[])
   &&equal(c.pre_deploy,emptyHook)&&equal(c.post_deploy,emptyHook)&&equal(c.ignore_services,row.stack===CORE?[]:['db-migrate']),'Frozen source/configuration drift')
  if(identities.has(row.stack))check(identities.get(row.stack)===detail._id.$oid,'Stack identity changed')
  else identities.set(row.stack,detail._id.$oid)
  if(configs.has(row.stack))check(equal(c,configs.get(row.stack)),'Full stack configuration changed')
  else configs.set(row.stack,structuredClone(c))
 }
 async function guard(stacks=plan.stacks.map(r=>r.stack)){
  signal?.throwIfAborted()
  check((await t.read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running===false,'Concurrent rollout procedure')
  for(const stack of stacks){
   const row=rowFor(stack),servers=await hosts(),server=servers.find(r=>r.name===row.server)
   const action=await t.read('GetStackActionState',{stack});check(actions.every(k=>action[k]===false),'Concurrent stack action')
   const before=await t.read('GetStack',{stack});assertConfig(before,row,server.id)
   await t.refreshStackCache(stack)
   const after=await t.read('GetStack',{stack}),freshServer=(await hosts()).find(r=>r.name===row.server)
   check(freshServer.id===server.id,'Host identity changed');assertConfig(after,row,server.id)
   check(equal(before.config,after.config),'Source configuration changed while refreshing')
   const info=after.info,remote=info?.remote_contents
   check(equal(info?.remote_errors,[])&&equal(info?.missing_files,[])&&Array.isArray(remote)&&remote.length===1&&remote[0].path==='compose.yml'&&typeof remote[0].contents==='string','Fresh host source unavailable')
   const phase=phases.get(stack),ref=phase==='target-file'?row.target:phase==='preparation'?row.preparation:row[phase]
   check(hash(remote[0].contents)===ref.sha256,'Host Compose hash differs from sealed source')
   await onProgress({phase:'host-source',status:'verified',stack,sourcePhase:phase,sha256:ref.sha256})
  }
 }
 async function assertIdle(){
  await guard()
  for(const stack of APPS){
   const services=await t.read('ListStackServices',{stack});check(Array.isArray(services),'Service inventory unavailable')
   const jobs=services.filter(r=>r.service==='db-migrate');check(jobs.length<=1,'Ambiguous migration job')
   if(jobs[0]?.container){
    check(hex.test(jobs[0].container.id??''),'Migration container identity unavailable')
    const c=await t.read('InspectContainer',{server:rowFor(stack).server,container:jobs[0].container.id})
    check(c.Id===jobs[0].container.id&&c.State?.Running===false&&c.State?.Restarting===false,'Existing migration job unresolved')
   }
  }
 }
 async function inspect(){
  const result=[]
  for(const stack of APPS){
   const row=rowFor(stack),services=await t.read('ListStackServices',{stack});check(Array.isArray(services),'Service inventory unavailable')
   for(const service of ['lingxiloop','worker']){
    const matches=services.filter(s=>s.service===service);check(matches.length===1&&hex.test(matches[0].container?.id??''),'Ambiguous application service')
    const c=await t.read('InspectContainer',{server:row.server,container:matches[0].container.id})
    const env=c.Config?.Env,source=env?.find(x=>x.startsWith('LINGXILOOP_COMMIT_SHA='))?.slice('LINGXILOOP_COMMIT_SHA='.length)
    check([plan.source.sha,plan.target.sha].includes(source)&&c.Id===matches[0].container.id&&c.Config?.Image===IMAGE+source
     &&/^sha256:[a-f0-9]{64}$/.test(c.Image??'')&&typeof c.State?.Running==='boolean'&&typeof c.State?.Restarting==='boolean'
     &&Number.isSafeInteger(c.RestartCount)&&Number.isSafeInteger(c.State.Pid)&&c.State.Pid>=0&&c.State.OOMKilled===false,'Unexpected actual container identity/state')
    const which=source===plan.source.sha?'source':'target',qualified=images.get(imageKey(which,row.server))
    if(qualified)check(c.Image===qualified,'Container image differs from actual qualified host image')
    // Keep secret-bearing values only in memory. Never persist their contents.
    const protectedConfig={env:env.filter(x=>!x.startsWith('LINGXILOOP_COMMIT_SHA=')).toSorted(),host:c.HostConfig,user:c.Config.User,command:c.Config.Cmd,entrypoint:c.Config.Entrypoint,health:c.Config.Healthcheck,mounts:c.Mounts}
    // Docker fills container-specific host fields; compare security/volume fields
    // explicitly instead of comparing the whole HostConfig object.
    protectedConfig.host=Object.fromEntries(['ReadonlyRootfs','Privileged','SecurityOpt','CapAdd','CapDrop','PidsLimit','Binds','Tmpfs','PortBindings','Memory','NanoCpus','Devices','DeviceRequests'].map(k=>[k,c.HostConfig?.[k]]))
    const key=stack+':'+service
    if(containerPolicies.has(key))check(equal(containerPolicies.get(key),protectedConfig),'Actual environment/security/volumes/startup policy changed')
    else containerPolicies.set(key,structuredClone(protectedConfig))
    result.push({stack,server:row.server,service,id:c.Id,source,imageId:c.Image,running:c.State.Running,restarting:c.State.Restarting,restartCount:c.RestartCount,pid:c.State.Pid,healthy:c.State.Health?.Status==='healthy',
     policy:{readOnly:c.HostConfig?.ReadonlyRootfs,privileged:c.HostConfig?.Privileged,securityOpt:c.HostConfig?.SecurityOpt,capAdd:c.HostConfig?.CapAdd,capDrop:c.HostConfig?.CapDrop,pidsLimit:c.HostConfig?.PidsLimit,user:c.Config.User,productionMode:env.includes('NODE_ENV=production')}})
   }
  }
  return result
 }
 async function verifyImages(which='target',onlyStack){
  check(['source','target'].includes(which)&&(!onlyStack||APPS.includes(onlyStack)),'Unexpected image qualification scope')
  const descriptor=plan[which]
  for(const stack of onlyStack?[onlyStack]:APPS){
   const row=rowFor(stack),actual=await t.read('InspectImage',{server:row.server,image:IMAGE+descriptor.sha}),imageId=assertImageIdentity(actual,descriptor.image)
   const key=imageKey(which,row.server)
   if(images.has(key))check(images.get(key)===imageId,'Cached image changed during release')
   images.set(key,imageId)
   await onProgress({phase:'image',status:'verified',stack,release:which,source:descriptor.sha,imageId,indexDigest:descriptor.image.indexDigest,platform:'linux/amd64',layers:descriptor.image.diffIds.length})
  }
 }
 async function writeFile(stack,which,nextPhase){
  const row=rowFor(stack);check(APPS.includes(stack),'Core source writes prohibited')
  await guard([stack])
  const contents=files?.get(stack)?.[which];check(typeof contents==='string'&&hash(contents)===row[which].sha256,'Unqualified public source bytes')
  await t.writeHostFile(stack,contents);phases.set(stack,nextPhase)
  try{await guard([stack])}catch{throw Object.assign(Error('Host write succeeded but exact source readback is unresolved'),{uncertain:true})}
 }
 async function stage(stack){
  check(phases.get(stack)==='source','Release staging may not replay a partial source')
  await writeFile(stack,'target','target-file')
  const row=rowFor(stack),before=structuredClone(configs.get(stack)),patch={commit:row.target.commit,branch:row.target.branch,auto_pull:false,extra_args:RELEASE_ARGS}
  await t.setHostReleaseConfig(stack,patch)
  try{
   const after=await t.read('GetStack',{stack})
   check(after?._id?.$oid===identities.get(stack)&&equal(after.config,{...before,...patch}),'Full post-update configuration mismatch')
   configs.set(stack,structuredClone(after.config));phases.set(stack,'target');await guard([stack])
  }catch{throw Object.assign(Error('Configuration acknowledged but exact source/config readback is unresolved'),{uncertain:true})}
  await onProgress({phase:'host-config',status:'verified',stack,fullConfigReadback:true})
 }
 async function state(){
  await guard([CORE])
  return validateStateReceipt(parseMarker(await t.execute('RunStackService',oneOff(CORE,'postgres',{entrypoint:'sh',user:'postgres',command:['-ec',stateCommand]})),'STATE'))
 }
 async function metadata(stack){
  check(APPS.includes(stack)&&phases.get(stack)==='target','Metadata requires qualified target host source')
  await guard([stack])
  return parseMarker(await t.execute('RunStackService',oneOff(stack,'db-migrate',{command:['timeout','-k','5','30','node','--input-type=module','-e',METADATA_CODE+`console.log('SCHEMA_UPGRADE_METADATA='+JSON.stringify(metadata));`]})),'METADATA')
 }
 return {assertIdle,inspect,verifyImages,stage,state,metadata,
  async stop(stack,service){
   check(APPS.includes(stack)&&service==='worker'&&phases.get(stack)==='target','Only old Workers may be drained')
   await guard([stack]);const result=await t.execute('StopStack',{stack,services:[service],stop_time:150})
   stoppedWorkers.add(stack);return result
  },
  async migrate(){
   check(plan.format===PRODUCT_SCHEMA_FORMAT&&!migrationSubmitted&&APPS.every(stack=>phases.get(stack)==='target'&&stoppedWorkers.has(stack)),'Only one staged, drained product48→49 migration may submit')
   await guard()
   const rows=await inspect()
   check(rows.every(row=>row.source===plan.source.sha&&row.restartCount===0&&!row.restarting
    &&(row.service==='worker'?!row.running&&row.pid===0:row.running&&row.healthy&&row.pid>0)),'Old Workers must be stopped and old Web healthy before product migration')
   const expected=Object.fromEntries(metadataKeys.map(key=>[key,plan.target[key]]))
   // The executing image proves all public release metadata before opening DB.
   // Native schema is unchanged: do not inject any environment/drain override.
   const code=METADATA_CODE+`import{isDeepStrictEqual}from'node:util';if(!isDeepStrictEqual(metadata,${JSON.stringify(expected)}))throw Error('target drift');await import('./server/src/migrate-bin.ts');if(process.exitCode)throw Error('migration failed');console.log('SCHEMA_UPGRADE_MIGRATED='+JSON.stringify({sha:metadata.sha,schema:metadata.schema,product:metadata.productVersion}));`
   migrationSubmitted=true
   const receipt=parseMarker(await t.execute('RunStackService',oneOff(APPS[0],'db-migrate',{command:['timeout','-k','30','300','node','--import','tsx','--input-type=module','-e',code]})),'MIGRATED')
   check(equal(receipt,{sha:plan.target.sha,schema:13,product:49}),'Product migration marker mismatch')
  },
  async deploy(stack,service){check(APPS.includes(stack)&&['lingxiloop','worker'].includes(service)&&phases.get(stack)==='target','Only qualified app services may deploy');await guard([stack]);return t.execute('DeployStack',{stack,services:[service]})},
  async verifyHealthy(stack,service){
   const deadline=Date.now()+180000
   while(Date.now()<deadline){
    const r=(await inspect()).find(r=>r.stack===stack&&r.service===service)
    check(r?.source===plan.target.sha&&r.imageId===images.get(imageKey('target',r.server)),'Deployed service is not qualified target')
    if(r.running&&!r.restarting&&r.healthy&&r.restartCount===0)return
    await wait(2000,undefined,{signal})
   }
   throw Error('Application readiness deadline exceeded')
  },
  async stagePreparation(stack){check(phases.get(stack)==='source','Image preparation cannot replay partial staging');await writeFile(stack,'preparation','preparation')},
  async pullPrepared(stack){check(APPS.includes(stack)&&phases.get(stack)==='preparation','Only explicit prepared image pull allowed');await guard([stack]);return t.execute('PullStack',{stack,services:['db-migrate']})},
  async restoreSource(stack){check(phases.get(stack)==='preparation','Expected online preparation source');await writeFile(stack,'source','source')},
  wait:ms=>wait(ms,undefined,{signal}),
 }
}
