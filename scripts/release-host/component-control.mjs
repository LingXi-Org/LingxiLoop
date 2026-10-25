#!/usr/bin/env node
// Fixed Notebook/WuKongIM evidence. Never issues main-runtime SQL or changes a storage schema.
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify,isDeepStrictEqual as equal } from 'node:util'
import { isAbsolute,join,resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {imageProfileKey,inspectQualifiedImage} from './image-identity.mjs'
import { canonical,hash,fault,identifier } from './journal.mjs'
import { validateContract,runDocker } from './adapter.mjs'
const exec=promisify(execFile),rawHash=value=>createHash('sha256').update(value).digest('hex')
const check=(condition,code,message)=>{if(!condition)throw fault(code,message,422)}
const validImageId=value=>/^sha256:[a-f0-9]{64}$/.test(value??'')
export const componentProfile=(local,image)=>local.component?.imageProfiles?.[imageProfileKey(image)]
export function validateComponentPlan(local,plan) {
  check(local.component && plan.mode==='maintenance' && !plan.database,'COMPONENT_POLICY_REQUIRED','Component releases require their own maintenance/storage policy, without main-runtime database phases')
  check(Object.values(local.services).every(spec=>spec.role==='component'),'COMPONENT_SCOPE_INVALID','A component target may contain only its own component services')
  const source=plan.source??plan.recovery
  let storageHash
  for(const descriptor of [source,plan,plan.recovery]) for(const image of Object.values(descriptor.images)) {
    const profile=componentProfile(local,image)
    check(profile && ['notebook-rag','wukongim'].includes(profile.kind) && profile.storage && equal(profile.contract,descriptor.contract),'COMPONENT_PROFILE_UNQUALIFIED','Exact image identity must be bound to a locally reviewed storage/protocol profile')
    validateContract(profile.contract)
    check(profile.contract.nativeSchema===0,'COMPONENT_PROFILE_UNQUALIFIED','A component contract cannot claim the main-runtime native schema')
    const current=hash(profile.storage)
    if(storageHash===undefined)storageHash=current
    check(current===storageHash,'COMPONENT_STORAGE_CHANGE_REQUIRES_MIGRATION','Component storage/protocol changes require a separate qualified migration adapter')
    if(image.sourceEvidence) check(equal(image.sourceEvidence,profile.sourceEvidence),'LOCAL_SOURCE_EVIDENCE_MISMATCH','Local image source evidence must match the root-owned qualification')
  }
  if(plan.sourceMode==='repo-adopted-image') {
    check(local.adapter==='open-notebook' && source.images && Object.values(source.images).every(image=>image.sourceEvidence?.mode==='repo' && /^[a-f0-9]{40}$/.test(image.sourceEvidence.commit??'')),'LOCAL_SOURCE_EVIDENCE_MISMATCH','Repository adoption requires exact source commit and distinct local image identity')
    // Adoption can preserve an existing local target; new image versions must use full registry qualification.
    for(const [service,image] of Object.entries(plan.images)) if(image.kind==='local-qualified')check(image.localImageId===source.images[service].localImageId,'LOCAL_TARGET_NOT_ALLOWED','A new target cannot be built/selected from a repository during release')
  } else check(!Object.values(plan.images).some(image=>image.kind==='local-qualified'),'LOCAL_TARGET_NOT_ALLOWED','Local target adoption requires the explicit repo-adopted-image mode')
}
function mountInventory(container) {return (container.Mounts??[]).filter(mount=>['volume','bind'].includes(mount.Type)).map(mount=>({type:mount.Type,source:mount.Type==='volume'?mount.Name:mount.Source,target:mount.Destination,readOnly:!mount.RW})).sort((a,b)=>a.target.localeCompare(b.target))}
export function assertComponentMounts(container,spec) {
  const expected=spec.mounts.map(mount=>({...mount,readOnly:Boolean(mount.readOnly)})).sort((a,b)=>a.target.localeCompare(b.target))
  check(equal(mountInventory(container),expected),'COMPONENT_VOLUME_DRIFT','Complete component durable mount inventory changed, including anonymous volumes')
}
async function inspectService(run,project,service) {
  const ids=(await run(['ps','--all','--quiet','--filter',`label=com.docker.compose.project=${project}`,'--filter',`label=com.docker.compose.service=${service}`])).trim().split(/\s+/).filter(Boolean)
  check(ids.length===1&&/^[a-f0-9]{12,64}$/.test(ids[0]),'COMPONENT_INVENTORY_UNCERTAIN','Expected one exact component container')
  return JSON.parse(await run(['container','inspect',ids[0]]))[0]
}
export async function componentInventory(policy,target,run) {
  const local=policy.targets[target],services={},dependencies={}
  for(const [service,spec] of Object.entries(local.services)) {const actual=await inspectService(run,local.project,service);assertComponentMounts(actual,spec);services[service]=actual}
  for(const [name,spec] of Object.entries(local.component.dependencies??{})) {
    check(identifier(name)&&identifier(spec.project)&&identifier(spec.service)&&validImageId(spec.image?.configDigest??spec.image?.localImageId),'COMPONENT_POLICY_INVALID','A storage dependency requires a fixed service, project and qualified image')
    const actual=await inspectService(run,spec.project,spec.service);assertComponentMounts(actual,spec)
    const identity=await inspectQualifiedImage(run,spec.image,spec.localImageProfile,{stateDirectory:policy.stateDirectory})
    check(identity&&actual.Image===identity.localImageId&&actual.State?.Running&&!actual.State.Restarting&&actual.State.Health?.Status==='healthy','COMPONENT_DEPENDENCY_UNHEALTHY','Read-only storage dependency image/readiness differs from the reviewed identity')
    if (spec.version) {const version=await run(['exec',actual.Id,'/surreal','version']);check(rawHash(version)===spec.versionOutputSha256&&version.includes(spec.version),'COMPONENT_DEPENDENCY_VERSION_CHANGED','Actual Surreal binary version differs from the qualified persistent storage dependency')}
    dependencies[name]=actual
  }
  return {services,dependencies}
}
function environment(container) {return Object.fromEntries((container.Config?.Env??[]).map(value=>{const i=value.indexOf('=');return[value.slice(0,i),value.slice(i+1)]}))}
function privateAddress(value) {return /^10\.\d+\.\d+\.\d+$/.test(value??'')||/^192\.168\.\d+\.\d+$/.test(value??'')||/^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(value??'')}
async function surrealRows(local,inventory,storage,fetcher) {
  const connection=local.component.surreal,spec=local.component.dependencies?.[connection?.dependency],container=inventory.dependencies[connection?.dependency]
  check(container&&spec&&identifier(storage.namespace)&&identifier(storage.database)&&identifier(storage.controlDatabase??storage.database),'COMPONENT_POLICY_INVALID','Notebook needs a fixed, observed Surreal dependency/namespace/database')
  const address=container.NetworkSettings?.Networks?.[connection.network]?.IPAddress
  check(privateAddress(address),'COMPONENT_NETWORK_UNQUALIFIED','Surreal read-only evidence must use the configured Docker private network')
  const env=environment(container),user=env.SURREAL_USER,password=env.SURREAL_PASS??env.SURREAL_PASSWORD
  check(user&&password,'COMPONENT_CREDENTIAL_UNAVAILABLE','Existing storage credentials are unavailable to the private read-only evidence probe')
  const query=async(database,body)=>{
    const response=await fetcher(`http://${address}:8000/sql`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{accept:'application/json',authorization:`Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,'surreal-ns':storage.namespace,'surreal-db':database},body})
    check(response.ok,'COMPONENT_STORAGE_UNAVAILABLE','Surreal read-only metadata probe failed')
    const rows=await response.json();check(Array.isArray(rows)&&rows.every(row=>row.status==='OK'),'COMPONENT_STORAGE_UNAVAILABLE','Surreal read-only metadata query was rejected');return rows.map(row=>row.result)
  }
  const [versions,pending,info]=await query(storage.database,"SELECT version FROM open_notebook:rag_schema; SELECT count() AS count FROM command WHERE status NOT IN ['completed','failed','canceled'] GROUP ALL; INFO FOR DB;")
  check(versions?.length===1&&versions[0].version===storage.schemaVersion&&hash(info)===storage.databaseInfoHash,'COMPONENT_SCHEMA_UNQUALIFIED','Actual Notebook RAG schema marker/definition fingerprint differs from reviewed storage')
  if(storage.generation) {
    const [pointer]=await query(storage.controlDatabase??storage.database,'SELECT active_database,phase,revision FROM open_notebook:rag_active_generation;')
    check(pointer?.length===1&&hash(pointer[0])===hash(storage.generation),'COMPONENT_GENERATION_UNQUALIFIED','Actual Notebook active generation differs from its retained compatibility evidence')
  }
  return {schemaVersion:versions[0].version,schemaFingerprint:hash(info),pendingCommands:pending?.length?pending[0].count:0}
}
async function repoEvidence(profile,container,run,runGit) {
  const evidence=profile.sourceEvidence
  if(evidence?.mode!=='repo')return null
  const repo=profile.repository
  check(repo&&isAbsolute(repo.directory)&&/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(evidence.repository??'')&&/^[a-f0-9]{40}$/.test(evidence.commit??'')&&Array.isArray(repo.files)&&repo.files.length>0,'LOCAL_SOURCE_EVIDENCE_MISMATCH','A repository adoption requires fixed canonical source and audited file inventory')
  const head=(await runGit(['-C',repo.directory,'rev-parse','HEAD'])).trim(),remote=(await runGit(['-C',repo.directory,'remote','get-url','origin'])).trim()
  check(head===evidence.commit&&remote===evidence.repository&&!(await runGit(['-C',repo.directory,'status','--porcelain','--untracked-files=no'])).trim(),'LOCAL_SOURCE_EVIDENCE_MISMATCH','Repository HEAD/origin/clean tracked state differs from the qualified image source')
  for(const file of repo.files) {
    check(!file.repositoryPath.startsWith('-')&&!file.repositoryPath.includes('..')&&/^\/app\/(?:api\/|open_notebook\/|rag_commands\.py$)/.test(file.containerPath)&&/^[a-f0-9]{64}$/.test(file.sha256),'LOCAL_SOURCE_EVIDENCE_MISMATCH','Repository adoption source-file evidence is invalid')
    check(rawHash(await runGit(['-C',repo.directory,'show',`${evidence.commit}:${file.repositoryPath}`]))===file.sha256,'LOCAL_SOURCE_EVIDENCE_MISMATCH','Exact committed source file differs from its audit hash')
    const actual=(await run(['exec',container.Id,'sha256sum',file.containerPath])).trim().split(/\s+/)[0]
    check(actual===file.sha256,'LOCAL_SOURCE_EVIDENCE_MISMATCH','Running image source file differs from its exact repository commit')
  }
  return {...evidence,filesHash:hash(repo.files)}
}
async function warmMetadata(profile,container,run,runGit) {
  for(const file of profile.metadata?.files??[]) {
    check(isAbsolute(file.path)&&/^[a-f0-9]{64}$/.test(file.sha256),'COMPONENT_PROFILE_UNQUALIFIED','Fixed metadata hashes are required')
    check((await run(['exec',container.Id,'sha256sum',file.path])).trim().split(/\s+/)[0]===file.sha256,'COMPONENT_METADATA_MISMATCH','Actual component metadata file differs from the reviewed immutable artifact')
  }
  const source=await repoEvidence(profile,container,run,runGit)
  if(profile.kind==='wukongim') {
    const info=await run(['exec',container.Id,'cat','/usr/local/share/wukongim/build-info.txt'])
    check(rawHash(info)===profile.metadata?.buildInfoSha256,'COMPONENT_METADATA_MISMATCH','Actual WuKongIM build provenance differs from the reviewed writer')
    const rows=Object.fromEntries(info.trim().split('\n').filter(line=>line.includes('=')).map(line=>{const at=line.indexOf('=');return[line.slice(0,at),line.slice(at+1)]}))
    check(rows.upstream_commit===profile.metadata.upstreamCommit&&rows.raftstore_fix_commit===profile.metadata.raftstoreFixCommit,'COMPONENT_METADATA_MISMATCH','WuKongIM upstream/fix versions differ from qualified storage writer')
    const actual=(await run(['exec',container.Id,'sha256sum','/usr/local/bin/wukongim'])).trim().split(/\s+/)[0]
    check(actual===profile.metadata.binarySha256,'COMPONENT_METADATA_MISMATCH','Actual WuKongIM executable differs from its build provenance')
    await run(['exec',container.Id,'wget','-q','-O','/dev/null','http://127.0.0.1:5001/readyz'])
    return {upstreamCommit:rows.upstream_commit,raftstoreFixCommit:rows.raftstore_fix_commit,binarySha256:actual}
  }
  check((profile.metadata?.files?.length??0)>0||source,'COMPONENT_METADATA_MISMATCH','Notebook needs actual source/metadata hash evidence')
  return {kind:'notebook-rag',source,metadataHash:hash(profile.metadata??{})}
}
export async function componentControl(policy,action,op,{run=(args,options={})=>runDocker(args,{...options,binary:policy.dockerBinary??'/usr/bin/docker'}),fetcher=fetch,runGit=async args=>(await exec(policy.gitBinary??'/usr/bin/git',args,{encoding:'utf8',maxBuffer:2*1024*1024,timeout:10000,env:{PATH:'/usr/bin:/bin'}})).stdout}={}) {
  const local=policy.targets?.[op.target];check(local?.component&&['open-notebook','wukongim'].includes(local.adapter),'COMPONENT_POLICY_REQUIRED','Only fixed component controls are supported')
  const inventory=await componentInventory(policy,op.target,run),db=new DatabaseSync(join(policy.stateDirectory,'journal.sqlite'))
  db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS component_observations (key TEXT PRIMARY KEY, body TEXT NOT NULL)')
  try {
    const registered=db.prepare('SELECT body,hash FROM manifests WHERE release_id=?').get(op.releaseId)
    check(registered?.hash===op.manifestHash,'MANIFEST_REQUIRED','Component observation requires the exact registered manifest')
    const plan=JSON.parse(registered.body).targets?.[op.target]?.hostPlan
    const profiles=[],versions={}
    for(const [service,container] of Object.entries(inventory.services)) {
      let profile,identity
      for(const descriptor of [plan?.source??plan?.recovery,plan,plan?.recovery]){const image=descriptor?.images?.[service];if(!image)continue;const candidate=componentProfile(local,image);if(!candidate)continue;const resolved=await inspectQualifiedImage(run,image,candidate,{stateDirectory:policy.stateDirectory});if(resolved?.localImageId===container.Image){profile=candidate;identity=resolved;break}}
      check(profile&&profile.contract&&profile.storage,'COMPONENT_PROFILE_UNQUALIFIED','Actual component image has no reviewed storage/protocol profile');profiles.push(profile)
      const key=`${op.target}:${service}:${container.Id}:${container.Image}:${hash(profile)}`
      let metadata
      if(container.State?.Running) {
        metadata=await warmMetadata(profile,container,run,runGit)
        db.prepare('INSERT INTO component_observations VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(key,canonical({metadata,observedAt:new Date().toISOString()}))
      } else {
        check(container.State?.Pid===0&&container.State.Status!=='restarting','COMPONENT_PROCESS_UNCERTAIN','Component process shutdown is not proven')
        const row=db.prepare('SELECT body FROM component_observations WHERE key=?').get(key)
        check(row,'COMPONENT_METADATA_UNAVAILABLE','Stopped component has no exact pre-drain metadata observation');metadata=JSON.parse(row.body).metadata
      }
      versions[service]={...identity,metadata}
    }
    const profile=profiles[0];check(profiles.every(value=>equal(value.contract,profile.contract)&&equal(value.storage,profile.storage)),'COMPONENT_PROFILE_UNQUALIFIED','Selected services disagree on component storage/protocol')
    let storageEvidence
    if(local.adapter==='open-notebook')storageEvidence=await surrealRows(local,inventory,profile.storage,fetcher)
    else storageEvidence={kind:'audited-writer-identity-and-original-volume',storageFingerprint:hash(profile.storage),coldSchemaInspected:false}
    if(action==='barrier') {
      const stopped=Object.values(inventory.services).every(container=>!container.State.Running&&container.State.Pid===0)
      if(stopped)for(const container of Object.values(inventory.services))check((profile.allowedStopExitCodes??[0]).includes(container.State.ExitCode),'COMPONENT_SHUTDOWN_UNPROVEN','Component did not finish its audited bounded shutdown normally')
      return {kind:'component',fullVisibility:true,drained:stopped&&(storageEvidence.pendingCommands??0)===0,servicesStopped:stopped,storageUnchanged:true,storageEvidence}
    }
    if(action==='settled')return {settled:(storageEvidence.pendingCommands??0)===0,storageEvidence}
    if(action==='readiness') {
      check(Object.values(inventory.services).every(container=>container.State.Running&&!container.State.Restarting&&container.State.Health?.Status==='healthy'),'COMPONENT_NOT_READY','Actual component health is not ready')
      if(local.adapter==='open-notebook')for(const container of Object.values(inventory.services)) {
        const readiness=JSON.parse(await run(['exec',container.Id,'curl','--fail','--silent','--show-error','http://127.0.0.1:5055/readyz']))
        check(readiness.status==='ready'&&readiness.profile==='rag'&&readiness.schema_version===profile.storage.schemaVersion,'COMPONENT_NOT_READY','Notebook actual RAG readiness/schema differs from its storage profile')
      }
      return {ready:true,contract:profile.contract,versions,storageEvidence,sourceModeEvidence:profiles.map(value=>value.sourceEvidence).filter(Boolean)}
    }
    check(action==='state','UNSUPPORTED_CONTROL','Only state, settled, barrier and readiness component controls are supported')
    return {...profile.contract,verified:true,requiredCapabilities:profile.contract.capabilities,versions,storageEvidence}
  } finally {db.close()}
}
export async function componentDrain(adapter,op,plan,context) {
  const local=adapter.policy.targets[op.target],actual=await adapter.containers(op),direction=op.phase==='source-drain'?'source':op.phase==='recovery-drain'?'recovery':'forward',descriptor=direction==='source'?(plan.source??plan.recovery):direction==='recovery'?plan.recovery:plan
  const identities=await adapter.resolveImages(descriptor.images,local)
  if(Object.entries(actual).every(([service,container])=>container.Image===identities[service].localImageId&&container.State.Running&&container.State.Health?.Status==='healthy')) {
    await adapter.verify(op,plan,direction);return {drained:true,unchanged:true,noServiceChange:true}
  }
  await adapter.control(local,'state',op,'GET')
  if(local.adapter==='open-notebook') {
    for(const container of Object.values(actual))if(container.State.Running) {
      let status
      try { status=await adapter.run(['exec',container.Id,'/app/.venv/bin/supervisorctl','-s','unix:///tmp/supervisor.sock','status','rag-api']) }
      catch(error) {if(error.cause?.code===3&&/^rag-api\s+STOPPED\b/.test(error.cause.stdout??''))status=error.cause.stdout;else throw error}
      check(/^rag-api\s+(RUNNING|STOPPED)\b/.test(status),'COMPONENT_ADMISSION_UNPROVEN','Actual Notebook API admission process state is not proven')
      if(/^rag-api\s+RUNNING\b/.test(status))await context.step('component:notebook-admission-close',()=>adapter.run(['exec',container.Id,'/app/.venv/bin/supervisorctl','-s','unix:///tmp/supervisor.sock','stop','rag-api']),{sideEffect:true})
    }
    const deadline=Date.now()+(adapter.policy.drainTimeoutMs??120000)
    while(!(await adapter.control(local,'settled',op,'GET')).settled) {if(Date.now()>=deadline)throw fault('COMPONENT_DRAIN_TIMEOUT','Notebook commands remain unsettled; data and original writer are retained');await adapter.wait(adapter.policy.pollIntervalMs??1000)}
  }
  for(const service of Object.keys(local.services))await context.step(`component:stop:${service}`,()=>adapter.run([...context.compose,'stop','--timeout',String(adapter.policy.stopTimeoutSeconds??150),service]),{sideEffect:true})
  check(await adapter.barrier(op),'COMPONENT_DRAIN_UNPROVEN','Component-local process/storage barrier is not proven')
  return {drained:true,component:local.adapter,storageServicesStopped:false}
}
async function main(){const[policyPath,action]=process.argv.slice(2);let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1024*1024)throw Error('Input exceeds limit')}process.stdout.write(JSON.stringify(await componentControl(JSON.parse(await readFile(policyPath,'utf8')),action,JSON.parse(input))))}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{process.stdout.write(JSON.stringify({error:{code:error.code??'COMPONENT_CONTROL_FAILED',message:error.code?error.message:'Fixed component evidence failed'}}));process.exitCode=1})
