// Deliberately narrow one-time native12 -> native13 release boundary.
// No remote work on import or in the default (offline plan) CLI mode.
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {resolve,isAbsolute} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {validateMemoryBackupPlan,executeMemoryBackup} from './verify-memory-backup.mjs'
import {createOperations} from './schema-upgrade-komodo.mjs'
import {assertEffectiveComposePin} from './schema-upgrade-compose.mjs'
import {deriveHostSource} from './schema-upgrade-host-source.mjs'
export {createTransport,parseMarker} from './schema-upgrade-komodo.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),run=promisify(execFile)
export const STACKS=['lingxiloop-app-a','lingxiloop-app-b']
export const SERVICES=['lingxiloop','worker']
const sha=/^[a-f0-9]{40}$/,hash=/^[a-f0-9]{64}$/,semver=/^\d+\.\d+\.\d+$/
export const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
const equal=(a,b)=>stable(a)===stable(b)
const digest=value=>createHash('sha256').update(value).digest('hex')
const requireThat=(yes,message)=>{if(!yes)throw Error(message)}
export function sealPlan(value) {const {planHash:_,...body}=value;return {...body,planHash:digest(stable(body))}}
export function assertOrdinarySchema(state,target) {
 requireThat(Number.isSafeInteger(state?.schema)&&state.schema>=12&&state.installedSchema===state.schema&&Number.isSafeInteger(target?.schema),'Unknown or inconsistent native schema')
 requireThat(state.schema===target.schema,'Native schema change requires explicit maintenance; ordinary rollout remains stopped before service actions')
}
export function assertBarrier(state) {
 requireThat(state?.readOnly===true&&state.fullVisibility===true,'Writer barrier visibility or read-only transaction not verified')
 for(const key of ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','otherClients','prepared'])requireThat(state[key]===0,`Writer barrier not empty: ${key}`)
}
function assertState(state,descriptor) {
 const rt=descriptor.runtime,expected=typeof rt==='string'?descriptor:rt
 requireThat(state?.schema===expected.schema&&state.installedSchema===expected.schema&&state.runtime===expected.runtime
  &&state.protocol===expected.protocol&&state.schemaHash===expected.schemaHash&&state.product===descriptor.productVersion&&state.count===descriptor.productVersion,'Database provenance differs from exact release')
 requireThat(equal(state.migrations,descriptor.migrations),'Database migration inventory differs from exact release')
}
export function recoveryBoundary(state,source) {
 if(!state)return 'unknown'
 if(state.schema>=13||state.installedSchema>=13||state.product>=47)return 'fix-forward'
 try{assertState(state,source);return 'source-unchanged'}catch{return 'unknown'}
}
function assertMetadata(actual,expected) {
 for(const key of ['sha','runtime','schema','protocol','schemaHash','productVersion','integrity','tarball','migrations'])requireThat(equal(actual?.[key],expected[key]),`Target metadata mismatch: ${key}`)
}
function assertContainers(rows,source,original,stopped=new Set()) {
 requireThat(Array.isArray(rows)&&rows.length===4&&new Set(rows.map(x=>x.id)).size===4,'Four distinct writer containers required')
 for(const stack of STACKS)for(const service of SERVICES){
  const matches=rows.filter(x=>x.stack===stack&&x.service===service),row=matches[0]
  requireThat(matches.length===1&&row.source===source.sha&&row.restarting===false&&typeof row.running==='boolean','Source writer identity/state mismatch')
  if(original){const before=original.find(x=>x.stack===stack&&x.service===service);requireThat(row.id===before.id&&row.imageId===before.imageId&&row.restartCount===before.restartCount,'Writer container changed during maintenance')}
  if(stopped.has(`${stack}:${service}`))requireThat(row.running===false&&row.pid===0,'Stop accepted but writer is still running')
 }
}
export async function runMaintenance({plan,ops,backup,onProgress=async()=>{}}) {
 requireThat(plan?.format===2&&plan.hostSource?.mode==='host','Online prepared host-source plan required before maintenance')
 requireThat(plan.planHash===sealPlan(plan).planHash,'Plan hash mismatch')
 let phase='preflight',submitted=false,lastState=null
 const record=async detail=>onProgress({phase,planHash:plan.planHash,...detail})
 try {
  await record({status:'pending'});await ops.assertIdle()
  const original=await ops.inspect();assertContainers(original,plan.source)
  lastState=await ops.state();assertState(lastState,plan.source)
  for(const stack of STACKS)await ops.pull(stack)
  await ops.verifyImages();for(const stack of STACKS)assertMetadata(await ops.metadata(stack),plan.target)
  // Commit all online/pre-pull evidence before the first downtime action.
  await record({status:'prepared',writers:original})
  const stopped=new Set();phase='drain'
  for(const service of ['worker','lingxiloop'])for(const stack of STACKS){
   await ops.assertIdle();await ops.stop(stack,service);stopped.add(`${stack}:${service}`)
   assertContainers(await ops.inspect(),plan.source,original,stopped)
   await record({status:'stopped',stack,service})
  }
  const barrier=async()=>{assertContainers(await ops.inspect(),plan.source,original,stopped);lastState=await ops.state();assertState(lastState,plan.source);assertBarrier(lastState);await record({status:'barrier',state:lastState})}
  await barrier();await ops.wait(2000);await barrier()
  await ops.assertIdle();phase='backup';const receipt=await backup()
  requireThat(receipt?.status==='Complete'&&receipt.success===true&&equal(receipt.source,plan.source)
   &&receipt.commandHash===plan.backup.commandHash&&receipt.isolatedDatabaseRemoved===true
   &&receipt.restoreCountsEqual===true&&receipt.restoreProvenanceEqual===true&&hash.test(receipt.dumpSha256??''),'Final source backup receipt invalid')
  await record({status:'verified',backup:receipt})
  await barrier();await ops.assertIdle();await ops.verifyImages();for(const stack of STACKS)assertMetadata(await ops.metadata(stack),plan.target)
  // Metadata is DB-free, but do not let its one-off hide another writer/lease.
  await barrier();phase='migration';submitted=true;await record({status:'submitting'})
  await ops.migrate();lastState=await ops.state();assertState(lastState,plan.target)
  await record({status:'migrated',state:lastState});phase='recovery'
  for(const service of ['lingxiloop','worker'])for(const stack of STACKS){
   await ops.assertIdle();await ops.verifyImages();await ops.deploy(stack,service);await ops.verifyHealthy(stack,service)
   await record({status:'healthy',stack,service})
  }
  const result={status:'complete',phase:'complete',planHash:plan.planHash,recovery:'fix-forward',state:lastState}
  await onProgress(result);return result
 }catch(error){
  const uncertain=error?.uncertain===true||/^Backup operation outcome uncertain;/.test(error?.message??'')
  // A failed migration can have committed47 before48 failed. Only fresh state
  // qualifies recovery; stale source evidence must never allow an old start.
  if(submitted){lastState=null;if(!uncertain)try{lastState=await ops.state()}catch{}}
  await record({status:uncertain?'uncertain':'failed',recovery:uncertain?'unknown':recoveryBoundary(lastState,plan.source)}).catch(()=>{})
  throw Object.assign(Error(uncertain?'Maintenance outcome uncertain; inspect the saved update before any further action':'Maintenance stopped; inspect the private receipt; no automatic recovery was attempted'),{uncertain})
 }
}
const git=async args=>(await run('git',args,{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024})).stdout
export async function releaseDescriptor(commit,release) {
 requireThat(sha.test(commit??'')&&semver.test(release?.runtime??'')&&Number.isSafeInteger(release?.schema)&&Number.isSafeInteger(release?.protocol)&&hash.test(release?.schemaHash??''),'Exact formal release metadata required')
 const paths=['package.json','server/package.json','package-lock.json','server/package-lock.json']
 const [p,s,l,sl]=await Promise.all(paths.map(p=>git(['show',`${commit}:${p}`]).then(JSON.parse)))
 const key='@lyyzka/lingxios',a=l.packages?.[`node_modules/${key}`],b=sl.packages?.[`node_modules/${key}`]
 requireThat([p,s,l.packages?.[''],sl.packages?.['']].every(x=>x?.dependencies?.[key]===release.runtime)
  &&a?.version===release.runtime&&b?.version===release.runtime&&a.integrity===b.integrity&&a.resolved===b.resolved
  &&a.integrity===release.integrity&&a.resolved===release.tarball&&/^sha512-[\w+/]+={0,2}$/.test(a.integrity)
  &&a.resolved.startsWith(`https://npm.pkg.github.com/download/${key}/${release.runtime}/`),'Four manifests/locks do not match exact formal package')
 const names=(await git(['ls-tree','--name-only',`${commit}:server/src/db/migrations`])).trim().split('\n').sort()
 requireThat(names.every((n,i)=>new RegExp(`^${String(i+1).padStart(4,'0')}_[a-z0-9_]+\\.sql$`).test(n)),'Noncontiguous migration inventory')
 const migrations=await Promise.all(names.map(async name=>({version:Number(name.slice(0,4)),name:name.slice(5,-4),checksum:digest(await git(['show',`${commit}:server/src/db/migrations/${name}`]))})))
 return {sha:commit,runtime:release.runtime,schema:release.schema,protocol:release.protocol,schemaHash:release.schemaHash,integrity:a.integrity,tarball:a.resolved,productVersion:names.length,migrations}
}
// Install the exact published target package with the reviewed locks before
// planning. Public release resources, not caller-supplied version claims, own
// the schema/protocol/hash. No registry access or credential storage here.
export async function assertInstalledTarget(target) {
 const {releaseVersions,packageResources}=await import('@lyyzka/lingxios')
 requireThat(releaseVersions.runtime===target.runtime&&releaseVersions.schema===target.schema
  &&releaseVersions.controlPlane===target.protocol&&digest(await readFile(packageResources().schema))===target.schemaHash,'Installed formal package metadata does not match target')
 const installed=JSON.parse(await readFile(new URL('../node_modules/@lyyzka/lingxios/package.json',import.meta.url),'utf8'))
 requireThat(installed.version===target.runtime,'Installed formal package version mismatch')
}
export async function validatePlan(plan) {
 requireThat(plan&&equal(Object.keys(plan).sort(),['format','source','sourceImageDigest','target','backup','createdAt','pinCommit','hostSource','qualification','planHash'].sort()),'Unexpected plan fields')
 requireThat(equal(Object.keys(plan.qualification??{}).sort(),['commit','ciUrl','conclusion'].sort())&&plan.qualification.conclusion==='success'&&Number.isFinite(Date.parse(plan.createdAt)),'Successful exact-head qualification and plan timestamp required')
 requireThat(plan?.format===2&&equal(plan,sealPlan(plan)),'Plan integrity mismatch')
 await validateMemoryBackupPlan(plan.backup)
 requireThat(equal(plan.source,plan.backup.source),'Final backup must bind exact source')
 requireThat(plan.source.runtime.schema===12&&plan.source.productVersion===46&&plan.target.schema===13&&[47,48].includes(plan.target.productVersion),'Only reviewed12/46 to13/47-or48 transition supported')
 requireThat(/^sha256:[a-f0-9]{64}$/.test(plan.target.imageDigest??'')&&/^sha256:[a-f0-9]{64}$/.test(plan.sourceImageDigest??'')&&sha.test(plan.pinCommit??'')&&sha.test(plan.qualification?.commit??'')&&plan.qualification.commit===plan.target.sha
  &&/^https:\/\/github\.com\/LingXi-Org\/LingxiLoop\/actions\/runs\/\d+$/.test(plan.qualification?.ciUrl??''),'Exact image, manifest commit and successful exact-head CI receipt required')
 await assertInstalledTarget(plan.target)
 const derived=await releaseDescriptor(plan.target.sha,plan.target)
 requireThat(equal({...derived,imageDigest:plan.target.imageDigest},plan.target),'Target descriptor mismatch')
 for(const side of ['a','b']){
  const compose=await git(['show',`${plan.pinCommit}:deploy/komodo/lingxiloop-app-${side}/compose.yml`])
  assertEffectiveComposePin(compose,plan.target.sha)
  requireThat(!compose.includes('LINGXIOS_SCHEMA_UPGRADE_DRAINED'),'Drain acknowledgement must not persist in Compose')
 }
 requireThat((await git(['show','-s','--format=%B',plan.pinCommit])).includes('[skip deploy]'),'Pin commit must suppress automatic rollout')
 requireThat(equal(plan.hostSource,await deriveHostSource({pinCommit:plan.pinCommit,branch:plan.hostSource?.branch})),'Host source must bind exact committed Compose files')
}
async function main() {
 const args=process.argv.slice(2),flags=new Set(['--execute','--input','--output','--help'])
 if(args.length===1&&args[0]==='--help'){console.log('Default offline plan: --input <absolute descriptor.json> --output <new plan.json>. Explicit maintenance: --execute --input <reviewed plan.json> --output <new private receipt.json>. Existing injected Komodo authorization only. No automatic retry/recovery.');return}
 const values={};for(let i=0;i<args.length;i++){const k=args[i];requireThat(flags.has(k)&&!(k in values),'Unknown or duplicate argument');values[k]=k==='--execute'?true:args[++i]}
 requireThat(isAbsolute(values['--input']??'')&&isAbsolute(values['--output']??''),'Absolute input and exclusive output required')
 const input=JSON.parse(await readFile(values['--input'],'utf8')),plan=values['--execute']?input:sealPlan(input)
 await validatePlan(plan)
 if(!values['--execute']){await writeFile(values['--output'],JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({mode:'plan-only',planHash:plan.planHash}));return}
 const apiKey=process.env.KOMODO_API_KEY,apiSecret=process.env.KOMODO_API_SECRET
 requireThat(apiKey&&apiSecret,'Existing injected authorization required')
 const abort=new AbortController(),stop=()=>abort.abort(),events=[]
 await writeFile(values['--output'],'{}\n',{flag:'wx',mode:0o600})
 const onProgress=async event=>{events.push({...event,observedAt:new Date().toISOString()});await writeFile(values['--output'],JSON.stringify({planHash:plan.planHash,events},null,2)+'\n',{mode:0o600})}
 process.once('SIGINT',stop);process.once('SIGTERM',stop)
 try{const ops=createOperations({plan,apiKey,apiSecret,signal:abort.signal,onProgress});await runMaintenance({plan,ops,onProgress,backup:()=>executeMemoryBackup({plan:plan.backup,apiKey,apiSecret,signal:abort.signal,onProgress})});console.log(JSON.stringify({status:'complete',planHash:plan.planHash}))}
 finally{process.off('SIGINT',stop);process.off('SIGTERM',stop)}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Schema maintenance preparation/execution failed; inspect the private receipt and known update before any further action');process.exitCode=1})
