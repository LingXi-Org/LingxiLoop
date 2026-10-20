// Serial, ONLINE source preparation only. No Stop/Deploy/migration/backup requests.
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual as equal} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {validatePlan} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-maintenance.mjs';
import {createOperations,createTransport} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
import {verifyHostSource} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-host-source.mjs';
const dir='/tmp/lingxi-358-production',output=dir+'/online-host-preparation.json';
const plan=JSON.parse(await readFile(dir+'/maintenance-host-plan.json','utf8')),names=plan.hostSource.stacks.map(x=>x.stack),oldPin='5d00ad7e379d82ea8b5ab35c10af775b155717f2';
const check=(v,m)=>{if(!v)throw Error(m)},hash=x=>createHash('sha256').update(x).digest('hex');
await validatePlan(plan);
const remote=(await promisify(execFile)('git',['ls-remote','origin','refs/heads/'+plan.hostSource.branch],{cwd:'/workspace/LingxiLoop-production-358',encoding:'utf8',timeout:30000})).stdout.trim().split(/\s+/);
check(remote.length===2&&remote[0]===plan.pinCommit&&remote[1]==='refs/heads/'+plan.hostSource.branch,'Release branch drift');
const out={startedAt:new Date().toISOString(),planHash:plan.planHash,mode:'online-source-preparation',complete:false,events:[]};
await writeFile(output,JSON.stringify(out)+'\n',{flag:'wx',mode:0o600});
const save=async event=>{out.events.push({...event,at:new Date().toISOString()});await writeFile(output,JSON.stringify(out,null,2)+'\n',{mode:0o600});};
const auth={apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET},t=createTransport({...auth,onProgress:save});
// inspect does only reads. The no-plan operations below are only the public
// DB-free metadata / read-only state methods; no source reply is rewritten.
const qualified=createOperations({plan,transport:t}),inspect=qualified.inspect,online=createOperations({transport:t});
let originals;
async function healthy(){const rows=await inspect();check(rows.length===4&&rows.every(x=>x.running&&x.healthy&&!x.restarting&&x.source===plan.source.sha),'Original writers unhealthy');if(originals)check(equal(rows,originals),'Original container identity/state changed');else originals=rows;}
async function idle(){
 check((await t.read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running===false,'Rollout busy');
 const servers=await t.read('ListServers',{});for(const name of ['manager','shanghai-a','shanghai-b'])check(servers.filter(x=>x.name===name&&x.info?.state==='Ok').length===1,'Required host unhealthy');
 for(const stack of names){const a=await t.read('GetStackActionState',{stack});check(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].every(k=>a[k]===false),'Stack busy');}
}
async function patch(stack,before,config){
 await idle();await healthy();const fresh=await t.read('GetStack',{stack});check(equal(fresh.config,before.config)&&fresh._id?.$oid===before._id?.$oid,'Concurrent configuration change');
 check(/^[a-f0-9]{24}$/.test(before._id?.$oid??'')&&Object.keys(config).every(k=>['branch','commit','reclone','files_on_host'].includes(k)),'Unreviewed patch scope');
 await save({phase:'config',stack,status:'submitting',fields:Object.keys(config)});
 let response;try{response=await fetch('https://ops.christmas1314.xyz/write/UpdateStack',{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':auth.apiKey,'x-api-secret':auth.apiSecret},body:JSON.stringify({id:before._id.$oid,config}),signal:AbortSignal.timeout(60000)});}catch{await save({phase:'config',stack,status:'uncertain-checking-readonly'});}
 await response?.body?.cancel();if(response&&!response.ok){await save({phase:'config',stack,status:[401,403].includes(response.status)?'denied':'failed-or-uncertain',httpStatus:response.status});throw Error('Configuration write unsuccessful');}
 const after=await t.read('GetStack',{stack});check(after._id?.$oid===before._id.$oid&&equal(after.config,{...before.config,...config}),'Full configuration readback differs');
 await save({phase:'config',stack,status:'verified',fields:Object.keys(config),fullConfigReadback:true});await healthy();return after;
}
function metadataEquals(actual){for(const key of ['sha','runtime','schema','protocol','schemaHash','productVersion','integrity','tarball','migrations'])check(equal(actual[key],plan.target[key]),'Target metadata mismatch');}
function sourceEquals(s){check(s.schema===12&&s.installedSchema===12&&s.runtime===plan.source.runtime.runtime&&s.protocol===plan.source.runtime.protocol&&s.schemaHash===plan.source.runtime.schemaHash&&s.product===46&&s.count===46&&equal(s.migrations,plan.source.migrations),'Source schema provenance drift');}
async function oneOff(stack,stage,host=false){
 await idle();await healthy();await qualified.verifyImages();const start=Date.now();
 const ops=host?createOperations({plan,transport:t,onProgress:save}):online;
 if(stack.endsWith('core-state')){const state=await ops.state();sourceEquals(state);await save({phase:stage,stack,status:'verified',durationMs:Date.now()-start,source:{runtime:state.runtime,schema:state.schema,product:state.product,schemaHash:state.schemaHash}});}
 else{const metadata=await ops.metadata(stack);metadataEquals(metadata);await save({phase:stage,stack,status:'verified',durationMs:Date.now()-start,metadata:{sha:metadata.sha,runtime:metadata.runtime,schema:metadata.schema,productVersion:metadata.productVersion}});}
 await qualified.verifyImages();await healthy();
}
try{
 await idle();await healthy();await qualified.verifyImages();out.originals=originals;await save({phase:'baseline',status:'verified'});
 const configs=new Map();
 for(const stack of names){
  const d=await t.read('GetStack',{stack}),c=d.config;
  const expectedServer=plan.hostSource.stacks.find(x=>x.stack===stack).server,serverRows=(await t.read('ListServers',{})).filter(x=>x.name===expectedServer);
  check(serverRows.length===1&&serverRows[0].info?.state==='Ok'&&c.server_id===serverRows[0].id&&c.swarm_id==='','Exact preparation host mismatch');
  check(c.git_account===''&&c.registry_account===''&&c.repo==='LingXi-Org/LingxiLoop'&&c.branch==='main'&&c.commit===(stack.endsWith('core-state')?'':oldPin)&&c.files_on_host===false&&c.reclone===false&&c.clone_path===''&&c.linked_repo===''&&c.file_contents===''&&c.run_directory==='deploy/komodo/'+stack&&equal(c.file_paths,['compose.yml'])&&equal(c.additional_env_files,[])&&equal(c.config_files,[])&&c.env_file_path==='.env'&&c.auto_update===false&&c.auto_update_all_services===false&&c.poll_for_updates===false&&c.compose_cmd_wrapper===''&&equal(c.pre_deploy,{path:'',command:'',shell_mode:false})&&equal(c.post_deploy,{path:'',command:'',shell_mode:false}),'Initial owned checkout scope drift');
  const server=plan.hostSource.stacks.find(x=>x.stack===stack).server,services=await t.read('ListStackServices',{stack});
  for(const row of services){if(!row.container)continue;const container=await t.read('InspectContainer',{server,container:row.container.id});check(Array.isArray(container.Mounts)&&container.Mounts.every(m=>m.Type!=='bind'),'Cold preparation requires no live bind mounts');}
  configs.set(stack,d);await save({phase:'scope',stack,status:'verified',ownedCheckoutOnly:true,servicesChecked:services.length});
 }
 for(const stack of names){
  let d=await patch(stack,configs.get(stack),{branch:plan.hostSource.branch,commit:plan.pinCommit,reclone:true});
  await oneOff(stack,'git-cold');
  d=await patch(stack,d,{reclone:false});configs.set(stack,d);
  for(let round=1;round<=2;round++){
   await delay(6000);await t.refreshStackCache(stack);const current=await t.read('GetStack',{stack}),info=current.info;
   check(equal(current.config,d.config)&&equal(info?.remote_errors,[])&&equal(info?.missing_files,[])&&info?.remote_contents?.length===1&&info.remote_contents[0].path==='compose.yml'&&hash(info.remote_contents[0].contents)===plan.hostSource.stacks.find(x=>x.stack===stack).sha256,'Fresh release-branch Core cache mismatch');
   await oneOff(stack,'git-warm-'+round);
  }
 }
 for(const stack of names)configs.set(stack,await patch(stack,configs.get(stack),{files_on_host:true}));
 await verifyHostSource({plan,transport:t,onProgress:save});
 for(let round=1;round<=2;round++){await delay(6000);for(const stack of names)await oneOff(stack,'host-warm-'+round,true);}
 await idle();await healthy();out.complete=true;await save({phase:'complete',status:'verified',originalContainersUnchanged:true});
}catch{await save({phase:'stopped',status:'failed-or-uncertain',noRetry:true,noStopDeployOrMigrationSubmitted:true});process.exitCode=1;}
console.log(JSON.stringify({output,complete:out.complete,lastEvent:out.events.at(-1)}));
