// Explicit same-schema or reviewed product-only release. No network work on import.
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify,isDeepStrictEqual as equal} from 'node:util'
import {isAbsolute,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {releaseDescriptor,assertInstalledTarget} from './schema-upgrade-maintenance.mjs'
import {assertHostComposeChange} from './host-release-compose.mjs'

export const APPS=['lingxiloop-app-a','lingxiloop-app-b'],CORE='lingxiloop-core-state'
export const RELEASE_ARGS=['--no-deps','--pull','never']
export const IMAGE='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'
export const check=(ok,message)=>{if(!ok)throw Error(message)}
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const sha=/^[a-f0-9]{40}$/,hex=/^[a-f0-9]{64}$/,digest=/^sha256:[a-f0-9]{64}$/
const formalKeys=['runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations']
const packageKeys=formalKeys.filter(key=>!['productVersion','migrations'].includes(key))
export const PRODUCT_SCHEMA_FORMAT='product-schema-host-release/v1'
const migration49={version:49,name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'}
export const metadataKeys=['sha',...formalKeys]
const select=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v?.[k]]))
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
export function sealHostPlan(value){const {planHash:_,...body}=value;return {...body,planHash:hash(stable(body))}}
const exactKeys=(v,keys)=>v&&equal(Object.keys(v).sort(),keys.toSorted())
function assertMigrationInventory(descriptor){
 check(descriptor.schema===13&&[48,49].includes(descriptor.productVersion)&&Array.isArray(descriptor.migrations)
  &&descriptor.migrations.length===descriptor.productVersion
  &&descriptor.migrations.every((m,i)=>exactKeys(m,['version','name','checksum'])&&m.version===i+1&&/^[a-z0-9_]+$/.test(m.name??'')&&hex.test(m.checksum??'')),'Exact native13/product48-or49 inventory required')
 if(descriptor.productVersion===49)check(equal(descriptor.migrations[48],migration49),'Only reviewed product migration49 supported')
}
export function assertSameSchema(source,target){
 check(equal(select(source,formalKeys),select(target,formalKeys)),'Formal package/schema/inventory differs; dedicated migration required')
 assertMigrationInventory(source)
}
export function assertProductSchemaUpgrade(source,target){
 assertMigrationInventory(source);assertMigrationInventory(target)
 check(source.runtime==='3.5.8'&&source.productVersion===48&&target.productVersion===49
  &&equal(select(source,packageKeys),select(target,packageKeys))
  &&equal(source.migrations,target.migrations.slice(0,48)),'Only unchanged formal3.5.8/native13 product48→49 supported')
}
export function validateHostPlanShape(plan){
 check(exactKeys(plan,['format','createdAt','source','target','sourceAcceptanceSha256','qualification','stacks','planHash'])
  &&['same-schema-host-release/v1',PRODUCT_SCHEMA_FORMAT].includes(plan.format)&&equal(plan,sealHostPlan(plan))&&Number.isFinite(Date.parse(plan.createdAt)),'Invalid sealed host-release plan')
 if(plan.format===PRODUCT_SCHEMA_FORMAT)assertProductSchemaUpgrade(plan.source,plan.target)
 else assertSameSchema(plan.source,plan.target)
 for(const d of [plan.source,plan.target]){
  check(exactKeys(d,[...metadataKeys,'image'])&&sha.test(d.sha??'')&&/^\d+\.\d+\.\d+$/.test(d.runtime??'')
   &&Number.isSafeInteger(d.protocol)&&d.protocol>0&&hex.test(d.schemaHash??'')
   &&/^sha512-[\w+/]+={0,2}$/.test(d.integrity??'')&&d.tarball?.startsWith(`https://npm.pkg.github.com/download/@lyyzka/lingxios/${d.runtime}/`),'Invalid formal descriptor')
  const i=d.image
  check(exactKeys(i,['indexDigest','configDigest','manifestDigest','diffIds','auditSha256'])&&[i.indexDigest,i.configDigest,i.manifestDigest].every(x=>digest.test(x??''))
   &&hex.test(i.auditSha256??'')&&Array.isArray(i.diffIds)&&i.diffIds.length>0&&i.diffIds.every(x=>digest.test(x)),'Exact audited image descriptor required')
 }
 check(hex.test(plan.sourceAcceptanceSha256??'')&&exactKeys(plan.qualification,['commit','conclusion','ciUrl'])
  &&plan.qualification.commit===plan.target.sha&&plan.qualification.conclusion==='success'
  &&/^https:\/\/github\.com\/LingXi-Org\/LingxiLoop\/actions\/runs\/\d+$/.test(plan.qualification.ciUrl??''),'Accepted source and exact-target CI required')
 check(Array.isArray(plan.stacks)&&plan.stacks.length===3,'Exactly two app sources and unchanged core required')
 for(const [i,row] of plan.stacks.entries()){
  check(exactKeys(row,i===2?['stack','server','source','target']:['stack','server','source','target','preparation'])
   &&row.stack===[...APPS,CORE][i]&&row.server===(i===1?'shanghai-b':'shanghai-a'),'Unexpected stack or server')
  for(const ref of [row.source,row.target]){
   check(exactKeys(ref,['commit','branch','sha256','autoPull','extraArgs'])&&sha.test(ref.commit??'')&&hex.test(ref.sha256??'')
    &&/^release\/[a-z0-9][a-z0-9._-]{0,95}$/.test(ref.branch??'')&&!ref.branch.includes('..')&&!ref.branch.endsWith('.')&&!ref.branch.endsWith('.lock')
    &&typeof ref.autoPull==='boolean'&&(equal(ref.extraArgs,[])||equal(ref.extraArgs,RELEASE_ARGS)),'Invalid stack source policy')
  }
  if(i===2)check(equal(row.source,row.target)&&equal(row.source.extraArgs,[]),'Core source/policy must remain unchanged')
  else{
   check(row.target.autoPull===false&&equal(row.target.extraArgs,RELEASE_ARGS),'App deployment must disable pull/dependencies')
   check(exactKeys(row.preparation,['commit','sha256'])&&sha.test(row.preparation.commit??'')&&hex.test(row.preparation.sha256??''),'Explicit committed online pull template required')
  }
 }
}
export function assertWorkerBarrier(state){
 check(state?.readOnly===true&&state.fullVisibility===true,'Worker lease visibility unavailable')
 for(const key of ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','prepared'])check(state[key]===0,`Worker barrier not empty: ${key}`)
}
export function assertCompatibleState(state,descriptor){
 assertMigrationInventory(descriptor)
 check(state?.readOnly===true&&state.fullVisibility===true&&state.schema===descriptor.schema&&state.installedSchema===descriptor.schema
  &&state.runtime===descriptor.runtime&&state.protocol===descriptor.protocol&&state.schemaHash===descriptor.schemaHash
  &&state.product===descriptor.productVersion&&state.count===descriptor.productVersion&&equal(state.migrations,descriptor.migrations),'Actual database provenance changed')
}
export function assertImageIdentity(actual,audit){
 check(digest.test(actual?.Id??'')&&actual.RepoDigests?.some(x=>x===IMAGE.slice(0,-1)+'@'+audit.indexDigest)
  &&actual.Os==='linux'&&actual.Architecture==='amd64'&&actual.RootFS?.Type==='layers'&&equal(actual.RootFS.Layers,audit.diffIds),'Cached image does not match audited index/platform/layers')
 if(actual.Descriptor)check(actual.Descriptor.digest===audit.indexDigest||actual.Descriptor.digest===audit.manifestDigest,'Image descriptor differs from qualified index/platform')
 return actual.Id
}
function assertInventory(rows,plan,original,stopped=new Set(),deployed=new Map()){
 check(Array.isArray(rows)&&rows.length===4&&new Set(rows.map(x=>x.id)).size===4,'Four distinct application containers required')
 for(const stack of APPS)for(const service of ['lingxiloop','worker']){
  const key=stack+':'+service,matches=rows.filter(x=>x.stack===stack&&x.service===service),r=matches[0],old=original?.find(x=>x.stack===stack&&x.service===service)
  check(matches.length===1&&hex.test(r.id??'')&&r.source===(deployed.has(key)?plan.target.sha:plan.source.sha)&&r.restarting===false
   &&r.restartCount===0&&digest.test(r.imageId??''),'Container identity/state differs from release')
  if(old)check(equal(r.policy,old.policy),'Container security policy changed')
  if(!deployed.has(key)&&old)check(r.id===old.id&&r.imageId===old.imageId,'Original container replaced outside ordered release')
  if(deployed.has(key))check(r.id===deployed.get(key).id&&r.imageId===deployed.get(key).imageId,'Healthy target container replaced outside ordered release')
  if(stopped.has(key)&&!deployed.has(key))check(r.running===false&&r.pid===0,'Old Worker still running')
  else check(r.running===true&&r.healthy===true&&r.pid>0,'Expected application service unhealthy')
 }
}
async function failed({error,ops,plan,record}){
 let recovery='unknown',uncertain=error?.uncertain===true
 if(!uncertain)try{
  const state=await ops.state()
  try{assertCompatibleState(state,plan.source);recovery=plan.format===PRODUCT_SCHEMA_FORMAT?'source-unchanged-recovery-requires-review':'same-schema-recovery-requires-review'}
  catch{
   if(plan.format===PRODUCT_SCHEMA_FORMAT){assertCompatibleState(state,plan.target);recovery='fix-forward'}
  }
 }catch(classificationError){uncertain=classificationError?.uncertain===true}
 await record({phase:'stopped',status:uncertain?'uncertain':'failed',recovery,noAutomaticRetry:true}).catch(()=>{})
 throw Object.assign(Error('Host release stopped; resolve the private receipt before any further action'),{uncertain})
}
export async function runHostRelease({plan,ops,onProgress=async()=>{}}){
 validateHostPlanShape(plan)
 const record=e=>onProgress({planHash:plan.planHash,...e})
 try{
  await ops.assertIdle();const original=await ops.inspect();assertInventory(original,plan)
  assertCompatibleState(await ops.state(),plan.source)
  await ops.verifyImages('source');await ops.verifyImages('target')
  assertInventory(await ops.inspect(),plan,original)
  await record({phase:'preflight',status:'verified',original})
  for(const stack of APPS){await ops.assertIdle();await ops.stage(stack);assertInventory(await ops.inspect(),plan,original)}
  await ops.verifyImages('target')
  for(const stack of APPS)check(equal(select(await ops.metadata(stack),metadataKeys),select(plan.target,metadataKeys)),'Actual target metadata mismatch')
  assertCompatibleState(await ops.state(),plan.source);assertInventory(await ops.inspect(),plan,original)
  await record({phase:'online',status:'prepared'})
  const stopped=new Set(),deployed=new Map()
  let installed=plan.source
  for(const stack of APPS){await ops.assertIdle();await ops.stop(stack,'worker');stopped.add(stack+':worker');assertInventory(await ops.inspect(),plan,original,stopped);await record({phase:'drain',status:'stopped',stack,service:'worker'})}
  const barrier=async()=>{assertInventory(await ops.inspect(),plan,original,stopped,deployed);const state=await ops.state();assertCompatibleState(state,installed);assertWorkerBarrier(state);await record({phase:'drain',status:'zero-leases',state})}
  await barrier();await ops.wait(2000);await barrier()
  if(plan.format===PRODUCT_SCHEMA_FORMAT){
   await ops.assertIdle();await ops.verifyImages('target')
   await record({phase:'migration',status:'submitting'})
   await ops.migrate()
   const state=await ops.state();assertCompatibleState(state,plan.target);installed=plan.target
   await record({phase:'migration',status:'migrated',state,recovery:'fix-forward'})
  }
  for(const service of ['lingxiloop','worker'])for(const stack of APPS){
   await ops.assertIdle();await ops.verifyImages('target')
   assertCompatibleState(await ops.state(),plan.target)
   // Before the first new Worker, every native lease must still be empty.
   if(![...deployed.keys()].some(k=>k.endsWith(':worker')))await barrier()
   assertInventory(await ops.inspect(),plan,original,stopped,deployed)
   await ops.deploy(stack,service);await ops.verifyHealthy(stack,service)
   const rows=await ops.inspect(),healthy=rows.find(r=>r.stack===stack&&r.service===service)
   check(healthy,'Healthy target identity unavailable');deployed.set(stack+':'+service,{id:healthy.id,imageId:healthy.imageId})
   assertInventory(rows,plan,original,stopped,deployed)
   assertCompatibleState(await ops.state(),plan.target)
   await record({phase:'rollout',status:'healthy',stack,service,containerId:healthy.id,imageId:healthy.imageId})
  }
  await ops.assertIdle();await ops.verifyImages('target');const state=await ops.state();assertCompatibleState(state,plan.target)
  const containers=await ops.inspect();assertInventory(containers,plan,original,stopped,deployed)
  const result={phase:'complete',status:'complete',planHash:plan.planHash,state,containers}
  await record(result);return result
 }catch(error){return failed({error,ops,plan,record})}
}
export async function runImagePreparation({plan,ops,onProgress=async()=>{}}){
 validateHostPlanShape(plan);const record=e=>onProgress({planHash:plan.planHash,...e})
 try{
  await ops.assertIdle();const original=await ops.inspect();assertInventory(original,plan)
  assertCompatibleState(await ops.state(),plan.source);await ops.verifyImages('source')
  assertInventory(await ops.inspect(),plan,original)
  for(const stack of APPS){
   await ops.assertIdle();await ops.stagePreparation(stack);assertInventory(await ops.inspect(),plan,original)
   await ops.pullPrepared(stack);await ops.verifyImages('target',stack);assertInventory(await ops.inspect(),plan,original)
   await ops.restoreSource(stack);assertInventory(await ops.inspect(),plan,original)
   await record({phase:'image-preparation',status:'restored-source',stack})
  }
  await ops.assertIdle();await ops.verifyImages('target');assertCompatibleState(await ops.state(),plan.source)
  const result={phase:'complete',status:'complete',planHash:plan.planHash,mode:'online-images-only',original}
  await record(result);return result
 }catch(error){return failed({error,ops,plan,record})}
}

const root=fileURLToPath(new URL('../',import.meta.url)),run=promisify(execFile)
async function git(args){return (await run('git',args,{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024})).stdout}
export async function validateHostPlan(plan,{acceptance,sourceAudit,targetAudit}){
 validateHostPlanShape(plan)
 check(hash(acceptance)===plan.sourceAcceptanceSha256,'Source acceptance bytes changed')
 const accepted=JSON.parse(acceptance)
 check(accepted.passed===true&&accepted.candidate===plan.source.sha&&Object.keys(accepted.checks??{}).length>0&&Object.values(accepted.checks).every(x=>x===true),'Source has no successful sealed acceptance')
 for(const [descriptor,bytes] of [[plan.source,sourceAudit],[plan.target,targetAudit]]){
  const audit=JSON.parse(bytes),i=descriptor.image
  check(hash(bytes)===i.auditSha256&&audit.passed===true&&audit.sourceCommit===descriptor.sha&&audit.indexDigest===i.indexDigest
   &&audit.configDigest===i.configDigest&&audit.linuxAmd64ManifestDigest===i.manifestDigest&&equal(audit.layers?.map(x=>x.diffId),i.diffIds),'Image audit bytes or provenance mismatch')
  const derived=await releaseDescriptor(descriptor.sha,descriptor)
  check(equal(derived,select(descriptor,metadataKeys)),'Committed package/inventory differs from descriptor')
 }
 await assertInstalledTarget(plan.target)
 const files=new Map()
 for(const row of plan.stacks){
  const values={}
  for(const which of ['source','target',...(row.preparation?['preparation']:[])]){
   const ref=row[which],path=`deploy/komodo/${row.stack}/compose.yml`,entry=await git(['ls-tree',ref.commit,path])
   check(new RegExp('^100644 blob [a-f0-9]{40}\\t'+path+'\\n$').test(entry),'Source must be a tracked regular public Compose file')
   const content=await git(['show',`${ref.commit}:${path}`]);check(hash(content)===ref.sha256,'Committed Compose hash differs')
   values[which]=content
  }
  if(row.stack!==CORE){
   assertHostComposeChange(values.source,values.target,plan.source.sha,plan.target.sha,'never')
   assertHostComposeChange(values.target,values.preparation,plan.target.sha,plan.target.sha,'always')
   check((await git(['show','-s','--format=%B',row.target.commit])).includes('[skip deploy]'),'Candidate manifests must suppress legacy rollout')
  }else check(values.source===values.target,'Core template changed')
  files.set(row.stack,values)
 }
 return files
}
async function main(){
 const args=process.argv.slice(2),values={},allowed=['--execute','--prepare-images','--input','--output','--acceptance','--source-audit','--target-audit']
 if(args.length===1&&args[0]==='--help'){console.log('Offline by default. --input <descriptor.json> --output <exclusive plan/receipt.json> --acceptance <accepted source.json> --source-audit <audit.json> --target-audit <audit.json>. All paths absolute. --execute follows the explicit same-schema or reviewed product48→49 plan format; --prepare-images only prepares images online and restores source files. No automatic retry/recovery.');return}
 for(let i=0;i<args.length;i++){const k=args[i];check(allowed.includes(k)&&!(k in values),'Unknown or repeated argument');values[k]=['--execute','--prepare-images'].includes(k)?true:args[++i]}
 check(!(values['--execute']&&values['--prepare-images']),'Choose release or explicit online image preparation')
 for(const k of allowed.slice(2))check(isAbsolute(values[k]??''),'Absolute input/evidence/output paths required')
 const input=JSON.parse(await readFile(values['--input'],'utf8')),execute=values['--execute']||values['--prepare-images'],plan=execute?input:sealHostPlan(input)
 const files=await validateHostPlan(plan,{acceptance:await readFile(values['--acceptance']),sourceAudit:await readFile(values['--source-audit']),targetAudit:await readFile(values['--target-audit'])})
 if(!execute){await writeFile(values['--output'],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({mode:'offline-plan',planHash:plan.planHash}));return}
 const abort=new AbortController(),stop=()=>abort.abort(),out={planHash:plan.planHash,mode:values['--prepare-images']?'online-images-only':plan.format===PRODUCT_SCHEMA_FORMAT?'product-schema-release':'same-schema-release',startedAt:new Date().toISOString(),complete:false,events:[]}
 await writeFile(values['--output'],JSON.stringify(out)+'\n',{flag:'wx',mode:0o600})
 const onProgress=async e=>{out.events.push({...e,observedAt:new Date().toISOString()});if(e.phase==='complete')out.complete=true;await writeFile(values['--output'],JSON.stringify(out,null,2)+'\n',{mode:0o600})}
 process.once('SIGINT',stop);process.once('SIGTERM',stop)
 try{
  const {createHostReleaseOperations}=await import('./host-release-komodo.mjs')
  const ops=createHostReleaseOperations({plan,files,apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,signal:abort.signal,onProgress})
  await (values['--prepare-images']?runImagePreparation:runHostRelease)({plan,ops,onProgress})
  console.log(JSON.stringify({status:'complete',mode:out.mode,planHash:plan.planHash}))
 }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop)}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Host release failed; inspect the private receipt. No automatic retry/recovery.');process.exitCode=1})
