import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {isDeepStrictEqual as eq} from 'node:util';
import {expectedUpdates,hash,DIR,APPS,CORE} from './collect-terminal-receipts.mjs';
import {validateHostPlanShape,assertCompatibleState,metadataKeys} from '/workspace/LingxiLoop-product49-host-release/scripts/host-release.mjs';
const SOURCE='cf4a299bcfb44d7e7ed74a250ea1404588a4e901',TARGET='7fe5b16e08dbe6634feb701d64e26c28475b917e';
const ID=/^[a-f0-9]{24}$/,HEX=/^[a-f0-9]{64}$/,DIGEST=/^sha256:[a-f0-9]{64}$/,IMAGE='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server';
export const files=['plan.json','release-execution.json','image-preparation.json','production-after.json','image-audit/receipt.json','terminal-receipts.json'];
const key=c=>c.stack+':'+c.service;
const identities=APPS.flatMap(stack=>['lingxiloop','worker'].map(service=>stack+':'+service));
function inventory(rows){assert.equal(rows?.length,4);assert.deepEqual(rows.map(key).sort(),identities.toSorted());assert.equal(new Set(rows.map(c=>c.id)).size,4);assert.ok(rows.every(c=>HEX.test(c.id??'')&&DIGEST.test(c.imageId??'')));}
export function verifyEvidence(raw,{acceptedBytes,beforeBytes,now=Date.now()}={}){
 const data=Object.fromEntries(files.map(n=>[n,JSON.parse(raw[n])])),plan=data['plan.json'],execution=data['release-execution.json'],prep=data['image-preparation.json'],after=data['production-after.json'],audit=data['image-audit/receipt.json'],receipts=data['terminal-receipts.json'];
 const accepted=JSON.parse(acceptedBytes),before=JSON.parse(beforeBytes),done=execution.events?.at(-1),checks={};
 const check=(name,fn)=>{try{fn();checks[name]=true}catch{checks[name]=false}};
 let expected;
 check('sealedSameSchemaPlan',()=>{validateHostPlanShape(plan);assert.equal(plan.format,'same-schema-host-release/v1');for(const d of [plan.source,plan.target]){assert.equal(d.runtime,'3.5.8');assert.equal(d.schema,13);assert.equal(d.productVersion,49);}assert.equal(plan.source.sha,SOURCE);assert.equal(plan.target.sha,TARGET);});
 check('acceptedSource',()=>{assert.equal(accepted.format,'recovered-source-qualification/v1');assert.equal(accepted.passed,true);assert.equal(accepted.inputs?.find(i=>i.name==='production-after.json')?.sha256,hash(beforeBytes));assert.equal(accepted.candidate,SOURCE);assert.equal(hash(acceptedBytes),plan.sourceAcceptanceSha256);assert.ok(Object.keys(accepted.checks??{}).length&&Object.values(accepted.checks).every(x=>x===true));assert.equal(before.verified,true);assert.equal(before.candidate,SOURCE);inventory(before.containers);assert.ok(before.containers.every(c=>c.imageSource===SOURCE&&c.declaredSource===SOURCE));const original=execution.events?.find(e=>e.phase==='preflight'&&e.status==='verified')?.original;inventory(original);inventory(prep.events?.at(-1)?.original);for(const c of before.containers){for(const rows of [original,prep.events.at(-1).original]){const prior=rows.find(x=>key(x)===key(c));assert.equal(prior.id,c.id);assert.equal(prior.imageId,c.imageId);assert.equal(prior.source,SOURCE);assert.deepEqual(prior.policy,c.policy);}}});
 check('executionAndPreparation',()=>{expected=expectedUpdates(plan,prep,execution);assert.equal(execution.mode,'same-schema-release');assert.ok(Date.parse(prep.startedAt)<=Date.parse(execution.startedAt));});
 check('auditBytes',()=>{assert.equal(audit.passed,true);assert.equal(audit.repository,'ghcr.io/lingxi-org/lingxiloop-server');assert.equal(audit.sourceCommit,TARGET);assert.equal(hash(raw['image-audit/receipt.json']),plan.target.image.auditSha256);assert.equal(audit.indexDigest,plan.target.image.indexDigest);assert.equal(audit.configDigest,plan.target.image.configDigest);assert.equal(audit.linuxAmd64ManifestDigest,plan.target.image.manifestDigest);assert.deepEqual(audit.layers?.map(x=>x.diffId),plan.target.image.diffIds);});
 check('terminalReceipts',()=>{
  assert.equal(expected?.length,34);assert.equal(receipts.verified,true);assert.equal(receipts.planHash,plan.planHash);
  assert.deepEqual(receipts.inputs?.map(x=>x.name).sort(),['plan.json','image-preparation.json','release-execution.json'].sort());
  for(const i of receipts.inputs)assert.equal(i.sha256,hash(raw[i.name]));
  assert.deepEqual(Object.keys(receipts.stackIds).sort(),[...APPS,CORE].sort());assert.ok(Object.values(receipts.stackIds).every(x=>ID.test(x)));assert.equal(new Set(Object.values(receipts.stackIds)).size,3);
  assert.equal(receipts.updates.length,expected.length);assert.equal(new Set(receipts.updates.map(u=>u.id)).size,expected.length);
  for(const r of expected){const u=receipts.updates.find(u=>u.id===r.id);assert.ok(u);for(const k of Object.keys(r))assert.deepEqual(u[k],r[k]);assert.deepEqual(u.target,{type:'Stack',id:receipts.stackIds[r.stack]});assert.equal(u.status,'Complete');assert.equal(u.success,true);assert.ok(Number.isFinite(u.startTs)&&Number.isFinite(u.endTs)&&u.startTs>0&&u.endTs>=u.startTs);assert.equal(u.durationMs,u.endTs-u.startTs);
   if(r.kind==='metadata')assert.deepEqual(u.metadata,Object.fromEntries(metadataKeys.map(k=>[k,plan.target[k]])));
   if(r.kind==='state')assertCompatibleState(u.state,plan.target);
  }
  const final=receipts.updates.find(u=>u.finalState===true);assert.ok(final);assert.deepEqual(final.state,done.state);assert.ok(final.endTs>=Math.max(...receipts.updates.filter(u=>u.requestOperation==='DeployStack').map(u=>u.endTs)));
 });
 check('freshPostflight',()=>{
  assert.equal(after.verified,true);assert.equal(after.candidate,TARGET);assert.deepEqual(after.errors,[]);assert.equal(after.mode,'read-only');
  const completed=Date.parse(done.observedAt),start=Date.parse(after.startedAt),end=Date.parse(after.finishedAt);
  assert.ok(Number.isFinite(completed)&&start>=completed&&end>=start&&now>=end&&now-end<=15*60*1000,'Stale postflight');
  assert.ok(Date.parse(receipts.startedAt)>=completed&&Date.parse(receipts.finishedAt)>=Date.parse(receipts.startedAt)&&now>=Date.parse(receipts.finishedAt));
  assert.ok(after.counts.read>0&&['write','execute','sql','provider'].every(k=>after.counts[k]===0));
 });
 check('exactCurrentContainers',()=>{
  inventory(after.containers);inventory(done.containers);
  for(const c of after.containers){const row=plan.stacks.find(s=>s.stack===c.stack),d=done.containers.find(x=>key(x)===key(c));assert.equal(c.server,row.server);assert.ok(ID.test(c.serverId??''));assert.equal(c.id,d.id);assert.equal(c.imageId,d.imageId);assert.equal(c.imageSource,TARGET);assert.equal(c.declaredSource,TARGET);assert.equal(d.source,TARGET);assert.equal(d.server,c.server);assert.ok(c.running===true&&c.healthy===true&&c.restarting===false&&c.oomKilled===false&&c.restartCount===0&&c.healthFailingStreak===0);assert.ok(d.running===true&&d.healthy===true&&d.restarting===false&&d.restartCount===0&&d.pid>0);assert.ok(Number.isFinite(Date.parse(c.startedAt))&&Date.parse(c.startedAt)>=Date.parse(execution.startedAt));assert.ok(Date.parse(c.latestHealthAt)>=Date.parse(c.startedAt)&&Date.parse(c.latestHealthAt)<=Date.parse(after.finishedAt));}
 });
 check('exactCurrentSources',()=>{
  assert.equal(after.stacks.length,2);assert.deepEqual(after.stacks.map(s=>s.stack).sort(),APPS.toSorted());
  assert.equal(after.servers.length,3);assert.deepEqual(after.servers.map(s=>s.name).sort(),['manager','shanghai-a','shanghai-b'].sort());assert.ok(after.servers.every(s=>s.state==='Ok'&&ID.test(s.id??'')));assert.equal(new Set(after.servers.map(s=>s.id)).size,3);
  for(const s of after.stacks){const row=plan.stacks.find(r=>r.stack===s.stack),host=after.servers.find(h=>h.name===row.server);assert.equal(s.id,receipts.stackIds[s.stack]);assert.equal(s.server,row.server);assert.equal(s.serverId,host.id);assert.ok(s.idleBefore===true&&s.idleAfter===true);assert.equal(s.source.repo,'LingXi-Org/LingxiLoop');assert.equal(s.source.runDirectory,'deploy/komodo/'+s.stack);assert.deepEqual(s.source.files,['compose.yml']);assert.equal(s.source.commit,row.target.commit);assert.equal(s.source.branch,row.target.branch);assert.equal(s.source.filesOnHost,true);assert.equal(s.source.reclone,false);assert.equal(s.source.autoPull,false);assert.deepEqual(s.source.extraArgs,row.target.extraArgs);for(const c of after.containers.filter(c=>c.stack===s.stack))assert.equal(c.serverId,host.id);}
  const lastRollout=execution.events.findLastIndex(e=>e.phase==='rollout');
  for(const row of plan.stacks){const h=execution.events.map((e,i)=>({...e,i})).filter(e=>e.phase==='host-source'&&e.stack===row.stack).at(-1);assert.ok(h?.i>lastRollout&&h.status==='verified');assert.equal(h.sha256,row.target.sha256);assert.equal(h.sourcePhase,row.stack===CORE?'source':'target');}
 });
 check('actualHostImageIdentity',()=>{
  assert.equal(after.images.length,2);assert.deepEqual(after.images.map(i=>i.server).sort(),['shanghai-a','shanghai-b']);
  for(const i of after.images){assert.ok(DIGEST.test(i.id??''));assert.ok(i.repoDigests?.includes(IMAGE+'@'+audit.indexDigest));assert.equal(i.architecture,'amd64');assert.equal(i.os,'linux');assert.equal(i.rootFS?.Type,'layers');assert.deepEqual(i.rootFS.Layers,plan.target.image.diffIds);if(i.descriptor)assert.ok([audit.indexDigest,audit.linuxAmd64ManifestDigest].includes(i.descriptor.digest));
   const row=plan.stacks.find(r=>r.server===i.server&&APPS.includes(r.stack));const qualified=execution.events.filter(e=>e.phase==='image'&&e.release==='target'&&e.stack===row.stack).at(-1);assert.equal(qualified?.status,'verified');assert.equal(qualified.source,TARGET);assert.equal(qualified.indexDigest,audit.indexDigest);assert.equal(qualified.imageId,i.id);assert.equal(qualified.platform,'linux/amd64');assert.equal(qualified.layers,plan.target.image.diffIds.length);
   assert.ok(after.containers.filter(c=>c.server===i.server).length===2&&after.containers.filter(c=>c.server===i.server).every(c=>c.imageId===i.id));
  }
 });
 check('policyUnchanged',()=>{inventory(before.containers);for(const c of after.containers){const old=before.containers.find(x=>key(x)===key(c)),d=done.containers.find(x=>key(x)===key(c));assert.ok(c.policy&&Object.keys(c.policy).length>0);assert.deepEqual(c.policy,old.policy);assert.deepEqual(c.policy,d.policy);}});
 check('schema',()=>{assertCompatibleState(done.state,plan.source);assertCompatibleState(done.state,plan.target);const r=receipts.updates.filter(u=>u.finalState===true);assert.equal(r.length,1);assert.deepEqual(r[0].state,done.state);});
 check('publicHealthAndVersion',()=>{assert.deepEqual(after.public.map(r=>r.path).sort(),['/api/health','/readyz','/api/health/dependencies','/api/meta'].sort());assert.ok(after.public.every(r=>r.ok===true&&r.status===200));const meta=after.public.find(r=>r.path==='/api/meta').meta;assert.equal(meta.commitSha,TARGET);assert.equal(meta.reasoningRuntime?.runtime,plan.target.runtime);assert.equal(meta.reasoningRuntime?.schema,13);assert.equal(meta.reasoningRuntime?.controlPlane,plan.target.protocol);const deps=after.public.find(r=>r.path==='/api/health/dependencies').dependencies;assert.ok(deps.database===true&&deps.redis===true&&deps.openNotebook===true);});
 check('workerStartupSelfChecksInferred',()=>{const rows=after.containers.filter(c=>c.service==='worker');assert.equal(rows.length,2);assert.ok(rows.every(c=>c.workerCommandMatches===true&&c.workerEntrypointMatches===true&&c.workerReadyzCheckMatches===true&&c.policy.productionMode===true));});
 return {at:new Date(now).toISOString(),candidate:plan.target.sha,planHash:plan.planHash,checks,passed:Object.values(checks).every(v=>v===true),inputs:files.map(name=>({name,sha256:hash(raw[name])})),sourceAcceptanceSha256:hash(acceptedBytes),sourceProductionReadSha256:hash(beforeBytes),isolationScope:'Exact production entrypoint and native readyz imply shipped startup self-check completion; no full production isolation/fault-injection matrix.',authenticatedSmoke:'not-run: no existing authorized identity injected; no credential created/copied'};
}
async function main(){
 const raw=Object.fromEntries(await Promise.all(files.map(async n=>[n,await readFile(DIR+'/'+n)]))),acceptedBytes=await readFile(DIR+'/source/qualification.json'),beforeBytes=await readFile(DIR+'/source/production-after.json');
 const out=verifyEvidence(raw,{acceptedBytes,beforeBytes});await writeFile(DIR+'/final-acceptance.json',JSON.stringify(out,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({passed:out.passed,checks:out.checks}));if(!out.passed)process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Acceptance inputs unavailable or invalid; no successful acceptance written.');process.exitCode=1});
