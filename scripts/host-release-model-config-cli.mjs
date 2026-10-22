// Offline by default. Online modes require explicit existing authorization.
import {readFile,writeFile} from 'node:fs/promises'
import {isAbsolute,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {modelHash,modelConfigBoundary,runModelConfigRelease} from './host-release-model-config.mjs'
import {collectModelConfigPlan,validateModelConfigEvidence} from './host-release-model-config-evidence.mjs'
import {createModelConfigOperations} from './host-release-model-config-komodo.mjs'
const check=(v,m)=>{if(!v)throw Error(m)}
async function main(){
 const args=process.argv.slice(2),values={},flags=['--preflight','--execute','--continue'],paths=['--input','--output','--acceptance','--audit','--image-config','--knowledge-plan','--knowledge-fence','--knowledge-image-audit'],other=['--failed','--failed-sha256']
 if(args.length===1&&args[0]==='--help'){console.log('Offline by default. Required absolute paths: --input <draft-or-sealed-plan> --output <exclusive-new-output> --acceptance <actual-source> --audit <source-all-layer-audit> --image-config <raw-OCI-config> --knowledge-plan <complete-finite-shadow-plan> --knowledge-fence <actual-fence-receipt> --knowledge-image-audit <knowledge-full-OCI-source-audit>. --preflight performs read-only collection including a fresh knowledge status oneoff and seals a plan; also writes <output>.preflight.json. --execute drains four writers, changes only two model values, then deploys Web before Worker using the identical image/schema. Knowledge API/worker must remain the exact stopped source; its staged audited probe image must be pull-never. --continue requires --failed <prior-terminal-failed-receipt> --failed-sha256 <raw-hash>; unknown outcomes and 401/403 cannot continue. No automatic retry or rollback.');return}
 for(let i=0;i<args.length;i++){const k=args[i];check([...flags,...paths,...other].includes(k)&&!(k in values),'Unknown or repeated model-release argument');values[k]=flags.includes(k)?true:args[++i]}
 check(flags.filter(k=>values[k]).length<=1,'Select one online mode')
 for(const p of paths)check(isAbsolute(values[p]??''),'All evidence/input/output paths must be absolute')
 if(values['--continue'])check(isAbsolute(values['--failed']??'')&&/^[a-f0-9]{64}$/.test(values['--failed-sha256']??''),'Explicit raw-hash-bound failed receipt required')
 else check(!other.some(k=>k in values),'Failed receipt is valid only for explicit continuation')
 const files=Object.fromEntries(await Promise.all([['acceptance','--acceptance'],['audit','--audit'],['imageConfig','--image-config'],['knowledgePlan','--knowledge-plan'],['knowledgeFence','--knowledge-fence'],['knowledgeImageAudit','--knowledge-image-audit']].map(async([k,p])=>[k,await readFile(values[p])]))),input=JSON.parse(await readFile(values['--input'],'utf8'))
 const controller=new AbortController(),stop=()=>controller.abort(),output=values['--output'],options={files,apiKey:process.env.KOMODO_API_KEY,apiSecret:process.env.KOMODO_API_SECRET,signal:controller.signal}
 process.once('SIGINT',stop);process.once('SIGTERM',stop)
 try{
  if(values['--preflight']){
   const evidence={mode:'read-only-model-config-preflight',startedAt:new Date().toISOString(),complete:false,events:[]},evidencePath=output+'.preflight.json'
   await writeFile(evidencePath,JSON.stringify(evidence)+'\n',{flag:'wx',mode:0o600})
   const onProgress=async e=>{evidence.events.push({...e,observedAt:new Date().toISOString()});await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n',{mode:0o600})}
   const {plan,observed}=await collectModelConfigPlan({...options,draft:input,onProgress});evidence.complete=true;evidence.planHash=plan.planHash;evidence.observed=observed;await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});await writeFile(output,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({mode:'read-only-preflight',planHash:plan.planHash,complete:true}));return
  }
  const plan=input;await validateModelConfigEvidence(plan,files)
  if(!values['--execute']&&!values['--continue']){await writeFile(output,JSON.stringify({mode:'offline-verification',planHash:plan.planHash,passed:true})+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({mode:'offline-verification',planHash:plan.planHash,passed:true}));return}
  let failed,failedHash
  if(values['--continue']){const raw=await readFile(values['--failed']);failedHash=modelHash(raw);check(failedHash===values['--failed-sha256'],'Failed receipt bytes changed');failed=JSON.parse(raw);modelConfigBoundary(plan,failed)}
  const out={planHash:plan.planHash,mode:plan.format,startedAt:new Date().toISOString(),complete:false,...(failed?{continuedFromSha256:failedHash}:{}),events:failed?failed.events.slice(0,-1):[]}
  await writeFile(output,JSON.stringify(out)+'\n',{flag:'wx',mode:0o600})
  const onProgress=async e=>{out.events.push({...e,observedAt:new Date().toISOString()});if(e.phase==='complete')out.complete=true;await writeFile(output,JSON.stringify(out,null,2)+'\n',{mode:0o600})}
  const ops=createModelConfigOperations({...options,plan,imageConfig:files.imageConfig.toString('utf8'),knowledgePlan:files.knowledgePlan.toString('utf8'),onProgress});await runModelConfigRelease({plan,ops,receipt:failed,onProgress});console.log(JSON.stringify({status:'complete',mode:plan.format,planHash:plan.planHash}))
 }finally{process.off('SIGINT',stop);process.off('SIGTERM',stop)}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(JSON.stringify({error:'Model configuration operation stopped; inspect its private receipt; no automatic retry',uncertain:error?.uncertain===true,...(Number.isInteger(error?.httpStatus)?{httpStatus:error.httpStatus}:{})}));process.exitCode=1})
