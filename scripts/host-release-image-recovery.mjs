// Explicit source restoration for one terminal failed same54 image release.
// No migration, credential/config expansion, speculative retry or receipt replay.
import {isDeepStrictEqual as equal} from 'node:util'
import {readFile,writeFile} from 'node:fs/promises'
import {isAbsolute,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {APPS,check,hash,metadataKeys,validateHostPlan,validateHostPlanShape,assertCompatibleState,assertWorkerBarrier} from './host-release.mjs'
import {SAME54_FORMAT,assertPublicTextMetadata} from './public-text-release.mjs'
import {waitForWorkerLeaseExpiry} from './host-release-lease-wait.mjs'
const hex=/^[a-f0-9]{64}$/,id=/^[a-f0-9]{24}$/
const key=r=>r.stack+':'+r.service,select=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v?.[k]]))
export function assertImageFailure(plan,receipt){
 check(plan.format===SAME54_FORMAT&&receipt?.mode===plan.format&&receipt.planHash===plan.planHash&&receipt.complete===false,'Wrong image-only failure receipt')
 const events=receipt.events,last=events?.at(-1)
 check(Array.isArray(events)&&last?.phase==='stopped'&&last.status==='failed'&&last.noAutomaticRetry===true,'Failure must be known, terminal and unreplayed')
 check(!events.some(e=>e.status==='uncertain'||['migration','backup','complete','source-restoration'].includes(e.phase)),'Unresolved operation or incompatible receipt')
 const preflight=events.filter(e=>e.phase==='preflight'&&e.status==='verified')
 check(preflight.length===1&&preflight[0].original?.length===4,'Original source evidence missing')
 const original=preflight[0].original
 check(equal(original.map(r=>select(r,['stack','service','id','imageId'])),plan.publicText.sourceContainers)
  &&original.every(r=>r.source===plan.source.sha&&r.running===true&&r.healthy===true&&r.restarting===false&&r.restartCount===0&&hex.test(r.policy?.configurationSha256??'')),'Accepted original reader/policy binding differs')
 let pending=null,intent=null;const operations=[],attempts=new Set(),deployments=new Map(),seen=new Set()
 for(const e of events){
  if(e.phase==='rollout'&&e.status==='observed'){
   check(attempts.has(key(e))&&!deployments.has(key(e))&&hex.test(e.containerId??'')&&/^sha256:[a-f0-9]{64}$/.test(e.imageId??''),'Unattributed deployment identity')
   deployments.set(key(e),{id:e.containerId,imageId:e.imageId})
  }
  if(e.phase==='service-action'){
   check(!intent&&!pending&&['StopStack','DeployStack'].includes(e.action)&&APPS.includes(e.stack)&&['lingxiloop','worker'].includes(e.service),'Ambiguous service intent');intent=e
  }
  if(e.phase!=='komodo')continue
  check(['RunStackService','WriteStackFileContents','StopStack','DeployStack'].includes(e.operation),'Unexpected native operation')
  if(e.status==='submitting'){
   check(!pending,'Overlapping native operations')
   if(['StopStack','DeployStack'].includes(e.operation))check(intent?.action===e.operation&&intent.stack===e.stack,'Unattributed service action')
   else check(!intent,'Service intent not consumed')
   pending={...e,service:intent?.service}
  }else if(e.status==='pending'){
   check(pending&&!pending.updateId&&pending.operation===e.operation&&pending.stack===e.stack&&id.test(e.updateId??'')&&!seen.has(e.updateId),'Ambiguous update identity')
   pending.updateId=e.updateId;seen.add(e.updateId)
  }else if(['complete','failed'].includes(e.status)){
   check(pending?.updateId&&pending.updateId===e.updateId&&pending.operation===e.operation&&pending.stack===e.stack,'Unmatched terminal native update')
   operations.push({...pending,success:e.status==='complete'})
   if(e.operation==='DeployStack')attempts.add(key(pending))
   pending=null;intent=null
  }else throw Error('Unknown native outcome')
 }
 check(!pending&&!intent,'Unresolved native/service operation')
 return {original,operations,deployments}
}
export function assertImageRecoveryInventory(rows,plan,boundary,{observed,stopped=new Set(),restored=new Map()}={}){
 check(Array.isArray(rows)&&rows.length===4&&new Set(rows.map(r=>r.id)).size===4,'Four exact recovery containers required')
 for(const old of boundary.original){
  const matches=rows.filter(r=>key(r)===key(old)),r=matches[0],k=key(old),done=restored.get(k)
  check(matches.length===1&&hex.test(r.id??'')&&equal(r.policy,old.policy)&&Number.isSafeInteger(r.restartCount)&&r.restartCount>=0,'Recovery container/policy changed')
  if(done)check(r.id===done&&r.source===plan.source.sha&&r.imageId===old.imageId&&r.running&&r.healthy&&!r.restarting&&r.restartCount===0,'Restored source reader changed')
  else{
   if(r.source===plan.source.sha)check(r.id===old.id&&r.imageId===old.imageId&&r.restartCount===0&&!r.restarting,'Original source replaced/restarted')
   else check(r.source===plan.target.sha&&r.id===boundary.deployments.get(k)?.id&&r.imageId===boundary.deployments.get(k)?.imageId&&r.imageId===boundary.targetImages?.[r.stack],'Unattributed, replaced or unaudited target reader')
   if(observed)check(observed.find(x=>key(x)===k)?.id===r.id,'Recovery boundary changed')
   if(stopped.has(k))check(r.running===false&&r.pid===0&&r.restarting===false,'Recovery writer still running')
  }
 }
}
export async function restoreImageSource({plan,receipt,ops,onProgress=async()=>{}}){
 validateHostPlanShape(plan);const boundary=assertImageFailure(plan,receipt),record=e=>onProgress({planHash:plan.planHash,...e})
 const stopped=new Set(),restored=new Map();let observed
 const inventory=async()=>{const rows=await ops.inspect();assertImageRecoveryInventory(rows,plan,boundary,{observed,stopped,restored});return rows}
 const state=async()=>{const s=await ops.state();assertCompatibleState(s,plan.source);return s}
 const barrier=async(wait=false)=>{const read=async()=>{await inventory();return state()};const s=wait?await waitForWorkerLeaseExpiry({read,wait:ops.wait,onProgress:record}):await read();assertWorkerBarrier(s);await record({phase:'drain',status:'zero-leases',state:s})}
 try{
  await ops.prepareSourceRestoration(boundary)
  await ops.assertIdle();await state();await ops.verifyImages('source');boundary.targetImages=await ops.verifyImages('target')
  observed=await inventory();await record({phase:'source-restoration',status:'boundary-verified',containers:observed})
  for(const service of ['worker','lingxiloop'])for(const stack of APPS){
   await ops.assertIdle();const r=(await inventory()).find(r=>r.stack===stack&&r.service===service)
   if(r.running||r.restarting)await ops.stop(stack,service)
   stopped.add(key(r));await inventory();await record({phase:'drain',status:'stopped',stack,service})
  }
  await barrier(true);await ops.wait(2000);await barrier()
  for(const stack of APPS){await ops.assertIdle();await inventory();await ops.restoreAcceptedSource(stack);await inventory()}
  await ops.verifyImages('source')
  for(const stack of APPS){const meta=await ops.metadata(stack,'source');check(equal(select(meta,metadataKeys),select(plan.source,metadataKeys)),'Restoration source metadata differs');assertPublicTextMetadata(meta,plan)}
  await barrier()
  for(const service of ['lingxiloop','worker'])for(const stack of APPS){
   await ops.assertIdle();await state();await inventory();await ops.verifyImages('source')
   if(![...restored.keys()].some(k=>k.endsWith(':worker')))await barrier()
   await ops.deploy(stack,service)
   const first=(await ops.inspect()).find(r=>r.stack===stack&&r.service===service),old=boundary.original.find(r=>r.stack===stack&&r.service===service)
   check(first?.source===plan.source.sha&&hex.test(first.id??'')&&first.imageId===old.imageId,'Restoration source identity unavailable')
   const observedIdentity={id:first.id,imageId:first.imageId}
   await record({phase:'source-restoration',status:'observed',stack,service,containerId:first.id,imageId:first.imageId})
   await ops.verifyHealthy(stack,service,observedIdentity)
   const rows=await ops.inspect(),r=rows.find(r=>r.stack===stack&&r.service===service)
   check(r?.source===plan.source.sha&&r.id===observedIdentity.id&&r.imageId===observedIdentity.imageId,'Source restoration deployment identity changed');restored.set(key(r),observedIdentity.id)
   assertImageRecoveryInventory(rows,plan,boundary,{observed,stopped,restored});await state()
   await record({phase:'rollout',status:'healthy',stack,service,containerId:r.id,imageId:r.imageId})
  }
  await ops.assertIdle();const result={phase:'complete',status:'complete',restoredSource:plan.source.sha,state:await state(),containers:await inventory(),publicText:plan.publicText.source,configurationSha256:plan.publicText.sourceConfigurationSha256,runTrace:1}
  await record(result);return result
 }catch(error){await record({phase:'stopped',status:error?.uncertain?'uncertain':'failed',noAutomaticRetry:true});throw error}
}
async function main(){
 const v={},args=process.argv.slice(2),paths=['--input','--acceptance','--source-audit','--target-audit','--failed','--output']
 for(let i=0;i<args.length;i++){const k=args[i];check([...paths,'--failed-sha256','--execute'].includes(k)&&!(k in v),'Unknown/repeated restoration argument');v[k]=k==='--execute'?true:args[++i]}
 for(const k of paths)check(isAbsolute(v[k]??''),'Absolute evidence/output paths required')
 const plan=JSON.parse(await readFile(v['--input'])),failed=await readFile(v['--failed']),acceptance=await readFile(v['--acceptance'])
 check(hex.test(v['--failed-sha256']??'')&&hash(failed)===v['--failed-sha256'],'Failed receipt bytes changed')
 const receipt=JSON.parse(failed);assertImageFailure(plan,receipt)
 const files=await validateHostPlan(plan,{acceptance,sourceAudit:await readFile(v['--source-audit']),targetAudit:await readFile(v['--target-audit'])})
 if(!v['--execute']){console.log(JSON.stringify({mode:'offline-source-restoration',planHash:plan.planHash,failedReceiptSha256:hash(failed)}));return}
 const out={mode:'product54-source-restoration/v1',planHash:plan.planHash,failedReceiptSha256:hash(failed),startedAt:new Date().toISOString(),complete:false,events:[]}
 await writeFile(v['--output'],JSON.stringify(out)+'\n',{flag:'wx',mode:0o600})
 const abort=new AbortController(),stop=()=>abort.abort(),onProgress=async e=>{out.events.push({...e,observedAt:new Date().toISOString()});if(e.phase==='complete')out.complete=true;await writeFile(v['--output'],JSON.stringify(out,null,2)+'\n',{mode:0o600})}
 process.once('SIGINT',stop);process.once('SIGTERM',stop)
 try{const {createHostReleaseOperations}=await import('./host-release-komodo.mjs');const ops=createHostReleaseOperations({plan,files,sourceConfigurationProof:JSON.parse(acceptance).evidence.observed.stacks,apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,signal:abort.signal,onProgress});await restoreImageSource({plan,receipt,ops,onProgress});console.log(JSON.stringify({status:'complete',restoredSource:plan.source.sha}))}
 finally{process.off('SIGINT',stop);process.off('SIGTERM',stop)}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Source restoration stopped. Inspect its exclusive receipt; never replay unresolved operations.');process.exitCode=1})
