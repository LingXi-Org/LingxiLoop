const presentationFormat='run-presentation-contract-host-release/v1',presentationMigration={version:54,name:'run_presentation_contract',checksum:'f58aafed796cabcb481bd381b4df298024d5effd0a576dae5e9638430aed38e2'};
const traceFormat='run-trace-provenance-host-release/v1',traceMigration={version:52,name:'run_trace_provenance',checksum:'2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886'};
import test from 'node:test'
import {assertImageFailure,restoreImageSource} from './host-release-image-recovery.mjs'
import {CASE_COVER_PACKAGE,READER_FORMAT,PRODUCER_FORMAT,CONVERSATION_FORMAT,MIGRATION53,MIGRATION51,SCHEMA14} from './public-text-release.mjs'
import assert from 'node:assert/strict'
import {createHostReleaseOperations} from './host-release-komodo.mjs'
import {APPS,CORE,IMAGE,RELEASE_ARGS,hash,sealHostPlan,runHostRelease,runImagePreparation} from './host-release.mjs'
function fixture(fault={}){
 if(fault.cover55||fault.same55)fault={...fault,producerV3:true};
 if(fault.producerV3)fault={...fault,producerV2:true};
 fault={...fault,image54:fault.image54||fault.runtimePatch||fault.producerV2}
 fault={...fault,presentation:fault.presentation||fault.image54,repair:fault.repair||fault.presentation||fault.image54,trace:fault.trace||fault.repair||fault.presentation||fault.image54}
 const a='a'.repeat(40),b='b'.repeat(40),h='c'.repeat(64),d='sha256:'+h
 const formal={runtime:'3.5.8',schema:13,protocol:11,schemaHash:h,integrity:'sha512-'+Buffer.alloc(64).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.5.8/fixture',productVersion:48,migrations:Array.from({length:48},(_,i)=>({version:i+1,name:'migration_'+(i+1),checksum:h}))}
 const image={indexDigest:d,configDigest:'sha256:'+'d'.repeat(64),manifestDigest:'sha256:'+'e'.repeat(64),diffIds:[d],auditSha256:h}
 const source={sha:a,...formal,image},target={sha:b,...formal,image},files=new Map(),configs=new Map(),actualFiles=new Map(),events=[],calls=[],updates=new Map()
 if(fault.native14||fault.sameNative14||fault.reader||fault.producer||fault.trace){
  const m49={version:49,name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'}
  Object.assign(source,{productVersion:49,migrations:[...formal.migrations,m49]});Object.assign(target,{runtime:'3.6.0',schema:14,productVersion:50,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.6.0/fixture',migrations:[...source.migrations,{version:50,name:'native_skill_delivery',checksum:h}]})
  if(fault.sameNative14||fault.reader||fault.producer||fault.trace)Object.assign(source,{...target,sha:a})
 }
 const backup={format:2,profile:'native13-product49',source:{sha:a,productVersion:source.productVersion,runtime:Object.fromEntries(['runtime','schema','protocol','schemaHash','integrity','tarball'].map(k=>[k,source[k]])),migrations:source.migrations},commandHash:h,attempt:'synthetic',nonce:'0123456789abcdef',command:'synthetic',migrationRehearsal:'not-performed',isolatedDatabase:'memory_verify_synthetic',backupDir:'/synthetic'}
 if(fault.upgrade){target.productVersion=49;target.migrations=[...formal.migrations,{version:49,name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'}]}
 const rawConfig=(commit,node)=>JSON.stringify({config:{Env:['NODE_VERSION='+node,'LINGXILOOP_COMMIT_SHA='+commit],Cmd:['node']}}),imageConfigs={source:rawConfig(a,'22.23.4'),target:rawConfig(b,'22.23.5')};
 const publicText={source:fault.producer||fault.trace?{reader:2,producer:fault.trace?'purpose-json-v1':'disabled'}:null,target:{reader:2,producer:fault.producer||fault.trace?'purpose-json-v1':'disabled'},sourceConfigurationSha256:fault.producer||fault.trace?h:null,targetConfigurationSha256:h,sourceContainers:fault.producer||fault.trace?APPS.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),imageId:'sha256:'+'f'.repeat(64)}))):null};
 if(fault.reader||fault.producer||fault.trace){
  source.schemaHash=SCHEMA14;Object.assign(target,{runtime:'3.7.0',schemaHash:SCHEMA14,productVersion:51,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.7.0/fixture',migrations:[...source.migrations,MIGRATION51]});
  if(fault.producer||fault.trace)Object.assign(source,{...target,sha:a});
  if(fault.trace)Object.assign(target,{runtime:'3.8.0',productVersion:52,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.0/fixture',migrations:[...source.migrations,traceMigration]});
  if(fault.repair){Object.assign(source,{runtime:target.runtime,productVersion:target.productVersion,tarball:target.tarball,migrations:target.migrations});Object.assign(target,{runtime:'3.8.2',productVersion:53,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.2/fixture',migrations:[...source.migrations,MIGRATION53]});}
  if(fault.presentation){Object.assign(source,{runtime:target.runtime,productVersion:target.productVersion,tarball:target.tarball,migrations:structuredClone(target.migrations)});Object.assign(target,{productVersion:54,migrations:[...structuredClone(source.migrations),presentationMigration]});}
  source.image={...image,configDigest:'sha256:'+hash(imageConfigs.source)};target.image={...image,configDigest:'sha256:'+hash(imageConfigs.target)};
 }
 let plan=sealHostPlan({format:fault.presentation?presentationFormat:fault.repair?CONVERSATION_FORMAT:fault.trace?traceFormat:fault.reader?READER_FORMAT:fault.producer?PRODUCER_FORMAT:fault.native14?'native-schema-host-release/v1':fault.upgrade?'product-schema-host-release/v1':'same-schema-host-release/v1',...(fault.native14?{backup}:{}),...((fault.reader||fault.producer||fault.trace)?{publicText,imageConfigs}:{}),createdAt:'2026-10-20T00:00:00Z',source,target,sourceAcceptanceSha256:h,qualification:{commit:b,conclusion:'success',ciUrl:'https://github.com/LingXi-Org/LingxiLoop/actions/runs/1'},stacks:[...APPS,CORE].map((stack,i)=>{
  const source='public source '+stack,target=i===2?source:'public target '+stack,preparation='public pull '+stack
  files.set(stack,{source,target,preparation});actualFiles.set(stack,source)
  const s={commit:a,branch:'release/source',sha256:hash(source),autoPull:true,extraArgs:[]}
  return {stack,server:i===1?'shanghai-b':'shanghai-a',source:s,target:i===2?s:{commit:b,branch:'release/target',sha256:hash(target),autoPull:false,extraArgs:RELEASE_ARGS},...(i===2?{}:{preparation:{commit:b,sha256:hash(preparation)}})}
 })})
 for(const [i,row] of plan.stacks.entries())configs.set(row.stack,{_id:{$oid:String(i+1).repeat(24)},config:{
  server_id:row.server==='shanghai-a'?'a'.repeat(24):'b'.repeat(24),swarm_id:'',repo:'LingXi-Org/LingxiLoop',branch:row.source.branch,commit:a,
  files_on_host:true,reclone:false,clone_path:'',git_account:'',registry_account:'',linked_repo:'',file_contents:'',run_directory:'deploy/komodo/'+row.stack,
  env_file_path:'.env',file_paths:['compose.yml'],additional_env_files:[],config_files:[],auto_update:false,auto_update_all_services:false,poll_for_updates:false,
  auto_pull:true,run_build:false,destroy_before_deploy:false,project_name:'',compose_cmd_wrapper:'',extra_args:[],build_extra_args:[],pre_deploy:{path:'',command:'',shell_mode:false},post_deploy:{path:'',command:'',shell_mode:false},
  ignore_services:row.stack===CORE?[]:['db-migrate'],environment:'private fixture never persist',
 }})
 if(fault.image54){const p=structuredClone(plan);p.format='product54-image-host-release/v1';for(const k of ['runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations'])p.source[k]=structuredClone(p.target[k]);for(const row of p.stacks.slice(0,2)){row.source.autoPull=false;row.source.extraArgs=RELEASE_ARGS;const c=configs.get(row.stack).config;c.auto_pull=false;c.extra_args=RELEASE_ARGS}plan=sealHostPlan(p);Object.assign(source,p.source)}
 if(fault.runtimePatch||fault.producerV2){const p=structuredClone(plan);p.format='runtime-patch-host-release/v1';p.target.runtime='3.8.3';p.target.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.3/fixture';p.target.integrity='sha512-'+Buffer.alloc(64,1).toString('base64');plan=sealHostPlan(p);Object.assign(target,p.target)}
 if(fault.producerV2){const p=structuredClone(plan);p.source.runtime='3.8.3';p.source.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.3/fixture';p.target.runtime='3.8.5';p.target.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.5/fixture';p.publicText.target.producer='purpose-json-v2';p.publicText.targetConfigurationSha256='d'.repeat(64);plan=sealHostPlan(p);Object.assign(source,p.source);Object.assign(target,p.target)}
 if(fault.producerV3){const p=structuredClone(plan);p.source.runtime='3.8.5';p.source.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.5/fixture';p.target.runtime='3.8.7';p.target.tarball='https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.7/fixture';p.publicText.source.producer='purpose-json-v2';p.publicText.target={reader:3,producer:'purpose-json-v3'};plan=sealHostPlan(p);Object.assign(source,p.source);Object.assign(target,p.target)}
 if(fault.cover55||fault.same55){
  const p=structuredClone(plan);p.format=fault.same55?'product55-image-host-release/v1':'case-cover55-host-release/v1';
  for(const d of [p.source,p.target])Object.assign(d,CASE_COVER_PACKAGE)
  p.publicText.source=p.publicText.target={reader:3,producer:'purpose-json-v3'};p.publicText.sourceConfigurationSha256=p.publicText.targetConfigurationSha256;
  p.target.productVersion=55;p.target.migrations.push({version:55,name:'case_covers',checksum:'609100abaddceeaba19d363962d6defbfae3276450a2fd660777d7efd4a66160'});
  if(fault.same55){p.source.productVersion=55;p.source.migrations=structuredClone(p.target.migrations)}
  else p.backup={...backup,format:2,profile:'native14-product54',source:{sha:p.source.sha,productVersion:54,runtime:Object.fromEntries(['runtime','schema','protocol','schemaHash','integrity','tarball'].map(k=>[k,p.source[k]])),migrations:p.source.migrations}};
  plan=sealHostPlan(p);Object.assign(source,p.source);Object.assign(target,p.target);if(fault.cover55)Object.assign(backup,p.backup);
 }
 const containers=APPS.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({
  stack,service,Id:String(i*2+j+1).repeat(64),Image:'sha256:'+(fault.sourceImageMismatch?'0':'f').repeat(64),
  Config:{Image:IMAGE+a,Env:['LINGXILOOP_COMMIT_SHA='+a,...((fault.reader||fault.producer||fault.trace)?['NODE_VERSION=22.23.4']:[]),'NODE_ENV=production','SECRET=private fixture never persist'],User:'node',Cmd:['npm','run',service==='worker'?'worker:start':'server:start']},
  State:{Running:true,Restarting:false,Pid:1,OOMKilled:false,Health:{Status:'healthy'}},RestartCount:0,
  HostConfig:{ReadonlyRootfs:service==='worker',Privileged:false,SecurityOpt:[],CapAdd:[],CapDrop:[],PidsLimit:128},
 })))
 const state={...formal,schemaHash:source.schemaHash,runtime:source.runtime,schema:source.schema,migrations:source.migrations,installedSchema:source.schema,product:source.productVersion,count:source.productVersion,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:4,queued:3,pendingCapture:1}
 delete state.integrity;delete state.tarball;delete state.productVersion
 const t={
  async read(op,p){
   calls.push({op,...p})
   if(op==='GetUpdate')return structuredClone(updates.get(p.id))
   if(op==='GetProcedureActionState')return {running:false}
   if(op==='ListServers')return ['manager','shanghai-a','shanghai-b'].map((name,i)=>({name,id:(i===2?'b':'a').repeat(24),info:{state:fault.hostDown&&name==='shanghai-b'?'Offline':'Ok'}}))
   if(op==='GetStackActionState')return Object.fromEntries(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].map(k=>[k,false]))
   if(op==='GetStack')return {...structuredClone(configs.get(p.stack)),info:{remote_contents:[{path:'compose.yml',contents:actualFiles.get(p.stack)}],remote_errors:fault.stale?['unavailable']:[],missing_files:[]}}
   if(op==='ListStackServices')return containers.filter(c=>c.stack===p.stack).map(c=>({service:c.service,container:{id:c.Id}}))
   if(op==='InspectContainer')return structuredClone(containers.find(c=>c.Id===p.container))
   if(op==='InspectImage')return {...((fault.reader||fault.producer||fault.trace)?{Config:JSON.parse(imageConfigs[p.image===IMAGE+a?'source':'target']).config}:{}),Id:'sha256:'+'f'.repeat(64),RepoDigests:[IMAGE.slice(0,-1)+'@'+d],Os:'linux',Architecture:fault.image?'arm64':'amd64',RootFS:{Type:'layers',Layers:[d]}}
   throw Error('Unexpected read '+op)
  },
  async refreshStackCache(stack){calls.push({op:'RefreshStackCache',stack})},
  async writeHostFile(stack,contents){calls.push({op:'WriteStackFileContents',stack});if(fault.unknownWrite)throw Object.assign(Error('private fixture never persist'),{uncertain:true});actualFiles.set(stack,contents)},
  async setHostReleaseConfig(stack,config){calls.push({op:'UpdateStack',stack});Object.assign(configs.get(stack).config,config);if(fault.configDrift)configs.get(stack).config.environment='changed'},
  async execute(op,p){
   calls.push({op,...p})
   if(op==='RunStackService'){
    assert.equal(p.no_deps,true);assert.equal(p.pull,false);assert.equal(p.service_ports,false);assert.equal(p.detach,false)
    if(JSON.stringify(p).includes('expected_plans'))return {_id:{$oid:'9'.repeat(24)},operation:'RunStackService',target:{type:'Stack',id:'3'.repeat(24)},status:'Complete',success:true,start_ts:1,end_ts:2,logs:[{stdout:'SCHEMA_UPGRADE_METADATA='+JSON.stringify({readOnly:true,fullVisibility:true,canonicalSha256:'18182ceea150aec2db43a871e6100d6e7793ddcfec326cfd5031266cd84bb2e7',equal:true,counts:{missing:0,mismatched:fault.seed?1:0,plans:1,entitlements:8,planEntitlements:8}})}]};
    if(JSON.stringify(p).includes('runtime-patch.ts')){
     assert.equal(p.stack,APPS[0]);assert.equal(p.service,'db-migrate');assert.equal(Object.hasOwn(p,'env'),false);assert.doesNotMatch(JSON.stringify(p),/migrate-bin|seedCommand/)
     if(JSON.stringify(p).includes('applyPublishedRuntimePatch')){
      assert.ok(containers.every(c=>!c.State.Running));if(fault.patchUnknown)throw Object.assign(Error('unknown patch'),{uncertain:true});
      Object.assign(state,{runtime:target.runtime});return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_PATCHED='+JSON.stringify({source:source.runtime,target:target.runtime,schema:14,product:54,updated:1})}]}
     }
     return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_PATCH_READ='+JSON.stringify({prepared:0,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,incompatibleRuns:fault.bound?1:0})}]}
    }
    if(JSON.stringify(p).includes('migrate-bin')){
     assert.ok(fault.upgrade||fault.native14||fault.reader||fault.trace);assert.equal(p.stack,APPS[0]);assert.equal(p.service,'db-migrate')
     assert.equal(Object.hasOwn(p,'env'),Boolean(fault.native14));assert.equal(JSON.stringify(p).includes('LINGXIOS_SCHEMA_UPGRADE_DRAINED'),Boolean(fault.native14));if(fault.reader||fault.trace)assert.ok(containers.every(c=>!c.State.Running));if(fault.native14){assert.deepEqual(p.env,{LINGXIOS_SCHEMA_UPGRADE_DRAINED:'true'});assert.ok(containers.every(c=>!c.State.Running))}
     assert.equal(containers.filter(c=>c.service==='worker').every(c=>!c.State.Running),true)
     if(fault.migrationUnknown)throw Object.assign(Error('unknown native migration'),{uncertain:true})
     Object.assign(state,{runtime:target.runtime,schema:target.schema,installedSchema:target.schema,product:target.productVersion,count:target.productVersion,migrations:target.migrations})
     return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_MIGRATED='+JSON.stringify({sha:b,schema:target.schema,product:target.productVersion})}]}
    }
    if(fault.native14)state.otherClients=containers.every(c=>!c.State.Running)?0:4;
    const candidate=actualFiles.get(p.stack)===files.get(p.stack)?.source?source:target
    const deployment=fault.producerV2&&candidate===source?plan.publicText.source:plan.publicText?.target,configurationSha256=fault.producerV2&&candidate===source?plan.publicText.sourceConfigurationSha256:plan.publicText?.targetConfigurationSha256;
    const marker=p.service==='postgres'?'STATE':'METADATA',value=p.service==='postgres'?state:{...candidate,...((fault.reader||fault.producer||fault.trace)?{publicText:fault.wrongV3Capability?2:deployment.reader,deployment,configurationSha256,modelOptions:fault.producerV2?{publicTextProtocol:fault.wrongV2Options?'purpose-json-v1':deployment.producer}:fault.producer||fault.trace?{publicTextProtocol:'purpose-json-v1'}:{},...(fault.trace?{runTrace:fault.traceMetadataWrong?0:1}:{})}:{})}
    return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_'+marker+'='+JSON.stringify(value)}]}
   }
   if(op==='PullStack'){assert.deepEqual(p.services,['db-migrate']);return}
   const c=containers.find(c=>c.stack===p.stack&&c.service===p.services[0])
   if(op==='StopStack'){c.State.Running=false;c.State.Restarting=false;c.State.Pid=0;return}
   assert.equal(op,'DeployStack');assert.deepEqual(configs.get(p.stack).config.extra_args,RELEASE_ARGS);assert.equal(configs.get(p.stack).config.auto_pull,false)
   const oldSource=actualFiles.get(p.stack)===files.get(p.stack).source;c.Id=(oldSource?'e':'f')+c.Id.slice(1);c.Config.Image=IMAGE+(oldSource?a:b);c.Config.Env=c.Config.Env.map(x=>x.startsWith('LINGXILOOP_COMMIT_SHA=')?'LINGXILOOP_COMMIT_SHA='+(oldSource?a:b):x.startsWith('NODE_VERSION=')?'NODE_VERSION='+(oldSource?'22.23.4':'22.23.5'):x);c.State.Running=true;c.State.Pid=2;c.RestartCount=0;c.State.Restarting=false;c.State.Health.Status='healthy'
   if(fault.containerImage)c.Image='sha256:'+'0'.repeat(64)
  },
 }
 if(fault.image54){
  let seq=0
  for(const name of ['execute','writeHostFile']){
   const perform=t[name].bind(t)
   t[name]=async(...args)=>{
    const op=name==='execute'?args[0]:'WriteStackFileContents',stack=name==='execute'?args[1].stack:args[0],updateId=(++seq).toString(16).padStart(24,'0')
    events.push({phase:'komodo',status:'submitting',operation:op,stack},{phase:'komodo',status:'pending',operation:op,stack,updateId})
    const operation={StopStack:'StopStackService',DeployStack:'DeployStackService',WriteStackFileContents:'WriteStackContents'}[op]??op
    try{const result=await perform(...args);updates.set(updateId,{_id:{$oid:updateId},operation,target:{type:'Stack',id:configs.get(stack)._id.$oid},status:'Complete',success:true});events.push({phase:'komodo',status:'complete',operation:op,stack,updateId});return result}
    catch(error){updates.set(updateId,{_id:{$oid:updateId},operation,target:{type:'Stack',id:configs.get(stack)._id.$oid},status:'Complete',success:false});events.push({phase:'komodo',status:'failed',operation:op,stack,updateId});throw error}
   }
  }
 }
 const sourceConfigurationProof=[...configs].map(([stack,d])=>({stack,id:d._id.$oid,configSha256:hash(JSON.stringify(d.config))}))
 const onProgress=async e=>events.push(e),ops=createHostReleaseOperations({plan,files,sourceConfigurationProof,transport:t,onProgress,wait:async()=>{},backupExecutor:async({expectedStackId})=>{assert.equal(expectedStackId,'3'.repeat(24));calls.push({op:'SnapshotRestore'});assert.ok(containers.every(c=>!c.State.Running));if(fault.backupUnknown)throw Object.assign(Error('unknown backup'),{uncertain:true});return {...backup,status:'Complete',success:true,updateId:'f'.repeat(24),dumpSha256:h,restoreCountsEqual:true,restoreProvenanceEqual:true,isolatedDatabaseRemoved:true}}})
 return {plan,ops,calls,events,configs,actualFiles,files,containers,transport:t,sourceConfigurationProof,updates,run:()=>runHostRelease({plan,ops,onProgress})}
}
async function failedImageRelease(partial=false,runtimePatch=false,producerV2=false,producerV3=false){
 const f=fixture({image54:true,runtimePatch,producerV2,producerV3})
 if(partial)f.ops.verifyHealthy=async()=>{throw Error('synthetic target readiness failure')}
 else {const state=f.ops.state;f.ops.state=async()=>{const s=await state();return f.containers.every(c=>!c.State.Running)?{...s,liveWork:1}:s}}
 await assert.rejects(f.run())
 const receipt={mode:f.plan.format,planHash:f.plan.planHash,complete:false,events:structuredClone(f.events)}
 const restore=()=>restoreImageSource({plan:f.plan,receipt,ops:createHostReleaseOperations({plan:f.plan,files:f.files,sourceConfigurationProof:f.sourceConfigurationProof,transport:f.transport,wait:async()=>{}})})
 return {...f,receipt,restore}
}
for(const [partial,runtimePatch] of [[false,false],[true,false],[false,true]])test(`${runtimePatch?'runtime patch':'same54'} source restoration handles ${partial?'partial target rollout':'all-stopped lease expiry'} with no migration or repeated stop`,async()=>{
 const f=await failedImageRelease(partial,runtimePatch),offset=f.calls.length
 if(partial){const target=f.containers.find(c=>c.Config.Image===IMAGE+f.plan.target.sha);target.RestartCount=2;target.State.Restarting=true;target.State.Health.Status='unhealthy'}
 const result=await f.restore();assert.equal(result.status,'complete');assert.equal(result.restoredSource,f.plan.source.sha)
 const calls=f.calls.slice(offset)
 assert.equal(calls.filter(c=>c.op==='StopStack').length,partial?1:0)
 assert.deepEqual(calls.filter(c=>c.op==='DeployStack').map(c=>c.stack+':'+c.services[0]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>a+':'+s)))
 assert.equal(calls.some(c=>c.op==='PullStack'||c.op==='SnapshotRestore'||c.op==='RunStackService'&&JSON.stringify(c.command??[]).includes('migrate-bin')),false)
 assert.ok(APPS.every(s=>f.actualFiles.get(s)===f.files.get(s).source&&f.configs.get(s).config.commit===f.plan.stacks[0].source.commit))
 assert.ok(result.containers.every(c=>c.source===f.plan.source.sha&&c.healthy))
 const after=f.calls.length;await assert.rejects(f.restore());assert.equal(f.calls.slice(after).some(c=>['StopStack','DeployStack','WriteStackFileContents','UpdateStack'].includes(c.op)),false)
})
test('source restoration refuses changed full config, native identity/status, or policy before any writes',async()=>{
 for(const fault of ['config','operation','target','status','success','policy','container']){
  const f=await failedImageRelease(true)
  if(fault==='config')f.configs.get(APPS[0]).config.environment='changed'
  else if(fault==='policy')f.containers[0].HostConfig.Privileged=true
  else if(fault==='container')f.containers[1].Id='d'.repeat(64)
  else {const u=f.updates.values().next().value;if(fault==='operation')u.operation='Wrong';if(fault==='target')u.target.id='d'.repeat(24);if(fault==='status')u.status='InProgress';if(fault==='success')u.success=false}
  const offset=f.calls.length;await assert.rejects(f.restore());assert.equal(f.calls.slice(offset).some(c=>['StopStack','DeployStack','WriteStackFileContents','UpdateStack'].includes(c.op)),false)
 }
})
test('same54 accepted source config proof is required before staging',async()=>{
 const f=fixture({image54:true}),ops=createHostReleaseOperations({plan:f.plan,files:f.files,transport:f.transport})
 await assert.rejects(runHostRelease({plan:f.plan,ops}));assert.equal(f.calls.some(c=>['StopStack','DeployStack','WriteStackFileContents','UpdateStack'].includes(c.op)),false)
})
test('same54 health wait rejects another container with the same audited image',async()=>{
 const f=fixture({image54:true}),read=f.transport.read
 f.transport.read=async(op,p)=>{
  if(op==='ListStackServices'&&f.events.some(e=>e.phase==='rollout'&&e.status==='observed')){
   const c=f.containers.find(c=>c.stack===APPS[0]&&c.service==='lingxiloop'&&c.Config.Image===IMAGE+f.plan.target.sha)
   if(c)c.Id='9'.repeat(64)
  }
  return read(op,p)
 }
 await assert.rejects(f.run());assert.equal(f.calls.filter(c=>c.op==='DeployStack').length,1)
})
test('same54 source restoration also binds the observed new source id through health wait',async()=>{
 const f=await failedImageRelease(true),ops=createHostReleaseOperations({plan:f.plan,files:f.files,sourceConfigurationProof:f.sourceConfigurationProof,transport:f.transport,wait:async()=>{}}),verify=ops.verifyHealthy
 ops.verifyHealthy=async(stack,service,identity)=>{if(stack===APPS[0]&&service==='lingxiloop'){const c=f.containers.find(c=>c.stack===stack&&c.service===service);c.Id='9'.repeat(64)}return verify(stack,service,identity)}
 await assert.rejects(restoreImageSource({plan:f.plan,receipt:f.receipt,ops}))
})
test('same54 source restoration refuses a replacement after health and before final registration',async()=>{
 const f=await failedImageRelease(true),ops=createHostReleaseOperations({plan:f.plan,files:f.files,sourceConfigurationProof:f.sourceConfigurationProof,transport:f.transport,wait:async()=>{}}),verify=ops.verifyHealthy
 ops.verifyHealthy=async(stack,service,identity)=>{await verify(stack,service,identity);if(stack===APPS[0]&&service==='lingxiloop')f.containers.find(c=>c.stack===stack&&c.service===service).Id='9'.repeat(64)}
 await assert.rejects(restoreImageSource({plan:f.plan,receipt:f.receipt,ops}))
})
test('product54 image-only adapter forbids migration and backup, preserves complete config and reader contracts',async()=>{
 const f=fixture({image54:true}),original=structuredClone(f.configs)
 await f.run()
 assert.equal(f.calls.some(c=>c.op==='SnapshotRestore'||c.op==='RunStackService'&&(JSON.stringify(c.command??[]).includes('migrate-bin')||Object.hasOwn(c,'env'))),false)
 assert.deepEqual(f.calls.filter(c=>c.op==='StopStack').map(c=>c.stack+':'+c.services[0]),['worker','lingxiloop'].flatMap(s=>APPS.map(a=>a+':'+s)))
 assert.deepEqual(f.calls.filter(c=>c.op==='DeployStack').map(c=>c.stack+':'+c.services[0]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>a+':'+s)))
 const before=f.calls.length;await assert.rejects(f.ops.migrate());await assert.rejects(f.ops.backup());assert.equal(f.calls.length,before)
 assert.ok(APPS.every(s=>f.configs.get(s).config.environment===original.get(s).config.environment))
 assert.equal(JSON.stringify(f.events).includes('private fixture'),false)
})
test('real adapter/engine contract stages public host files, preserves core and full secret config, no pull/migration',async()=>{
 const f=fixture();await f.run()
 assert.deepEqual(f.calls.filter(c=>c.op==='WriteStackFileContents').map(c=>c.stack),APPS)
 assert.equal(f.actualFiles.get(CORE),f.files.get(CORE).source)
 assert.equal(f.calls.some(c=>c.op==='PullStack'),false)
 assert.equal(JSON.stringify(f.events).includes('private fixture'),false)
 assert.ok(APPS.every(s=>f.configs.get(s).config.environment==='private fixture never persist'))
})
test('native14 same-schema public adapter keeps8 preparation and26 release actions, no maintenance command',async()=>{
 const f=fixture({sameNative14:true}),original=structuredClone(f.configs)
 const native=c=>['WriteStackFileContents','RunStackService','PullStack','StopStack','DeployStack','SnapshotRestore'].includes(c.op)
 await runImagePreparation({plan:f.plan,ops:f.ops})
 assert.equal(f.calls.filter(native).length,8);assert.deepEqual(f.configs,original)
 const offset=f.calls.length;await f.run();const release=f.calls.slice(offset)
 assert.equal(release.filter(native).length,26)
 assert.deepEqual(release.filter(c=>c.op==='StopStack').map(c=>c.stack+':'+c.services[0]),APPS.map(a=>a+':worker'))
 assert.deepEqual(release.filter(c=>c.op==='DeployStack').map(c=>c.stack+':'+c.services[0]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>a+':'+s)))
 assert.equal(f.calls.some(c=>c.op==='SnapshotRestore'||c.op==='RunStackService'&&(JSON.stringify(c.command??[]).includes('migrate-bin')||Object.hasOwn(c,'env'))),false)
 assert.equal(f.actualFiles.get(CORE),f.files.get(CORE).source)
 assert.ok(APPS.every(s=>f.configs.get(s).config.environment===original.get(s).config.environment))
 assert.equal(JSON.stringify(f.events).includes('private fixture'),false)
 const before=f.calls.length;await assert.rejects(f.ops.migrate());await assert.rejects(f.ops.backup());assert.equal(f.calls.length,before)
})
test('product migration adapter runs exact isolated A command once, no env override or old-Web stop',async()=>{
 const f=fixture({upgrade:true});await f.run()
 const migrations=f.calls.filter(c=>c.op==='RunStackService'&&JSON.stringify(c.command??[]).includes('migrate-bin'))
 assert.equal(migrations.length,1)
 assert.match(migrations[0].command.at(-1),/isDeepStrictEqual\(metadata,/)
 assert.deepEqual(migrations[0].command.slice(0,8),['timeout','-k','30','300','node','--import','tsx','--input-type=module'])
 assert.equal(JSON.stringify(f.events).includes('private fixture'),false)
 const before=f.calls.length;await assert.rejects(f.ops.migrate());assert.equal(f.calls.length,before)
})
test('ordinary or unstaged adapter cannot migrate, uncertain native migration ends all requests',async()=>{
 const normal=fixture(),unprepared=fixture({upgrade:true})
 await assert.rejects(normal.ops.migrate());await assert.rejects(unprepared.ops.migrate())
 assert.equal(normal.calls.length,0);assert.equal(unprepared.calls.length,0)
 const unknown=fixture({upgrade:true,migrationUnknown:true});await assert.rejects(unknown.run(),e=>e.uncertain===true)
 assert.equal(unknown.calls.at(-1).op,'RunStackService')
 assert.ok(JSON.stringify(unknown.calls.at(-1).command).includes('migrate-bin'))
 assert.equal(unknown.calls.some(c=>c.op==='DeployStack'),false)
})
test('host errors, platform mismatch and unexpected full-config change fail before stops',async()=>{
 for(const fault of [{hostDown:true},{stale:true},{image:true},{configDrift:true},{unknownWrite:true},{sourceImageMismatch:true}]){
  const f=fixture(fault);await assert.rejects(f.run())
  assert.equal(f.calls.some(c=>c.op==='StopStack'||c.op==='DeployStack'),false)
  if(fault.unknownWrite)assert.equal(f.calls.at(-1).op,'WriteStackFileContents')
  if(fault.configDrift){assert.equal(f.events.at(-1).status,'uncertain');assert.equal(f.calls.at(-1).op,'GetStack')}
  if(fault.sourceImageMismatch)assert.equal(f.calls.some(c=>c.op==='WriteStackFileContents'),false)
 }
})
test('actual container image must equal verified host ID, not merely declared source',async()=>{
 const f=fixture({containerImage:true});await assert.rejects(f.run());assert.equal(f.calls.filter(c=>c.op==='DeployStack').length,1)
})
test('explicit online preparation uses pull template then restores exact original files and config',async()=>{
 const f=fixture(),before=structuredClone(f.configs)
 await runImagePreparation({plan:f.plan,ops:f.ops})
 assert.deepEqual(f.configs,before)
 assert.deepEqual(f.calls.filter(c=>c.op==='PullStack').map(c=>c.stack),APPS)
 assert.equal(f.calls.some(c=>['StopStack','DeployStack','UpdateStack'].includes(c.op)),false)
 for(const stack of [...APPS,CORE])assert.equal(f.actualFiles.get(stack),f.files.get(stack).source)
})

test('native14 adapter requires all4 stopped and fresh verified backup before one drain-marked public migration',async()=>{
 const f=fixture({native14:true});await f.run()
 const migrations=f.calls.filter(c=>c.op==='RunStackService'&&JSON.stringify(c.command??[]).includes('migrate-bin'))
 assert.equal(migrations.length,1);assert.deepEqual(migrations[0].env,{LINGXIOS_SCHEMA_UPGRADE_DRAINED:'true'})
 assert.equal(f.calls.filter(c=>c.op==='SnapshotRestore').length,1)
 assert.deepEqual(f.calls.filter(c=>c.op==='StopStack').map(c=>c.stack+':'+c.services[0]),['worker','lingxiloop'].flatMap(s=>APPS.map(a=>a+':'+s)))
 assert.equal(f.calls.filter(c=>c.op==='UpdateStack').some(c=>Object.hasOwn(c,'env')),false)
 const before=f.calls.length;await assert.rejects(f.ops.migrate());assert.equal(f.calls.length,before)
 const b=fixture({native14:true});await assert.rejects(b.ops.migrate());await assert.rejects(b.ops.backup());assert.equal(b.calls.length,0)
})

test('reader adapter drains four, seed reads once, migration once without env injection, and derives Node metadata from images',async()=>{
 const f=fixture({reader:true});await runImagePreparation({plan:f.plan,ops:f.ops});assert.equal(f.calls.filter(c=>['WriteStackFileContents','RunStackService','PullStack'].includes(c.op)).length,8);f.calls.length=0;await f.run();const native=f.calls.filter(c=>['WriteStackFileContents','RunStackService','StopStack','DeployStack'].includes(c.op));
 assert.equal(native.length,31);
 const migrations=native.filter(c=>JSON.stringify(c.command??[]).includes('migrate-bin'));assert.equal(migrations.length,1);assert.equal(Object.hasOwn(migrations[0],'env'),false);
 assert.deepEqual(native.filter(c=>c.op==='StopStack').map(c=>[c.stack,c.services[0]]),['worker','lingxiloop'].flatMap(s=>APPS.map(a=>[a,s])));
 assert.equal(native.filter(c=>JSON.stringify(c.command??[]).includes('expected_plans')).length,1);assert.equal(f.calls.some(c=>c.op==='SnapshotRestore'),false);assert.equal(JSON.stringify(f.events).includes('private fixture'),false);
 const count=f.calls.length;await assert.rejects(f.ops.migrate());assert.equal(f.calls.length,count);
});
test('producer adapter uses already capable source identities and never migrates or seeds',async()=>{
 const f=fixture({producer:true});await f.run();assert.equal(f.calls.filter(c=>['WriteStackFileContents','RunStackService','StopStack','DeployStack'].includes(c.op)).length,26);assert.equal(f.calls.some(c=>JSON.stringify(c.command??[]).includes('migrate-bin')||JSON.stringify(c.command??[]).includes('expected_plans')),false);
 assert.deepEqual(f.calls.filter(c=>c.op==='StopStack').map(c=>[c.stack,c.services[0]]),APPS.map(a=>[a,'worker']));
});
test('seed mismatch and unknown provenance migration stop without deployment or automatic replay',async()=>{
 const a=fixture({reader:true,seed:true});await assert.rejects(a.run());assert.equal(a.calls.some(c=>c.op==='StopStack'),false);
 const b=fixture({reader:true,migrationUnknown:true});await assert.rejects(b.run(),e=>e.uncertain);assert.match(JSON.stringify(b.calls.at(-1).command),/migrate-bin/);assert.equal(b.calls.some(c=>c.op==='DeployStack'),false);
});
test('trace real adapter proves8+31 recipe, capability metadata and public migration without env or backup',async()=>{
 const f=fixture({trace:true}),native=c=>['WriteStackFileContents','RunStackService','PullStack','StopStack','DeployStack'].includes(c.op);
 await runImagePreparation({plan:f.plan,ops:f.ops});assert.equal(f.calls.filter(native).length,8);f.calls.length=0;await f.run();assert.equal(f.calls.filter(native).length,31);
 const migrations=f.calls.filter(c=>JSON.stringify(c.command??[]).includes('migrate-bin'));assert.equal(migrations.length,1);assert.equal(Object.hasOwn(migrations[0],'env'),false);assert.match(migrations[0].command.at(-1),/releaseVersions\.runTrace/);assert.match(migrations[0].command.at(-1),/"runTrace":1/);
 assert.deepEqual(f.calls.filter(c=>c.op==='StopStack').map(c=>[c.stack,c.services[0]]),['worker','lingxiloop'].flatMap(s=>APPS.map(a=>[a,s])));assert.deepEqual(f.calls.filter(c=>c.op==='DeployStack').map(c=>[c.stack,c.services[0]]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>[a,s])));
 assert.equal(f.calls.filter(c=>JSON.stringify(c.command??[]).includes('expected_plans')).length,1);assert.equal(f.calls.some(c=>c.op==='SnapshotRestore'),false);assert.equal(JSON.stringify(f.events).includes('private fixture'),false);
 const n=f.calls.length;await assert.rejects(f.ops.migrate());await assert.rejects(f.ops.backup());assert.equal(f.calls.length,n);
 const bad=fixture({trace:true,traceMetadataWrong:true});await assert.rejects(bad.run());assert.equal(bad.calls.some(c=>c.op==='StopStack'||c.op==='DeployStack'),false);
});

test('conversation repair adapter proves8+31 recipe, capability metadata and public migration without env or backup',async()=>{
 const f=fixture({repair:true}),native=c=>['WriteStackFileContents','RunStackService','PullStack','StopStack','DeployStack'].includes(c.op);
 await runImagePreparation({plan:f.plan,ops:f.ops});assert.equal(f.calls.filter(native).length,8);f.calls.length=0;await f.run();assert.equal(f.calls.filter(native).length,31);
 const migrations=f.calls.filter(c=>JSON.stringify(c.command??[]).includes('migrate-bin'));assert.equal(migrations.length,1);assert.equal(Object.hasOwn(migrations[0],'env'),false);assert.match(migrations[0].command.at(-1),/releaseVersions\.runTrace/);assert.match(migrations[0].command.at(-1),/"runTrace":1/);
 assert.deepEqual(f.calls.filter(c=>c.op==='StopStack').map(c=>[c.stack,c.services[0]]),['worker','lingxiloop'].flatMap(s=>APPS.map(a=>[a,s])));assert.deepEqual(f.calls.filter(c=>c.op==='DeployStack').map(c=>[c.stack,c.services[0]]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>[a,s])));
 assert.equal(f.calls.filter(c=>JSON.stringify(c.command??[]).includes('expected_plans')).length,1);assert.equal(f.calls.some(c=>c.op==='SnapshotRestore'),false);assert.equal(JSON.stringify(f.events).includes('private fixture'),false);
 const n=f.calls.length;await assert.rejects(f.ops.migrate());await assert.rejects(f.ops.backup());assert.equal(f.calls.length,n);
 const bad=fixture({repair:true,traceMetadataWrong:true});await assert.rejects(bad.run());assert.equal(bad.calls.some(c=>c.op==='StopStack'||c.op==='DeployStack'),false);
});


test('presentation adapter binds53-to54 command, four-service drain and one migration with no native override',async()=>{
 const f=fixture({presentation:true}),native=c=>['WriteStackFileContents','RunStackService','PullStack','StopStack','DeployStack'].includes(c.op);
 await runImagePreparation({plan:f.plan,ops:f.ops});assert.equal(f.calls.filter(native).length,8);f.calls.length=0;await f.run();assert.equal(f.calls.filter(native).length,31);
 const migrations=f.calls.filter(c=>JSON.stringify(c.command??[]).includes('migrate-bin'));assert.equal(migrations.length,1);assert.equal(Object.hasOwn(migrations[0],'env'),false);
 assert.match(migrations[0].command.at(-1),/"runtime":"3\.8\.2"/);assert.match(migrations[0].command.at(-1),/"productVersion":54/);assert.match(migrations[0].command.at(-1),/f58aafed796cabcb481bd381b4df298024d5effd0a576dae5e9638430aed38e2/);assert.match(migrations[0].command.at(-1),/"runTrace":1/);
 assert.deepEqual(f.calls.filter(c=>c.op==='StopStack').map(c=>[c.stack,c.services[0]]),['worker','lingxiloop'].flatMap(s=>APPS.map(a=>[a,s])));
 assert.deepEqual(f.calls.filter(c=>c.op==='DeployStack').map(c=>[c.stack,c.services[0]]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>[a,s])));
 const n=f.calls.length;await assert.rejects(f.ops.migrate());await assert.rejects(f.ops.backup());assert.equal(f.calls.length,n);assert.equal(JSON.stringify(f.events).includes('private fixture'),false);
});
test('presentation adapter stops before old readers on metadata drift and never retries unknown migration',async()=>{
 const bad=fixture({presentation:true,traceMetadataWrong:true});await assert.rejects(bad.run());assert.equal(bad.calls.some(c=>c.op==='StopStack'||c.op==='DeployStack'),false);
 const unknown=fixture({presentation:true,migrationUnknown:true});await assert.rejects(unknown.run(),e=>e.uncertain);assert.match(JSON.stringify(unknown.calls.at(-1).command),/migrate-bin/);assert.equal(unknown.calls.some(c=>c.op==='DeployStack'),false);
});


test('runtime patch native adapter uses only verified provenance module with no migration or injected env',async()=>{
 const f=fixture({runtimePatch:true});await f.run();
 const patches=f.calls.filter(c=>c.op==='RunStackService'&&JSON.stringify(c).includes('applyPublishedRuntimePatch'));assert.equal(patches.length,1)
 assert.equal(f.calls.some(c=>JSON.stringify(c).includes('migrate-bin')),false)
 assert.equal(f.calls.filter(c=>c.op==='DeployStack').length,4)
})
test('runtime patch precheck refusal keeps services running, unknown CAS is never replayed',async()=>{
 const bound=fixture({runtimePatch:true,bound:true});await assert.rejects(bound.run());assert.equal(bound.calls.some(c=>c.op==='StopStack'),false)
 const unknown=fixture({runtimePatch:true,patchUnknown:true});await assert.rejects(unknown.run(),e=>e.uncertain)
 assert.equal(unknown.calls.filter(c=>c.op==='RunStackService'&&JSON.stringify(c).includes('applyPublishedRuntimePatch')).length,1)
 assert.equal(unknown.calls.some(c=>c.op==='DeployStack'),false)
})

test('v2 native adapter rechecks exact target model options and leaf before the single provenance CAS',async()=>{
 const f=fixture({producerV2:true});await f.run();
 const patches=f.calls.filter(c=>c.op==='RunStackService'&&JSON.stringify(c).includes('applyPublishedRuntimePatch'));assert.equal(patches.length,1);
 const code=patches[0].command.at(-1),literal=code.split('if(!isDeepStrictEqual(metadata,')[1].split("))throw Error('target drift')")[0];
 const expected=JSON.parse(literal);
 assert.equal(expected.runtime,'3.8.5');assert.equal(expected.publicText,2);assert.equal(expected.runTrace,1);
 assert.deepEqual(expected.deployment,{reader:2,producer:'purpose-json-v2'});assert.deepEqual(expected.modelOptions,{publicTextProtocol:'purpose-json-v2'});assert.equal(expected.configurationSha256,f.plan.publicText.targetConfigurationSha256);
 assert.equal(f.calls.some(c=>JSON.stringify(c).includes('migrate-bin')),false);assert.equal(Object.hasOwn(patches[0],'env'),false);assert.equal(f.calls.filter(c=>c.op==='DeployStack').length,4);
});
test('v2 native adapter retains capability, environment, original identity and incompatible-run fences',async()=>{
 for(const fault of [{wrongV2Options:true},{traceMetadataWrong:true},{bound:true}]){const f=fixture({producerV2:true,...fault});await assert.rejects(f.run());assert.equal(f.calls.some(c=>c.op==='StopStack'||c.op==='DeployStack'),false);}
 const identity=fixture({producerV2:true});identity.containers[0].Id='0'.repeat(64);await assert.rejects(identity.run());assert.equal(identity.calls.some(c=>c.op==='StopStack'),false);
 const env=fixture({producerV2:true}),execute=env.transport.execute;env.transport.execute=async(op,p)=>{const result=await execute(op,p);if(op==='DeployStack')env.containers.find(c=>c.stack===p.stack&&c.service===p.services[0]).Config.Env.push('UNREVIEWED=1');return result};await assert.rejects(env.run());assert.equal(env.calls.filter(c=>c.op==='DeployStack').length,1);
});

test('v2 upgrade source restoration accepts only original v1 metadata before any committed runtime CAS',async()=>{
 const f=await failedImageRelease(false,true,true),before=f.calls.length,result=await f.restore();
 assert.equal(result.restoredSource,f.plan.source.sha);assert.equal(result.state.runtime,'3.8.3');assert.deepEqual(result.publicText,{reader:2,producer:'purpose-json-v1'});assert.equal(result.configurationSha256,f.plan.publicText.sourceConfigurationSha256);
 const calls=f.calls.slice(before);assert.equal(calls.filter(c=>c.op==='DeployStack').length,4);assert.equal(calls.some(c=>JSON.stringify(c).includes('applyPublishedRuntimePatch')||JSON.stringify(c).includes('migrate-bin')||c.op==='StopStack'),false);
});
test('v3 native adapter binds actual reader3 and writer3 to formal3.8.7 before its one non-DDL CAS',async()=>{
 const f=fixture({producerV3:true});await f.run();
 const patches=f.calls.filter(c=>c.op==='RunStackService'&&JSON.stringify(c).includes('applyPublishedRuntimePatch'));assert.equal(patches.length,1);
 const literal=patches[0].command.at(-1).split('if(!isDeepStrictEqual(metadata,')[1].split("))throw Error('target drift')")[0],expected=JSON.parse(literal);
 assert.equal(expected.runtime,'3.8.7');assert.equal(expected.publicText,3);assert.equal(expected.runTrace,1);
 assert.deepEqual(expected.deployment,{reader:3,producer:'purpose-json-v3'});assert.deepEqual(expected.modelOptions,{publicTextProtocol:'purpose-json-v3'});
 assert.equal(expected.configurationSha256,f.plan.publicText.targetConfigurationSha256);assert.equal(Object.hasOwn(patches[0],'env'),false);
 assert.equal(f.calls.some(c=>JSON.stringify(c).includes('migrate-bin')),false);
 assert.deepEqual(f.calls.filter(c=>c.op==='DeployStack').map(c=>c.stack+':'+c.services[0]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>a+':'+s)));
});
test('v3 native adapter preserves pre-stop capability, old binding, source identity and runtime config fences',async()=>{
 for(const fault of [{wrongV3Capability:true},{wrongV2Options:true},{traceMetadataWrong:true},{bound:true}]){
  const f=fixture({producerV3:true,...fault});await assert.rejects(f.run());assert.equal(f.calls.some(c=>c.op==='StopStack'||c.op==='DeployStack'),false);
 }
 const identity=fixture({producerV3:true});identity.containers[0].Id='0'.repeat(64);await assert.rejects(identity.run());assert.equal(identity.calls.some(c=>c.op==='StopStack'),false);
 const env=fixture({producerV3:true}),execute=env.transport.execute;
 env.transport.execute=async(op,p)=>{const result=await execute(op,p);if(op==='DeployStack')env.containers.find(c=>c.stack===p.stack&&c.service===p.services[0]).Config.Env.push('UNREVIEWED=1');return result};
 await assert.rejects(env.run());assert.equal(env.calls.filter(c=>c.op==='DeployStack').length,1);
});
test('v3 pre-CAS source restoration requires the original v2 package, options and identities',async()=>{
 const f=await failedImageRelease(false,true,false,true),before=f.calls.length,result=await f.restore();
 assert.equal(result.state.runtime,'3.8.5');assert.deepEqual(result.publicText,{reader:2,producer:'purpose-json-v2'});
 assert.equal(result.configurationSha256,f.plan.publicText.sourceConfigurationSha256);
 const calls=f.calls.slice(before);assert.equal(calls.filter(c=>c.op==='DeployStack').length,4);
 assert.equal(calls.some(c=>JSON.stringify(c).includes('applyPublishedRuntimePatch')||JSON.stringify(c).includes('migrate-bin')||c.op==='StopStack'),false);
 const committed=await failedImageRelease(true,true,false,true),offset=committed.calls.length;
 await assert.rejects(committed.restore(),/unchanged source provenance/);
 assert.equal(committed.calls.slice(offset).some(c=>['DeployStack','StopStack','WriteStackFileContents','UpdateStack'].includes(c.op)),false);
});

test('cover55 native calls require a fresh backup and keep full configuration, reader3 and ordered first identities',async()=>{
 const f=fixture({cover55:true});
 await assert.rejects(f.ops.migrate());assert.equal(f.calls.some(c=>JSON.stringify(c.command??[]).includes('migrate-bin')),false);
 const result=await f.run();assert.equal(result.state.product,55);assert.equal(result.publicText.reader,3);
 const backup=f.calls.findIndex(c=>c.op==='SnapshotRestore'),migration=f.calls.findIndex(c=>JSON.stringify(c.command??[]).includes('migrate-bin'));
 assert.ok(backup>=0&&migration>backup);assert.equal(f.calls.filter(c=>c.op==='SnapshotRestore').length,1);
 const job=f.calls[migration];assert.equal(Object.hasOwn(job,'env'),false);assert.match(JSON.stringify(job.command),/\\"publicText\\":3/);
 assert.equal(f.calls.filter(c=>JSON.stringify(c.command??[]).includes('migrate-bin')).length,1);await assert.rejects(f.ops.migrate());
 assert.deepEqual(f.calls.filter(c=>c.op==='StopStack').map(c=>[c.stack,c.services[0],c.stop_time]),['worker','lingxiloop'].flatMap(s=>APPS.map(a=>[a,s,150])));
 assert.deepEqual(f.calls.filter(c=>c.op==='DeployStack').map(c=>[c.stack,c.services[0]]),['lingxiloop','worker'].flatMap(s=>APPS.map(a=>[a,s])));
 assert.equal(f.events.filter(e=>e.status==='observed').length,4);assert.equal(f.calls.some(c=>c.op==='PullStack'),false);
});
test('cover55 rejects source configuration drift and backup ambiguity before migration',async()=>{
 const f=fixture({cover55:true});f.configs.get(APPS[0]).config.environment='changed';await assert.rejects(f.run());
 assert.equal(f.calls.some(c=>['StopStack','DeployStack','SnapshotRestore','WriteStackFileContents','UpdateStack'].includes(c.op)),false);
 const backup=fixture({cover55:true,backupUnknown:true});await assert.rejects(backup.run(),e=>e.uncertain);assert.equal(backup.calls.some(c=>JSON.stringify(c.command??[]).includes('migrate-bin')),false);assert.equal(backup.events.at(-1).recovery,'unknown');
 const unknown=fixture({cover55:true,migrationUnknown:true});await assert.rejects(unknown.run(),e=>e.uncertain);
 assert.equal(unknown.events.at(-1).recovery,'unknown');assert.equal(unknown.calls.filter(c=>JSON.stringify(c.command??[]).includes('migrate-bin')).length,1);
 assert.equal(unknown.calls.some(c=>c.op==='DeployStack'),false);
});
test('same55 native calls have no backup or migration and require observed health identity',async()=>{
 const f=fixture({same55:true});await assert.rejects(f.ops.verifyHealthy(APPS[0],'lingxiloop'));
 await f.run();assert.equal(f.calls.some(c=>c.op==='SnapshotRestore'||JSON.stringify(c.command??[]).includes('migrate-bin')),false);
 assert.equal(f.events.filter(e=>e.status==='observed').length,4);await assert.rejects(f.ops.migrate());
});
