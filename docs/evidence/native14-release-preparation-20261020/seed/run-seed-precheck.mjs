// Generation/check mode is offline. Only explicit --execute opens the native API.
import {execFileSync} from 'node:child_process';
import {readFile,open} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {loadPreSeedInputs,ROOT,HEAD,DIR} from '../inputs.mjs';
import {createTransport} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/schema-upgrade-komodo.mjs';
import {createHostReleaseOperations} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/host-release-komodo.mjs';
import {validateHostPlanShape,NATIVE_SCHEMA_FORMAT} from '/workspace/LingxiLoop-native14-host-maintenance/scripts/host-release.mjs';
import {BINDINGS,FORMAT,hash,parseSeedUpdate,assertFreshSeedUpdate,validateSeedReceipt} from './seed-contract.mjs';
const CORE='lingxiloop-core-state',stacks=['lingxiloop-app-a','lingxiloop-app-b',CORE];
const id=/^[a-f0-9]{24}$/,hex=/^[a-f0-9]{64}$/;
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const q=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const key=c=>c.stack+':'+c.service;
const safeCheck=(value,code)=>{if(!value)throw Error('Seed precheck: '+code)};
export async function validateLocalSeedInputs({plan,planRaw,evidence}){
 validateHostPlanShape(plan);safeCheck(plan.format===NATIVE_SCHEMA_FORMAT,'native profile');
 safeCheck(plan.source.sha===BINDINGS.source,'accepted source');
 safeCheck(execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()===HEAD&&HEAD===BINDINGS.driverCommit,'frozen driver');
 safeCheck(execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'})==='','clean frozen driver');
 const sql=await readFile(new URL('./seed-check.sql',import.meta.url),'utf8');
 const canonical=await readFile(new URL('./canonical.json',import.meta.url));
 const proofRaw=await readFile(new URL('./provenance.json',import.meta.url));
 safeCheck(hash(sql)===BINDINGS.sqlSha256&&hash(canonical)===BINDINGS.canonicalSha256&&hash(proofRaw)===BINDINGS.provenanceSha256,'canonical artifacts');
 const proof=JSON.parse(proofRaw);safeCheck(proof.source===plan.source.sha&&proof.reviewedTarget===BINDINGS.reviewedTarget&&proof.files.length===7,'source provenance');
 for(const f of proof.files){
  safeCheck(f.equal===true&&f.sourceSha256===f.targetSha256,'equal definition');
  for(const commit of [plan.source.sha,plan.target.sha,BINDINGS.reviewedTarget]){
   const bytes=execFileSync('git',['show',commit+':'+f.path],{cwd:ROOT,maxBuffer:1024*1024});
   safeCheck(hash(bytes)===f.sourceSha256,'actual candidate definition differs');
  }
 }
 const accepted=JSON.parse(evidence.sourceAcceptance),before=JSON.parse(evidence.sourceProduction);
 safeCheck(hash(evidence.sourceAcceptance)===plan.sourceAcceptanceSha256&&accepted.passed===true&&accepted.candidate===plan.source.sha,'source acceptance');
 safeCheck(Object.keys(accepted.checks??{}).length>0&&Object.values(accepted.checks).every(v=>v===true),'source checks');
 safeCheck(accepted.inputs?.find(x=>x.name==='production-after.json')?.sha256===hash(evidence.sourceProduction),'source production binding');
 safeCheck(before.verified===true&&before.candidate===plan.source.sha&&before.containers?.length===4,'source production');
 safeCheck(new Set(before.containers.map(c=>c.id)).size===4,'source identities');
 safeCheck(new Set(before.containers.map(key)).size===4&&before.containers.every(c=>['lingxiloop-app-a','lingxiloop-app-b'].includes(c.stack)&&['lingxiloop','worker'].includes(c.service)&&hex.test(c.id??'')),'source services');
 return {sql,before,planSha256:hash(planRaw)};
}
export function queryParams(sql){
 const command=`set -eu; set +x; export PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT=10; exec timeout -k 5 30 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c ${q(sql)}`;
 return {stack:CORE,service:'postgres',entrypoint:'sh',user:'postgres',command:['-ec',command],no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false};
}
export async function runSeedPrecheck({plan,planRaw,evidence,local,transport,output,signal,operationsFactory=createHostReleaseOperations}){
 safeCheck(isAbsolute(output),'absolute receipt path');
 // Refuse an existing attempt, before any request; preserve unknown outcomes.
 const file=await open(output,'wx',0o600);
 const receipt={format:FORMAT,verified:false,outcome:'pending',planHash:plan.planHash,planSha256:hash(planRaw),
  ...Object.fromEntries(['source','reviewedTarget','driverCommit','sqlSha256','canonicalSha256','provenanceSha256'].map(k=>[k,BINDINGS[k]])),
  target:plan.target.sha,sourceAcceptanceSha256:plan.sourceAcceptanceSha256,sourceProductionSha256:hash(evidence.sourceProduction),
  startedAt:new Date().toISOString(),finishedAt:null,readOnly:null,fullVisibility:null,counts:null,equal:false,native:null,guards:{before:null,after:null,unchanged:false},events:[]};
 let pending=false,coreStackId;
 async function save(){const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');await file.write(bytes,0,bytes.length,0);await file.truncate(bytes.length);await file.sync();}
 async function progress(event){
  if(event.phase!=='komodo')return;
  safeCheck(event.operation==='RunStackService'&&event.stack===CORE,'unexpected native operation');
  if(event.status==='submitting'||event.status==='pending'||event.status==='uncertain')pending=true;
  if(event.status==='failed')pending=false;
  const row=Object.fromEntries(['phase','status','operation','stack','updateId'].filter(k=>event[k]!==undefined).map(k=>[k,event[k]]));
  receipt.events.push({...row,observedAt:new Date().toISOString()});await save();
 }
 try{
  await save();
  const t=transport(progress),ops=operationsFactory({plan,transport:t,signal});
  async function snapshot(){
   await ops.assertIdle();await ops.verifyImages('source');
   const rows=await ops.inspect();
   safeCheck(rows.length===4&&new Set(rows.map(c=>c.id)).size===4&&new Set(rows.map(key)).size===4,'four current identities');
   for(const c of rows){
    const old=local.before.containers.find(x=>key(x)===key(c));
    safeCheck(old&&old.id===c.id&&old.imageId===c.imageId&&old.imageSource===plan.source.sha&&old.declaredSource===plan.source.sha&&c.source===plan.source.sha,'accepted identity changed');
    safeCheck(c.running===true&&c.restarting===false&&c.healthy===true&&c.restartCount===0&&c.pid>0,'current source health');
    safeCheck(old.running===true&&old.restarting===false&&old.healthy===true&&old.restartCount===0&&old.oomKilled===false,'accepted source health');
    safeCheck(isDeepStrictEqual(c.policy,old.policy),'accepted source policy');
   }
   const configHashes={};
   for(const stack of stacks){
    const detail=await t.read('GetStack',{stack});safeCheck(id.test(detail?._id?.$oid??'')&&detail.config,'stack read');
    if(stack===CORE){if(coreStackId)safeCheck(coreStackId===detail._id.$oid,'core identity changed');else coreStackId=detail._id.$oid;}
    configHashes[stack]=hash(stable(detail.config));
   }
   return {configHashes,containersSha256:hash(stable(rows.toSorted((a,b)=>key(a).localeCompare(key(b)))))};
  }
  receipt.guards.before=await snapshot();receipt.events.push({phase:'guard',status:'verified',observedAt:new Date().toISOString()});await save();
  let native;
  try{
   pending=true;
   const accepted=await t.execute('RunStackService',queryParams(local.sql));
   const expectedId=accepted?._id?.$oid;
   parseSeedUpdate(accepted,{expectedId,coreStackId});
   const fresh=await t.read('GetUpdate',{id:expectedId});
   native=assertFreshSeedUpdate(accepted,fresh,{expectedId,coreStackId});pending=false;
  }catch(e){if(e.uncertain===false)pending=false;throw e}
  Object.assign(receipt,native);await save();
  safeCheck(native.equal===true,'canonical values differ');
  receipt.guards.after=await snapshot();
  safeCheck(isDeepStrictEqual(receipt.guards.before,receipt.guards.after),'before after guard changed');
  receipt.events.push({phase:'guard',status:'verified',observedAt:new Date().toISOString()});
  receipt.guards.unchanged=true;receipt.verified=true;receipt.outcome='complete';receipt.finishedAt=new Date().toISOString();
  receipt.events.push({phase:'seed',status:'complete',observedAt:receipt.finishedAt});
  validateSeedReceipt({plan,planRaw,receipt,executionStartedAt:receipt.finishedAt,coreStackId});await save();
  return receipt;
 }catch{
  receipt.verified=false;receipt.outcome=pending?'uncertain':'failed';receipt.finishedAt=new Date().toISOString();
  receipt.events.push({phase:'seed',status:receipt.outcome,observedAt:receipt.finishedAt});
  await save();throw Object.assign(Error('Seed precheck stopped; inspect the exclusive receipt, never retry an unresolved native ID'),{uncertain:pending});
 }finally{await file.close()}
}
async function main(){
 const args=process.argv.slice(2);safeCheck(args.length===1&&['--check','--execute'].includes(args[0]),'use --check or --execute');
 const loaded=await loadPreSeedInputs(),local=await validateLocalSeedInputs(loaded);
 if(args[0]==='--check'){console.log(JSON.stringify({verified:true,mode:'offline',source:loaded.plan.source.sha,target:loaded.plan.target.sha,sqlSha256:BINDINGS.sqlSha256}));return;}
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),180000);
 const stop=()=>abort.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const result=await runSeedPrecheck({...loaded,local,output:DIR+'/seed/receipt.json',signal:abort.signal,
   transport:onProgress=>createTransport({apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,signal:abort.signal,onProgress,confirmTerminal:true})});
  console.log(JSON.stringify({verified:result.verified,nativeId:result.native.id,counts:result.counts,receipt:DIR+'/seed/receipt.json'}));
 }finally{clearTimeout(timeout);process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Seed precheck unavailable or stopped. Review saved receipt; no retry or release is implied.');process.exitCode=1});
