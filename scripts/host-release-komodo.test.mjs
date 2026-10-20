import test from 'node:test'
import assert from 'node:assert/strict'
import {createHostReleaseOperations} from './host-release-komodo.mjs'
import {APPS,CORE,IMAGE,RELEASE_ARGS,hash,sealHostPlan,runHostRelease,runImagePreparation} from './host-release.mjs'
function fixture(fault={}){
 const a='a'.repeat(40),b='b'.repeat(40),h='c'.repeat(64),d='sha256:'+h
 const formal={runtime:'3.5.8',schema:13,protocol:11,schemaHash:h,integrity:'sha512-'+Buffer.alloc(64).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.5.8/fixture',productVersion:48,migrations:Array.from({length:48},(_,i)=>({version:i+1,name:'migration_'+(i+1),checksum:h}))}
 const image={indexDigest:d,configDigest:'sha256:'+'d'.repeat(64),manifestDigest:'sha256:'+'e'.repeat(64),diffIds:[d],auditSha256:h}
 const source={sha:a,...formal,image},target={sha:b,...formal,image},files=new Map(),configs=new Map(),actualFiles=new Map(),events=[],calls=[]
 const plan=sealHostPlan({format:'same-schema-host-release/v1',createdAt:'2026-10-20T00:00:00Z',source,target,sourceAcceptanceSha256:h,qualification:{commit:b,conclusion:'success',ciUrl:'https://github.com/LingXi-Org/LingxiLoop/actions/runs/1'},stacks:[...APPS,CORE].map((stack,i)=>{
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
  Config:{Image:IMAGE+a,Env:['LINGXILOOP_COMMIT_SHA='+a,'NODE_ENV=production','SECRET=private fixture never persist'],User:'node',Cmd:['npm','run',service==='worker'?'worker:start':'server:start']},
  State:{Running:true,Restarting:false,Pid:1,OOMKilled:false,Health:{Status:'healthy'}},RestartCount:0,
  HostConfig:{ReadonlyRootfs:service==='worker',Privileged:false,SecurityOpt:[],CapAdd:[],CapDrop:[],PidsLimit:128},
 })))
 const state={...formal,installedSchema:13,product:48,count:48,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:4,queued:3,pendingCapture:1}
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
   if(op==='InspectImage')return {Id:'sha256:'+'f'.repeat(64),RepoDigests:[IMAGE.slice(0,-1)+'@'+d],Os:'linux',Architecture:fault.image?'arm64':'amd64',RootFS:{Type:'layers',Layers:[d]}}
   throw Error('Unexpected read '+op)
  },
  async refreshStackCache(stack){calls.push({op:'RefreshStackCache',stack})},
  async writeHostFile(stack,contents){calls.push({op:'WriteStackFileContents',stack});if(fault.unknownWrite)throw Object.assign(Error('private fixture never persist'),{uncertain:true});actualFiles.set(stack,contents)},
  async setHostReleaseConfig(stack,config){calls.push({op:'UpdateStack',stack});Object.assign(configs.get(stack).config,config);if(fault.configDrift)configs.get(stack).config.environment='changed'},
  async execute(op,p){
   calls.push({op,...p})
   if(op==='RunStackService'){
    assert.equal(p.no_deps,true);assert.equal(p.pull,false);assert.equal(p.service_ports,false);assert.equal(p.detach,false)
    assert.equal(JSON.stringify(p).includes('migrate-bin'),false)
    const marker=p.service==='postgres'?'STATE':'METADATA',value=p.service==='postgres'?state:target
    return {status:'Complete',success:true,logs:[{stdout:'SCHEMA_UPGRADE_'+marker+'='+JSON.stringify(value)}]}
   }
   if(op==='PullStack'){assert.deepEqual(p.services,['db-migrate']);return}
   const c=containers.find(c=>c.stack===p.stack&&c.service===p.services[0])
   if(op==='StopStack'){c.State.Running=false;c.State.Pid=0;return}
   assert.equal(op,'DeployStack');assert.deepEqual(configs.get(p.stack).config.extra_args,RELEASE_ARGS);assert.equal(configs.get(p.stack).config.auto_pull,false)
   c.Id='e'+c.Id.slice(1);c.Config.Image=IMAGE+b;c.Config.Env[0]='LINGXILOOP_COMMIT_SHA='+b;c.State.Running=true;c.State.Pid=2
   if(fault.containerImage)c.Image='sha256:'+'0'.repeat(64)
  },
 }
 const onProgress=async e=>events.push(e),ops=createHostReleaseOperations({plan,files,transport:t,onProgress,wait:async()=>{}})
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
