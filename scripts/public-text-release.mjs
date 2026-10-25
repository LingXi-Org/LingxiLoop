// Explicit public-text capability/provenance contracts. No network or product imports.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {CURRENT_SOURCE52_FORMAT,assertCurrentSource52Acceptance} from './current-source52-acceptance.mjs';
export const READER_FORMAT='reader-provenance-host-release/v1';
export const PRODUCER_FORMAT='purpose-producer-host-release/v1';
export const TRACE_FORMAT='run-trace-provenance-host-release/v1';
export const CONVERSATION_FORMAT='conversation-repair-provenance-host-release/v1';
export const RUNTIME_PATCH_FORMAT='runtime-patch-host-release/v1';
export const CASE_COVER55_FORMAT='case-cover55-host-release/v1';
export const SAME55_FORMAT='product55-image-host-release/v1';
export const SAME56_FORMAT='product56-image-host-release/v1';
export const HOMEWORK56_FORMAT='homework56-host-release/v1';
export const CASE_SOFT_DELETE57_FORMAT='case-soft-delete57-host-release/v1';
export const MIGRATION57={version:57,name:'case_soft_delete',checksum:'f42124684d66f1387267f6da653ec2b255c2fa4a9f6dccd6179a3a5fbb4607a0'};
// One reviewed package boundary; candidate SHAs and their actual inventories remain plan inputs.
export const CASE_COVER_PACKAGE={runtime:'3.8.12',schema:14,protocol:11,schemaHash:'c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f',integrity:'sha512-O0YQexhXEbcdJRdNr9TNhkZkAkIqkuemxTKkA/2KkESbxnD1LNASNP2ujHVpWPSWY3SIxW9GNGz36H71Uig08g==',tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.12/a0a3ad053438464fc2c216744e290845b22b46a0'};
export const MIGRATION55={version:55,name:'case_covers',checksum:'609100abaddceeaba19d363962d6defbfae3276450a2fd660777d7efd4a66160'};
export const MIGRATION56={version:56,name:'homework_validation_status',checksum:'88f7078980c26b4d9658c805bc27fec8b4b4c7199a58c51a8b11201d65c4217a'};
export const SAME54_FORMAT='product54-image-host-release/v1';
export const RUN_PRESENTATION_FORMAT='run-presentation-contract-host-release/v1';
export const SCHEMA14='c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f';
export const MIGRATION51={version:51,name:'public_text_reader',checksum:'0d8d2e5a24af7ca41df8b40d58fed42bfbc72d369c1bd4574e22738857c77185'};
export const MIGRATION52={version:52,name:'run_trace_provenance',checksum:'2016fdcc9e095454f1a9fbd5fdffdaa4443c8918173dea8a324f88546123a886'};
export const MIGRATION53={version:53,name:'conversation_repair_provenance',checksum:'733e035ba5de5aa5a9142c516e0364f83fe24e6dc0937e6045a89078371529dd'};
export const MIGRATION54={version:54,name:'run_presentation_contract',checksum:'f58aafed796cabcb481bd381b4df298024d5effd0a576dae5e9638430aed38e2'};
export const DEPLOYMENT_PATH='server/src/agent-runtime/public-text-deployment.ts';
const check=(ok,message)=>{if(!ok)throw Error(message)},hex=/^[a-f0-9]{64}$/;
const keys=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&equal(Object.keys(v).sort(),k.toSorted());
export const isPublicTextPlan=plan=>[READER_FORMAT,PRODUCER_FORMAT,TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT,SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan?.format);
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
export function assertFull54RuntimeInventory(d){
 const patch=/^3\.8\.(0|[1-9]\d*)$/.exec(d?.runtime??'');
 check(patch&&Number.isSafeInteger(Number(patch[1]))&&Number(patch[1])>=2,'Reviewed full54 runtime patch family required');
 assertRunPresentationInventory({...d,runtime:'3.8.2'});
}
export function assertCaseCoverInventory(d){
 for(const [key,value] of Object.entries(CASE_COVER_PACKAGE))check(d?.[key]===value,'Case-cover requires the exact published3.8.12/native14 package');
 check(d.productVersion===55&&d.migrations?.length===55&&equal(d.migrations[54],MIGRATION55),'Exact case-cover55 checksum and full contiguous inventory required');
 assertFull54RuntimeInventory({...d,productVersion:54,migrations:d.migrations.slice(0,54)});
}
export function assertHomeworkInventory(d){
 check(d?.productVersion===56&&d.migrations?.length===56&&equal(d.migrations[55],MIGRATION56),'Exact homework56 checksum and full contiguous inventory required');
 assertCaseCoverInventory({...d,productVersion:55,migrations:d.migrations.slice(0,55)});
}
export function assertCaseSoftDeleteInventory(d){
 check(d?.productVersion===57&&d.migrations?.length===57&&equal(d.migrations[56],MIGRATION57),'Exact soft-delete57 checksum and full contiguous inventory required');
 assertHomeworkInventory({...d,productVersion:56,migrations:d.migrations.slice(0,56)});
}
export function assertRuntimePatchPlan(source,target){
 assertFull54RuntimeInventory(source);assertFull54RuntimeInventory(target);
 check(Number(target.runtime.split('.')[2])>Number(source.runtime.split('.')[2]),'Runtime patch must advance within one reviewed major/minor');
 for(const k of ['schema','protocol','schemaHash','productVersion','migrations'])check(equal(source[k],target[k]),'Runtime patch cannot change schema/inventory');
}
// Capability introduction within the reviewed full54 patch family. The actual
// formal package, audited image and metadata must independently prove it.
const full54Reader=d=>Number(d.runtime.split('.')[2])>=7?3:2;
export function assertPublicTextPlan(plan){
 check(isPublicTextPlan(plan),'Explicit public-text release format required');const {source:s,target:t,publicText:p}=plan;
 if(plan.format===CASE_SOFT_DELETE57_FORMAT)assertCaseSoftDeleteInventory(t);else if([HOMEWORK56_FORMAT,SAME56_FORMAT].includes(plan.format))assertHomeworkInventory(t);else if([CASE_COVER55_FORMAT,SAME55_FORMAT].includes(plan.format))assertCaseCoverInventory(t);else if([SAME54_FORMAT,RUNTIME_PATCH_FORMAT].includes(plan.format))assertFull54RuntimeInventory(t);else if(plan.format===RUN_PRESENTATION_FORMAT)assertRunPresentationInventory(t);else if(plan.format===CONVERSATION_FORMAT)assertConversationRepairInventory(t);else if(plan.format===TRACE_FORMAT)assertTraceInventory(t);else assertReaderInventory(t);
 check(keys(p,['source','target','sourceConfigurationSha256','targetConfigurationSha256','sourceContainers'])&&hex.test(p.targetConfigurationSha256??''),'Public deployment source binding required');
 check(keys(p.target,['reader','producer'])&&p.target.reader===([SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format)?full54Reader(t):2),'Target must retain the exact compatible formal reader');
 if(plan.format===READER_FORMAT){
  check(s.runtime==='3.6.0'&&s.schema===14&&s.protocol===11&&s.schemaHash===SCHEMA14&&s.productVersion===50&&s.migrations?.length===50&&equal(s.migrations,t.migrations.slice(0,50)),'Only exact3.6/14/full50 to3.7/14/full51 supported');
  check(p.source===null&&p.sourceConfigurationSha256===null&&p.sourceContainers===null&&p.target.producer==='disabled','First reader phase must disable producer');
 }else{
  if([SAME56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format))assertHomeworkInventory(s);else if([SAME55_FORMAT,HOMEWORK56_FORMAT].includes(plan.format))assertCaseCoverInventory(s);else if([SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,HOMEWORK56_FORMAT].includes(plan.format))assertFull54RuntimeInventory(s);else if(plan.format===RUN_PRESENTATION_FORMAT)assertConversationRepairInventory(s);else if(plan.format===CONVERSATION_FORMAT)assertTraceInventory(s);else assertReaderInventory(s);
  if([SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format)){
   if(plan.format===CASE_SOFT_DELETE57_FORMAT){
    check(s.productVersion===56&&equal(s.migrations,t.migrations.slice(0,56)),'Soft-delete upgrade requires the entire unchanged56 prefix');
    for(const k of ['runtime','schema','protocol','schemaHash','integrity','tarball'])check(equal(s[k],t[k]),'Soft-delete upgrade cannot change the formal package');
   }else if(plan.format===HOMEWORK56_FORMAT){
    check(s.productVersion===55&&equal(s.migrations,t.migrations.slice(0,55)),'Homework upgrade requires the entire unchanged55 prefix');
    for(const k of ['runtime','schema','protocol','schemaHash','integrity','tarball'])check(equal(s[k],t[k]),'Homework upgrade cannot change the formal package');
   }else if(plan.format===CASE_COVER55_FORMAT){
    check(s.productVersion===54&&equal(s.migrations,t.migrations.slice(0,54)),'Case-cover upgrade requires the entire unchanged54 prefix');
    for(const k of ['runtime','schema','protocol','schemaHash','integrity','tarball'])check(equal(s[k],t[k]),'Case-cover upgrade cannot change the formal package');
   }else if(plan.format===RUNTIME_PATCH_FORMAT)assertRuntimePatchPlan(s,t);
   else for(const k of ['runtime','schema','protocol','schemaHash','productVersion','migrations','integrity','tarball'])check(equal(s[k],t[k]),'Image-only release requires identical formal package/provenance');
   if([CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format))check(equal(p.source,{reader:3,producer:'purpose-json-v3'})&&equal(p.target,p.source),'Case-cover release retains reader3 and producer v3');
   const upgrade=plan.format===RUNTIME_PATCH_FORMAT&&[
    ['purpose-json-v1','purpose-json-v2'],['purpose-json-v2','purpose-json-v3']
   ].some(([source,target])=>p.source?.producer===source&&p.target.producer===target);
   check(s.sha!==t.sha&&['purpose-json-v1','purpose-json-v2','purpose-json-v3'].includes(p.source?.producer)
    &&(upgrade||p.source.producer===p.target.producer)
    &&(upgrade?p.sourceConfigurationSha256!==p.targetConfigurationSha256:p.sourceConfigurationSha256===p.targetConfigurationSha256),'Only runtime patch may advance enabled producer with a new bound deployment leaf');
   // This is only the version boundary. Formal package/image audit and actual
   // publicText/runTrace/leaf/options checks remain mandatory before draining.
   for(const [descriptor,deployment] of [[s,p.source],[t,p.target]]){
    check(deployment.reader===full54Reader(descriptor)&&(deployment.producer==='purpose-json-v3')===(deployment.reader===3),'Reader/producer v3 requires its formal3.8.7 capability boundary');
    if(deployment.producer==='purpose-json-v2')check(Number(descriptor.runtime.split('.')[2])>=5,'Producer v2 requires formal runtime3.8.5 or later reviewed3.8 patch');
   }
   check(plan.stacks?.slice(0,2).every(r=>r.source.autoPull===false&&equal(r.source.extraArgs,['--no-deps','--pull','never'])),'Image-only source must retain accepted offline host policy');
  }else if(plan.format===RUN_PRESENTATION_FORMAT){
   check(equal(s.migrations,t.migrations.slice(0,53))&&p.source?.producer==='purpose-json-v1'&&p.target.producer==='purpose-json-v1','Presentation upgrade requires enabled source/target and unchanged full53');
   for(const k of ['runtime','schema','protocol','schemaHash','integrity','tarball'])check(equal(s[k],t[k]),'Presentation upgrade cannot change the formal native package');
  }
  else if(plan.format===CONVERSATION_FORMAT)check(equal(s.migrations,t.migrations.slice(0,52))&&p.source?.producer==='purpose-json-v1'&&p.target.producer==='purpose-json-v1','Repair upgrade requires enabled source/target and unchanged full52');
  else if(plan.format===TRACE_FORMAT)check(equal(s.migrations,t.migrations.slice(0,51))&&p.source?.producer==='purpose-json-v1'&&p.target.producer==='purpose-json-v1','Trace upgrade requires enabled source/target and unchanged full51');
  else for(const k of ['runtime','schema','protocol','schemaHash','productVersion','migrations','integrity','tarball'])check(equal(s[k],t[k]),'Producer phase cannot change formal package/provenance');
  const modes=[SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format)?['purpose-json-v1','purpose-json-v2','purpose-json-v3']:['disabled','purpose-json-v1'];
  check(keys(p.source,['reader','producer'])&&p.source.reader===([SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format)?full54Reader(s):2)&&modes.includes(p.source.producer)&&hex.test(p.sourceConfigurationSha256??''),'Accepted capable source reader required');
  check(Array.isArray(p.sourceContainers)&&p.sourceContainers.length===4&&new Set(p.sourceContainers.map(c=>c.id)).size===4&&equal(p.sourceContainers.map(c=>c.stack+':'+c.service).sort(),['lingxiloop-app-a:lingxiloop','lingxiloop-app-a:worker','lingxiloop-app-b:lingxiloop','lingxiloop-app-b:worker'])&&p.sourceContainers.every(c=>keys(c,['stack','service','id','imageId'])&&hex.test(c.id??'')&&/^sha256:[a-f0-9]{64}$/.test(c.imageId??'')),'Four accepted capable source identities required');
  check(modes.includes(p.target.producer),'Explicit producer mode with capable readers required');
 }
 qualifyImageEnvironments(plan);
}
export function assertPublicTextMetadata(value,plan,which='target'){
 check(['source','target'].includes(which),'Explicit public metadata direction required');
 const deployment=plan.publicText[which];
 check([2,3].includes(deployment?.reader)&&value?.publicText===deployment.reader&&equal(value.deployment,deployment)&&value.configurationSha256===plan.publicText[which+'ConfigurationSha256']&&equal(value.modelOptions,deployment.producer==='disabled'?{}:{publicTextProtocol:deployment.producer}),'Actual image reader/producer capability mismatch');
 if([TRACE_FORMAT,CONVERSATION_FORMAT,RUN_PRESENTATION_FORMAT,SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format))check(value.runTrace===1,'Actual trace package capability mismatch');
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
 if([SAME54_FORMAT,RUNTIME_PATCH_FORMAT,CASE_COVER55_FORMAT,SAME55_FORMAT,SAME56_FORMAT,HOMEWORK56_FORMAT,CASE_SOFT_DELETE57_FORMAT].includes(plan.format)){
  const rows=accepted.evidence?.observed?.stacks;check(Array.isArray(rows)&&rows.length===3&&new Set(rows.map(r=>r.stack)).size===3&&['lingxiloop-app-a','lingxiloop-app-b','lingxiloop-core-state'].every(s=>rows.some(r=>r.stack===s&&/^[a-f0-9]{24}$/.test(r.id??'')&&hex.test(r.configSha256??''))),'Full accepted source configuration hashes required');
 }
 if(accepted.format===CURRENT_SOURCE52_FORMAT){assertCurrentSource52Acceptance(accepted,plan);return;}
 if(plan.format===READER_FORMAT)check(['web-same-schema-acceptance/v1','d601-interrupted-release-recovery-acceptance/v1'].includes(accepted.format),'Unsupported source acceptance format');
 else check(accepted.format==='public-text-host-acceptance/v1'&&equal(accepted.publicText,plan.publicText.source)&&accepted.configurationSha256===plan.publicText.sourceConfigurationSha256&&equal(accepted.readerContainers,plan.publicText.sourceContainers),'Producer phase requires actual accepted four-reader source');
}
