// ONLINE contingency: exact public Compose templates through native host-file API.
// No Git execution on production, Stop/Deploy/migration/backup or environment copy.
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {validatePlan} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-maintenance.mjs';
import {createOperations,createTransport,parseMarker} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
import {verifyHostSource} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-host-source.mjs';
import {assertEffectiveComposePin} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-compose.mjs';
const dir='/tmp/lingxi-358-production',output=dir+'/online-direct-host-preparation.json',run=promisify(execFile);
const plan=JSON.parse(await readFile(dir+'/maintenance-host-plan.json','utf8')),names=plan.hostSource.stacks.map(x=>x.stack),oldPin='5d00ad7e379d82ea8b5ab35c10af775b155717f2',knownUpdate='6ad7723fe06d5e1f79836d40';
const check=(v,m)=>{if(!v)throw Error(m)},hash=x=>createHash('sha256').update(x).digest('hex');
await validatePlan(plan);
try{await run('pgrep',['-f','^node /tmp/lingxi-358-production/prepare-host-sources.mjs$']);throw Error('Original driver still alive');}catch(e){if(e.code!==1)throw Error('Original driver absence not established');}
const priorBytes=await readFile(dir+'/online-host-preparation.json'),prior=JSON.parse(priorBytes);
check(prior.planHash===plan.planHash&&prior.complete===false&&prior.events.at(-1)?.phase==='stopped','Original driver is not stopped');
check(equal(prior.events.filter(x=>x.phase==='komodo'&&x.status==='pending').map(x=>x.updateId),[knownUpdate]),'Unexpected prior action inventory');
const files=new Map();
for(const stack of names){
 const path=`deploy/komodo/${stack}/compose.yml`,options={cwd:'/workspace/LingxiLoop-production-358',encoding:'utf8',maxBuffer:1024*1024};
 const entry=(await run('git',['ls-tree',plan.pinCommit,path],options)).stdout;
 check(new RegExp('^100644 blob [a-f0-9]{40}\\t'+path+'\\n$').test(entry),'Source is not an ordinary tracked public Compose file');
 const contents=(await run('git',['show',`${plan.pinCommit}:${path}`],options)).stdout;
 check(hash(contents)===plan.hostSource.stacks.find(x=>x.stack===stack).sha256,'Committed public template hash mismatch');
 if(!stack.endsWith('core-state'))assertEffectiveComposePin(contents,plan.target.sha);
 files.set(stack,contents);
}
const out={startedAt:new Date().toISOString(),planHash:plan.planHash,mode:'online-direct-host-source',prior:{sha256:hash(priorBytes),updateId:knownUpdate},complete:false,events:[]};
await writeFile(output,JSON.stringify(out)+'\n',{flag:'wx',mode:0o600});
const save=async event=>{out.events.push({...event,at:new Date().toISOString()});await writeFile(output,JSON.stringify(out,null,2)+'\n',{mode:0o600});};
const auth={apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET},t=createTransport({...auth,onProgress:save});
const qualified=createOperations({plan,transport:t,onProgress:save});let originals;
async function healthy(){const rows=await qualified.inspect();check(rows.length===4&&rows.every(x=>x.running&&x.healthy&&!x.restarting&&x.source===plan.source.sha),'Original writers unhealthy');if(originals)check(equal(rows,originals),'Original container identity/state changed');else{check(equal(rows,prior.originals),'Original online source changed');originals=rows;}}
async function idle(){
 check((await t.read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running===false,'Rollout busy');
 const servers=await t.read('ListServers',{});for(const name of ['manager','shanghai-a','shanghai-b'])check(servers.filter(x=>x.name===name&&x.info?.state==='Ok').length===1,'Required host unhealthy');
 for(const stack of names){const a=await t.read('GetStackActionState',{stack});check(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].every(k=>a[k]===false),'Stack busy');}
}
async function requestWrite(operation,params){
 check(['UpdateStack','WriteStackFileContents'].includes(operation),'Write operation outside reviewed scope');
 const response=await fetch('https://ops.christmas1314.xyz/write/'+operation,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':auth.apiKey,'x-api-secret':auth.apiSecret},body:JSON.stringify(params),signal:AbortSignal.timeout(60000)});
 if(!response.ok){await response.body?.cancel();await save({phase:'api',operation,status:[401,403].includes(response.status)?'denied':'failed-or-uncertain',httpStatus:response.status});throw Error('Write unsuccessful');}
 if(operation==='UpdateStack'){await response.body?.cancel();return;}
 const text=await response.text();check(text.length<=100000,'File-write response exceeds bound');return JSON.parse(text);
}
async function patch(stack,before){
 await idle();await healthy();const fresh=await t.read('GetStack',{stack});check(equal(fresh.config,before.config)&&fresh._id?.$oid===before._id?.$oid,'Concurrent config change');
 const config={branch:plan.hostSource.branch,commit:plan.pinCommit,reclone:false,files_on_host:true};
 await save({phase:'config',stack,status:'submitting',fields:Object.keys(config)});
 // An unknown response stops this driver; no automatic retry or inferred success.
 await requestWrite('UpdateStack',{id:before._id.$oid,config});
 const after=await t.read('GetStack',{stack});check(after._id?.$oid===before._id.$oid&&equal(after.config,{...before.config,...config}),'Full config readback differs');
 await save({phase:'config',stack,status:'verified',fields:Object.keys(config),fullConfigReadback:true});await healthy();return after;
}
async function stage(stack,details){
 await idle();await healthy();const fresh=await t.read('GetStack',{stack});check(fresh._id?.$oid===details._id.$oid&&equal(fresh.config,details.config),'Source config changed before write');
 const contents=files.get(stack),expectedHash=plan.hostSource.stacks.find(x=>x.stack===stack).sha256;check(hash(contents)===expectedHash&&details.config.files_on_host===true&&details.config.auto_update===false,'Unreviewed file staging');
 await save({phase:'host-file',stack,status:'submitting',path:'compose.yml',sha256:expectedHash});
 const u=await requestWrite('WriteStackFileContents',{stack,file_path:'compose.yml',contents});
 const id=u?._id?.$oid;check(/^[a-f0-9]{24}$/.test(id??''),'Missing native file-write receipt identity');
 await save({phase:'host-file',stack,status:'received',updateId:id});
 check(u.operation==='WriteStackContents'&&u.target?.type==='Stack'&&u.target.id===details._id.$oid&&u.status==='Complete'&&u.success===true,'Native file-write receipt not successful');
 const terminal=await t.read('GetUpdate',{id});check(terminal._id?.$oid===id&&terminal.operation===u.operation&&equal(terminal.target,u.target)&&terminal.status==='Complete'&&terminal.success===true,'Native terminal file-write receipt mismatch');
 await verifyHostSource({plan,transport:t,stacks:[stack],onProgress:save});
 await save({phase:'host-file',stack,status:'verified',updateId:id,sha256:expectedHash});await healthy();
}
function metadataEquals(actual){for(const key of ['sha','runtime','schema','protocol','schemaHash','productVersion','integrity','tarball','migrations'])check(equal(actual[key],plan.target[key]),'Target metadata mismatch');}
function sourceEquals(s){check(s.schema===12&&s.installedSchema===12&&s.runtime===plan.source.runtime.runtime&&s.protocol===plan.source.runtime.protocol&&s.schemaHash===plan.source.runtime.schemaHash&&s.product===46&&s.count===46&&equal(s.migrations,plan.source.migrations),'Source schema provenance drift');}
try{
 const u=await t.read('GetUpdate',{id:knownUpdate}),a=await t.read('GetStack',{stack:names[0]});
 check(u._id?.$oid===knownUpdate&&u.operation==='RunStackService'&&u.target?.type==='Stack'&&u.target.id===a._id?.$oid&&u.status==='Complete'&&typeof u.success==='boolean','Original action outcome unresolved');
 if(u.success)metadataEquals(parseMarker(u,'METADATA'));
 await save({phase:'prior-action',status:'terminal',updateId:knownUpdate,success:u.success});
 await idle();await healthy();await qualified.verifyImages();out.originals=originals;await save({phase:'baseline',status:'verified'});
 const configs=new Map();
 for(const stack of names){
  const d=await t.read('GetStack',{stack}),c=d.config,row=plan.hostSource.stacks.find(x=>x.stack===stack),servers=(await t.read('ListServers',{})).filter(x=>x.name===row.server);
  check(/^[a-f0-9]{24}$/.test(d._id?.$oid??'')&&servers.length===1&&servers[0].info?.state==='Ok'&&c.server_id===servers[0].id&&c.swarm_id==='','Exact staging host mismatch');
  const isA=stack===names[0];check(c.git_account===''&&c.registry_account===''&&c.repo==='LingXi-Org/LingxiLoop'&&c.branch===(isA?plan.hostSource.branch:'main')&&c.commit===(isA?plan.pinCommit:stack.endsWith('core-state')?'':oldPin)&&c.reclone===isA&&c.files_on_host===false&&c.clone_path===''&&c.linked_repo===''&&c.file_contents===''&&c.run_directory==='deploy/komodo/'+stack&&equal(c.file_paths,['compose.yml'])&&equal(c.additional_env_files,[])&&equal(c.config_files,[])&&c.env_file_path==='.env'&&c.auto_update===false&&c.auto_update_all_services===false&&c.poll_for_updates===false&&c.compose_cmd_wrapper===''&&equal(c.extra_args,[])&&equal(c.pre_deploy,{path:'',command:'',shell_mode:false})&&equal(c.post_deploy,{path:'',command:'',shell_mode:false}),'Initial source staging scope drift');
  const services=await t.read('ListStackServices',{stack});for(const service of services){if(!service.container)continue;const container=await t.read('InspectContainer',{server:row.server,container:service.container.id});check(Array.isArray(container.Mounts)&&container.Mounts.every(x=>x.Type!=='bind'),'Host source staging requires no live bind mounts');}
  configs.set(stack,d);await save({phase:'scope',stack,status:'verified',sameOwnedPath:true,publicTemplateSha256:row.sha256});
 }
 for(const stack of names){const d=await patch(stack,configs.get(stack));await stage(stack,d);}
 await qualified.assertIdle();
 for(let round=1;round<=2;round++){
  await delay(6000);
  for(const stack of names){
   await idle();await healthy();await qualified.verifyImages();const start=Date.now();
   if(stack.endsWith('core-state')){const state=await qualified.state();sourceEquals(state);await save({phase:'host-round-'+round,stack,status:'verified',durationMs:Date.now()-start,source:{runtime:state.runtime,schema:state.schema,product:state.product,schemaHash:state.schemaHash}});}
   else{const metadata=await qualified.metadata(stack);metadataEquals(metadata);await save({phase:'host-round-'+round,stack,status:'verified',durationMs:Date.now()-start,metadata:{sha:metadata.sha,runtime:metadata.runtime,schema:metadata.schema,productVersion:metadata.productVersion}});}
   await qualified.verifyImages();await healthy();
  }
 }
 await qualified.assertIdle();await healthy();out.complete=true;await save({phase:'complete',status:'verified',originalContainersUnchanged:true,gitCloneSubmissions:0});
}catch{await save({phase:'stopped',status:'failed-or-uncertain',noRetry:true,noStopDeployOrMigrationSubmitted:true});process.exitCode=1;}
console.log(JSON.stringify({output,complete:out.complete,lastEvent:out.events.at(-1)}));
