import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {configurationFingerprint} from './adapter.mjs'
import {fixture,baseConfig,oldImage,newImage} from './fixtures/fake-host.mjs'
import {hash,fault} from './journal.mjs'
const rawHash=value=>createHash('sha256').update(value).digest('hex'),contract={nativeSchema:0,productSchema:0,api:'gateway-v1',worker:'none',checkpoint:'none',control:'nginx-healthz-v1',capabilities:['gateway.proxy-v1']},version='nginx version: nginx/1.29.0\n',oldConfig='upstream app { server 10.20.0.2:5183; }\n',newConfig='upstream app { server 10.20.0.2:5183; server 127.0.0.1:5183; }\n'
async function setup(t,{unchanged=false,stopExitCode=0,stopResponseLost=false}={}){
  const directory=await mkdtemp(join(tmpdir(),'release-gateway-')),f=fixture(directory,{storeKind:'index',offline:true}),id='4'.repeat(64)
  t.after(async()=>{f.journal.close();await rm(directory,{recursive:true,force:true})})
  f.host.data.containers.gateway={...structuredClone(f.host.data.containers.web),Id:id,Mounts:[]};const mainBefore=JSON.stringify({web:f.host.data.containers.web,worker:f.host.data.containers.worker})
  const profile=configuration=>({contract,metadata:{version:'1.29.0',versionOutputSha256:rawHash(version),configurationSha256:rawHash(configuration)}})
  const local={adapter:'gateway',project:'original-project',composeFile:'/fixed/gateway-compose.yml',envFile:'/fixed/gateway.env',services:{gateway:{role:'component',mounts:[]}},gateway:{imageProfiles:{[oldImage.configDigest]:profile(oldConfig),[newImage.configDigest]:profile(newConfig)}}}
  f.adapter.policy.targets.gateway=local
  const config=baseConfig();config.services.gateway={image:oldImage.ref,pull_policy:'never'};const configurationHash=configurationFingerprint(config,local),source={images:{gateway:oldImage},contract,configurationHash},release={...f.release,releaseId:'gateway-release',targets:{gateway:{adapter:'gateway',contract,hostPlan:{version:1,mode:'maintenance',sourceMode:'image',images:{gateway:unchanged?oldImage:newImage},contract,configurationHash,source,recovery:source}}}},manifestHash=hash(release)
  f.executor.register(release,manifestHash)
  const original=f.adapter.run;let corrupt=false
  f.adapter.run=async(args,options)=>{
    if(args[0]==='ps'&&args.at(-1).endsWith('=gateway')){f.host.data.calls.push(args);return id}
    if(args[0]==='container'&&args[2]===id){f.host.data.calls.push(args);return JSON.stringify([f.host.data.containers.gateway])}
    if(args[0]==='exec'&&args[1]===id){f.host.data.calls.push(args);if(args[2]==='nginx'&&args[3]==='-v'){assert.equal(options.captureStderr,true);return version}if(args[2]==='nginx'&&args[3]==='-T')return corrupt?'unexpected config':f.host.data.containers.gateway.Image===newImage.indexDigest?newConfig:oldConfig;return ''}
    if(args[0]==='run'){f.host.data.calls.push(args);assert.ok(['-t','-v','-T'].includes(args.at(-1)));assert.equal(args[args.indexOf('--entrypoint')+1],'nginx');assert.equal(args[args.indexOf('--pull')+1],'never');if(args.at(-1)==='-v')return version;if(args.at(-1)==='-T')return args.includes(newImage.indexDigest)?newConfig:oldConfig;return ''}
    if(args[0]==='compose'&&(args.includes('stop')||args.includes('up'))){assert.equal(args.at(-1),'gateway');f.host.data.calls.push(args);const actual=f.host.data.containers.gateway;if(args.includes('stop')){actual.State={...actual.State,Running:false,Pid:0,Status:'exited',ExitCode:stopExitCode};if(stopResponseLost)throw Object.assign(fault('DOCKER_COMMAND_FAILED','Stop response was lost'),{uncertain:true})}else actual.State={...actual.State,Running:true,Pid:222,Health:{Status:'healthy'}},actual.Image=args.find(value=>value.endsWith('gateway-recovery.json'))?oldImage.indexDigest:(unchanged?oldImage:newImage).indexDigest;return ''}
    return original(args,options)
  }
  const phase=async phase=>{const accepted=f.executor.submit({releaseId:release.releaseId,target:'gateway',phase,generation:phase==='prepare'?0:1,manifestHash,parameters:{}});return f.executor.run(accepted.operation.key)}
  return{...f,id,phase,mainBefore,setCorrupt:value=>corrupt=value}
}
test('gateway changes only its fixed service and can restore the cached source without application or DB actions',async t=>{
  const f=await setup(t)
  for(const phase of ['prepare','drain','apply','verify','undrain','recovery-drain','recover','recovery-undrain']){const result=await f.phase(phase);assert.equal(result.status,'succeeded',JSON.stringify(result))}
  assert.equal(f.host.data.containers.gateway.Image,oldImage.indexDigest);assert.equal(JSON.stringify({web:f.host.data.containers.web,worker:f.host.data.containers.worker}),f.mainBefore)
  assert.ok(f.host.data.calls.filter(args=>args[0]==='compose'&&(args.includes('up')||args.includes('stop'))).every(args=>args.at(-1)==='gateway'))
  assert.equal(f.host.data.calls.some(args=>args.includes('psql')||args.includes('db-migrate')||args.includes('ingress')),false)
})
test('same gateway image adoption is read-only and does not claim hot drain without a configuration mount',async t=>{
  const f=await setup(t,{unchanged:true})
  for(const phase of ['prepare','drain','apply','verify','undrain']){const result=await f.phase(phase);assert.equal(result.status,'succeeded');if(phase==='verify'){assert.equal(result.result.storageEvidence.hotDrainVerified,false);assert.equal(result.result.storageEvidence.configurationMountObserved,false)}}
  assert.equal(f.host.data.calls.some(args=>args[0]==='run'||args.includes('up')||args.includes('stop')),false)
})
test('unexpected effective Nginx config blocks preparation before gateway or main services are stopped',async t=>{
  const f=await setup(t);f.setCorrupt(true);const result=await f.phase('prepare');assert.equal(result.status,'failed');assert.equal(result.errors.forward.code,'GATEWAY_CONFIGURATION_MISMATCH');assert.equal(f.host.data.calls.some(args=>args.includes('stop')||args.includes('up')),false)
})
test('gateway drain requires a confirmed stopped process with exit code 0 or 143',async t=>{
  for(const stopExitCode of [0,143]){const f=await setup(t,{stopExitCode});assert.equal((await f.phase('prepare')).status,'succeeded');assert.equal((await f.phase('drain')).status,'succeeded');assert.equal(f.host.data.containers.gateway.State.ExitCode,stopExitCode);assert.equal(JSON.stringify({web:f.host.data.containers.web,worker:f.host.data.containers.worker}),f.mainBefore)}
})
test('gateway stop timeout exit 137 stays uncertain, retains its reservation and cannot authorize apply or replay stop',async t=>{
  const f=await setup(t,{stopExitCode:137});assert.equal((await f.phase('prepare')).status,'succeeded');const result=await f.phase('drain')
  assert.equal(result.status,'uncertain');assert.equal(result.errors.forward.code,'GATEWAY_PROCESS_UNCERTAIN');assert.equal(f.journal.state('gateway').drainedHash,undefined);await assert.rejects(f.phase('apply'),{code:'RESOURCE_BUSY'})
  const observed=await f.executor.reconcile(result);assert.equal(observed.status,'uncertain');assert.equal(observed.result.observationError.code,'GATEWAY_PROCESS_UNCERTAIN');assert.equal(f.host.data.calls.filter(args=>args.includes('stop')).length,1);assert.equal(f.host.data.calls.some(args=>args.includes('up')),false);assert.equal(JSON.stringify({web:f.host.data.containers.web,worker:f.host.data.containers.worker}),f.mainBefore)
})
test('lost stop response is reconciled from an allowed actual exit code without repeating the stop',async t=>{
  const f=await setup(t,{stopExitCode:143,stopResponseLost:true});assert.equal((await f.phase('prepare')).status,'succeeded');const result=await f.phase('drain');assert.equal(result.status,'uncertain');assert.equal(result.errors.forward.code,'DOCKER_COMMAND_FAILED')
  assert.equal((await f.executor.reconcile(result)).status,'succeeded');assert.equal(f.host.data.calls.filter(args=>args.includes('stop')).length,1)
})
