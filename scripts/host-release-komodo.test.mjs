import test from 'node:test'
import {READER_FORMAT,PRODUCER_FORMAT,MIGRATION51,SCHEMA14} from './public-text-release.mjs'
import assert from 'node:assert/strict'
import {createHostReleaseOperations} from './host-release-komodo.mjs'
import {APPS,CORE,IMAGE,RELEASE_ARGS,hash,sealHostPlan,runHostRelease,runImagePreparation} from './host-release.mjs'
function fixture(fault={}){
 const a='a'.repeat(40),b='b'.repeat(40),h='c'.repeat(64),d='sha256:'+h
 const formal={runtime:'3.5.8',schema:13,protocol:11,schemaHash:h,integrity:'sha512-'+Buffer.alloc(64).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.5.8/fixture',productVersion:48,migrations:Array.from({length:48},(_,i)=>({version:i+1,name:'migration_'+(i+1),checksum:h}))}
 const image={indexDigest:d,configDigest:'sha256:'+'d'.repeat(64),manifestDigest:'sha256:'+'e'.repeat(64),diffIds:[d],auditSha256:h}
 const source={sha:a,...formal,image},target={sha:b,...formal,image},files=new Map(),configs=new Map(),actualFiles=new Map(),events=[],calls=[]
 if(fault.native14||fault.sameNative14||fault.reader||fault.producer){
  const m49={version:49,name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'}
  Object.assign(source,{productVersion:49,migrations:[...formal.migrations,m49]});Object.assign(target,{runtime:'3.6.0',schema:14,productVersion:50,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.6.0/fixture',migrations:[...source.migrations,{version:50,name:'native_skill_delivery',checksum:h}]})
  if(fault.sameNative14||fault.reader||fault.producer)Object.assign(source,{...target,sha:a})
 }
 const backup={format:2,profile:'native13-product49',source:{sha:a,productVersion:source.productVersion,runtime:Object.fromEntries(['runtime','schema','protocol','schemaHash','integrity','tarball'].map(k=>[k,source[k]])),migrations:source.migrations},commandHash:h,attempt:'synthetic',nonce:'0123456789abcdef',command:'synthetic',migrationRehearsal:'not-performed',isolatedDatabase:'memory_verify_synthetic',backupDir:'/synthetic'}
 if(fault.upgrade){target.productVersion=49;target.migrations=[...formal.migrations,{version:49,name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'}]}
 const rawConfig=(commit,node)=>JSON.stringify({config:{Env:['NODE_VERSION='+node,'LINGXILOOP_COMMIT_SHA='+commit],Cmd:['node']}}),imageConfigs={source:rawConfig(a,'22.23.4'),target:rawConfig(b,'22.23.5')};
 const publicText={source:fault.producer?{reader:2,producer:'disabled'}:null,target:{reader:2,producer:fault.producer?'purpose-json-v1':'disabled'},sourceConfigurationSha256:fault.producer?h:null,targetConfigurationSha256:h,sourceContainers:fault.producer?APPS.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),imageId:'sha256:'+'f'.repeat(64)}))):null};
 if(fault.reader||fault.producer){
  source.schemaHash=SCHEMA14;Object.assign(target,{runtime:'3.7.0',schemaHash:SCHEMA14,productVersion:51,tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.7.0/fixture',migrations:[...source.migrations,MIGRATION51]});
  if(fault.producer)Object.assign(source,{...target,sha:a});
  source.image={...image,configDigest:'sha256:'+hash(imageConfigs.source)};target.image={...image,configDigest:'sha256:'+hash(imageConfigs.target)};
 }
 const plan=sealHostPlan({format:fault.reader?READER_FORMAT:fault.producer?PRODUCER_FORMAT:fault.native14?'native-schema-host-release/v1':fault.upgrade?'product-schema-host-release/v1':'same-schema-host-release/v1',...(fault.native14?{backup}:{}),...((fault.reader||fault.producer)?{publicText,imageConfigs}:{}),createdAt:'2026-10-20T00:00:00Z',source,target,sourceAcceptanceSha256:h,qualification:{commit:b,conclusion:'success',ciUrl:'https://github.com/LingXi-Org/LingxiLoop/actions/runs/1'},stacks:[...APPS,CORE].map((stack,i)=>{
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
 const containers=APPS.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({
  stack,service,Id:String(i*2+j+1).repeat(64),Image:'sha256:'+(fault.sourceImageMismatch?'0':'f').repeat(64),
  Config:{Image:IMAGE+a,Env:['LINGXILOOP_COMMIT_SHA='+a,...((fault.reader||fault.producer)?['NODE_VERSION=22.23.4']:[]),'NODE_ENV=production','SECRET=private fixture never persist'],User:'node',Cmd:['npm','run',service==='worker'?'worker:start':'server:start']},
  State:{Running:true,Restarting:false,Pid:1,OOMKilled:false,Health:{Status:'healthy'}},RestartCount:0,
  HostConfig:{ReadonlyRootfs:service==='worker',Privileged:false,SecurityOpt:[],CapAdd:[],CapDrop:[],PidsLimit:128},
 })))
 const state={...formal,schemaHash:source.schemaHash,runtime:source.runtime,schema:source.schema,migrations:source.migrations,installedSchema:source.schema,product:source.productVersion,count:source.productVersion,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:4,queued:3,pendingCapture:1}
 delete state.integrity;delete state.tarball;delete state.productVersion
 const t={
  async read(op,p){
   calls.push({op,...p})
   if(op==='GetProcedureActionState')return {running:false}
   if(op==='ListServers')return ['manager','shanghai-a','shanghai-b'].map((name,i)=>({name,id:(i===2?'b':'a').repeat(24),info:{state:fault.hostDown&&name==='shanghai-b'?'Offline':'Ok'}}))
   if(op==='GetStackActionState')return Object.fromEntries(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].map(k=>[k,false]))
   if(op==='GetStack')return {...structuredClone(configs.get(p.stack)),info:{remote_contents:[{path:'compose.yml',contents:actualFiles.get(p.stack)}],remote_errors:fault.stale?['unavailable']:[],missing_files:[]}}
   if(op==='ListStackServices')return containers.filter(c=>c.stack===p.stack).map(c=>({service:c.service,container:{id:c.Id}}))
   if(op==='InspectContainer')return structuredClone(containers.find(c=>c.Id===p.container))
   if(op==='InspectImage')return {...((fault.reader||fault.producer)?{Config:JSON.parse(imageConfigs[p.image===IMAGE+a?'source':'target']).config}:{}),Id:'sha256:'+'f'.repeat(64),RepoDigests:[IMAGE.slice(0,-1)+'@'+d],Os:'linux',Architecture:fault.image?'arm64':'amd64',RootFS:{Type:'layers',Layers:[d]}}
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
    if(JSON.stringify(p).includes('migrate-bin')){
     assert.ok(fault.upgrade||fault.native14||fault.reader);assert.equal(p.stack,APPS[0]);assert.equal(p.service,'db-migrate')
     assert.equal(Object.hasOwn(p,'env'),Boolean(fault.native14));assert.equal(JSON.stringify(p).includes('LINGXIOS_SCHEMA_UPGRADE_DRAINED'),Boolean(fault.native14));if(fault.reader)assert.ok(containers.every(c=>!c.State.Running));if(fault.native14){assert.deepEqual(p.env,{LINGXIOS_SCHEMA_UPGRADE_DRAINED:'true'});assert.ok(containers.every(c=>!c.State.Running))}
     assert.equal(containers.filter(c=>c.service==='worker').every(c=>!c.State.Running),true)
     if(fault.migrationUnknown)throw Object.assign(Error('unknown native migration'),{uncertain:true})
     Object.assign(state,{runtime:target.runtime,schema:target.schema,installedSchema:target.schema,product:target.productVersion,count:target.productVersion,migrations:target.migrations})
     return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_MIGRATED='+JSON.stringify({sha:b,schema:target.schema,product:target.productVersion})}]}
    }
    if(fault.native14)state.otherClients=containers.every(c=>!c.State.Running)?0:4;
    const marker=p.service==='postgres'?'STATE':'METADATA',value=p.service==='postgres'?state:{...target,...((fault.reader||fault.producer)?{publicText:2,deployment:publicText.target,configurationSha256:h,modelOptions:fault.producer?{publicTextProtocol:'purpose-json-v1'}:{}}:{})}
    return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_'+marker+'='+JSON.stringify(value)}]}
   }
   if(op==='PullStack'){assert.deepEqual(p.services,['db-migrate']);return}
   const c=containers.find(c=>c.stack===p.stack&&c.service===p.services[0])
   if(op==='StopStack'){c.State.Running=false;c.State.Pid=0;return}
   assert.equal(op,'DeployStack');assert.deepEqual(configs.get(p.stack).config.extra_args,RELEASE_ARGS);assert.equal(configs.get(p.stack).config.auto_pull,false)
   c.Id='e'+c.Id.slice(1);c.Config.Image=IMAGE+b;c.Config.Env[0]='LINGXILOOP_COMMIT_SHA='+b;if(fault.reader||fault.producer)c.Config.Env=c.Config.Env.map(x=>x.startsWith('NODE_VERSION=')?'NODE_VERSION=22.23.5':x);c.State.Running=true;c.State.Pid=2
   if(fault.containerImage)c.Image='sha256:'+'0'.repeat(64)
  },
 }
 const onProgress=async e=>events.push(e),ops=createHostReleaseOperations({plan,files,transport:t,onProgress,wait:async()=>{},backupExecutor:async({expectedStackId})=>{assert.equal(expectedStackId,'3'.repeat(24));calls.push({op:'SnapshotRestore'});assert.ok(containers.every(c=>!c.State.Running));return {...backup,status:'Complete',success:true,updateId:'f'.repeat(24),dumpSha256:h,restoreCountsEqual:true,restoreProvenanceEqual:true,isolatedDatabaseRemoved:true}}})
 return {plan,ops,calls,events,configs,actualFiles,files,run:()=>runHostRelease({plan,ops,onProgress})}
}
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
