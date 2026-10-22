// A new observation of the known running source, never a reconstructed release.
// This exception only qualifies 110d/product52 for the published d548/product53.
// Existing online identity, configuration, seed and drain barriers still apply.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
export const CURRENT_SOURCE52_FORMAT='current-source52-acceptance/v1';
const check=(ok,message)=>{if(!ok)throw Error(message)},hex=/^[a-f0-9]{64}$/,update=/^[a-f0-9]{24}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const fields=['sha','runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations'];
const select=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value?.[key]]));
const imagePrefix='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server';
export function assertCurrentSource52Acceptance(accepted,plan){
 const s=plan.source,p=plan.publicText,e=accepted?.evidence,r=e?.observed;
 check(plan.format==='conversation-repair-provenance-host-release/v1'
  &&s.sha==='110d1a2389605b6a0649807d79c6b932261609e4'&&s.runtime==='3.8.0'&&s.schema===14&&s.productVersion===52&&s.migrations?.length===52
  &&plan.target.sha==='d5481cd258058784e7004169b5ef1235460384f1'&&plan.target.runtime==='3.8.2'&&plan.target.productVersion===53,'Current source exception is only the exact reviewed52-to53 release');
 check(accepted.format===CURRENT_SOURCE52_FORMAT&&accepted.qualification==='current-source-observation'&&accepted.historicalReleaseReceipt==='unavailable'
  &&accepted.passed===true&&accepted.candidate===s.sha&&accepted.checks?.currentSource===true&&Object.values(accepted.checks).every(v=>v===true),'Explicit new current-source qualification required');
 check(equal(accepted.publicText,p.source)&&accepted.configurationSha256===p.sourceConfigurationSha256&&equal(accepted.readerContainers,p.sourceContainers),'Current source capability/identities differ');
 check(r&&!r.error&&r.candidate===s.sha,'Complete current observation required');
 const times=[r.startedAt,r.finishedAt,e.schema?.checkedAt,e.assets?.startedAt,e.assets?.finishedAt].map(Date.parse),sealed=Date.parse(accepted.createdAt);
 check(times.every(Number.isFinite)&&Number.isFinite(sealed)&&Math.max(...times)<=sealed&&sealed-Math.min(...times)<=3600000,'Seal current observations within one hour');
 check(r.servers?.length===3&&equal(r.servers.map(x=>x.name).sort(),['manager','shanghai-a','shanghai-b'])&&r.servers.every(x=>x.state==='Ok'),'All three active control-plane servers must be healthy');
 check(r.stacks?.length===3&&equal(r.stacks.map(x=>select(x,['stack','server','source'])),plan.stacks.map(x=>select(x,['stack','server','source']))),'Actual host source/policy differs from plan');
 check(r.containers?.length===4&&new Set(r.containers.map(c=>c.id)).size===4&&equal(r.containers.map(c=>select(c,['stack','service','id','imageId'])),p.sourceContainers),'Four observed reader identities required');
 check(r.images?.length===2&&equal(r.images.map(x=>x.server).sort(),['shanghai-a','shanghai-b']),'Both host image inspections required');
 for(const i of r.images){
  check(/^sha256:[a-f0-9]{64}$/.test(i.id??'')&&i.repoDigests?.includes(imagePrefix+'@'+s.image.indexDigest)&&i.os==='linux'&&i.architecture==='amd64'
   &&i.rootFS?.Type==='layers'&&equal(i.rootFS.Layers,s.image.diffIds),'Observed source image differs from full audit');
  if(i.descriptor)check([s.image.indexDigest,s.image.manifestDigest].includes(i.descriptor.digest),'Observed descriptor differs');
 }
 for(const c of r.containers)check(c.source===s.sha&&c.image===imagePrefix+':'+s.sha&&c.imageId===r.images.find(i=>i.server===c.server)?.id
  &&c.server===(c.stack==='lingxiloop-app-a'?'shanghai-a':'shanghai-b')&&c.running===true&&c.restarting===false&&c.oomKilled===false&&c.health==='healthy'&&c.healthFailingStreak===0,'Actual reader is unhealthy or not using the audited image');
 check(r.metadata?.length===2&&equal(r.metadata.map(x=>x.stack).sort(),['lingxiloop-app-a','lingxiloop-app-b']),'Both actual image metadata results required');
 for(const m of r.metadata)check(m.status==='Complete'&&m.success===true&&update.test(m.updateId??'')&&equal(select(m.metadata,fields),select(s,fields))
  &&m.metadata.publicText===2&&m.metadata.runTrace===1&&equal(m.metadata.deployment,p.source)&&m.metadata.configurationSha256===p.sourceConfigurationSha256
  &&equal(m.metadata.modelOptions,{publicTextProtocol:'purpose-json-v1'}),'Actual source metadata/provenance differs');
 const states=e.schema.events?.filter(x=>x.phase==='read-only-provenance');check(states?.length===1,'One completed read-only provenance observation required');
 const receipt=states[0],state=receipt.state;
 check(update.test(receipt.updateId??'')&&e.schema.events.some(x=>x.phase==='komodo'&&x.status==='complete'&&x.operation==='RunStackService'&&x.stack==='lingxiloop-core-state'&&x.updateId===receipt.updateId),'Read-only schema update has no terminal success');
 check(state?.readOnly===true&&state.fullVisibility===true&&state.schema===s.schema&&state.installedSchema===s.schema&&state.runtime===s.runtime&&state.protocol===s.protocol
  &&state.schemaHash===s.schemaHash&&state.product===52&&state.count===52&&equal(state.migrations,s.migrations),'Full actual database provenance differs');
 check(typeof e.audit==='string'&&hash(e.audit)===s.image.auditSha256,'Full audit bytes are not bound to source');
 const a=JSON.parse(e.audit);
 check(a.passed===true&&a.sourceCommit===s.sha&&a.indexDigest===s.image.indexDigest&&a.configDigest===s.image.configDigest&&a.linuxAmd64ManifestDigest===s.image.manifestDigest
  &&equal(a.layers?.map(x=>x.diffId),s.image.diffIds)&&a.formalRuntimeIntegrity===s.integrity&&a.packageComparisons?.some(x=>x.prefix==='app/node_modules/@lyyzka/lingxios/'&&x.matches===true&&x.actualFiles===488&&x.expectedFiles===488)
  &&a.sourceComparisons?.length>0&&a.sourceComparisons.every(x=>x.matches===true),'Full formal runtime and source audit must pass');
 const paths=['/api/health','/readyz','/api/health/dependencies','/api/meta'];
 check(r.public?.length===4&&equal(r.public.map(x=>x.path),paths)&&r.public.every(x=>x.status===200&&x.ok===true),'All current public endpoints must succeed');
 const [health,ready,dependencies,meta]=r.public.map(x=>x.body);
 check(health?.ok===true&&ready?.ok===true&&equal(ready.dependencies,{database:true,redis:true,control:true})&&dependencies?.ok===true&&equal(dependencies.dependencies,{database:true,redis:true,openNotebook:true}),'Public dependency/readiness checks failed');
 check(meta?.commitSha===s.sha&&equal(select(meta.reasoningRuntime,['runtime','schema','controlPlane','publicText','runTrace']),{runtime:s.runtime,schema:14,controlPlane:11,publicText:2,runTrace:1}),'Public metadata differs from current source');
 const assets=e.assets;
 check(assets.passed===true&&assets.candidate===s.sha&&assets.inventorySha256===a.inventorySha256&&hex.test(a.inventorySha256??'')&&assets.paths?.length>=3
  &&assets.paths[0].path==='/'&&new Set(assets.paths.map(x=>x.path)).size===assets.paths.length&&assets.paths.some(x=>x.path.endsWith('.js'))&&assets.paths.some(x=>x.path.endsWith('.css'))
  &&assets.paths.every(x=>x.status===200&&x.ok===true&&x.matchesAudit===true&&Number.isSafeInteger(x.bytes)&&x.bytes>0&&hex.test(x.sha256??'')&&(x.path==='/'||/^\/assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(x.path))),'Audited public HTML and referenced assets required');
 // Verify the full inventory bytes here, not a caller's matchesAudit flag or
 // an unattached inventory-hash string. The exact audit is already plan-bound.
 check(typeof e.inventory==='string'&&Buffer.byteLength(e.inventory)<=32*1024*1024&&hash(e.inventory)===a.inventorySha256,'Full rootfs inventory bytes differ from the audited inventory');
 const inventory=JSON.parse(e.inventory);
 check(inventory&&typeof inventory==='object'&&!Array.isArray(inventory),'Invalid rootfs inventory');
 for(const item of assets.paths){
  const name=item.path==='/'?'app/dist/index.html':'app/dist'+item.path,expected=inventory[name];
  check(Object.hasOwn(inventory,name)&&expected?.kind==='file'&&expected.bytes===item.bytes&&expected.sha256===item.sha256,'Public asset path/hash/length differs from audited rootfs');
 }
 check(typeof e.html==='string'&&Buffer.byteLength(e.html)<=1024*1024&&Buffer.byteLength(e.html)===assets.paths[0].bytes&&hash(e.html)===assets.paths[0].sha256,'HTML bytes differ from the audited public entrypoint');
 const references=[...e.html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(x=>x[1]??x[2]).filter(x=>/\.(?:js|css)(?:[?#]|$)/i.test(x));
 check(references.every(x=>/^\/assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(x))
  &&equal([...new Set(references)].sort(),assets.paths.slice(1).map(x=>x.path).sort()),'Public evidence does not cover the exact complete HTML JS/CSS reference set');
}
