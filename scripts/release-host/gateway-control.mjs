import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {join,posix} from 'node:path'
import {readFile} from 'node:fs/promises'
import {renderIngress} from './ingress.mjs'
import {isDeepStrictEqual as equal} from 'node:util'
import {hash,canonical,fault} from './journal.mjs'
import {inspectQualifiedImage} from './image-identity.mjs'
const rawHash=value=>createHash('sha256').update(value).digest('hex')
const check=(condition,code,message)=>{if(!condition)throw fault(code,message,422)}
/** Reconstruct the originally qualified generation0 dump; never discard configuration lines. */
export async function verifyGatewayConfiguration(configuration,profile,local,ingress) {
  if (!profile.metadata.managedIngress) return rawHash(configuration)===profile.metadata.configurationSha256
  const managed=profile.metadata.managedIngress
  check(/^[a-f0-9]{64}$/.test(managed.templateSha256??'')&&ingress?.templateFile&&ingress?.outputFile,'GATEWAY_POLICY_REQUIRED','Managed ingress requires a pinned template and trusted ingress policy')
  const template=await readFile(ingress.templateFile,'utf8')
  check(rawHash(template)===managed.templateSha256,'GATEWAY_CONFIGURATION_MISMATCH','Managed ingress template differs from its pinned bytes')
  const candidates=Object.values(local.services).flatMap(service=>service.mounts).filter(mount=>mount.type==='bind'&&mount.readOnly===true&&posix.dirname(ingress.outputFile)===mount.source)
  check(candidates.length===1,'GATEWAY_POLICY_REQUIRED','Managed ingress output must belong to exactly one fixed read-only directory mount')
  const path=posix.join(candidates[0].target,posix.basename(ingress.outputFile)),header=`# configuration file ${path}:\n`
  check(configuration.split(header).length===2,'GATEWAY_CONFIGURATION_MISMATCH','Managed file must occur exactly once in the complete Nginx dump')
  const start=configuration.indexOf(header)+header.length,next=configuration.indexOf('\n# configuration file ',start),end=next<0?configuration.length:next+1,body=configuration.slice(start,end),states={}
  for (const target of Object.keys(ingress.backends)) {
    const prefix=`    location = /state/${target} { default_type application/json; return 200 '`,parts=body.split(prefix)
    check(parts.length===2,'GATEWAY_CONFIGURATION_MISMATCH','Every fixed backend needs exactly one canonical state marker')
    const encoded=parts[1].split("'; }")[0];let state
    try{state=JSON.parse(encoded)}catch{throw fault('GATEWAY_CONFIGURATION_MISMATCH','Malformed ingress marker',422)}
    check(state&&Object.keys(state).length===2&&typeof state.enabled==='boolean'&&Number.isSafeInteger(state.generation)&&state.generation>=0&&canonical(state)===encoded,'GATEWAY_CONFIGURATION_MISMATCH','Ingress marker must contain only canonical enabled and nonnegative safe generation')
    states[target]=state
  }
  const rendered=renderIngress(template,ingress.backends,states)
  check(body===rendered+'\n','GATEWAY_CONFIGURATION_MISMATCH','Managed file differs from the exact trusted template rendering')
  const initial=Object.fromEntries(Object.keys(ingress.backends).map(target=>[target,{enabled:true,generation:0}]))
  const reconstructed=configuration.slice(0,start)+renderIngress(template,ingress.backends,initial)+'\n'+configuration.slice(end)
  return rawHash(reconstructed)===profile.metadata.configurationSha256
}

export function validateGatewayPlan(local,plan){
  check(local.gateway&&plan.mode==='maintenance'&&!plan.database&&Object.keys(local.services).length===1&&Object.values(local.services).every(spec=>spec.role==='component'),'GATEWAY_POLICY_REQUIRED','Gateway has one fixed service and its own configuration policy, without application/database phases')
  for(const descriptor of [plan.source??plan.recovery,plan,plan.recovery])for(const image of Object.values(descriptor.images)){
    const profile=local.gateway.imageProfiles?.[image.configDigest]
    check(image.kind!=='local-qualified'&&profile&&profile.contract?.nativeSchema===0&&profile.contract.productSchema===0&&equal(profile.contract,descriptor.contract),'GATEWAY_PROFILE_UNQUALIFIED','Gateway image must bind an independently reviewed zero-schema protocol/configuration profile')
    check(typeof profile.metadata?.version==='string'&&['versionOutputSha256','configurationSha256'].every(key=>/^[a-f0-9]{64}$/.test(profile.metadata[key]??'')),'GATEWAY_PROFILE_UNQUALIFIED','Actual Nginx version and effective-configuration fingerprints are required')
  }
}
function mounts(container){return(container.Mounts??[]).filter(row=>['bind','volume'].includes(row.Type)).map(row=>({type:row.Type,source:row.Type==='volume'?row.Name:row.Source,target:row.Destination,readOnly:!row.RW})).sort((a,b)=>a.target.localeCompare(b.target))}
export async function gatewayControl(adapter,action,op){
  const local=adapter.policy.targets[op.target],actual=await adapter.containers(op),db=new DatabaseSync(join(adapter.policy.stateDirectory,'journal.sqlite'))
  db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS gateway_observations(key TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS gateway_image_observations(key TEXT PRIMARY KEY,body TEXT NOT NULL)')
  try{
    const registered=db.prepare('SELECT hash,body FROM manifests WHERE release_id=?').get(op.releaseId);check(registered?.hash===op.manifestHash,'MANIFEST_REQUIRED','Gateway evidence needs the exact registered manifest')
    const plan=JSON.parse(registered.body).targets[op.target].hostPlan,[service]=Object.keys(local.services),container=actual[service]
    check(equal(mounts(container),local.services[service].mounts.map(row=>({...row,readOnly:Boolean(row.readOnly)})).sort((a,b)=>a.target.localeCompare(b.target))),'GATEWAY_VOLUME_DRIFT','Actual gateway mounts differ from the preserved complete inventory')
    let profile,identity
    for(const descriptor of [plan.source??plan.recovery,plan,plan.recovery]){const image=descriptor.images[service],candidate=local.gateway.imageProfiles[image.configDigest],resolved=await adapter.inspectImage(image,local);if(candidate&&resolved?.localImageId===container.Image){profile=candidate;identity=resolved;break}}
    check(profile&&identity,'GATEWAY_PROFILE_UNQUALIFIED','Actual gateway image has no qualified local identity/configuration profile')
    const key=`${op.target}:${container.Id}:${container.Image}:${hash(profile)}`;let metadata
    if(container.State?.Running){
      await adapter.run(['exec',container.Id,'nginx','-t'])
      const version=await adapter.run(['exec',container.Id,'nginx','-v'],{captureStderr:true}),configuration=await adapter.run(['exec',container.Id,'nginx','-T'])
      check(rawHash(version)===profile.metadata.versionOutputSha256&&version.includes(`nginx/${profile.metadata.version}`),'GATEWAY_VERSION_MISMATCH','Actual Nginx binary version differs from the reviewed artifact')
      check(await verifyGatewayConfiguration(configuration,profile,local,adapter.policy.ingress),'GATEWAY_CONFIGURATION_MISMATCH','Actual complete Nginx configuration differs from the reviewed effective configuration')
      await adapter.run(['exec',container.Id,'wget','-q','-O','/dev/null','http://127.0.0.1:8080/healthz'])
      metadata={nginxVersion:profile.metadata.version,effectiveConfigurationSha256:rawHash(configuration),configurationMountObserved:mounts(container).some(row=>row.readOnly&&row.target==='/etc/nginx/conf.d'),hotDrainVerified:false}
      db.prepare('INSERT INTO gateway_image_observations VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(`${container.Image}:${hash(profile)}`,canonical(metadata))
      db.prepare('INSERT INTO gateway_observations VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(key,canonical(metadata))
    }else{
      if(container.State?.Running!==false||container.State.Pid!==0||![0,143].includes(container.State.ExitCode))throw Object.assign(fault('GATEWAY_PROCESS_UNCERTAIN','Gateway shutdown requires an observed stopped process and exit code 0 or 143',422),{uncertain:true})
      const prior=db.prepare('SELECT body FROM gateway_observations WHERE key=?').get(key)??db.prepare('SELECT body FROM gateway_image_observations WHERE key=?').get(`${container.Image}:${hash(profile)}`);check(prior,'GATEWAY_OBSERVATION_REQUIRED','Stopped gateway has no exact pre-stop configuration/version observation');metadata=JSON.parse(prior.body)
    }
    if(action==='barrier')return{kind:'gateway',fullVisibility:true,drained:!container.State.Running&&container.State.Pid===0,servicesStopped:!container.State.Running&&container.State.Pid===0,configurationVerified:true}
    if(action==='readiness'){check(container.State.Running&&!container.State.Restarting&&container.State.Health?.Status==='healthy','GATEWAY_NOT_READY','Actual gateway container/healthz is not ready');return{ready:true,contract:profile.contract,versions:{[service]:identity},storageEvidence:{kind:'gateway-configuration',...metadata},sourceModeEvidence:[]}}
    check(action==='state','UNSUPPORTED_CONTROL','Gateway controls support only state, barrier and readiness')
    return{...profile.contract,verified:true,requiredCapabilities:profile.contract.capabilities,versions:{[service]:identity},configurationEvidence:metadata}
  }finally{db.close()}
}
export async function gatewayPrepare(adapter,op,plan){
  const local=adapter.policy.targets[op.target],actual=await adapter.containers(op)
  for(const descriptor of [plan,plan.recovery])for(const image of Object.values(descriptor.images)){
    const identity=await adapter.inspectImage(image,local);check(identity,'OFFLINE_IMAGE_MISSING','Gateway syntax preflight requires a qualified cached image')
    if(Object.values(actual).some(container=>container.Image===identity.localImageId&&container.State.Running&&container.State.Health?.Status==='healthy'))continue
    const args=['run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--cap-add','CHOWN','--pids-limit','32','--memory','64m','--tmpfs','/var/cache/nginx:noexec,nosuid,size=8m','--tmpfs','/var/run:noexec,nosuid,size=1m']
    for(const spec of Object.values(local.services))for(const mount of spec.mounts){check(mount.readOnly===true&&!mount.source.includes(',')&&!mount.target.includes(','),'GATEWAY_POLICY_REQUIRED','Gateway preflight accepts only its fixed read-only configuration mounts');args.push('--mount',`type=${mount.type},source=${mount.source},target=${mount.target},readonly`)}
    await adapter.run([...args,'--entrypoint','nginx',identity.localImageId,'-t'])
    const profile=local.gateway.imageProfiles[image.configDigest],version=await adapter.run([...args,'--entrypoint','nginx',identity.localImageId,'-v'],{captureStderr:true}),configuration=await adapter.run([...args,'--entrypoint','nginx',identity.localImageId,'-T'])
    check(rawHash(version)===profile.metadata.versionOutputSha256&&version.includes(`nginx/${profile.metadata.version}`)&&await verifyGatewayConfiguration(configuration,profile,local,adapter.policy.ingress),'GATEWAY_PREFLIGHT_MISMATCH','Cached gateway syntax/version/effective configuration differs from its reviewed profile')
    const db=new DatabaseSync(join(adapter.policy.stateDirectory,'journal.sqlite'))
    try{db.prepare('INSERT INTO gateway_image_observations VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(`${identity.localImageId}:${hash(profile)}`,canonical({nginxVersion:profile.metadata.version,effectiveConfigurationSha256:rawHash(configuration),configurationMountObserved:Object.values(local.services).some(spec=>spec.mounts.some(mount=>mount.target==='/etc/nginx/conf.d'&&mount.readOnly)),hotDrainVerified:false}))}finally{db.close()}
  }
}
export async function gatewayDrain(adapter,op,plan,context){
  const local=adapter.policy.targets[op.target],direction=op.phase==='source-drain'?'source':op.phase==='recovery-drain'?'recovery':'forward',descriptor=direction==='source'?(plan.source??plan.recovery):direction==='recovery'?plan.recovery:plan,identities=await adapter.resolveImages(descriptor.images,local),actual=await adapter.containers(op)
  if(Object.entries(actual).every(([service,container])=>container.Image===identities[service].localImageId&&container.State.Running&&container.State.Health?.Status==='healthy')){await adapter.verify(op,plan,direction);return{drained:true,unchanged:true,noServiceChange:true}}
  const timeout=adapter.policy.stopTimeoutSeconds??30
  check(plan.mode==='maintenance'&&Number.isSafeInteger(timeout)&&timeout>0,'GATEWAY_POLICY_REQUIRED','Gateway fast shutdown requires maintenance and a fixed positive stop timeout')
  await adapter.control(local,'state',op,'GET')
  // TERM closes active connections during maintenance. Docker's manual-stop semantics also
  // suppress unless-stopped restarts; an exec signal alone would let the old container restart.
  for(const service of Object.keys(local.services))await context.step(`gateway:stop:${service}`,()=>adapter.run(['container','stop','--signal','SIGTERM','--timeout',String(timeout),actual[service].Id],{timeout:Math.max(120000,(timeout+5)*1000)}),{sideEffect:true})
  try{check(await adapter.barrier(op),'GATEWAY_DRAIN_UNPROVEN','Only the fixed gateway service must be stopped before replacement')}catch(error){throw Object.assign(error,{uncertain:true})}
  return{drained:true,gatewayOnly:true,hotDrainVerified:false,stopMode:'maintenance-fast-shutdown',maintenanceConnectionsClosed:true}
}
