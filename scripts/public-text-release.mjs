// Explicit public-text capability/provenance contracts. No network or product imports.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
export const READER_FORMAT='reader-provenance-host-release/v1';
export const PRODUCER_FORMAT='purpose-producer-host-release/v1';
export const TRACE_FORMAT='run-trace-provenance-host-release/v1';
export const CONVERSATION_FORMAT='conversation-repair-provenance-host-release/v1';
export const RUN_PRESENTATION_FORMAT='run-presentation-contract-host-release/v1';
export const SCHEMA14='c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f';
export const MIGRATION51={version:51,name:'public_text_reader',checksum:'0d8d2e5a24af7ca41df8b40d58fed42bfbc72d369c1bd4574e22738857c77185'};
export const MIGRATION52={version:52,name:'run_trace_provenance',checksum:'2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886'};
export const MIGRATION53={version:53,name:'conversation_repair_provenance',checksum:'733e035ba5de5aa5a9142c516e0364f83fe24e6dc0937e6045a89078371529dd'};
export const MIGRATION54={version:54,name:'run_presentation_contract',checksum:'f58aafed796cabcb481bd381b4df298024d5effd0a576dae5e9638430aed38e2'};
export const DEPLOYMENT_PATH='server/src/agent-runtime/public-text-deployment.ts';
const check=(ok,message)=>{if(!ok)throw Error(message)},hex=/^[a-f0-9]{64}$/;
const keys=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v).sort(),k.toSorted());
export const isPublicTextPlan=plan=>[READER_FORMAT,PRODUCER_FORMAT,TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT].includes(plan?.format);
export function assertReaderInventory(d){
 check(d?.runtime==='3.7.0'&&d.schema===14&&d.protocol===11&&d.schemaHash===SCHEMA14&&d.productVersion===51&&d.migrations?.length===51,'Exact public-text reader profile required');
 check(d.migrations.every((m,i)=>keys(m,['version','name','checksum'])&&m.version===i+1&&/^[a-z0-9_]+$/.test(m.name??'')&&hex.test(m.checksum??''))&&equal(d.migrations[50],MIGRATION51),'Reviewed51 and full contiguous inventory required');
}
export function assertTraceInventory(d){
 check(d?.runtime==='3.8.0'&&d.productVersion===52&&d.migrations?.length===52&&equal(d.migrations[51],MIGRATION52),'Exact trace3.8/full52 profile required');
 // Validate the unchanged historical reader inventory using its exact profile.
 assertReaderInventory({...d,runtime:'3.7.0',productVersion:51,migrations:d.migrations.slice(0,51)});
}
export function assertConversationRepairInventory(d){
 check(d?.runtime==='3.8.2'&&d.productVersion===53&&d.migrations?.length===53&&equal(d.migrations[52],MIGRATION53),'Exact repair3.8.2/full53 profile required');
 assertTraceInventory({...d,runtime:'3.8.0',productVersion:52,migrations:d.migrations.slice(0,52)});
}
export function assertRunPresentationInventory(d){
 check(d?.runtime==='3.8.2'&&d.productVersion===54&&d.migrations?.length===54&&equal(d.migrations[53],MIGRATION54),'Exact presentation3.8.2/full54 profile required');
 assertConversationRepairInventory({...d,productVersion:53,migrations:d.migrations.slice(0,53)});
}
export function assertPublicTextPlan(plan){
 check(isPublicTextPlan(plan),'Explicit public-text release format required');const {source:s,target:t,publicText:p}=plan;
 if(plan.format===RUN_PRESENTATION_FORMAT)assertRunPresentationInventory(t);else if(plan.format===CONVERSATION_FORMAT)assertConversationRepairInventory(t);else if(plan.format===TRACE_FORMAT)assertTraceInventory(t);else assertReaderInventory(t);
 check(keys(p,['source','target','sourceConfigurationSha256','targetConfigurationSha256','sourceContainers'])&&hex.test(p.targetConfigurationSha256??''),'Public deployment source binding required');
 check(keys(p.target,['reader','producer'])&&p.target.reader===2,'Target must retain v2 reader');
 if(plan.format===READER_FORMAT){
  check(s.runtime==='3.6.0'&&s.schema===14&&s.protocol===11&&s.schemaHash===SCHEMA14&&s.productVersion===50&&s.migrations?.length===50&&equal(s.migrations,t.migrations.slice(0,50)),'Only exact3.6/14/full50 to3.7/14/full51 supported');
  check(p.source===null&&p.sourceConfigurationSha256===null&&p.sourceContainers===null&&p.target.producer==='disabled','First reader phase must disable producer');
 }else{
  if(plan.format===RUN_PRESENTATION_FORMAT)assertConversationRepairInventory(s);else if(plan.format===CONVERSATION_FORMAT)assertTraceInventory(s);else assertReaderInventory(s);
  if(plan.format===RUN_PRESENTATION_FORMAT){
   check(equal(s.migrations,t.migrations.slice(0,53))&&p.source?.producer==='purpose-json-v1'&&p.target.producer==='purpose-json-v1','Presentation upgrade requires enabled source/target and unchanged full53');
   for(const k of ['runtime','schema','protocol','schemaHash','integrity','tarball'])check(equal(s[k],t[k]),'Presentation upgrade cannot change the formal native package');
  }
  else if(plan.format===CONVERSATION_FORMAT)check(equal(s.migrations,t.migrations.slice(0,52))&&p.source?.producer==='purpose-json-v1'&&p.target.producer==='purpose-json-v1','Repair upgrade requires enabled source/target and unchanged full52');
  else if(plan.format===TRACE_FORMAT)check(equal(s.migrations,t.migrations.slice(0,51))&&p.source?.producer==='purpose-json-v1'&&p.target.producer==='purpose-json-v1','Trace upgrade requires enabled source/target and unchanged full51');
  else for(const k of ['runtime','schema','protocol','schemaHash','productVersion','migrations','integrity','tarball'])check(equal(s[k],t[k]),'Producer phase cannot change formal package/provenance');
  check(keys(p.source,['reader','producer'])&&p.source.reader===2&&['disabled','purpose-json-v1'].includes(p.source.producer)&&hex.test(p.sourceConfigurationSha256??''),'Accepted capable source reader required');
  check(Array.isArray(p.sourceContainers)&&p.sourceContainers.length===4&&new Set(p.sourceContainers.map(c=>c.id)).size===4&&equal(p.sourceContainers.map(c=>c.stack+':'+c.service).sort(),['lingxiloop-app-a:lingxiloop','lingxiloop-app-a:worker','lingxiloop-app-b:lingxiloop','lingxiloop-app-b:worker'])&&p.sourceContainers.every(c=>keys(c,['stack','service','id','imageId'])&&hex.test(c.id??'')&&/^sha256:[a-f0-9]{64}$/.test(c.imageId??'')),'Four accepted capable source identities required');
  check(['disabled','purpose-json-v1'].includes(p.target.producer),'Explicit producer mode with capable readers required');
 }
 qualifyImageEnvironments(plan);
}
export function assertPublicTextMetadata(value,plan){
 check(value?.publicText===2&&equal(value.deployment,plan.publicText.target)&&value.configurationSha256===plan.publicText.targetConfigurationSha256&&equal(value.modelOptions,plan.publicText.target.producer==='disabled'?{}:{publicTextProtocol:'purpose-json-v1'}),'Actual image reader/producer capability mismatch');
 if([TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT].includes(plan.format))check(value.runTrace===1,'Actual trace package capability mismatch');
}
function envMap(rows){check(Array.isArray(rows),'Image environment unavailable');const map=new Map();for(const x of rows){check(typeof x==='string'&&x.indexOf('=')>0,'Invalid environment entry');const n=x.indexOf('='),k=x.slice(0,n);check(!map.has(k),'Duplicate environment key');map.set(k,x.slice(n+1));}return map;}
export function qualifyImageEnvironments(plan){
 check(keys(plan.imageConfigs,['source','target']),'Both audited public image configurations required');const configs={},maps={};
 for(const which of ['source','target']){const raw=plan.imageConfigs[which];check(typeof raw==='string'&&Buffer.byteLength(raw)<=65536&&'sha256:'+createHash('sha256').update(raw).digest('hex')===plan[which].image.configDigest,'Public image config digest differs');configs[which]=JSON.parse(raw).config;maps[which]=envMap(configs[which]?.Env);check(maps[which].get('LINGXILOOP_COMMIT_SHA')===plan[which].sha,'Baked commit mismatch');check(/^22\.\d+\.\d+$/.test(maps[which].get('NODE_VERSION')??''),'Only reviewed Node22 metadata supported');}
 check(equal({...configs.source,Env:null},{...configs.target,Env:null}),'Image startup configuration changed');
 for(const k of new Set([...maps.source.keys(),...maps.target.keys()]))if(!['LINGXILOOP_COMMIT_SHA','NODE_VERSION'].includes(k))check(maps.source.get(k)===maps.target.get(k),'Other baked environment changed');
 return new Map(['source','target'].map(which=>[plan[which].sha,{node:maps[which].get('NODE_VERSION'),config:configs[which]}]));
}
export function normalizeImageEnvironment(env,source,contract){
 const map=envMap(env),expected=contract.get(source);check(expected&&map.get('LINGXILOOP_COMMIT_SHA')===source&&map.get('NODE_VERSION')===expected.node,'Container metadata differs from audited image');
 return env.filter(x=>!x.startsWith('LINGXILOOP_COMMIT_SHA=')).map(x=>x.startsWith('NODE_VERSION=')?'NODE_VERSION=<audited-image>':x).toSorted();
}
export function assertSeedEquality(value){
 check(keys(value,['readOnly','fullVisibility','canonicalSha256','counts','equal'])&&value.readOnly===true&&value.fullVisibility===true&&value.equal===true&&value.canonicalSha256==='18182ceea150aec2db43a871e6100d6e7793ddcfec326cfd5031266cd84bb2e7'&&equal(value.counts,{missing:0,mismatched:0,plans:1,entitlements:8,planEntitlements:8}),'Canonical education seed differs or cannot be verified');
}

export function assertAcceptedPublicTextSource(accepted,plan){
 check(accepted?.passed===true&&accepted.candidate===plan.source.sha&&Object.keys(accepted.checks??{}).length>0&&Object.values(accepted.checks).every(v=>v===true),'Accepted actual source evidence required');
 if(plan.format===READER_FORMAT)check(['web-same-schema-acceptance/v1','d601-interrupted-release-recovery-acceptance/v1'].includes(accepted.format),'Unsupported source acceptance format');
 else check(accepted.format==='public-text-host-acceptance/v1'&&equal(accepted.publicText,plan.publicText.source)&&accepted.configurationSha256===plan.publicText.sourceConfigurationSha256&&equal(accepted.readerContainers,plan.publicText.sourceContainers),'Producer phase requires actual accepted four-reader source');
}
