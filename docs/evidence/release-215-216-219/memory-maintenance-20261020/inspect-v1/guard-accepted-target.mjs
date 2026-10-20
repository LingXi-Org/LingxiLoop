// Issue216 post-acceptance guard. Importing this module performs no network work.
// Only read/RefreshStackCache are reachable. Secret-bearing values stay in memory.
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {files as evidenceFiles,verifyEvidence} from './verify-final-acceptance.mjs';
import {APPS,CORE,IMAGE,check,hash,validateHostPlanShape,assertImageIdentity} from '/workspace/LingxiLoop-maintenance-host-source/scripts/host-release.mjs';
const DIR='/tmp/lingxi-canvas-release-20261020';
const PLAN_HASH='78166e8cb841bd5735c25ea3eac9fef1be4e4846709ec8a55a10c7445f8bbf8a';
const TARGET='9a5cfda82ad105d666bf0452df1d615daf6c6a28';
const actions=['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'];
const id=/^[a-f0-9]{24}$/,hex=/^[a-f0-9]{64}$/;
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const digest=v=>hash(stable(v));
const key=c=>c.stack+':'+c.service;
const safeError=()=>Error('Accepted-target guard failed; no service action authorized and no automatic retry');
function validatePlan(plan){
 validateHostPlanShape(plan);
 check(plan.planHash===PLAN_HASH&&plan.target.sha===TARGET,'Unexpected maintenance target');
}

// Dependency injection exists for local tests only. The exported guard uses the
// fixed local acceptance artifacts and the exact existing verifier.
export async function loadAcceptedEvidence(plan,{read=readFile,now=Date.now()}={}){
 try{
  validatePlan(plan);
  const acceptanceBytes=await read(DIR+'/final-acceptance.json'),acceptance=JSON.parse(acceptanceBytes);
  check(acceptance.passed===true&&acceptance.planHash===plan.planHash&&acceptance.candidate===TARGET,'Target not accepted');
  const at=Date.parse(acceptance.at);
  check(Number.isFinite(at)&&at<=now&&now-at<=24*60*60*1000,'Acceptance unavailable or too old');
  const raw={};
  for(const name of evidenceFiles)raw[name]=await read(DIR+'/'+name);
  check(equal(JSON.parse(raw['plan.json']),plan),'Plan differs from acceptance');
  const acceptedBytes=await read('/tmp/lingxi-358-production/production-host-final-acceptance.json');
  const beforeBytes=await read('/tmp/lingxi-358-production/production-host-after-v2.json');
  // Revalidate freshness at its acceptance time; current liveness is verified
  // below through fresh API reads, rather than reinterpreting old observations.
  const recomputed=verifyEvidence(raw,{acceptedBytes,beforeBytes,now:at});
  check(recomputed.passed===true&&equal(recomputed,acceptance),'Acceptance bytes or evidence changed');
  check(equal(await read(DIR+'/final-acceptance.json'),acceptanceBytes),'Acceptance changed while reading');
  return {planHash:plan.planHash,acceptanceSha256:hash(acceptanceBytes),
   after:JSON.parse(raw['production-after.json']),stackIds:JSON.parse(raw['terminal-receipts.json']).stackIds};
 }catch{throw safeError()}
}

export function createAcceptedTargetGuard({readEvidence=loadAcceptedEvidence}={}){
 const sessions=new WeakMap();
 return async function acceptedTargetGuard({plan,transport:t,onProgress=async()=>{}}){
  let session;
  try{
   validatePlan(plan);
   check(t&&typeof t.read==='function'&&typeof t.refreshStackCache==='function','Read transport unavailable');
   session=sessions.get(t);
   check(!session?.failed&&!session?.active,'Guard session stopped or concurrently in use');
   if(!session){session={active:false,failed:false};sessions.set(t,session)}
   session.active=true;
   const read=async(operation,params)=>{
    check(!session.failed,'Guard session stopped');
    const value=await t.read(operation,params);
    check(!session.failed,'Guard session stopped');
    return value;
   };
   const evidence=await readEvidence(plan),{after,stackIds}=evidence;
   check(evidence.planHash===plan.planHash&&hex.test(evidence.acceptanceSha256??'')&&after.candidate===TARGET,'Invalid accepted target evidence');
   const evidenceHash=digest(evidence);
   if(session.evidenceHash)check(session.evidenceHash===evidenceHash,'Accepted evidence changed');
   check(after.containers.length===4&&new Set(after.containers.map(c=>c.id)).size===4
    &&equal(after.containers.map(key).sort(),APPS.flatMap(s=>['lingxiloop','worker'].map(v=>s+':'+v)).sort()),'Accepted container inventory invalid');
   check(after.servers.length===3&&equal(after.servers.map(s=>s.name).sort(),['manager','shanghai-a','shanghai-b'])
    &&after.servers.every(s=>s.state==='Ok'&&id.test(s.id??'')),'Accepted hosts invalid');
   check(equal(Object.keys(stackIds).sort(),[...APPS,CORE].sort())&&Object.values(stackIds).every(x=>id.test(x))
    &&new Set(Object.values(stackIds)).size===3,'Accepted stack identities invalid');
   check(after.images.length===2&&equal(after.images.map(i=>i.server).sort(),['shanghai-a','shanghai-b']),'Accepted image inventory invalid');
   const fullConfigs=new Map(),fullPolicies=new Map(),imageIds=new Map(),stackSummaries=[],containers=[];
   const acceptedHost=name=>after.servers.find(s=>s.name===name);
   async function hosts(){
    const rows=await read('ListServers',{});
    check(Array.isArray(rows),'Host inventory unavailable');
    for(const wanted of after.servers){
     const matches=rows.filter(s=>s.name===wanted.name);
     check(matches.length===1&&matches[0].id===wanted.id&&matches[0].info?.state==='Ok','Accepted host unavailable');
    }
   }
   async function idle(){
    check((await read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'}))?.running===false,'Concurrent rollout');
    for(const row of plan.stacks){
     const a=await read('GetStackActionState',{stack:row.stack});
     check(a&&actions.every(k=>a[k]===false),'Concurrent stack operation');
    }
   }
   function assertConfig(detail,row){
    const c=detail?.config,ref=row.target,emptyHook={path:'',command:'',shell_mode:false};
    check(detail?._id?.$oid===stackIds[row.stack]&&c&&c.server_id===acceptedHost(row.server).id
     &&c.swarm_id===''&&c.repo==='LingXi-Org/LingxiLoop'&&c.branch===ref.branch&&c.commit===ref.commit
     &&c.files_on_host===true&&c.reclone===false&&c.clone_path===''&&c.git_account===''&&c.registry_account===''
     &&c.linked_repo===''&&c.file_contents===''&&c.run_directory==='deploy/komodo/'+row.stack&&c.env_file_path==='.env'
     &&equal(c.file_paths,['compose.yml'])&&equal(c.additional_env_files,[])&&equal(c.config_files,[])
     &&c.auto_update===false&&c.auto_update_all_services===false&&c.poll_for_updates===false
     &&c.auto_pull===ref.autoPull&&equal(c.extra_args,ref.extraArgs)&&c.run_build===false&&c.destroy_before_deploy===false
     &&c.project_name===''&&c.compose_cmd_wrapper===''&&equal(c.build_extra_args,[])
     &&equal(c.pre_deploy,emptyHook)&&equal(c.post_deploy,emptyHook)&&equal(c.ignore_services,row.stack===CORE?[]:['db-migrate']),'Target configuration drift');
    const baseline=fullConfigs.get(row.stack)??session.configs?.get(row.stack);
    if(baseline)check(equal(c,baseline),'Full configuration changed');
    else fullConfigs.set(row.stack,structuredClone(c));
    if(!fullConfigs.has(row.stack))fullConfigs.set(row.stack,structuredClone(c));
   }
   function assertContents(detail,row){
    const info=detail?.info,remote=info?.remote_contents;
    check(equal(info?.remote_errors,[])&&equal(info?.missing_files,[])&&Array.isArray(remote)&&remote.length===1
     &&remote[0].path==='compose.yml'&&typeof remote[0].contents==='string'
     &&hash(remote[0].contents)===row.target.sha256,'Fresh target Compose unavailable');
   }
   async function qualifyImages(){
    for(const row of plan.stacks.filter(r=>APPS.includes(r.stack))){
     const actual=await read('InspectImage',{server:row.server,image:IMAGE+TARGET});
     const imageId=assertImageIdentity(actual,plan.target.image),accepted=after.images.find(i=>i.server===row.server);
     check(imageId===accepted?.id,'Accepted host image changed');
     if(imageIds.has(row.server))check(imageIds.get(row.server)===imageId,'Host image changed during guard');
     imageIds.set(row.server,imageId);
    }
   }
   async function inspect(){
    const result=[];
    for(const row of plan.stacks.filter(r=>APPS.includes(r.stack))){
     const rows=await read('ListStackServices',{stack:row.stack});
     check(Array.isArray(rows)&&rows.every(r=>['lingxiloop','worker','db-migrate',...(row.stack===APPS[1]?['gateway']:[])].includes(r.service)),'Unexpected service inventory');
     for(const optional of ['db-migrate','gateway'])check(rows.filter(r=>r.service===optional).length<=1,'Ambiguous extra service');
     const job=rows.find(r=>r.service==='db-migrate');
     if(job?.container){
      check(hex.test(job.container.id??''),'Migration container identity unavailable');
      const c=await read('InspectContainer',{server:row.server,container:job.container.id});
      check(c.Id===job.container.id&&c.State?.Running===false&&c.State?.Restarting===false,'Existing migration job unresolved');
     }
     for(const service of ['lingxiloop','worker']){
      const matches=rows.filter(r=>r.service===service),accepted=after.containers.find(c=>c.stack===row.stack&&c.service===service);
      check(matches.length===1&&hex.test(accepted?.id??'')&&matches[0].container?.id===accepted.id,'Accepted service container changed');
      const c=await read('InspectContainer',{server:row.server,container:accepted.id}),env=c.Config?.Env;
      check(c.Id===accepted.id&&c.Image===accepted.imageId&&c.Image===imageIds.get(row.server)&&c.Config?.Image===IMAGE+TARGET
       &&Array.isArray(env)&&env.every(x=>typeof x==='string')
       &&equal(env.filter(x=>x.startsWith('LINGXILOOP_COMMIT_SHA=')),['LINGXILOOP_COMMIT_SHA='+TARGET])
       &&c.State?.Running===true&&c.State.Restarting===false&&c.State.OOMKilled===false&&c.RestartCount===0
       &&Number.isSafeInteger(c.State.Pid)&&c.State.Pid>0&&c.State.StartedAt===accepted.startedAt
       &&c.State.Health?.Status==='healthy'&&c.State.Health.FailingStreak===0,'Accepted target container unhealthy or changed');
      const policy={readOnly:c.HostConfig?.ReadonlyRootfs,privileged:c.HostConfig?.Privileged,securityOpt:c.HostConfig?.SecurityOpt,
       capAdd:c.HostConfig?.CapAdd,capDrop:c.HostConfig?.CapDrop,pidsLimit:c.HostConfig?.PidsLimit,user:c.Config.User,productionMode:env.includes('NODE_ENV=production')};
      check(equal(policy,accepted.policy),'Accepted security policy changed');
      const protectedConfig={env:env.toSorted(),host:Object.fromEntries(['ReadonlyRootfs','Privileged','SecurityOpt','CapAdd','CapDrop','PidsLimit','Binds','Tmpfs','PortBindings','Memory','NanoCpus','Devices','DeviceRequests'].map(k=>[k,c.HostConfig?.[k]])),
       user:c.Config.User,command:c.Config.Cmd,entrypoint:c.Config.Entrypoint,health:c.Config.Healthcheck,mounts:c.Mounts};
      const k=row.stack+':'+service,baseline=fullPolicies.get(k)??session.policies?.get(k);
      if(baseline)check(equal(baseline,protectedConfig),'Full container policy changed');
      fullPolicies.set(k,structuredClone(protectedConfig));
      result.push({stack:row.stack,server:row.server,serverId:acceptedHost(row.server).id,service,id:c.Id,imageId:c.Image,source:TARGET,
       running:true,healthy:true,restarting:false,restartCount:0,oomKilled:false,startedAt:c.State.StartedAt,policy});
     }
    }
    return result;
   }
   await hosts();await idle();
   for(const row of plan.stacks){
    const before=await read('GetStack',{stack:row.stack});assertConfig(before,row);
    check(!session.failed,'Guard session stopped');
    await t.refreshStackCache(row.stack);
    const fresh=await read('GetStack',{stack:row.stack});assertConfig(fresh,row);assertContents(fresh,row);
    stackSummaries.push({stack:row.stack,id:stackIds[row.stack],server:row.server,serverId:acceptedHost(row.server).id,
     composeSha256:row.target.sha256,configSha256:digest(fresh.config)});
   }
   await qualifyImages();containers.push(...await inspect());
   await hosts();await idle();
   for(const row of plan.stacks){const d=await read('GetStack',{stack:row.stack});assertConfig(d,row);assertContents(d,row)}
   await qualifyImages();check(equal(await inspect(),containers),'Target changed during guard');
   const result={verified:true,planHash:plan.planHash,candidate:TARGET,acceptanceSha256:evidence.acceptanceSha256,
    stacks:stackSummaries,containers,images:[...imageIds].map(([server,imageId])=>({server,imageId,indexDigest:plan.target.image.indexDigest,layers:plan.target.image.diffIds.length}))};
   if(session.result)check(equal(result,session.result),'Target changed across guard calls');
   await onProgress({phase:'accepted-target-guard',status:'verified',planHash:plan.planHash,acceptanceSha256:evidence.acceptanceSha256,
    stacks:stackSummaries,containers:containers.map(({stack,service,id,imageId})=>({stack,service,id,imageId}))});
   check(!session.failed,'Guard session stopped');
   session.evidenceHash=evidenceHash;session.configs=fullConfigs;session.policies=fullPolicies;session.result=structuredClone(result);
   return result;
  }catch{if(session)session.failed=true;throw safeError()}
  finally{if(session)session.active=false}
 };
}
export const guard=createAcceptedTargetGuard();
