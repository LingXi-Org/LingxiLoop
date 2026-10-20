// Exact failed WebB pull continuation. No Stop, backup, explicit migration,
// Git, or config write. Existing Compose dependencies may run db-migrate;
// exact installed 13/48 provenance must already match, so it has no new DDL.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {validatePlan} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-maintenance.mjs';
import {createTransport,createOperations,parseMarker} from '/workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-komodo.mjs';
const dir='/tmp/lingxi-358-production',output=dir+'/maintenance-host-continuation-v2.json',run=promisify(execFile),check=(v,m)=>{if(!v)throw Error(m)};
const plan=JSON.parse(await readFile(dir+'/maintenance-host-plan.json')),priorBytes=await readFile(dir+'/maintenance-host-execution.json'),prior=JSON.parse(priorBytes);
await validatePlan(plan);
try{await run('pgrep',['-f','^node /workspace/LingxiLoop-maintenance-host-source/scripts/schema-upgrade-maintenance.mjs ']);throw Error('Previous engine active');}catch(e){if(e.code!==1)throw Error('Previous engine absence not established');}
check(prior.planHash===plan.planHash&&prior.events.at(-1)?.phase==='recovery'&&prior.events.at(-1)?.status==='failed'&&prior.events.at(-1)?.recovery==='fix-forward','Prior failure boundary differs');
check(equal(prior.events.filter(e=>e.phase==='komodo'&&e.status==='failed').map(e=>e.updateId),['6ad778a1e06d5e1f79836ea6']),'Unexpected failures');
check(equal(prior.events.filter(e=>e.phase==='recovery'&&e.status==='healthy').map(e=>[e.stack,e.service]),[['lingxiloop-app-a','lingxiloop']]),'Unexpected recovered services');
const originals=prior.events.find(e=>e.phase==='preflight'&&e.status==='prepared')?.writers;
check(originals?.length===4,'Missing original writer identities');
const mirror=JSON.parse(await readFile(dir+'/host-recovery-mirror-head.json'));
check(mirror.status===200&&mirror.digest===plan.target.imageDigest&&Date.now()-Date.parse(mirror.finishedAt)<15*60000,'Fresh matching mirror response required');
const failedValidationBytes=await readFile(dir+'/maintenance-host-continuation.json'),failedValidation=JSON.parse(failedValidationBytes);
check(failedValidation.complete===false&&failedValidation.events.at(-1)?.status==='failed'&&failedValidation.events.every(e=>e.phase!=='komodo'),'Prior validation submitted an action');
try{await run('pgrep',['-f','^node /tmp/lingxi-358-production/continue-host-target-recovery.mjs$']);throw Error('Previous continuation active');}catch(e){if(e.code!==1)throw Error('Previous continuation absence not established');}
const audit=JSON.parse(await readFile('/tmp/lingxi-225-219-preparation/final-image-audit-result-d107/receipt.json'));
check(audit.passed===true&&audit.sourceCommit===plan.target.sha&&audit.indexDigest===plan.target.imageDigest&&audit.configDigest==='sha256:019d5728f0ef708fe9a642eaf1effd2c12699cdb303e2206e11b55e542fb2c4b'&&audit.layerCount===22,'Audited image identity mismatch');
const out={failedValidation:{sha256:createHash('sha256').update(failedValidationBytes).digest('hex'),noExecute:true},startedAt:new Date().toISOString(),planHash:plan.planHash,continuationOf:{sha256:createHash('sha256').update(priorBytes).digest('hex'),updateId:'6ad778a1e06d5e1f79836ea6'},events:[],complete:false};
await writeFile(output,JSON.stringify(out)+'\n',{flag:'wx',mode:0o600});
const save=async e=>{out.events.push({...e,observedAt:new Date().toISOString()});await writeFile(output,JSON.stringify(out,null,2)+'\n',{mode:0o600});};
const t=createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,onProgress:save}),ops=createOperations({plan,transport:t,onProgress:save});
const targetIds=new Map(),completed=new Map();
async function qualifiedImages(){
 await ops.verifyImages();
 for(const server of ['shanghai-a','shanghai-b']){
  const image=await t.read('InspectImage',{server,image:'accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'+plan.target.sha});
  check(image.Id===audit.indexDigest&&image.Descriptor?.digest===audit.indexDigest&&image.Descriptor?.mediaType==='application/vnd.oci.image.index.v1+json'&&image.RepoDigests?.includes('accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server@'+audit.indexDigest)&&image.Os==='linux'&&image.Architecture==='amd64'&&image.RootFS?.Type==='layers'&&equal(image.RootFS.Layers,audit.layers.map(x=>x.diffId))&&image.Config?.Env?.includes('LINGXILOOP_COMMIT_SHA='+plan.target.sha),'Actual image differs from audited platform/layers');
  if(targetIds.has(server))check(targetIds.get(server)===image.Id,'Host image changed');
  targetIds.set(server,image.Id);
 }
}
function stateMatches(s){check(s.runtime===plan.target.runtime&&s.schema===13&&s.installedSchema===13&&s.protocol===plan.target.protocol&&s.schemaHash===plan.target.schemaHash&&s.product===48&&s.count===48&&equal(s.migrations,plan.target.migrations),'Target schema mismatch');}
async function terminal(id,stack,operation,success){
 const u=await t.read('GetUpdate',{id}),s=await t.read('GetStack',{stack});
 check(u._id?.$oid===id&&u.operation===operation&&u.target?.type==='Stack'&&u.target.id===s._id?.$oid&&u.status==='Complete'&&u.success===success,'Known terminal differs');return u;
}
async function inspect(){
 const rows=await ops.inspect();check(rows.length===4,'Writer count changed');
 for(const row of rows){
  const key=row.stack+':'+row.service,before=completed.get(key);
  if(before)check(row.id===before.id&&row.imageId===targetIds.get(row.server)&&row.source===plan.target.sha&&row.running&&row.healthy&&!row.restarting&&row.restartCount===before.restartCount,'Healthy target changed');
  else{
   const old=originals.find(x=>x.stack===row.stack&&x.service===row.service);
   check(old&&row.id===old.id&&row.imageId===old.imageId&&row.source===plan.source.sha&&!row.running&&!row.restarting&&row.pid===0&&row.restartCount===old.restartCount,'Unfinished source is not stopped and unchanged');
  }
 }return rows;
}
try{
 await terminal('6ad778a1e06d5e1f79836ea6','lingxiloop-app-b','DeployStackService',false);
 await terminal('6ad7786be06d5e1f79836e99','lingxiloop-app-a','DeployStackService',true);
 const migrated=parseMarker(await terminal('6ad77847e06d5e1f79836e91','lingxiloop-app-a','RunStackService',true),'MIGRATED');
 check(migrated.sha===plan.target.sha&&migrated.schema===13,'Migration receipt differs');
 await ops.assertIdle();await qualifiedImages();
 const webA=(await ops.inspect()).find(x=>x.stack==='lingxiloop-app-a'&&x.service==='lingxiloop');
 check(webA&&webA.source===plan.target.sha&&webA.imageId===targetIds.get(webA.server)&&webA.running&&webA.healthy&&!webA.restarting&&webA.restartCount===0,'WebA target not healthy');
 completed.set('lingxiloop-app-a:lingxiloop',webA);await inspect();
 await save({phase:'continuation',status:'verified',preservedWebA:webA});
 for(const [stack,service] of [['lingxiloop-app-b','lingxiloop'],['lingxiloop-app-a','worker'],['lingxiloop-app-b','worker']]){
  await ops.assertIdle();await inspect();await qualifiedImages();const state=await ops.state();stateMatches(state);
  await ops.deploy(stack,service);await ops.verifyHealthy(stack,service);
  const row=(await ops.inspect()).find(x=>x.stack===stack&&x.service===service);
  check(row.source===plan.target.sha&&row.imageId===targetIds.get(row.server)&&row.restartCount===0,'New target identity mismatch');
  completed.set(stack+':'+service,row);await inspect();await save({phase:'recovery',status:'healthy',stack,service,containerId:row.id});
 }
 await ops.assertIdle();await inspect();const state=await ops.state();stateMatches(state);
 out.complete=true;await save({phase:'complete',status:'complete',planHash:plan.planHash,state});
}catch(e){await save({phase:'continuation',status:e?.uncertain?'uncertain':'failed',recovery:'fix-forward',noAutomaticRetry:true});process.exitCode=1;}
console.log(JSON.stringify({output,complete:out.complete,lastEvent:out.events.at(-1)?.status}));
