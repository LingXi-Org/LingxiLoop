// Offline only. Writes a new, explicitly narrowed source qualification from real reads.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readAcceptedRecovery} from './recovery-evidence.mjs';
import {releaseDescriptor} from '/workspace/LingxiLoop-product49-host-release/scripts/schema-upgrade-maintenance.mjs';
import {hash,assertCompatibleState,assertImageIdentity} from '/workspace/LingxiLoop-product49-host-release/scripts/host-release.mjs';
const DIR='/workspace/geometry-release/source',SOURCE='cf4a299bcfb44d7e7ed74a250ea1404588a4e901',INDEX='sha256:cfcf92c9db9cd0c446eb4400f2a9b4267a3a3c0a716427d2e1b9edac9e9e465e';
const APPS=['lingxiloop-app-a','lingxiloop-app-b'],CORE='lingxiloop-core-state';
const STACK_IDS=['6aa8a411b35d27bdd4e12aef','6aa8a414b35d27bdd4e12af1','6aa8a3e8b35d27bdd4e12ae0'];
const SHA=/^[a-f0-9]{64}$/,DIGEST=/^sha256:[a-f0-9]{64}$/;
export async function qualify({recoveryRaw,afterRaw,metadataRaw,now=Date.now()}){
 const acceptedRecovery=await readAcceptedRecovery();assert.equal(hash(recoveryRaw),hash(acceptedRecovery.recoveryRaw),'Recovery execution bytes changed');
 const recovery=JSON.parse(recoveryRaw),after=JSON.parse(afterRaw),m=JSON.parse(metadataRaw),done=recovery.events?.at(-1);
 const old=JSON.parse(await readFile('/workspace/LingxiLoop-release-229/docs/evidence/cli-memory-production-20261020/memory-d00e5f7b/plan.json'));
 const descriptor=await releaseDescriptor(SOURCE,old.target);
 assert.equal(descriptor.runtime,'3.5.8');assert.equal(descriptor.schema,13);assert.equal(descriptor.productVersion,49);
 assert.equal(recovery.format,'product49-interrupted-release-continuation/v1');assert.equal(recovery.execute,true);assert.equal(recovery.complete,true);assert.equal(done.phase,'complete');
 assert.ok(!recovery.events.some(e=>['failed','uncertain'].includes(e.status)||e.phase==='stopped'));assertCompatibleState(done.state,descriptor);
 assert.equal(after.verified,true);assert.equal(after.candidate,SOURCE);assert.deepEqual(after.errors,[]);assert.equal(after.recoveryExecutionSha256,hash(recoveryRaw));assert.equal(after.recoveryAcceptanceSha256,hash(acceptedRecovery.acceptanceRaw));
 const end=Date.parse(after.finishedAt);assert.ok(Date.parse(after.startedAt)>=Date.parse(done.at)&&end>=Date.parse(after.startedAt)&&now>=end&&now-end<15*60*1000,'Fresh post-recovery read required');
 assert.equal(after.counts.execute,0);assert.equal(after.counts.sql,0);assert.equal(after.counts.provider,0);assert.equal(after.counts.cacheRefresh,3);assert.equal(after.counts.write,3);
 assert.equal(m.format,'source-oci-metadata/v1');assert.equal(m.verified,true);assert.equal(m.sourceCommit,SOURCE);assert.equal(m.indexDigest,INDEX);assert.equal(m.repository,'ghcr.io/lingxi-org/lingxiloop-server');assert.equal(m.layerBodiesDownloaded,false);assert.equal(m.fullLayerAudit,false);assert.equal(m.os,'linux');assert.equal(m.architecture,'amd64');assert.ok(DIGEST.test(m.configDigest)&&DIGEST.test(m.linuxAmd64ManifestDigest));assert.equal(m.layers.length,22);assert.ok(m.layers.every(l=>DIGEST.test(l.diffId)&&DIGEST.test(l.digest)));
 const image={indexDigest:INDEX,manifestDigest:m.linuxAmd64ManifestDigest,configDigest:m.configDigest,diffIds:m.layers.map(l=>l.diffId)};
 assert.equal(after.servers.length,3);assert.deepEqual(after.servers.map(s=>s.name).sort(),['manager','shanghai-a','shanghai-b']);assert.ok(after.servers.every(s=>s.state==='Ok'));
 assert.equal(after.images.length,2);assert.deepEqual(after.images.map(i=>i.server).sort(),['shanghai-a','shanghai-b']);
 for(const i of after.images)assertImageIdentity({Id:i.id,RepoDigests:i.repoDigests,Os:i.os,Architecture:i.architecture,Descriptor:i.descriptor,RootFS:i.rootFS},image);
 assert.equal(after.containers.length,4);assert.equal(done.containers.length,4);assert.equal(new Set(after.containers.map(c=>c.id)).size,4);
 for(const stack of APPS)for(const service of ['lingxiloop','worker']){
  const rows=after.containers.filter(c=>c.stack===stack&&c.service===service),original=done.containers.filter(c=>c.stack===stack&&c.service===service);assert.equal(rows.length,1);assert.equal(original.length,1);const c=rows[0],d=original[0];
  assert.ok(SHA.test(c.id));assert.equal(c.id,d.id);assert.equal(c.imageId,d.imageId);assert.equal(c.imageId,after.images.find(i=>i.server===c.server).id);assert.equal(c.imageSource,SOURCE);assert.equal(c.declaredSource,SOURCE);assert.equal(d.sha,SOURCE);assert.ok(c.running&&c.healthy&&!c.restarting&&!c.oomKilled&&c.restartCount===0&&c.healthFailingStreak===0&&d.running&&d.healthy&&d.pid>0);assert.ok(Date.parse(c.latestHealthAt)>=Date.parse(c.startedAt));
 }
 assert.equal(after.hostSources.length,3);assert.deepEqual(after.hostSources.map(r=>r.stack),[...APPS,CORE]);
 for(const [i,r] of after.hostSources.entries()){assert.equal(r.id,STACK_IDS[i]);assert.equal(r.source.commit,i<2?'4a5513d5c8805deaeb7771f522b0426dafbfe7e2':'f56db73dabbaec1e92a421bbad76c239ed8d1ae2');assert.equal(r.source.autoPull,i===2);assert.deepEqual(r.source.extraArgs,i===2?[]:['--no-deps','--pull','never']);}
 const deployed=recovery.events.filter(e=>e.phase==='deployed-healthy');assert.deepEqual(deployed.map(e=>[e.stack,e.service]),[[APPS[1],'lingxiloop'],[APPS[0],'worker'],[APPS[1],'worker']]);
 const expected=new Map([
 ['6ad7a8b8e06d5e1f798378e2',{operation:'RunStackService',stackId:STACK_IDS[0],kind:'metadata'}],['6ad7a8bde06d5e1f798378e6',{operation:'RunStackService',stackId:STACK_IDS[1],kind:'metadata'}],['6ad7a927e06d5e1f79837905',{operation:'DeployStackService',stackId:STACK_IDS[0],kind:'original-web-a'}]
 ]);
 for(const e of recovery.events.filter(e=>e.receipt)){
  const kind=e.phase==='state'?'state':e.phase==='original-migration-confirmed'?'migration':'recovery-deploy';assert.ok(['state','original-migration-confirmed','deployed-healthy'].includes(e.phase));
  const stackId=kind==='state'?STACK_IDS[2]:kind==='migration'?STACK_IDS[0]:STACK_IDS[APPS.indexOf(e.stack)];assert.ok(stackId);const operation=kind==='recovery-deploy'?'DeployStackService':'RunStackService';assert.equal(e.receipt.operation,operation);assert.deepEqual(e.receipt.target,{type:'Stack',id:stackId});assert.equal(e.receipt.status,'Complete');assert.equal(e.receipt.success,true);
  if(kind==='migration')assert.equal(e.receipt.id,'6ad7a904e06d5e1f798378f8');
  expected.set(e.receipt.id,{operation,stackId,kind,original:e.receipt});
 }
 assert.equal(after.native.length,expected.size);assert.equal(new Set(after.native.map(x=>x.id)).size,expected.size);
 for(const [id,r] of expected){const n=after.native.find(x=>x.id===id);assert.ok(n);assert.equal(n.kind,r.kind);assert.equal(n.operation,r.operation);assert.deepEqual(n.target,{type:'Stack',id:r.stackId});assert.equal(n.status,'Complete');assert.equal(n.success,true);assert.ok(n.end>=n.start&&n.start>0);if(r.original){assert.equal(n.start,r.original.start);assert.equal(n.end,r.original.end);}
  if(r.kind==='metadata')assert.deepEqual(n.metadata,descriptor);if(r.kind==='state')assertCompatibleState(n.state,descriptor);if(r.kind==='migration')assert.deepEqual(n.migration,{sha:SOURCE,schema:13,product:49});
 }
 const finalNative=after.native.find(n=>n.id===recovery.events.filter(e=>e.phase==='state').at(-1).receipt.id);assert.deepEqual(finalNative.state,done.state);
 assert.deepEqual(after.public.map(x=>x.path).sort(),['/api/health','/readyz','/api/health/dependencies','/api/meta'].sort());assert.ok(after.public.every(x=>x.ok&&x.status===200));const meta=after.public.find(x=>x.path==='/api/meta').meta;assert.equal(meta.commitSha,SOURCE);assert.equal(meta.reasoningRuntime.runtime,'3.5.8');assert.equal(meta.reasoningRuntime.schema,13);assert.equal(meta.reasoningRuntime.controlPlane,descriptor.protocol);const deps=after.public.find(x=>x.path==='/api/health/dependencies').dependencies;assert.ok(deps.database&&deps.redis&&deps.openNotebook);
 const audit={format:'recovered-source-image-qualification/v1',passed:true,repository:m.repository,sourceCommit:SOURCE,indexDigest:INDEX,linuxAmd64ManifestDigest:m.linuxAmd64ManifestDigest,configDigest:m.configDigest,layers:m.layers,layerCount:22,metadataSha256:hash(metadataRaw),hostReadSha256:hash(afterRaw),actualHosts:after.images.map(i=>({server:i.server,imageId:i.id})),scope:'Digest-verified OCI metadata plus current cached host image index/platform/diffIDs and running-source identity. Layer bodies were not downloaded; lost full22-layer content audit is not recreated.',fullLayerAudit:false};
 const auditBytes=Buffer.from(JSON.stringify(audit,null,2)+'\n');
 const acceptance={format:'recovered-source-qualification/v1',candidate:SOURCE,at:new Date(now).toISOString(),passed:true,checks:{actualRecoveryAcceptance:true,actualRecoveryComplete:true,freshCurrentFourContainers:true,currentCachedImages:true,digestVerifiedMetadata:true,originalMetadataAndMigrationReadback:true,recoveryNativeReadbacks:true,full49Schema:true,threeHostSources:true,publicHealth:true},descriptor:{...descriptor,image:{...image,auditSha256:hash(auditBytes)}},stacks:after.hostSources.map(({stack,server,source})=>({stack,server,source})),inputs:[{name:'recovery-acceptance.json',path:'/workspace/recovery49/final-acceptance.json',sha256:hash(acceptedRecovery.acceptanceRaw)},{name:'execution.json',path:'/workspace/recovery49/execution.json',sha256:hash(recoveryRaw)},{name:'production-after.json',sha256:hash(afterRaw)},{name:'oci-metadata.json',sha256:hash(metadataRaw)},{name:'image-audit.json',sha256:hash(auditBytes)}],scope:'New interrupted-release recovery qualification only. Does not certify the lost original36+1 flow or lost source full22-layer audit.'};
 return {auditBytes,acceptance};
}
async function main(){const [recoveryRaw,afterRaw,metadataRaw]=await Promise.all([readFile('/workspace/recovery49/execution.json'),readFile(DIR+'/production-after.json'),readFile(DIR+'/oci-metadata.json')]);const {auditBytes,acceptance}=await qualify({recoveryRaw,afterRaw,metadataRaw});await writeFile(DIR+'/image-audit.json',auditBytes,{flag:'wx',mode:0o600});await writeFile(DIR+'/qualification.json',JSON.stringify(acceptance,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({passed:true,format:acceptance.format,checks:acceptance.checks}));}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Recovered source qualification unavailable or invalid; no successful source acceptance.');process.exitCode=1});
