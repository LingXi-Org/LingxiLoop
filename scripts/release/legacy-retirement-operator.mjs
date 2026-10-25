#!/usr/bin/env node
// Fixed #495 metadata actor. No service execute, image pull, RunSync, Variables API or secret export.
import{createHash}from'node:crypto'
import{readFile,mkdir,open,rename,lstat}from'node:fs/promises'
import{dirname,resolve}from'node:path'
import{pathToFileURL}from'node:url'
import{execFileSync}from'node:child_process'
import{isDeepStrictEqual as equal}from'node:util'
import{claimProcessLock}from'../release-host/server.mjs'

export const OPS_SHA='816433430c71887905bf277d6ced523cc92f6674'
export const SHARED_SHA='cca6816135ad1781c342493f3dbde3148728aff1ea20519a1e2a9799ee14ba69'
export const OLD_SOURCE_SHA='5e2fa5e7ec7fb401ae4021a8b8730ecd127a77bf5f73be0b4c49bb9d8ba987e9'
const SNAPSHOT_SHA='03edb2e2a383229c4b9596a80b67f222fedf3e4d4266664eecd7ec81b09640c7'
export const IDS={sync:'6aa8a273b35d27bdd4e12a8d',procedure:'6aa8a416b35d27bdd4e12af5',core:'6aa8a3e8b35d27bdd4e12ae0',a:'6aa8a411b35d27bdd4e12aef',b:'6aa8a414b35d27bdd4e12af1',knowledge:'6aa8a3ebb35d27bdd4e12ae2',ingress:'6aa8a3a0b35d27bdd4e12acd',landing:'6aa8a3e6b35d27bdd4e12ade',lit:'6aa8a3edb35d27bdd4e12ae4',uptime:'6aa8a415b35d27bdd4e12af3'}
const protectedIds=[IDS.core,IDS.a,IDS.b,IDS.knowledge,IDS.procedure],sharedIds=[IDS.ingress,IDS.landing,IDS.lit,IDS.uptime],terminal=new Set(['accepted','recovered','failed','superseded']),workflowTerminal=new Set(['complete','completed','errored','terminated'])
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v
const canonical=v=>JSON.stringify(ordered(v)),rawHash=v=>createHash('sha256').update(v).digest('hex')
export const evidenceHash=v=>`sha256:${rawHash(canonical(v))}`
const check=(v,code)=>{if(!v)throw Object.assign(Error(code),{code})}
const idOf=v=>v?._id?.$oid??v?.id,iso=v=>Number.isFinite(Date.parse(v)),sameImage=(a,b)=>equal(Object.fromEntries(['ref','indexDigest','platformDigest','configDigest','diffIds','os','architecture'].map(k=>[k,a?.[k]])),Object.fromEntries(['ref','indexDigest','platformDigest','configDigest','diffIds','os','architecture'].map(k=>[k,b?.[k]])))
function fresh(value,now){check(iso(value)&&Date.parse(value)<=now+5000&&now-Date.parse(value)<=120000,'FRESH_ZERO_EVIDENCE_REQUIRED')}
function operation(cohort,target,side,phase){
 const op=cohort.record.targets?.[`${target}:${side}:${phase}`],m=cohort.manifest
 check(op&&op.status==='succeeded'&&op.releaseId===m.releaseId&&op.target===target&&op.phase===phase&&op.key===`${m.releaseId}:${target}:${phase}`&&op.manifestHash===evidenceHash(m)&&op.generation===(phase==='prepare'?0:cohort.record.generation)&&typeof op.operationId==='string','HOST_PHASE_RECEIPT_REQUIRED')
 return op
}
function cohort(c,status){check(c?.manifest?.version===1&&c.manifest.opsSha===OPS_SHA&&c.record?.opsSha===OPS_SHA&&c.record.releaseId===c.manifest.releaseId&&c.record.appSha===c.manifest.appSha&&c.record.status===status&&c.record.generation>=1&&c.record.needsAgent===false&&typeof c.record.workflowId==='string','COMPLETE_RUNTIME_RECEIPTS_REQUIRED')}
export function validateEvidence(e,{now=Date.now()}={}){
 check(e?.version===1&&e.opsSha===OPS_SHA,'QUALIFICATION_EVIDENCE_REQUIRED')
 const accepted=e.runtime,recovered=e.recovery;cohort(accepted,'accepted');cohort(recovered,'recovered')
 check(accepted.record.releaseId!==recovered.record.releaseId&&recovered.manifest.sourceReleaseId===accepted.record.releaseId&&recovered.manifest.appSha===accepted.manifest.appSha,'SEPARATE_RECOVERY_QUALIFICATION_REQUIRED')
 check(recovered.record.targets?.recovery?.direction==='compatible-recovery','COMPATIBLE_RECOVERY_EXERCISE_REQUIRED')
 check(accepted.verified?.releaseId===accepted.record.releaseId&&accepted.verified.generation===accepted.record.generation&&equal(accepted.verified.observations,accepted.record.targets)&&iso(accepted.verified.verifiedAt),'ACCEPTED_R2_RECEIPT_REQUIRED')
 const receipt=recovered.receipt
 check(receipt?.releaseId===recovered.record.releaseId&&receipt.opsSha===OPS_SHA&&receipt.manifestHash===evidenceHash(recovered.manifest)&&receipt.generation===recovered.record.generation&&receipt.recordHash===evidenceHash(recovered.record)&&iso(receipt.observedAt)&&receipt.postRecovery?.probes?.['recovery-495-absence']?.status===404,'RECOVERY_ARCHIVE_RECEIPT_REQUIRED')
 check(typeof recovered.receiptText==='string'&&equal(JSON.parse(recovered.receiptText),receipt)&&recovered.archive?.sha256===`sha256:${rawHash(recovered.receiptText)}`&&recovered.archive.size===Buffer.byteLength(recovered.receiptText)&&typeof recovered.archive.key==='string'&&recovered.archive.key.includes(recovered.record.releaseId)&&typeof recovered.archive.etag==='string'&&recovered.archive.etag.length>0,'IMMUTABLE_RECOVERY_ARCHIVE_REQUIRED')
 for(const side of ['a','b']){
  const target=`main-runtime-${side}`,a=accepted.manifest.targets?.[target],r=recovered.manifest.targets?.[target]
  check(a?.adapter==='main-runtime'&&r?.adapter==='main-runtime'&&equal(a.hosts,[side])&&equal(r.hosts,[side])&&a.hostPlan?.mode==='maintenance'&&r.hostPlan?.mode==='maintenance'&&a.contract.nativeSchema===14&&a.contract.productSchema===57&&equal(a.contract,r.contract)&&equal(a.contract,r.hostPlan.contract)&&equal(a.contract,r.hostPlan.recovery?.contract)&&equal(a.contract,(r.hostPlan.source??r.hostPlan.recovery).contract),'RUNTIME_CONTRACT_MISMATCH')
  for(const [service,image]of Object.entries(a.hostPlan.images??{}))check(sameImage(image,r.hostPlan.images?.[service])&&sameImage(image,(r.hostPlan.source??r.hostPlan.recovery).images?.[service])&&sameImage(image,r.hostPlan.recovery.images?.[service]),'RECOVERY_IMAGE_MISMATCH')
  check(Object.keys(a.hostPlan.images??{}).length>=2&&equal(Object.keys(a.hostPlan.images).sort(),Object.keys(r.hostPlan.images??{}).sort()),'COMPLETE_RUNTIME_IMAGES_REQUIRED')
  for(const phase of ['prepare','drain','apply','verify','undrain'])operation(accepted,target,side,phase)
  const probes=accepted.record.targets?.[`${target}:verification`],names=a.verification
  check(operation(accepted,target,side,'verify').result?.verified===true&&probes&&Array.isArray(names?.readiness)&&names.readiness.length>0&&typeof names.businessProbe==='string'&&[...names.readiness,names.businessProbe].every(id=>Number.isInteger(probes[id]?.status)&&probes[id].status>=200&&probes[id].status<400),'RUNTIME_BUSINESS_RECEIPT_REQUIRED')
  for(const phase of ['prepare','drain','apply','verify','undrain','recovery-drain','recover','recovery-undrain'])operation(recovered,target,side,phase)
  const restore=operation(recovered,target,side,'recover'),post=receipt.postRecovery.hosts?.[side]
  check(restore.result?.applied===true&&restore.result.direction==='recovery'&&equal(restore.result.images,post?.images)&&post.nativeSchema===14&&post.productSchema===57,'RECOVERY_ACTUAL_VERSIONS_REQUIRED')
 }
 const frontend=recovered.manifest.targets?.['main-frontend']?.recovery?.artifact
 check(frontend?.versionId&&receipt.postRecovery.frontend?.versionId===frontend.versionId&&receipt.postRecovery.frontend.percentage===100,'FRONTEND_RECOVERY_RECEIPT_REQUIRED')
 const user=e.controller?.userReadback,ci=e.controller?.ci
 check(user?.source==='parent-trusted-user-readback'&&typeof user.messageId==='string'&&user.messageId.length>0&&iso(user.observedAt)&&typeof user.text==='string'&&user.sha256===`sha256:${rawHash(user.text)}`&&user.values?.RELEASE_CONTROLLER_ENABLED==='true'&&user.values?.RELEASE_OPS_SHA===OPS_SHA,'TRUSTED_CONTROLLER_READBACK_REQUIRED')
 check(ci?.run?.head_branch==='main'&&/^[a-f0-9]{40}$/.test(ci.run.head_sha??'')&&ci.run.event==='workflow_dispatch'&&ci.run.status==='completed'&&ci.run.conclusion==='success'&&ci.run.repository?.full_name==='LingXi-Org/LingxiLoop'&&ci.dispatch?.ref==='main'&&[true,'true'].includes(ci.dispatch.inputs?.publish_only)&&ci.baseline?.releaseId===accepted.record.releaseId,'ACTUAL_PUBLISH_ONLY_CONTROLLER_CI_REQUIRED')
 const jobs=ci.jobs?.jobs;check(Array.isArray(jobs)&&jobs.every(j=>j.run_id===ci.run.id)&&ci.jobs.total_count===jobs.length,'ACTUAL_CONTROLLER_CI_REQUIRED')
 const changes=jobs.find(j=>j.name==='changes');check(changes?.conclusion==='success'&&changes.steps?.some(s=>/cumulative/i.test(s.name)&&s.conclusion==='success'),'CUMULATIVE_CONTROLLER_STEP_REQUIRED')
 const checks=jobs.filter(j=>/^checks(?:\b| \()/.test(j.name)),publish=jobs.filter(j=>/^publish(?:\b| \()/.test(j.name));check(checks.length>0&&checks.every(j=>j.status==='completed'&&j.conclusion==='success')&&publish.length>0&&publish.every(j=>j.status==='completed'&&j.conclusion==='success'&&j.steps?.some(s=>s.name==='Record registry index, platform, config and layer identities'&&s.conclusion==='success')&&j.steps?.some(s=>/upload-artifact/.test(s.name)&&s.conclusion==='success')),'IMMUTABLE_PUBLISH_ONLY_CI_REQUIRED')
 for(const name of ['prepare-static','register-candidate','report-release','update-manifests','deploy','rollout'])check(jobs.some(j=>j.name===name&&j.status==='completed'&&j.conclusion==='skipped'),'PUBLISH_ONLY_DEPLOY_MUST_BE_SKIPPED')
 const artifacts=ci.artifacts?.artifacts;check(Array.isArray(artifacts)&&artifacts.every(a=>a.workflow_run?.id===ci.run.id)&&artifacts.some(a=>a.name.startsWith('release-baseline-')&&a.name.includes(ci.run.head_sha)&&a.expired===false)&&artifacts.some(a=>a.name.startsWith('release-component-')&&a.name.includes(ci.run.head_sha)&&a.expired===false),'ACTUAL_CI_ARTIFACTS_REQUIRED')
 const zero=e.zero;fresh(zero?.observedAt,now)
 check(zero?.readOnly===true&&Array.isArray(zero.submissions)&&zero.submissions.length>0&&new Set(zero.submissions.map(x=>x.releaseId)).size===zero.submissions.length,'SUBMIT_INTENT_INVENTORY_REQUIRED')
 for(const c of [accepted,recovered])check(zero.submissions.some(s=>s.releaseId===c.record.releaseId&&s.manifestHash===evidenceHash(c.manifest)),'UNACCOUNTED_SUBMIT_INTENT')
 for(const s of zero.submissions)check(typeof s.intentSha256==='string'&&/^sha256:[a-f0-9]{64}$/.test(s.intentSha256)&&s.record?.releaseId===s.releaseId&&terminal.has(s.record.status),'UNRESOLVED_SUBMIT_INTENT')
 const instances=zero.workflows?.result;check(zero.workflows?.success===true&&Array.isArray(instances)&&instances.every(i=>workflowTerminal.has(i.status))&&(!zero.workflows.result_info||zero.workflows.result_info.total_count<=instances.length),'WORKFLOW_INFLIGHT')
 for(const c of [accepted,recovered])check(instances.some(i=>i.id===c.record.workflowId&&['complete','completed'].includes(i.status)),'QUALIFICATION_WORKFLOW_NOT_COMPLETE')
 for(const side of ['a','b']){const host=zero.hosts?.[side];check(host?.readOnly===true&&Array.isArray(host.pending)&&host.pending.length===0&&Array.isArray(host.reservations)&&host.reservations.length===0&&host.ingress?.enabled===true&&host.ingress.generation>=recovered.record.generation,'HOST_INFLIGHT_OR_DRAINED')}
 check(zero.legacyActions?.total_count===0&&Array.isArray(zero.legacyActions.workflow_runs)&&zero.legacyActions.workflow_runs.length===0,'LEGACY_ACTIONS_INFLIGHT')
 check(e.merge?.number===506&&e.merge.merged===true&&e.merge.base?.ref==='main'&&/^[a-f0-9]{40}$/.test(e.merge.merge_commit_sha),'MERGED_RETIREMENT_REQUIRED')
 return{accepted:accepted.record.releaseId,recovered:recovered.record.releaseId,publishOnlyRunId:ci.run.id,opsSha:OPS_SHA,sourceHash:SHARED_SHA,mergeCommitSha:e.merge.merge_commit_sha}
}
const getOp=o=>o.kind==='Stack'?'GetStack':o.kind==='Procedure'?'GetProcedure':'GetResourceSync',param=o=>({[o.kind==='Stack'?'stack':o.kind==='Procedure'?'procedure':'sync']:o.id}),strip=(config,keys)=>Object.fromEntries(Object.entries(config).filter(([k])=>!keys.includes(k)))
export function buildPlan(e,snapshot,sharedSource,oldSource){
 validateEvidence(e);check(snapshot?.readOnly===true&&snapshot.observedAt==='2026-10-25T23:05:56.429Z'&&snapshot.coreVersion?.version==='2.3.3','LEGACY_SNAPSHOT_REQUIRED')
 check(rawHash(sharedSource)===SHARED_SHA&&sharedSource.includes(`commit = "${OPS_SHA}"`)&&rawHash(oldSource)===OLD_SOURCE_SHA,'REVIEWED_SOURCE_HASH_REQUIRED')
 const objects=[...snapshot.stacks.map(x=>({...x,kind:'Stack'})),...snapshot.procedures.map(x=>({...x,kind:'Procedure'})),...snapshot.syncs.map(x=>({...x,kind:'ResourceSync'}))]
 for(const id of Object.values(IDS))check(objects.some(o=>o.id===id),'LEGACY_OBJECT_ID_MISMATCH')
 const sync=objects.find(o=>o.id===IDS.sync);check(sync.flags.managed===false&&sync.flags.delete===false&&sync.fileContentsHash===OLD_SOURCE_SHA,'UNSAFE_SYNC_BASELINE')
 const syncPatch={repo:'',linked_repo:'',files_on_host:false,file_contents:sharedSource,resource_path:['deploy/komodo/shared-resources.toml'],managed:false,delete:false,webhook_enabled:false}
 const steps=[{id:IDS.sync,kind:'ResourceSync',config:syncPatch},{id:IDS.procedure,kind:'Procedure',config:{schedule_enabled:false,webhook_enabled:false}},...[IDS.core,IDS.a,IDS.b,IDS.knowledge].map(id=>({id,kind:'Stack',config:{webhook_enabled:false,poll_for_updates:false,auto_update:false,auto_update_all_services:false}})),{id:IDS.ingress,kind:'Stack',config:{commit:OPS_SHA}}]
 const rollbackSource=oldSource.replace('branch = "main"\n',`branch = "main"\ncommit = "${OPS_SHA}"\n`)
 check(rawHash(rollbackSource)==='f92e316937d35ca93ae3c26cbccc7789492f37085731f789f17b9e2596b0e024','ROLLBACK_SOURCE_HASH_MISMATCH')
 return{identity:validateEvidence(e),objects,steps,rollback:{sourceCommit:'33e97c9f98606f22f2762e5cab2bc66ccd2291ff',sourceSha256:OLD_SOURCE_SHA,sourceWithIngressPinSha256:rawHash(rollbackSource),fields:steps.map(step=>({id:step.id,kind:step.kind,config:step.id===IDS.sync?{...sync.source,managed:false,delete:false,webhook_enabled:sync.flags.webhook_enabled,file_contents_sha256:rawHash(rollbackSource)}:step.id===IDS.ingress?{commit:OPS_SHA}:Object.fromEntries(Object.keys(step.config).map(k=>[k,objects.find(o=>o.id===step.id).flags[k]]))}))}}
}
// Materialize reviewed restore bodies only in memory. This never submits or automatically
// re-enables a publisher; the root operator must establish exclusive rollback ownership first.
export function rollbackBodies(plan,oldSource){
 check(rawHash(oldSource)===OLD_SOURCE_SHA,'ROLLBACK_SOURCE_HASH_MISMATCH')
 const source=oldSource.replace('branch = "main"\n',`branch = "main"\ncommit = "${OPS_SHA}"\n`)
 check(rawHash(source)===plan.rollback.sourceWithIngressPinSha256,'ROLLBACK_SOURCE_HASH_MISMATCH')
 return plan.rollback.fields.map(row=>{const config={...row.config};if(row.id===IDS.sync){delete config.file_contents_sha256;config.file_contents=source}return{operation:`Update${row.kind}`,body:{id:row.id,config}}})
}
async function save(path,value){await mkdir(dirname(path),{recursive:true,mode:0o700});const tmp=`${path}.${process.pid}.tmp`,file=await open(tmp,'wx',0o600);try{await file.writeFile(canonical(value));await file.sync()}finally{await file.close()}await rename(tmp,path);const dir=await open(dirname(path),'r');try{await dir.sync()}finally{await dir.close()}}
async function journal(path){try{const info=await lstat(path);check(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&info.uid===process.getuid(),'UNSAFE_OPERATOR_JOURNAL');return JSON.parse(await readFile(path,'utf8'))}catch(error){if(error.code==='ENOENT')return null;throw error}}
function safePreview(resource){const info=resource.info;check(info&&!info.pending_error&&!info.pending_deploy_error&&!info.remote_errors?.length,'SYNC_PREVIEW_UNCERTAIN');for(const c of [...(info.resource_updates??[]),...(info.pending_deploys??[])])check(c.target?.type==='Stack'&&sharedIds.includes(c.target.id)&&!protectedIds.includes(c.target.id)&&!['Create','Delete'].includes(c.data?.type),'SYNC_PREVIEW_UNOWNED_OR_DESTRUCTIVE')}
export async function operate({evidence,snapshot,sharedSource,oldSource,journalPath,clients,now=Date.now}){
 validateEvidence(evidence,{now:now()});const plan=buildPlan(evidence,snapshot,sharedSource,oldSource),planHash=evidenceHash({identity:plan.identity,snapshot:evidenceHash(snapshot),steps:plan.steps}),saved=await journal(journalPath)
 check(!saved||saved.planHash===planHash,'RETIREMENT_PLAN_CONFLICT')
 const state=saved??{version:1,planHash,identity:plan.identity,rollback:plan.rollback,baselines:{},steps:{}}
 // These existing read endpoints independently cross-check the supplied provider exports.
 for(const s of evidence.zero.submissions){const live=await clients.release(`/v1/releases/${encodeURIComponent(s.releaseId)}`);check(terminal.has(live.status)&&live.status===s.record.status&&live.workflowId===s.record.workflowId,'LIVE_SUBMISSION_NOT_TERMINAL')}
 for(const c of [evidence.runtime,evidence.recovery]){const live=await clients.release(`/v1/releases/${encodeURIComponent(c.record.releaseId)}`);check(live.opsSha===OPS_SHA&&live.status===c.record.status&&live.generation===c.record.generation&&equal(live.targets,c.record.targets),'LIVE_RELEASE_RECEIPT_MISMATCH')}
 const accepted=await clients.release('/v1/accepted');check(accepted.releaseId===evidence.controller.ci.baseline.releaseId,'LATEST_ACCEPTED_RELEASE_MOVED')
 for(const c of [evidence.runtime,evidence.recovery])for(const side of ['a','b'])for(const [key,op]of Object.entries(c.record.targets)){if(!key.startsWith(`main-runtime-${side}:${side}:`))continue;const live=await clients.host(side,op.key);check(live.operationId===op.operationId&&live.status==='succeeded'&&equal(live.result,op.result),'LIVE_HOST_RECEIPT_MISMATCH')}
 const version=await clients.read('GetVersion',{});check(version.version==='2.3.3','KOMODO_VERSION_MISMATCH')
 const current=new Map()
 for(const object of plan.objects){const live=await clients.read(getOp(object),param(object));check(idOf(live)===object.id&&live.name===object.name&&live.config,'LEGACY_OBJECT_ID_MISMATCH');const action=await clients.read(`Get${object.kind}ActionState`,param(object));check(Object.keys(action).length>0&&Object.values(action).every(v=>v===false),'LEGACY_ACTION_INFLIGHT');current.set(object.id,live)}
 for(const object of plan.objects){const config=current.get(object.id).config,keys=Object.keys(plan.steps.find(s=>s.id===object.id)?.config??{}),invariant=evidenceHash(strip(config,keys));if(!saved){check(rawHash(JSON.stringify(config))===object.configHash,'LEGACY_CONFIG_DRIFT');state.baselines[object.id]=invariant}else check(state.baselines[object.id]===invariant,'LEGACY_UNOWNED_CONFIG_DRIFT')}
 await save(journalPath,state)
 async function step(key,operation,body,readback,verify){
  fresh(evidence.zero.observedAt,now())
  let entry=state.steps[key]
  if(!entry){entry={status:'intent',operation,bodyHash:evidenceHash(body),intentAt:new Date(now()).toISOString()};state.steps[key]=entry;await save(journalPath,state);try{await clients.write(operation,body)}catch{entry.writeOutcome='unknown';await save(journalPath,state)}}
  else check(entry.operation===operation&&entry.bodyHash===evidenceHash(body),'RETIREMENT_INTENT_CONFLICT')
  let observed
  try{observed=await readback();verify(observed)}catch(error){entry.status='uncertain';entry.error=error.code??'READBACK_UNCONFIRMED';await save(journalPath,state);throw Object.assign(Error('RETIREMENT_READBACK_UNCERTAIN'),{code:'RETIREMENT_READBACK_UNCERTAIN',step:key})}
  entry.status='verified';entry.observedHash=evidenceHash(observed.config??{info:observed.info});entry.verifiedAt=new Date(now()).toISOString();await save(journalPath,state)
 }
 for(const item of plan.steps){const object=plan.objects.find(o=>o.id===item.id);await step(item.id,`Update${item.kind}`,{id:item.id,config:item.config},()=>clients.read(getOp(object),param(object)),observed=>{check(idOf(observed)===item.id&&Object.entries(item.config).every(([k,v])=>equal(observed.config?.[k],v)),'PARTIAL_CONFIG_READBACK_MISMATCH');check(evidenceHash(strip(observed.config,Object.keys(item.config)))===state.baselines[item.id],'LEGACY_UNOWNED_CONFIG_DRIFT')})}
 await step('preview','RefreshResourceSyncPending',{sync:IDS.sync},()=>clients.read('GetResourceSync',{sync:IDS.sync}),safePreview)
 for(const object of plan.objects){const live=await clients.read(getOp(object),param(object)),keys=Object.keys(plan.steps.find(s=>s.id===object.id)?.config??{});check(evidenceHash(strip(live.config,keys))===state.baselines[object.id],'LEGACY_UNOWNED_CONFIG_DRIFT')}
 state.status='verified';state.completedAt=new Date(now()).toISOString();await save(journalPath,state)
 return{status:'verified',planHash,identity:plan.identity,steps:Object.fromEntries(Object.entries(state.steps).map(([k,v])=>[k,v.status])),journalPath}
}
export function productionClients(env=process.env){
 const request=async(url,headers,body)=>{let response;try{response=await fetch(url,{method:body===undefined?'GET':'POST',headers,redirect:'error',signal:AbortSignal.timeout(30000),...(body===undefined?{}:{body:JSON.stringify(body)})})}catch{throw Object.assign(Error('TRANSPORT_OUTCOME_UNKNOWN'),{code:'TRANSPORT_OUTCOME_UNKNOWN'})}check(response.ok,'AUTHENTICATED_REQUEST_REJECTED');try{return await response.json()}catch{throw Error('READBACK_UNCONFIRMED')}}
 const komodo={'content-type':'application/json','x-api-key':env.KOMODO_API_KEY,'x-api-secret':env.KOMODO_API_SECRET},release={authorization:`Bearer ${env.RELEASE_API_TOKEN}`},host={authorization:`Bearer ${env.EXECUTOR_TOKEN}`,'CF-Access-Client-Id':env.CF_ACCESS_CLIENT_ID,'CF-Access-Client-Secret':env.CF_ACCESS_CLIENT_SECRET}
 check([env.KOMODO_API_KEY,env.KOMODO_API_SECRET,env.RELEASE_API_TOKEN,env.EXECUTOR_TOKEN,env.CF_ACCESS_CLIENT_ID,env.CF_ACCESS_CLIENT_SECRET].every(v=>typeof v==='string'&&v.length>0),'EXISTING_SIGILLO_CREDENTIALS_REQUIRED')
 return{read:(op,p)=>request(`https://ops.christmas1314.xyz/read/${op}`,komodo,p),write:(op,p)=>{check(['UpdateResourceSync','UpdateProcedure','UpdateStack','RefreshResourceSyncPending'].includes(op),'WRITE_OPERATION_FORBIDDEN');return request(`https://ops.christmas1314.xyz/write/${op}`,komodo,p)},release:path=>request(`https://release.lingxilearn.cn${path}`,release),host:(side,key)=>{check(['a','b'].includes(side),'HOST_FORBIDDEN');return request(`https://release-${side}.lingxilearn.cn/operations?key=${encodeURIComponent(key)}`,host)}}
}
async function main(){
 const[action,evidencePath,expectedHash,snapshotPath,journalPath]=process.argv.slice(2);check(['plan','apply'].includes(action)&&evidencePath&&snapshotPath&&/^sha256:[a-f0-9]{64}$/.test(expectedHash??'')&&(action!=='apply'||journalPath),'FIXED_OPERATOR_ARGUMENTS_REQUIRED')
 const bytes=await readFile(evidencePath);check(bytes.length<=8*1024*1024&&`sha256:${rawHash(bytes)}`===expectedHash,'EVIDENCE_FILE_HASH_MISMATCH');const evidence=JSON.parse(bytes),snapshot=JSON.parse(await readFile(snapshotPath));check(rawHash(canonical(snapshot))===SNAPSHOT_SHA,'LEGACY_SNAPSHOT_HASH_MISMATCH');const sharedSource=await readFile(new URL('../../deploy/komodo/shared-resources.toml',import.meta.url),'utf8'),oldSource=execFileSync('git',['show','33e97c9f98606f22f2762e5cab2bc66ccd2291ff:deploy/komodo/resources.toml'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',maxBuffer:1024*1024}),plan=buildPlan(evidence,snapshot,sharedSource,oldSource)
 if(action==='plan')return console.log(JSON.stringify({ready:true,identity:plan.identity,stepIds:plan.steps.map(s=>s.id),rollback:plan.rollback}))
 const path=resolve(journalPath),unlock=await claimProcessLock(`${path}.lock`);try{console.log(JSON.stringify(await operate({evidence,snapshot,sharedSource,oldSource,journalPath:path,clients:productionClients()})))}finally{await unlock()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({error:error.code??'RETIREMENT_FAILED',...(error.step?{step:error.step}:{}),productionResult:'query-journal-and-readback-before-any-next-write'}));process.exitCode=1})
