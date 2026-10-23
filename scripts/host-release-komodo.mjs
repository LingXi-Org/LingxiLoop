// Native Komodo2.3.3 calls. Only explicit reviewed product/native plans may migrate.
// No Git/private API, secret or env writes.
import {READER_FORMAT,TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT,SAME54_FORMAT,RUNTIME_PATCH_FORMAT,isPublicTextPlan,qualifyImageEnvironments,normalizeImageEnvironment,assertSeedEquality} from './public-text-release.mjs'
import {seedCommand} from './public-text-seed.mjs'
import {assertStoppedReceipt,assertStoppedContainers,assertRecoveryConfig} from './host-release-stopped-recovery.mjs'
import {isDeepStrictEqual as equal} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
import {createTransport,parseMarker,validateStateReceipt,stateCommand,METADATA_CODE} from './schema-upgrade-komodo.mjs'
import {executeMemoryBackup} from './verify-memory-backup.mjs'
import {APPS,CORE,IMAGE,RELEASE_ARGS,PRODUCT_SCHEMA_FORMAT,NATIVE_SCHEMA_FORMAT,assertNativeBackupReceipt,metadataKeys,check,hash,validateHostPlanShape,assertImageIdentity} from './host-release.mjs'
const actions=['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying']
const id=/^[a-f0-9]{24}$/,hex=/^[a-f0-9]{64}$/
const PUBLIC_METADATA_CODE=`const {publicTextDeployment,publicTextModelOptions}=await import('./server/src/agent-runtime/public-text-deployment.ts');Object.assign(metadata,{publicText:releaseVersions.publicText,deployment:publicTextDeployment,configurationSha256:hash(await readFile('server/src/agent-runtime/public-text-deployment.ts')),modelOptions:publicTextModelOptions()});`;
const TRACE_METADATA_CODE=`Object.assign(metadata,{runTrace:releaseVersions.runTrace});`;
const oneOff=(stack,service,extra)=>({stack,service,no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,...extra})
export function createHostReleaseOperations({plan,files,apiKey,apiSecret,signal,onProgress=async()=>{},transport,wait=delay,backupExecutor=executeMemoryBackup,sourceConfigurationProof}){
 validateHostPlanShape(plan)
 const native=plan.format===NATIVE_SCHEMA_FORMAT,trace=[TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT,SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format),provenanceUpgrade=[READER_FORMAT,TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT].includes(plan.format),publicText=isPublicTextPlan(plan),nodeEnvironments=publicText?qualifyImageEnvironments(plan):null
 const t=transport??createTransport({apiKey,apiSecret,signal,onProgress,confirmTerminal:native||publicText})
 const phases=new Map(plan.stacks.map(r=>[r.stack,'source'])),configs=new Map(),identities=new Map(),images=new Map(),containerPolicies=new Map()
 const stoppedWriters=new Set()
 let restoringSource=false
 let patchSubmitted=false,patchChecked=false,migrationSubmitted=false,backupSubmitted=false,backupVerified=false,seedSubmitted=false,seedVerified=false
 const rowFor=stack=>{const r=plan.stacks.find(r=>r.stack===stack);check(r,'Unexpected stack');return r}
 const imageKey=(which,server)=>which+':'+server
 async function hosts(){
  const result=await t.read('ListServers',{});check(Array.isArray(result),'Server inventory unavailable')
  for(const name of ['manager','shanghai-a','shanghai-b'])check(result.filter(r=>r.name===name&&r.info?.state==='Ok'&&id.test(r.id??'')).length===1,'Required host unavailable')
  return result
 }
 function assertConfig(detail,row,serverId){
  const c=detail?.config,phase=phases.get(row.stack),ref=['target','source-file'].includes(phase)?row.target:row.source,emptyHook={path:'',command:'',shell_mode:false}
  check(id.test(detail?._id?.$oid??'')&&c&&c.server_id===serverId&&c.swarm_id===''&&c.repo==='LingXi-Org/LingxiLoop'
   &&c.branch===ref.branch&&c.commit===ref.commit&&c.files_on_host===true&&c.reclone===false&&c.clone_path===''
   &&c.git_account===''&&c.registry_account===''&&c.linked_repo===''&&c.file_contents===''
   &&c.run_directory===`deploy/komodo/${row.stack}`&&c.env_file_path==='.env'&&equal(c.file_paths,['compose.yml'])
   &&equal(c.additional_env_files,[])&&equal(c.config_files,[])&&c.auto_update===false&&c.auto_update_all_services===false
   &&c.poll_for_updates===false&&c.auto_pull===ref.autoPull&&equal(c.extra_args,ref.extraArgs)&&c.run_build===false
   &&c.destroy_before_deploy===false&&c.project_name===''&&c.compose_cmd_wrapper===''&&equal(c.build_extra_args,[])
   &&equal(c.pre_deploy,emptyHook)&&equal(c.post_deploy,emptyHook)&&equal(c.ignore_services,row.stack===CORE?[]:['db-migrate']),'Frozen source/configuration drift')
  if([SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format))assertRecoveryConfig(detail,row,sourceConfigurationProof?.find(r=>r.stack===row.stack))
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
   const phase=phases.get(stack),ref=phase==='target-file'?row.target:phase==='source-file'?row.source:phase==='preparation'?row.preparation:row[phase]
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
     &&Number.isSafeInteger(c.RestartCount)&&Number.isSafeInteger(c.State.Pid)&&c.State.Pid>=0&&(c.State.OOMKilled===false||restoringSource&&source===plan.target.sha),'Unexpected actual container identity/state')
    const which=source===plan.source.sha?'source':'target',qualified=images.get(imageKey(which,row.server))
    if(qualified)check(c.Image===qualified,'Container image differs from actual qualified host image')
    // Keep secret-bearing values only in memory. Never persist their contents.
    const protectedConfig={env:publicText?normalizeImageEnvironment(env,source,nodeEnvironments):env.filter(x=>!x.startsWith('LINGXILOOP_COMMIT_SHA=')).toSorted(),host:c.HostConfig,user:c.Config.User,command:c.Config.Cmd,entrypoint:c.Config.Entrypoint,health:c.Config.Healthcheck,mounts:c.Mounts}
    // Docker fills container-specific host fields; compare security/volume fields
    // explicitly instead of comparing the whole HostConfig object.
    protectedConfig.host=Object.fromEntries(['ReadonlyRootfs','Privileged','SecurityOpt','CapAdd','CapDrop','PidsLimit','Binds','Tmpfs','PortBindings','Memory','NanoCpus','Devices','DeviceRequests'].map(k=>[k,c.HostConfig?.[k]]))
    const key=stack+':'+service
    if(containerPolicies.has(key))check(equal(containerPolicies.get(key),protectedConfig),'Actual environment/security/volumes/startup policy changed')
    else containerPolicies.set(key,structuredClone(protectedConfig))
    result.push({stack,server:row.server,service,id:c.Id,source,imageId:c.Image,running:c.State.Running,restarting:c.State.Restarting,restartCount:c.RestartCount,pid:c.State.Pid,healthy:c.State.Health?.Status==='healthy',
     policy:{readOnly:c.HostConfig?.ReadonlyRootfs,privileged:c.HostConfig?.Privileged,securityOpt:c.HostConfig?.SecurityOpt,capAdd:c.HostConfig?.CapAdd,capDrop:c.HostConfig?.CapDrop,pidsLimit:c.HostConfig?.PidsLimit,user:c.Config.User,productionMode:env.includes('NODE_ENV=production'),...([SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format)?{configurationSha256:hash(JSON.stringify(protectedConfig))}:{})}})
   }
  }
  return result
 }
 async function verifyImages(which='target',onlyStack){
  check(['source','target'].includes(which)&&(!onlyStack||APPS.includes(onlyStack)),'Unexpected image qualification scope')
  const descriptor=plan[which]
  for(const stack of onlyStack?[onlyStack]:APPS){
   const row=rowFor(stack),actual=await t.read('InspectImage',{server:row.server,image:IMAGE+descriptor.sha}),imageId=assertImageIdentity(actual,descriptor.image)
   if(publicText)check(equal(actual.Config?.Env,nodeEnvironments.get(descriptor.sha).config.Env),'Host image Env differs from audited public config')
   const key=imageKey(which,row.server)
   if(images.has(key))check(images.get(key)===imageId,'Cached image changed during release')
   images.set(key,imageId)
   await onProgress({phase:'image',status:'verified',stack,release:which,source:descriptor.sha,imageId,indexDigest:descriptor.image.indexDigest,platform:'linux/amd64',layers:descriptor.image.diffIds.length})
  }
  return Object.fromEntries((onlyStack?[onlyStack]:APPS).map(stack=>[stack,images.get(imageKey(which,rowFor(stack).server))]))
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
 async function metadata(stack,which='target'){
  check(APPS.includes(stack)&&['source','target'].includes(which)&&(which==='target'||restoringSource)&&phases.get(stack)===which,'Metadata requires qualified target host source')
  await guard([stack])
  return parseMarker(await t.execute('RunStackService',oneOff(stack,'db-migrate',{command:['timeout','-k','5','30','node',...(publicText?['--import','tsx']:[]),'--input-type=module','-e',METADATA_CODE+(publicText?PUBLIC_METADATA_CODE:'')+(trace?TRACE_METADATA_CODE:'')+`console.log('SCHEMA_UPGRADE_METADATA='+JSON.stringify(metadata));`]})),'METADATA')
 }
 return {assertIdle,inspect,verifyImages,stage,state,metadata,
  async prepareSourceRestoration(boundary){
   check([SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format)&&!restoringSource&&configs.size===0&&boundary.original?.length===4,'Source restoration may initialize only once')
   const matches=(c,r)=>c.commit===r.commit&&c.branch===r.branch&&c.auto_pull===r.autoPull&&equal(c.extra_args,r.extraArgs)
   for(const row of plan.stacks){
    await t.refreshStackCache(row.stack);const detail=await t.read('GetStack',{stack:row.stack})
    assertRecoveryConfig(detail,row,sourceConfigurationProof?.find(r=>r.stack===row.stack))
    const remote=detail.info?.remote_contents
    check(equal(detail.info?.remote_errors,[])&&equal(detail.info?.missing_files,[])&&remote?.length===1&&remote[0].path==='compose.yml','Restoration host source unavailable')
    const fileHash=hash(remote[0].contents),source=matches(detail.config,row.source),target=row.stack!==CORE&&matches(detail.config,row.target)
    check(source||target,'Unrecognized source/target configuration')
    if(fileHash===row.source.sha256){check(source,'Unexplained source file under target configuration');phases.set(row.stack,'source')}
    else {check(row.stack!==CORE&&fileHash===row.target.sha256,'Unrecognized host source');phases.set(row.stack,target?'target':'target-file')}
   }
   await guard()
   const names={RunStackService:'RunStackService',WriteStackFileContents:'WriteStackContents',StopStack:'StopStackService',DeployStack:'DeployStackService'}
   for(const e of boundary.operations){
    const u=await t.read('GetUpdate',{id:e.updateId})
    check(u?._id?.$oid===e.updateId&&u.operation===names[e.operation]&&u.target?.type==='Stack'&&u.target.id===identities.get(e.stack)&&u.status==='Complete'&&u.success===e.success,'Saved operation is not the same known terminal update')
   }
   restoringSource=true
   await assertIdle()
  },
  async restoreAcceptedSource(stack){
   check(restoringSource&&[SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format)&&APPS.includes(stack),'Only explicit same54 source restoration allowed')
   await guard();const rows=await inspect()
   check(rows.length===4&&rows.every(r=>!r.running&&!r.restarting&&r.pid===0),'All four writers must remain stopped before source restoration')
   const phase=phases.get(stack)
   if(phase==='source')return
   check(['target','target-file'].includes(phase),'Unknown restoration source phase')
   await writeFile(stack,'source',phase==='target'?'source-file':'source')
   if(phase==='target'){
    const row=rowFor(stack),before=structuredClone(configs.get(stack)),patch={commit:row.source.commit,branch:row.source.branch,auto_pull:false,extra_args:RELEASE_ARGS}
    await t.setHostReleaseConfig(stack,patch)
    try{const after=await t.read('GetStack',{stack});check(after?._id?.$oid===identities.get(stack)&&equal(after.config,{...before,...patch}),'Restoration configuration readback differs');configs.set(stack,structuredClone(after.config));phases.set(stack,'source');await guard([stack])}
    catch{throw Object.assign(Error('Restoration configuration outcome unresolved'),{uncertain:true})}
   }
  },
  async resumeStoppedBoundary(receipt){
   const original=assertStoppedReceipt(plan,receipt)
   check([...phases.values()].every(p=>p==='source')&&configs.size===0&&!migrationSubmitted&&!seedSubmitted,'Recovery initialization may run only once')
   for(const stack of APPS)phases.set(stack,'target')
   await guard();assertStoppedContainers(await inspect(),original)
   for(const row of plan.stacks)assertRecoveryConfig(await t.read('GetStack',{stack:row.stack}),row,sourceConfigurationProof?.find(r=>r.stack===row.stack))
   const operations={StopStack:'StopStackService',RunStackService:'RunStackService',WriteStackFileContents:'WriteStackContents'}
   for(const e of receipt.events.filter(e=>e.phase==='komodo'&&e.status==='complete')){
    const u=await t.read('GetUpdate',{id:e.updateId})
    check(u?._id?.$oid===e.updateId&&u.operation===operations[e.operation]&&u.target?.type==='Stack'&&u.target.id===identities.get(e.stack)&&u.status==='Complete'&&u.success===true,'Saved native update not confirmed')
   }
   for(const r of original)stoppedWriters.add(r.stack+':'+r.service)
   await onProgress({phase:'recovery',status:'old-updates-and-stopped-boundary-confirmed'})
  },
  async stop(stack,service){
   check(APPS.includes(stack)&&(service==='worker'||(native||provenanceUpgrade||[SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format))&&service==='lingxiloop')&&(phases.get(stack)==='target'||restoringSource),'Only reviewed old writers may be drained')
   await guard([stack]);if([SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format))await onProgress({phase:'service-action',action:'StopStack',stack,service});const result=await t.execute('StopStack',{stack,services:[service],stop_time:150})
   stoppedWriters.add(stack+':'+service);return result
  },
  async backup(){
   check(native&&!backupSubmitted&&APPS.every(stack=>phases.get(stack)==='target'&&['lingxiloop','worker'].every(service=>stoppedWriters.has(stack+':'+service))),'Fresh native backup requires all4 drained writers')
   await guard();const rows=await inspect()
   check(rows.every(row=>row.source===plan.source.sha&&!row.running&&row.pid===0&&!row.restarting&&row.restartCount===0),'All original writers must remain stopped before backup')
   backupSubmitted=true
   const receipt=await backupExecutor({plan:plan.backup,apiKey,apiSecret,signal,expectedStackId:identities.get(CORE),onProgress:async event=>onProgress({phase:'backup-native',...event})})
   assertNativeBackupReceipt(plan,receipt);backupVerified=true;return receipt
  },
  async seedPrecheck(){
   check(provenanceUpgrade&&!seedSubmitted&&!migrationSubmitted,'Only one reviewed provenance seed precheck permitted');await guard();seedSubmitted=true;
   const u=await t.execute('RunStackService',oneOff(CORE,'postgres',{entrypoint:'sh',user:'postgres',command:['-ec',await seedCommand()]}));
   const value=parseMarker(u,'METADATA');assertSeedEquality(value);seedVerified=true;
   return {...value,native:{id:u._id?.$oid,operation:u.operation,target:u.target,status:u.status,success:u.success,startTs:u.start_ts,endTs:u.end_ts}};
  },
  async patchPrecheck(){
   check(plan.format===RUNTIME_PATCH_FORMAT&&!patchChecked&&!patchSubmitted&&APPS.every(stack=>phases.get(stack)==='target'),'One qualified runtime patch precheck required');
   await guard();await verifyImages('target');
   const code=METADATA_CODE+PUBLIC_METADATA_CODE+TRACE_METADATA_CODE+`import{readRuntimePatchBarrier}from'./server/src/db/runtime-patch.ts';import{pool}from'./server/src/db/pool.ts';const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'");const b=await readRuntimePatchBarrier(c);await c.query('COMMIT');console.log('SCHEMA_UPGRADE_PATCH_READ='+JSON.stringify(b));}finally{c.release();await pool.end();}`;
   const value=parseMarker(await t.execute('RunStackService',oneOff(APPS[0],'db-migrate',{command:['timeout','-k','5','30','node','--import','tsx','--input-type=module','-e',code]})),'PATCH_READ');
   check(value?.incompatibleRuns===0,'Unfinished bound/checkpoint runs must complete under their original runtime');patchChecked=true;return value;
  },
  async patchProvenance(){
   check(plan.format===RUNTIME_PATCH_FORMAT&&patchChecked&&!patchSubmitted&&!migrationSubmitted
    &&APPS.every(stack=>phases.get(stack)==='target'&&['worker','lingxiloop'].every(service=>stoppedWriters.has(stack+':'+service))),'Only one qualified and fully drained provenance CAS may submit');
   await guard();await verifyImages('target');const rows=await inspect();
   check(rows.every(row=>row.source===plan.source.sha&&!row.running&&!row.restarting&&row.pid===0&&row.restartCount===0
    &&plan.publicText.sourceContainers.some(c=>c.stack===row.stack&&c.service===row.service&&c.id===row.id&&c.imageId===row.imageId)),'Original runtime patch writers changed');
   const expected={...Object.fromEntries(metadataKeys.map(key=>[key,plan.target[key]])),publicText:2,deployment:plan.publicText.target,configurationSha256:plan.publicText.targetConfigurationSha256,modelOptions:{publicTextProtocol:plan.publicText.target.producer},runTrace:1};
   const code=METADATA_CODE+PUBLIC_METADATA_CODE+TRACE_METADATA_CODE+`import{isDeepStrictEqual}from'node:util';if(!isDeepStrictEqual(metadata,${JSON.stringify(expected)}))throw Error('target drift');const {applyPublishedRuntimePatch}=await import('./server/src/db/runtime-patch.ts');const {pool}=await import('./server/src/db/pool.ts');try{const r=await applyPublishedRuntimePatch(pool,${JSON.stringify(plan.source)},${JSON.stringify(plan.target)});console.log('SCHEMA_UPGRADE_PATCHED='+JSON.stringify(r));}finally{await pool.end();}`;
   patchSubmitted=true;
   const receipt=parseMarker(await t.execute('RunStackService',oneOff(APPS[0],'db-migrate',{command:['timeout','-k','5','60','node','--import','tsx','--input-type=module','-e',code]})),'PATCHED');
   check(equal(receipt,{source:plan.source.runtime,target:plan.target.runtime,schema:14,product:54,updated:1}),'Runtime patch receipt mismatch');
  },
  async migrate(){
   check([PRODUCT_SCHEMA_FORMAT,NATIVE_SCHEMA_FORMAT,READER_FORMAT,TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT].includes(plan.format)&&!migrationSubmitted&&(!native||backupVerified)&&(!provenanceUpgrade||seedVerified)
    &&APPS.every(stack=>phases.get(stack)==='target'&&(native||provenanceUpgrade?['worker','lingxiloop']:['worker']).every(service=>stoppedWriters.has(stack+':'+service))),'Only one staged, drained and backup-qualified migration may submit')
   await guard()
   const rows=await inspect()
   check(rows.every(row=>row.source===plan.source.sha&&row.restartCount===0&&!row.restarting
    &&(native||provenanceUpgrade||row.service==='worker'?!row.running&&row.pid===0:row.running&&row.healthy&&row.pid>0)),'Original writer state differs from reviewed migration boundary')
   const expected={...Object.fromEntries(metadataKeys.map(key=>[key,plan.target[key]])),...(publicText?{publicText:2,deployment:plan.publicText.target,configurationSha256:plan.publicText.targetConfigurationSha256,modelOptions:plan.publicText.target.producer==='disabled'?{}:{publicTextProtocol:plan.publicText.target.producer},...(trace?{runTrace:1}:{})}:{})}
   // The executing image proves all public release metadata before opening DB.
   // Product-only migrations never inject env. Native maintenance injects the
   // drain acknowledgement into this oneoff only, after verified fresh backup.
   const code=METADATA_CODE+(publicText?PUBLIC_METADATA_CODE:'')+(trace?TRACE_METADATA_CODE:'')+`import{isDeepStrictEqual}from'node:util';if(!isDeepStrictEqual(metadata,${JSON.stringify(expected)}))throw Error('target drift');await import('./server/src/migrate-bin.ts');if(process.exitCode)throw Error('migration failed');console.log('SCHEMA_UPGRADE_MIGRATED='+JSON.stringify({sha:metadata.sha,schema:metadata.schema,product:metadata.productVersion}));`
   migrationSubmitted=true
   const receipt=parseMarker(await t.execute('RunStackService',oneOff(APPS[0],'db-migrate',{...(native?{env:{LINGXIOS_SCHEMA_UPGRADE_DRAINED:'true'}}:{}),command:['timeout','-k','30','300','node','--import','tsx','--input-type=module','-e',code]})),'MIGRATED')
   check(equal(receipt,{sha:plan.target.sha,schema:plan.target.schema,product:plan.target.productVersion}),'Migration marker mismatch')
  },
  async deploy(stack,service){check(APPS.includes(stack)&&['lingxiloop','worker'].includes(service)&&phases.get(stack)===(restoringSource?'source':'target'),'Only qualified app services may deploy');await guard([stack]);if([SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format))await onProgress({phase:'service-action',action:'DeployStack',stack,service});return t.execute('DeployStack',{stack,services:[service]})},
  async verifyHealthy(stack,service,observedIdentity){
   check(![SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format)||hex.test(observedIdentity?.id??'')&&/^sha256:[a-f0-9]{64}$/.test(observedIdentity.imageId??''),'Observed same54 container identity required')
   const deadline=Date.now()+180000
   while(Date.now()<deadline){
    const r=(await inspect()).find(r=>r.stack===stack&&r.service===service)
    check(r?.source===plan[restoringSource?'source':'target'].sha&&r.imageId===images.get(imageKey(restoringSource?'source':'target',r.server))
     &&(!observedIdentity||r.id===observedIdentity.id&&r.imageId===observedIdentity.imageId),'Deployed service identity changed')
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
