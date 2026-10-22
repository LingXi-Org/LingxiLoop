// Explicit two-model configuration maintenance. No production work on import.
import {createHash} from 'node:crypto'
import {isDeepStrictEqual as equal} from 'node:util'
import {assertCompatibleState,assertWorkerBarrier} from './host-release.mjs'
import {assertRunPresentationInventory} from './public-text-release.mjs'
import {waitForWorkerLeaseExpiry} from './host-release-lease-wait.mjs'

export const MODEL_TARGET=Object.freeze({OPENAI_MODEL:'deepseek-ai/DeepSeek-V4.1-Flash',OPENAI_EMBEDDING_MODEL:'Pro/BAAI/bge-m3'})
export const MODEL_CONFIG_FORMAT='model-configuration-release/v1'
export const MODEL_APPS=['lingxiloop-app-a','lingxiloop-app-b'],MODEL_CORE='lingxiloop-core-state'
export const modelHash=bytes=>createHash('sha256').update(bytes).digest('hex')
const key=r=>r.stack+':'+r.service,hex=/^[a-f0-9]{64}$/,id=/^[a-f0-9]{24}$/,digest=/^sha256:[a-f0-9]{64}$/
const check=(v,m)=>{if(!v)throw Error(m)},exact=(v,names)=>v&&equal(Object.keys(v).sort(),names.toSorted())
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
export function sealModelConfigPlan(value){const {planHash:_,...body}=value;return {...body,planHash:modelHash(stable(body))}}

export function patchModelEnvironment(source,target=MODEL_TARGET){
 check(typeof source==='string'&&Buffer.byteLength(source)<=512*1024&&equal(target,MODEL_TARGET),'Only the exact two-model environment patch is permitted')
 const lines=source.split(/(?<=\n)/),seen=new Set()
 const output=lines.map(line=>{
  const candidate=/^[ \t]*(?:export[ \t]+)?(OPENAI_MODEL|OPENAI_EMBEDDING_MODEL)\b/.exec(line)
  if(!candidate)return line
  const match=/^([ \t]*)(OPENAI_MODEL|OPENAI_EMBEDDING_MODEL)([ \t]*=[ \t]*)([^\r\n]*)(\r?\n)?$/.exec(line)
  check(match&&!seen.has(match[2])&&!match[4].endsWith('\\'),'Missing, duplicated or multiline model environment entry')
  seen.add(match[2]);return match[1]+match[2]+match[3]+target[match[2]]+(match[5]??'')
 })
 check(seen.size===2,'Both existing model environment entries are required')
 return output.join('')
}

export function validateModelConfigPlan(plan){
 check(exact(plan,['format','createdAt','release','sourceAcceptanceSha256','sourceAuditSha256','sourceModels','targetModels','stacks','containers','knowledge','planHash'])&&plan.format===MODEL_CONFIG_FORMAT&&equal(plan,sealModelConfigPlan(plan))&&Number.isFinite(Date.parse(plan.createdAt)),'Invalid sealed model configuration plan')
 assertRunPresentationInventory(plan.release)
 const r=plan.release
 check(exact(r,['sha','runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations','image'])&&exact(r.image,['indexDigest','configDigest','manifestDigest','diffIds','auditSha256'])&&/^[a-f0-9]{40}$/.test(r.sha??'')&&/^sha512-[\w+/]+={0,2}$/.test(r.integrity??'')&&r.tarball?.startsWith('https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.2/'),'Exact accepted formal package required')
 check([plan.sourceAcceptanceSha256,plan.sourceAuditSha256].every(x=>hex.test(x??''))&&r.image?.auditSha256===plan.sourceAuditSha256&&[r.image?.indexDigest,r.image?.configDigest,r.image?.manifestDigest].every(x=>digest.test(x??''))&&r.image.diffIds?.length>0&&r.image.diffIds.every(x=>digest.test(x)),'Exact source image audit required')
 check(exact(plan.sourceModels,Object.keys(MODEL_TARGET))&&Object.values(plan.sourceModels).every(x=>typeof x==='string'&&x.length<=160&&/^[A-Za-z0-9./_-]+$/.test(x))&&equal(plan.targetModels,MODEL_TARGET)&&!equal(plan.sourceModels,MODEL_TARGET),'Exact source and target model pair required')
 check(plan.stacks?.length===3&&plan.stacks.every((r,i)=>exact(r,['stack','server','id','sourceConfigSha256','targetConfigSha256','composeSha256'])&&r.stack===[...MODEL_APPS,MODEL_CORE][i]&&r.server===(i===1?'shanghai-b':'shanghai-a')&&id.test(r.id??'')&&[r.sourceConfigSha256,r.targetConfigSha256,r.composeSha256].every(x=>hex.test(x??''))&&(i===2?r.sourceConfigSha256===r.targetConfigSha256:r.sourceConfigSha256!==r.targetConfigSha256)),'Three exact full stack configurations required')
 check(plan.containers?.length===4&&new Set(plan.containers.map(r=>r.id)).size===4&&equal(plan.containers.map(key).sort(),MODEL_APPS.flatMap(stack=>['lingxiloop','worker'].map(service=>stack+':'+service)).sort())&&plan.containers.every(r=>exact(r,['stack','service','id','imageId','sourcePolicySha256','targetPolicySha256'])&&hex.test(r.id??'')&&digest.test(r.imageId??'')&&[r.sourcePolicySha256,r.targetPolicySha256].every(x=>hex.test(x??''))&&r.sourcePolicySha256!==r.targetPolicySha256),'Four accepted configuration identities required')
 const k=plan.knowledge
 check(exact(k,['mode','stack','server','id','configSha256','containerId','imageId','manifestSha256','fenceSha256'])&&k.mode==='stopped'&&k.stack==='lingxiloop-knowledge-agent'&&k.server==='shanghai-b'&&id.test(k.id??'')&&hex.test(k.containerId??'')&&digest.test(k.imageId??'')&&[k.configSha256,k.manifestSha256,k.fenceSha256].every(x=>hex.test(x??'')),'Exact stopped knowledge and finite shadow plan/fence boundary required')
 return plan
}

function nativeProof(plan,stack,operation,u){
 const value={id:u?._id?.$oid,operation:u?.operation,target:u?.target,status:u?.status,success:u?.success,startTs:u?.start_ts,endTs:u?.end_ts}
 check(id.test(value.id??'')&&value.operation===operation&&value.target?.type==='Stack'&&value.target.id===plan.stacks.find(r=>r.stack===stack)?.id&&value.status==='Complete'&&value.success===true&&Number.isFinite(value.startTs)&&Number.isFinite(value.endTs)&&value.endTs>=value.startTs,'Matching terminal native update required')
 return value
}

export function modelConfigBoundary(plan,receipt){
 validateModelConfigPlan(plan)
 check(receipt?.planHash===plan.planHash&&receipt.mode===plan.format&&receipt.complete===false&&Array.isArray(receipt.events)&&receipt.events.length>0,'Exact incomplete model release receipt required')
 const events=receipt.events,last=events.at(-1)
 check(last.phase==='model-config-stopped'&&last.status==='failed'&&last.noAutomaticRetry===true&&![401,403].includes(last.httpStatus)&&!events.some(e=>e.status==='uncertain'||e.phase==='complete'),'Only a known terminal failure without authorization denial may continue')
 const stopped=new Set(),configured=new Set(),deployed=new Map(),healthy=new Set(),operations=[];let pending=null
 const stopOrder=['worker','lingxiloop'].flatMap(service=>MODEL_APPS.map(stack=>stack+':'+service)),deployOrder=['lingxiloop','worker'].flatMap(service=>MODEL_APPS.map(stack=>stack+':'+service))
 for(const e of events){
  if(e.phase==='komodo'){
   if(e.status==='submitting'){check(!pending,'Overlapping native operation');pending={operation:e.operation,stack:e.stack,service:e.service}}
   else if(e.status==='pending'){check(pending&&e.operation===pending.operation&&e.stack===pending.stack&&id.test(e.updateId??''),'Unmatched native pending update');pending.id=e.updateId}
   else if(['complete','failed'].includes(e.status)){check(pending?.id===e.updateId&&pending.operation===e.operation&&pending.stack===e.stack,'Unmatched native terminal update');pending=null}
   else throw Error('Unresolved native receipt')
  }
  if(e.phase==='drain'&&e.status==='stopped'){
   check(key(e)===stopOrder[stopped.size]&&!configured.size&&!deployed.size,'Invalid stop checkpoint')
   const n=e.native;nativeProof(plan,e.stack,'StopStackService',{_id:{$oid:n?.id},operation:n?.operation,target:n?.target,status:n?.status,success:n?.success,start_ts:n?.startTs,end_ts:n?.endTs});operations.push(n);stopped.add(key(e))
  }
  if(e.phase==='configuration'&&e.status==='verified'){
   check(stopped.size===4&&!deployed.size&&e.stack===MODEL_APPS[configured.size]&&e.responseAcknowledged===true&&e.fullConfigReadback===true&&e.targetConfigSha256===plan.stacks.find(r=>r.stack===e.stack).targetConfigSha256,'Invalid configuration checkpoint');configured.add(e.stack)
  }
  if(e.phase==='rollout'&&e.status==='observed'){
   check(configured.size===2&&stopped.size===4&&key(e)===deployOrder[deployed.size]&&healthy.size===deployed.size&&hex.test(e.containerId??'')&&e.containerId!==plan.containers.find(c=>key(c)===key(e)).id&&e.imageId===plan.containers.find(c=>key(c)===key(e)).imageId,'Invalid target observation checkpoint')
   const n=e.native;nativeProof(plan,e.stack,'DeployStackService',{_id:{$oid:n?.id},operation:n?.operation,target:n?.target,status:n?.status,success:n?.success,start_ts:n?.startTs,end_ts:n?.endTs});operations.push(n);deployed.set(key(e),{id:e.containerId,imageId:e.imageId})
  }
  if(e.phase==='rollout'&&e.status==='healthy'){const c=deployed.get(key(e));check(c?.id===e.containerId&&c.imageId===e.imageId,'Healthy target checkpoint identity changed');healthy.add(key(e))}
 }
 check(!pending&&new Set(operations.map(r=>r.id)).size===operations.length,'Missing or reused native action checkpoint')
 return {stopped,configured,deployed,healthy,operations}
}

export async function runModelConfigRelease({plan,ops,receipt,onProgress=async()=>{}}){
 validateModelConfigPlan(plan)
 const b=receipt?modelConfigBoundary(plan,receipt):{stopped:new Set(),configured:new Set(),deployed:new Map(),healthy:new Set(),operations:[]},record=e=>onProgress({planHash:plan.planHash,...e})
 const context=()=>({stopped:b.stopped,configured:b.configured,deployed:b.deployed})
 const boundary=()=>ops.assertBoundary(context())
 const state=async()=>{const s=await ops.state();assertCompatibleState(s,plan.release);return s}
 const barrier=async(expire=false)=>{const read=async()=>{await boundary();return state()};const s=expire?await waitForWorkerLeaseExpiry({read,wait:ops.wait,onProgress:record}):await read();assertWorkerBarrier(s);await record({phase:'drain',status:'zero-leases',state:s});return s}
 try{
  if(receipt)await ops.verifyPriorOperations(b.operations)
  const pending=[...b.deployed.keys()].filter(k=>!b.healthy.has(k));check(pending.length<=1,'Multiple unconfirmed target health observations')
  await ops.assertBoundary({...context(),...(pending.length?{allowUnhealthy:pending[0]}:{})});await state();await record({phase:'preflight',status:'verified',continuation:Boolean(receipt)})
  for(const service of ['worker','lingxiloop'])for(const stack of MODEL_APPS){
   if(b.stopped.has(stack+':'+service))continue
   await boundary();await state();const u=await ops.stop(stack,service),native=nativeProof(plan,stack,'StopStackService',u)
   b.stopped.add(stack+':'+service);await boundary();await record({phase:'drain',status:'stopped',stack,service,native})
  }
  if(!b.deployed.size){await barrier(true);await ops.wait(2000);await barrier()}
  for(const stack of MODEL_APPS){
   if(b.configured.has(stack))continue
   await boundary();await barrier();const proof=await ops.configure(stack)
   check(proof?.responseAcknowledged===true&&proof.fullConfigReadback===true&&proof.targetConfigSha256===plan.stacks.find(r=>r.stack===stack).targetConfigSha256,'Full configuration readback required')
   b.configured.add(stack);await record({phase:'configuration',status:'verified',stack,...proof});await boundary()
  }
  for(const service of ['lingxiloop','worker'])for(const stack of MODEL_APPS){
   const k=stack+':'+service
   if(b.healthy.has(k))continue
   if(!b.deployed.has(k)){
    await boundary();await state();if(![...b.deployed.keys()].some(k=>k.endsWith(':worker')))await barrier()
    const native=nativeProof(plan,stack,'DeployStackService',await ops.deploy(stack,service)),first=await ops.deploymentIdentity(stack,service),old=plan.containers.find(c=>key(c)===k)
    check(hex.test(first?.id??'')&&first.id!==old.id&&first.imageId===old.imageId,'First target identity differs from same-image configuration release')
    b.deployed.set(k,first);await record({phase:'rollout',status:'observed',stack,service,containerId:first.id,imageId:first.imageId,native})
   }
   const identity=b.deployed.get(k);await ops.healthy(stack,service,identity,context());await boundary();await state();b.healthy.add(k);await record({phase:'rollout',status:'healthy',stack,service,containerId:identity.id,imageId:identity.imageId})
  }
  const containers=await boundary(),observed=await state(),result={phase:'complete',status:'complete',planHash:plan.planHash,state:observed,containers,models:plan.targetModels,knowledge:'retained-stopped-for-shadow-cutover'}
  await record(result);return result
 }catch(error){const detail={...(Number.isInteger(error?.httpStatus)?{httpStatus:error.httpStatus}:{}),...(typeof error?.operation==='string'?{operation:error.operation}:{})};await record({phase:'model-config-stopped',status:error?.uncertain===true?'uncertain':'failed',noAutomaticRetry:true,...detail}).catch(()=>{});throw Object.assign(Error('Model configuration release stopped; inspect the bound receipt before continuation'),{uncertain:error?.uncertain===true,...detail})}
}
