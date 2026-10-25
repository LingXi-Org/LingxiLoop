import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {isDeepStrictEqual as equal} from 'node:util'
import {hash,canonical,fault} from './journal.mjs'
import {inspectQualifiedImage} from './image-identity.mjs'
const rawHash=value=>createHash('sha256').update(value).digest('hex')
const check=(condition,code,message)=>{if(!condition)throw fault(code,message,422)}
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
      check(rawHash(configuration)===profile.metadata.configurationSha256,'GATEWAY_CONFIGURATION_MISMATCH','Actual complete Nginx configuration differs from the reviewed effective configuration')
      await adapter.run(['exec',container.Id,'wget','-q','-O','/dev/null','http://127.0.0.1:8080/healthz'])
      metadata={nginxVersion:profile.metadata.version,effectiveConfigurationSha256:rawHash(configuration),configurationMountObserved:mounts(container).some(row=>row.readOnly&&row.target==='/etc/nginx/conf.d'),hotDrainVerified:false}
      db.prepare('INSERT INTO gateway_image_observations VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(`${container.Image}:${hash(profile)}`,canonical(metadata))
      db.prepare('INSERT INTO gateway_observations VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(key,canonical(metadata))
    }else{
      check(container.State?.Pid===0,'GATEWAY_PROCESS_UNCERTAIN','Gateway process shutdown is not proven')
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
    const args=['run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--pids-limit','32','--memory','64m','--tmpfs','/var/cache/nginx:noexec,nosuid,size=8m','--tmpfs','/var/run:noexec,nosuid,size=1m']
    for(const spec of Object.values(local.services))for(const mount of spec.mounts){check(mount.readOnly===true&&!mount.source.includes(',')&&!mount.target.includes(','),'GATEWAY_POLICY_REQUIRED','Gateway preflight accepts only its fixed read-only configuration mounts');args.push('--mount',`type=${mount.type},source=${mount.source},target=${mount.target},readonly`)}
    await adapter.run([...args,'--entrypoint','nginx',identity.localImageId,'-t'])
    const profile=local.gateway.imageProfiles[image.configDigest],version=await adapter.run([...args,'--entrypoint','nginx',identity.localImageId,'-v'],{captureStderr:true}),configuration=await adapter.run([...args,'--entrypoint','nginx',identity.localImageId,'-T'])
    check(rawHash(version)===profile.metadata.versionOutputSha256&&version.includes(`nginx/${profile.metadata.version}`)&&rawHash(configuration)===profile.metadata.configurationSha256,'GATEWAY_PREFLIGHT_MISMATCH','Cached gateway syntax/version/effective configuration differs from its reviewed profile')
    const db=new DatabaseSync(join(adapter.policy.stateDirectory,'journal.sqlite'))
    try{db.prepare('INSERT INTO gateway_image_observations VALUES (?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(`${identity.localImageId}:${hash(profile)}`,canonical({nginxVersion:profile.metadata.version,effectiveConfigurationSha256:rawHash(configuration),configurationMountObserved:Object.values(local.services).some(spec=>spec.mounts.some(mount=>mount.target==='/etc/nginx/conf.d'&&mount.readOnly)),hotDrainVerified:false}))}finally{db.close()}
  }
}
export async function gatewayDrain(adapter,op,plan,context){
  const local=adapter.policy.targets[op.target],direction=op.phase==='source-drain'?'source':op.phase==='recovery-drain'?'recovery':'forward',descriptor=direction==='source'?(plan.source??plan.recovery):direction==='recovery'?plan.recovery:plan,identities=await adapter.resolveImages(descriptor.images,local),actual=await adapter.containers(op)
  if(Object.entries(actual).every(([service,container])=>container.Image===identities[service].localImageId&&container.State.Running&&container.State.Health?.Status==='healthy')){await adapter.verify(op,plan,direction);return{drained:true,unchanged:true,noServiceChange:true}}
  await adapter.control(local,'state',op,'GET')
  for(const service of Object.keys(local.services))await context.step(`gateway:stop:${service}`,()=>adapter.run([...context.compose,'stop','--timeout',String(adapter.policy.stopTimeoutSeconds??30),service]),{sideEffect:true})
  check(await adapter.barrier(op),'GATEWAY_DRAIN_UNPROVEN','Only the fixed gateway service must be stopped before replacement')
  return{drained:true,gatewayOnly:true,hotDrainVerified:false}
}
