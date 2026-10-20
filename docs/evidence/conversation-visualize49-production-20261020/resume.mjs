// One-use continuation after the already committed product49 migration.
// Uses the frozen public Komodo transport. No migration, pull, stop or config write.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createTransport,parseMarker,validateStateReceipt,stateCommand} from '/workspace/LingxiLoop-product49-host-release/scripts/schema-upgrade-komodo.mjs';
import {assertCompatibleState,assertWorkerBarrier,hash,check} from '/workspace/LingxiLoop-product49-host-release/scripts/host-release.mjs';

const dir='/workspace/recovery49';
const execute=process.argv.length===3&&process.argv[2]==='--execute';
check(execute||process.argv.length===2,'Only optional --execute is accepted');
const receiptPath=`${dir}/${execute?'execution':'precheck'}.json`;
const out={format:'product49-interrupted-release-continuation/v1',startedAt:new Date().toISOString(),execute,complete:false,events:[]};
await writeFile(receiptPath,JSON.stringify(out,null,2),{flag:'wx',mode:0o600});
async function record(event){out.events.push({at:new Date().toISOString(),...event});await writeFile(`${receiptPath}.new`,JSON.stringify(out,null,2),{mode:0o600});await rename(`${receiptPath}.new`,receiptPath);console.log(JSON.stringify(event));}
const target='cf4a299bcfb44d7e7ed74a250ea1404588a4e901',old='d00e5f7b93cd04405e2e2ee62f0879e8bd3e4b5f';
const imagePrefix='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:';
const targetImage='sha256:cfcf92c9db9cd0c446eb4400f2a9b4267a3a3c0a716427d2e1b9edac9e9e465e';
const oldImage='sha256:9214d5d81d538bbacf4ecfb95555d9c36b40561efacb48d2b33d34aa43977f53';
const accepted=JSON.parse(await readFile('/workspace/LingxiLoop-release-229/docs/evidence/cli-memory-production-20261020/memory-d00e5f7b/plan.json','utf8'));
const descriptor={...accepted.target,sha:target,productVersion:49,migrations:[...accepted.target.migrations,{version:49,name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'}]};
delete descriptor.image;
check(accepted.target.sha===old&&accepted.target.productVersion===48,'Historical accepted descriptor changed');
const stackRows=[
 {stack:'lingxiloop-app-a',id:'6aa8a411b35d27bdd4e12aef',server:'shanghai-a',serverId:'6aa8a1bcb35d27bdd4e12a26',branch:'release/conversation-visualize49-production-20261020',commit:'4a5513d5c8805deaeb7771f522b0426dafbfe7e2',sha256:'8b49efd64947dd2aefc422d057febc9d6bce52586261e340063b705a45dfb32f',autoPull:false,args:['--no-deps','--pull','never']},
 {stack:'lingxiloop-app-b',id:'6aa8a414b35d27bdd4e12af1',server:'shanghai-b',serverId:'6aa8a1b9b35d27bdd4e12a24',branch:'release/conversation-visualize49-production-20261020',commit:'4a5513d5c8805deaeb7771f522b0426dafbfe7e2',sha256:'e4ea3d1c635f9fe39356ea8b1dea5e7a004cba1edb160aeba3acfe326c119785',autoPull:false,args:['--no-deps','--pull','never']},
 {stack:'lingxiloop-core-state',id:'6aa8a3e8b35d27bdd4e12ae0',server:'shanghai-a',serverId:'6aa8a1bcb35d27bdd4e12a26',branch:'release/production-358-20261020',commit:'f56db73dabbaec1e92a421bbad76c239ed8d1ae2',sha256:'dda3dd16ff30968905f2083d271a28d12e1519f713ce46a7fead19a02ce82dab',autoPull:true,args:[]}
];
const expected=new Map([
 ['lingxiloop-app-a:lingxiloop',{id:'7830e175fdb1532f9c3ae110b60ad5fb2206b074bf72c26ea13ae9dcd5f79684',sha:target,running:true}],
 ['lingxiloop-app-a:worker',{id:'b3cf4acd484c1656ce03780953c69f98d514cde30462255f1db1c5c80327abda',sha:old,running:false}],
 ['lingxiloop-app-b:lingxiloop',{id:'91881915d7a017b27a45045b2c44053f87ab8a28f392ce447e1b92d7ae7dad62',sha:old,running:true}],
 ['lingxiloop-app-b:worker',{id:'85e0263132672ae1eba44ecc389335918f30f78e8f4d141708105d5ae7f5ee2c',sha:old,running:false}]
]);
const configurations=new Map(),policies=new Map();
const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,onProgress:record});
const actions=['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'];
const projected=u=>({id:u._id.$oid,operation:u.operation,target:u.target,status:u.status,success:u.success,start:u.start_ts,end:u.end_ts});
async function terminal(id,operation,stackId){
 const u=await t.read('GetUpdate',{id});
 check(u?._id?.$oid===id&&u.operation===operation&&u.target?.type==='Stack'&&u.target.id===stackId&&u.status==='Complete'&&u.success===true,'Original or new native operation not successful');
 return u;
}
async function guard(){
 check((await t.read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running===false,'Concurrent rollout');
 const servers=await t.read('ListServers',{});
 for(const name of ['manager','shanghai-a','shanghai-b'])check(servers.filter(x=>x.name===name&&x.info?.state==='Ok').length===1,'Host unavailable');
 for(const r of stackRows){
  check(servers.find(x=>x.name===r.server)?.id===r.serverId,'Host identity changed');
  const a=await t.read('GetStackActionState',{stack:r.stack});check(actions.every(k=>a[k]===false),'Concurrent stack action');
  const d=await t.read('GetStack',{stack:r.stack}),c=d.config,empty={path:'',command:'',shell_mode:false};
  check(d?._id?.$oid===r.id&&c.server_id===r.serverId&&c.swarm_id===''&&c.repo==='LingXi-Org/LingxiLoop'&&c.branch===r.branch&&c.commit===r.commit
   &&c.files_on_host===true&&c.reclone===false&&c.clone_path===''&&c.git_account===''&&c.registry_account===''&&c.linked_repo===''&&c.file_contents===''
   &&c.run_directory===`deploy/komodo/${r.stack}`&&c.env_file_path==='.env'&&equal(c.file_paths,['compose.yml'])&&equal(c.additional_env_files,[])&&equal(c.config_files,[])
   &&c.auto_update===false&&c.auto_update_all_services===false&&c.poll_for_updates===false&&c.auto_pull===r.autoPull&&equal(c.extra_args,r.args)
   &&c.run_build===false&&c.destroy_before_deploy===false&&c.project_name===''&&c.compose_cmd_wrapper===''&&equal(c.build_extra_args,[])
   &&equal(c.pre_deploy,empty)&&equal(c.post_deploy,empty)&&equal(c.ignore_services,r.stack==='lingxiloop-core-state'?[]:['db-migrate']),'Frozen stack configuration drift');
  if(configurations.has(r.stack))check(equal(configurations.get(r.stack),c),'Full configuration changed');else configurations.set(r.stack,structuredClone(c));
  // Public cache refresh is the same reviewed host-source readback path.
  await t.refreshStackCache(r.stack);
  const fresh=await t.read('GetStack',{stack:r.stack}),remote=fresh.info?.remote_contents;
  check(equal(c,fresh.config)&&equal(fresh.info?.remote_errors,[])&&equal(fresh.info?.missing_files,[])&&Array.isArray(remote)&&remote.length===1&&remote[0].path==='compose.yml'&&hash(remote[0].contents)===r.sha256,'Fresh host Compose does not match committed final source');
  if(r.stack==='lingxiloop-core-state')continue;
  const services=await t.read('ListStackServices',{stack:r.stack}),jobs=services.filter(x=>x.service==='db-migrate');check(jobs.length<=1,'Ambiguous migration service');
  if(jobs[0]?.container){const j=await t.read('InspectContainer',{server:r.server,container:jobs[0].container.id});check(j.State.Running===false&&j.State.Restarting===false,'Existing migration operation unresolved');}
  const image=await t.read('InspectImage',{server:r.server,image:imagePrefix+target});
  check(image.Id===targetImage&&image.Os==='linux'&&image.Architecture==='amd64'&&image.RepoDigests?.includes(imagePrefix.slice(0,-1)+'@'+targetImage),'Qualified immutable target image changed');
 }
}
async function inspect({transition}={}){
 const result=[];
 for(const r of stackRows.slice(0,2)){
  const services=await t.read('ListStackServices',{stack:r.stack});
  for(const service of ['lingxiloop','worker']){
   const key=r.stack+':'+service,match=services.filter(x=>x.service===service);check(match.length===1,'Ambiguous service');
   const c=await t.read('InspectContainer',{server:r.server,container:match[0].container?.id}),e=expected.get(key),moving=transition===key;
   const env=c.Config?.Env,sha=env?.find(x=>x.startsWith('LINGXILOOP_COMMIT_SHA='))?.slice(22);
   check(c.Id===match[0].container.id&&/^[a-f0-9]{64}$/.test(c.Id)&&c.Config.Image===imagePrefix+(moving?target:e.sha)&&sha===(moving?target:e.sha)
    &&c.Image===(moving||e.sha===target?targetImage:oldImage)&&c.State.Restarting===false&&c.State.OOMKilled===false&&c.RestartCount===0,'Service identity/image changed');
   if(!moving)check(c.Id===e.id&&c.State.Running===e.running&&(e.running?c.State.Health?.Status==='healthy'&&c.State.Pid>0:c.State.Pid===0),'Checkpoint or already verified service changed');
   const policy={env:env.filter(x=>!x.startsWith('LINGXILOOP_COMMIT_SHA=')).toSorted(),host:Object.fromEntries(['ReadonlyRootfs','Privileged','SecurityOpt','CapAdd','CapDrop','PidsLimit','Binds','Tmpfs','PortBindings','Memory','NanoCpus','Devices','DeviceRequests'].map(k=>[k,c.HostConfig?.[k]])),user:c.Config.User,command:c.Config.Cmd,entrypoint:c.Config.Entrypoint,health:c.Config.Healthcheck,mounts:c.Mounts};
   if(policies.has(key))check(equal(policies.get(key),policy),'Environment/security/mount/startup policy changed');else policies.set(key,structuredClone(policy));
   result.push({stack:r.stack,service,id:c.Id,sha,imageId:c.Image,running:c.State.Running,healthy:c.State.Health?.Status==='healthy',pid:c.State.Pid,restartCount:c.RestartCount});
  }
 }
 check(new Set(result.map(x=>x.id)).size===4,'Non-distinct services');
 return result;
}
async function state(barrier=false){
 await guard();
 const u=await t.execute('RunStackService',{stack:'lingxiloop-core-state',service:'postgres',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,entrypoint:'sh',user:'postgres',command:['-ec',stateCommand]});
 const confirmed=await terminal(u._id.$oid,'RunStackService',stackRows[2].id),s=validateStateReceipt(parseMarker(confirmed,'STATE'));
 assertCompatibleState(s,descriptor);if(barrier)assertWorkerBarrier(s);
 await record({phase:'state',receipt:projected(confirmed),state:s});return s;
}
try{
 const migration=await terminal('6ad7a904e06d5e1f798378f8','RunStackService',stackRows[0].id);
 check(equal(parseMarker(migration,'MIGRATED'),{sha:target,schema:13,product:49}),'Original migration marker differs');
 for(const [id,r] of [['6ad7a8b8e06d5e1f798378e2',stackRows[0]],['6ad7a8bde06d5e1f798378e6',stackRows[1]]]){
  const u=await terminal(id,'RunStackService',r.id);check(equal(parseMarker(u,'METADATA'),descriptor),'Original actual target metadata mismatch');
 }
 await terminal('6ad7a927e06d5e1f79837905','DeployStackService',stackRows[0].id);
 await record({phase:'original-migration-confirmed',receipt:projected(migration)});
 await guard();await record({phase:'checkpoint',containers:await inspect()});
 // Precheck is read-only except the reviewed cache refresh; it creates no service jobs.
 if(!execute){out.complete=true;await record({phase:'precheck-complete'});process.exit(0);}
 await state(true);await delay(2000);await state(true);
 for(const [stack,service] of [['lingxiloop-app-b','lingxiloop'],['lingxiloop-app-a','worker'],['lingxiloop-app-b','worker']]){
  await guard();await inspect();await state(!(expected.get('lingxiloop-app-a:worker').running));
  await inspect();
  const u=await t.execute('DeployStack',{stack,services:[service]});
  const confirmed=await terminal(u._id.$oid,'DeployStackService',stackRows.find(r=>r.stack===stack).id);
  const key=stack+':'+service,deadline=Date.now()+180000;let healthy;
  while(Date.now()<deadline){
   const rows=await inspect({transition:key}),row=rows.find(x=>x.stack===stack&&x.service===service);
   if(row.running&&row.healthy&&row.pid>0){healthy=row;break;}
   await delay(2000);
  }
  check(healthy,'Target service readiness timed out');
  expected.set(key,{id:healthy.id,sha:target,running:true});
  await inspect();await state();
  await record({phase:'deployed-healthy',stack,service,container:healthy,receipt:projected(confirmed)});
 }
 await guard();const containers=await inspect(),finalState=await state();
 out.complete=true;await record({phase:'complete',containers,state:finalState});
}catch(error){
 await record({phase:'stopped',status:error?.uncertain?'uncertain':'failed',message:error.message,noAutomaticRetry:true}).catch(()=>{});
 process.exitCode=1;
}
