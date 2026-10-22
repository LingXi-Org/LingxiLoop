// Explicit reviewed continuation only for the known 52 -> 53 pre-migration stop.
// No automatic retry, lease edits, source rollback, or post-migration replay.
import {isDeepStrictEqual as equal} from 'node:util'
import {readFile,writeFile} from 'node:fs/promises'
import {isAbsolute,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {APPS,check,hash,metadataKeys,validateHostPlan,validateHostPlanShape,assertCompatibleState,assertWorkerBarrier,assertInventory} from './host-release.mjs'
import {CONVERSATION_FORMAT,assertPublicTextMetadata} from './public-text-release.mjs'
const select=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]))
export function assertStoppedReceipt(plan,receipt){
 check(plan.format===CONVERSATION_FORMAT&&receipt?.mode===plan.format&&receipt.planHash===plan.planHash&&receipt.complete===false,'Wrong recovery plan/receipt')
 const events=receipt.events,last=events?.at(-1)
 check(Array.isArray(events)&&last?.phase==='stopped'&&last.status==='failed'&&last.recovery==='source-unchanged-recovery-requires-review'&&last.noAutomaticRetry===true,'Unknown recovery boundary')
 check(!events.some(e=>['migration','rollout','complete'].includes(e.phase)||e.status==='uncertain'||e.operation==='DeployStack'),'Migration/deployment/uncertainty prevents pre-migration continuation')
 const starts=events.filter(e=>e.phase==='preflight'&&e.status==='verified')
 check(starts.length===1&&starts[0].original?.length===4,'Missing original container evidence')
 const original=starts[0].original
 for(const stack of APPS){
  check(events.filter(e=>e.phase==='host-config'&&e.status==='verified'&&e.stack===stack&&e.fullConfigReadback===true).length===1,'Target configuration not confirmed')
  for(const service of ['lingxiloop','worker'])check(events.filter(e=>e.phase==='drain'&&e.status==='stopped'&&e.stack===stack&&e.service===service).length===1,'Four confirmed stops required')
 }
 let pending=null
 for(const e of events.filter(e=>e.phase==='komodo')){
  if(e.status==='submitting'){check(!pending,'Unresolved prior operation');pending=e}
  else if(e.status==='pending'){check(pending&&!pending.updateId&&e.operation===pending.operation&&e.stack===pending.stack&&/^[a-f0-9]{24}$/.test(e.updateId??''),'Ambiguous pending operation');pending=e}
  else if(e.status==='complete'){check(pending?.updateId===e.updateId&&pending.operation===e.operation&&pending.stack===e.stack,'Unmatched terminal operation');pending=null}
  else throw Error('Nonterminal or failed native operation')
 }
 check(!pending,'Unresolved native operation')
 return original
}
export function assertStoppedContainers(rows,original){
 check(rows?.length===4&&new Set(rows.map(r=>r.id)).size===4,'Four original containers required')
 for(const old of original){
  const matches=rows.filter(r=>r.stack===old.stack&&r.service===old.service),r=matches[0]
  check(matches.length===1&&r.id===old.id&&r.source===old.source&&r.imageId===old.imageId&&equal(r.policy,old.policy)&&r.running===false&&r.pid===0&&r.restarting===false&&r.restartCount===0,'Original stopped container changed')
 }
}
export function assertRecoveryConfig(detail,row,proof){
 const sourceView={...detail.config,commit:row.source.commit,branch:row.source.branch,auto_pull:row.source.autoPull,extra_args:row.source.extraArgs}
 check(proof?.id===detail?._id?.$oid&&hash(JSON.stringify(sourceView))===proof.configSha256,'Full configuration differs from accepted source plus reviewed patch')
}
export async function continueStoppedRelease({plan,receipt,ops,onProgress=async()=>{}}){
 validateHostPlanShape(plan);const original=assertStoppedReceipt(plan,receipt)
 const stopped=new Set(original.map(r=>r.stack+':'+r.service)),deployed=new Map()
 const record=e=>onProgress({planHash:plan.planHash,...e})
 let installed=plan.source
 const barrier=async()=>{
  assertInventory(await ops.inspect(),plan,original,stopped,deployed)
  const state=await ops.state();assertCompatibleState(state,installed);assertWorkerBarrier(state)
  await record({phase:'drain',status:'zero-leases',state})
 }
 try{
  await ops.resumeStoppedBoundary(receipt)
  await ops.assertIdle();assertStoppedContainers(await ops.inspect(),original)
  assertCompatibleState(await ops.state(),plan.source)
  await ops.verifyImages('source');await ops.verifyImages('target')
  for(const stack of APPS){const actual=await ops.metadata(stack);check(equal(select(actual,metadataKeys),select(plan.target,metadataKeys)),'Target metadata mismatch');assertPublicTextMetadata(actual,plan)}
  await record({phase:'recovery',status:'boundary-verified'})
  await record({phase:'seed-precheck',status:'verified',receipt:await ops.seedPrecheck()})
  await barrier();await ops.wait(2000);await barrier()
  await ops.assertIdle();await ops.verifyImages('target')
  await record({phase:'migration',status:'submitting'});await ops.migrate()
  const migrated=await ops.state();assertCompatibleState(migrated,plan.target);installed=plan.target
  await record({phase:'migration',status:'migrated',state:migrated,recovery:'fix-forward'})
  for(const service of ['lingxiloop','worker'])for(const stack of APPS){
   await ops.assertIdle();await ops.verifyImages('target');assertCompatibleState(await ops.state(),plan.target)
   if(![...deployed.keys()].some(k=>k.endsWith(':worker')))await barrier()
   assertInventory(await ops.inspect(),plan,original,stopped,deployed)
   await ops.deploy(stack,service);await ops.verifyHealthy(stack,service)
   const rows=await ops.inspect(),healthy=rows.find(r=>r.stack===stack&&r.service===service)
   check(healthy,'Healthy target identity unavailable');deployed.set(stack+':'+service,{id:healthy.id,imageId:healthy.imageId})
   assertInventory(rows,plan,original,stopped,deployed);assertCompatibleState(await ops.state(),plan.target)
   await record({phase:'rollout',status:'healthy',stack,service,containerId:healthy.id,imageId:healthy.imageId})
  }
  await ops.assertIdle();await ops.verifyImages('target');const state=await ops.state();assertCompatibleState(state,plan.target)
  const containers=await ops.inspect();assertInventory(containers,plan,original,stopped,deployed)
  const result={phase:'complete',status:'complete',planHash:plan.planHash,state,containers,publicText:plan.publicText.target,configurationSha256:plan.publicText.targetConfigurationSha256,readerContainers:containers.map(({stack,service,id,imageId})=>({stack,service,id,imageId})),runTrace:1}
  await record(result);return result
 }catch(error){await record({phase:'stopped',status:error?.uncertain?'uncertain':'failed',noAutomaticRetry:true});throw error}
}
async function main(){
 const args=process.argv.slice(2),v={},paths=['--input','--acceptance','--source-audit','--target-audit','--failed','--output']
 for(let i=0;i<args.length;i++){const k=args[i];check([...paths,'--failed-sha256','--execute'].includes(k)&&!(k in v),'Unknown/repeated recovery argument');v[k]=k==='--execute'?true:args[++i]}
 for(const k of paths)check(isAbsolute(v[k]??''),'Absolute paths required')
 const plan=JSON.parse(await readFile(v['--input'],'utf8')),failed=await readFile(v['--failed'])
 check(/^[a-f0-9]{64}$/.test(v['--failed-sha256']??'')&&hash(failed)===v['--failed-sha256'],'Failed receipt bytes changed')
 const receipt=JSON.parse(failed);assertStoppedReceipt(plan,receipt)
 const acceptance=await readFile(v['--acceptance'])
 const files=await validateHostPlan(plan,{acceptance,sourceAudit:await readFile(v['--source-audit']),targetAudit:await readFile(v['--target-audit'])})
 if(!v['--execute']){console.log(JSON.stringify({mode:'offline-recovery',planHash:plan.planHash,failedReceiptSha256:hash(failed)}));return}
 const out={planHash:plan.planHash,mode:'reviewed-stopped52-to53-continuation/v1',failedReceiptSha256:hash(failed),startedAt:new Date().toISOString(),complete:false,events:[]}
 await writeFile(v['--output'],JSON.stringify(out)+'\n',{flag:'wx',mode:0o600})
 const abort=new AbortController(),stop=()=>abort.abort(),onProgress=async e=>{out.events.push({...e,observedAt:new Date().toISOString()});if(e.phase==='complete')out.complete=true;await writeFile(v['--output'],JSON.stringify(out,null,2)+'\n',{mode:0o600})}
 process.once('SIGINT',stop);process.once('SIGTERM',stop)
 try{const {createHostReleaseOperations}=await import('./host-release-komodo.mjs');const ops=createHostReleaseOperations({plan,files,sourceConfigurationProof:JSON.parse(acceptance).evidence.observed.stacks,apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,signal:abort.signal,onProgress});await continueStoppedRelease({plan,receipt,ops,onProgress});console.log(JSON.stringify({status:'complete',planHash:plan.planHash}))}
 finally{process.off('SIGINT',stop);process.off('SIGTERM',stop)}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Recovery stopped. Inspect its exclusive receipt; no replay or rollback.');process.exitCode=1})
