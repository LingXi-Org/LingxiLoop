#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { callRelease } from './client.mjs'
import { releaseTiming } from './timing-report.mjs'

const fail=code=>Object.assign(new Error(code),{code})
const safe=error=>/^[A-Z][A-Z0-9_]+$/.test(error?.code??'')?error.code:'RELEASE_RUN_UNAVAILABLE'
const transient=error=>[429,500,502,503,504].includes(error?.status)||!error?.status&&['RELEASE_RUN_UNAVAILABLE','RELEASE_REQUEST_FAILED'].includes(safe(error))
const terminal=new Set(['accepted','recovered','failed','blocked','superseded'])
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item)
const fingerprint=manifest=>createHash('sha256').update(canonical(manifest)).digest('hex')

/** One invocation observes the controller's automatic forward/recovery chain.
 * This operator does not clear locks, cancel a Workflow or invent new IDs. */
export async function runRelease({manifest,mode='publish',budgetMs=2_400_000,previous}, {call=callRelease,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),save=()=>{},qualify=async()=>{},progress=()=>{}}={}) {
  if(!['publish','preflight','resume','recover'].includes(mode)||!Number.isInteger(budgetMs)||budgetMs<1||budgetMs>2_400_000)throw fail('INVALID_RUN_BUDGET')
  if(!manifest?.releaseId||!manifest.appSha||!manifest.opsSha||manifest.checks?.commit!==manifest.appSha||manifest.checks?.conclusion!=='success')throw fail('QUALIFIED_MANIFEST_REQUIRED')
  const identity=fingerprint(manifest)
  if(previous&&(previous.manifestHash!==identity||previous.mode!==mode))throw fail('RUN_CHECKPOINT_CONFLICT')
  const receipt=previous??{version:1,releaseId:manifest.releaseId,appSha:manifest.appSha,opsSha:manifest.opsSha,manifestHash:identity,mode,startedAt:now(),deadline:now()+budgetMs,requests:0,retries:0,submissions:0,stages:[],status:'preflight'}
  const checkpoint=()=>{receipt.observedAt=now();save(receipt)}
  const stage=async(name,fn)=>{const row={name,startedAt:now()};receipt.stages.push(row);checkpoint();try{return await fn()}catch(error){row.error=safe(error);throw error}finally{row.completedAt=now();checkpoint()}}
  const request=async(method,args)=>{if(now()>=receipt.deadline)throw fail('RUN_DEADLINE_EXCEEDED');receipt.requests++;checkpoint();return call(method,args,{timeoutMs:Math.min(30_000,receipt.deadline-now())})}
  const identify=record=>{if(record.releaseId!==manifest.releaseId||record.appSha!==manifest.appSha||record.opsSha!==manifest.opsSha)throw fail('RELEASE_IDENTITY_MISMATCH');return record}
  const lookup=async()=>{try{return identify(await request('get',{releaseId:manifest.releaseId}))}catch(error){if(error.status===404||error.code==='RELEASE_NOT_FOUND')return null;throw error}}
  const read=async(fn)=>{
    for(let attempt=0;;attempt++)try{return await fn()}catch(error){
      if(!transient(error)||attempt>=2)throw error
      const delay=500*2**attempt
      if(now()+delay>=receipt.deadline)throw fail('RUN_DEADLINE_EXCEEDED')
      receipt.retries++;checkpoint();await wait(delay)
    }
  }
  try {
    checkpoint()
    await stage('environment-and-ci',()=>qualify(manifest,mode))
    let record=await stage('read-existing',()=>read(lookup))
    if(mode==='preflight'){
      if(!record)await stage('controller-plan',()=>read(()=>request('plan',{manifest})))
      receipt.status='preflight-passed';receipt.controller=record;checkpoint();return receipt
    }
    if(record&&terminal.has(record.status)&&!['recover','resume'].includes(mode)){receipt.status=record.status;receipt.controller=record;receipt.timing=releaseTiming(record);checkpoint();return receipt}
    if(['resume','recover'].includes(mode)){
      if(!record)throw fail('RELEASE_NOT_FOUND')
      if(terminal.has(record.status)&&record.status!=='blocked')throw fail('RELEASE_ALREADY_TERMINAL')
      if(receipt.commandIntent){
        // A changed durable Workflow ID proves that this command was accepted.
        if(record.workflowId===receipt.commandIntent.workflowId)throw fail('ADMIN_COMMAND_OUTCOME_UNKNOWN')
      }else{
        receipt.commandIntent={method:mode,workflowId:record.workflowId};checkpoint()
        await stage(mode,async()=>{
          try{record=identify(await request(mode,{releaseId:manifest.releaseId}))}
          catch(error){if(!transient(error))throw error;const observed=await read(lookup);if(!observed||observed.workflowId===receipt.commandIntent.workflowId)throw fail('ADMIN_COMMAND_OUTCOME_UNKNOWN');record=observed}
        })
      }
    }else if(!record){
      await stage('controller-plan',()=>read(()=>request('plan',{manifest})))
      await stage('submit',async()=>{
        while(!record&&receipt.submissions<3){
          receipt.submissions++;checkpoint()
          try{record=identify(await request('submit',{manifest}))}
          catch(error){if(!transient(error))throw error;receipt.retries++;checkpoint();record=await read(lookup)}
        }
        if(!record)throw fail('SUBMISSION_OUTCOME_UNKNOWN')
      })
    }
    await stage('observe-terminal',async()=>{
      while(record&&!terminal.has(record.status)){
        receipt.controller=record;receipt.status=record.status;checkpoint();progress({releaseId:manifest.releaseId,status:record.status,phase:record.phase})
        const remaining=receipt.deadline-now();if(remaining<=0)throw fail('RUN_DEADLINE_EXCEEDED')
        await wait(Math.min(3000,remaining));record=await read(lookup);if(!record)throw fail('RELEASE_DISAPPEARED')
      }
    })
    receipt.status=record.status;receipt.controller=record;receipt.timing=releaseTiming(record)
  }catch(error){receipt.status='unverified';receipt.error=safe(error);receipt.failureStatus=error.status??null}
  receipt.completedAt=now();checkpoint();return receipt
}

export function atomicReceipt(path,value){
  mkdirSync(dirname(path),{recursive:true,mode:0o700})
  const temporary=`${path}.${process.pid}.tmp`,fd=openSync(temporary,'w',0o600)
  try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd)}finally{closeSync(fd)}
  renameSync(temporary,path)
  const directory=openSync(dirname(path),'r');try{fsyncSync(directory)}finally{closeSync(directory)}
}
export function environmentCheck(env=process.env){
  if(Number(process.versions.node.split('.')[0])<22)throw fail('NODE_22_REQUIRED')
  if(!env.RELEASE_API_URL||!env.RELEASE_API_TOKEN)throw fail('EXISTING_RELEASE_CONFIGURATION_REQUIRED')
  const origin=new URL(env.RELEASE_API_URL)
  if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.password||origin.search||origin.hash)throw fail('INVALID_RELEASE_ORIGIN')
  return {node:process.version,existingConfiguration:true}
}
function existingConfiguration(){
  // The saved provider owns tokens. Reuse the approved tracked custom domain;
  // GitHub Variables access is not required and is never probed or retried.
  if(!process.env.RELEASE_API_URL){
    try {
      const config=JSON.parse(readFileSync(new URL('../../workers/release/wrangler.jsonc',import.meta.url),'utf8'))
      const domains=config.routes.filter(route=>route.custom_domain===true)
      if(domains.length!==1||!/^[a-z0-9.-]+$/.test(domains[0].pattern))throw Error('ambiguous domain')
      process.env.RELEASE_API_URL=`https://${domains[0].pattern}`
    }
    catch { throw fail('EXISTING_ENDPOINT_READ_REQUIRED') }
  }
  return environmentCheck()
}
function qualifySource(manifest,mode){
  environmentCheck()
  if(['recover','resume'].includes(mode)&&!process.env.RELEASE_ADMIN_TOKEN)throw fail('EXISTING_ADMIN_CREDENTIAL_REQUIRED')
  const api=path=>{
    try{return JSON.parse(execFileSync('gh',['api',`repos/LingXi-Org/LingxiLoop/${path}`],{encoding:'utf8',timeout:20_000,stdio:['ignore','pipe','pipe']}))}
    catch(error){if(error.code==='ENOENT')throw fail('GITHUB_CLI_REQUIRED');if(/HTTP (401|403)/.test(String(error.stderr??'')))throw fail('GITHUB_CI_READ_DENIED');throw fail('GITHUB_CI_READ_UNAVAILABLE')}
  }
  if(!/^[a-f0-9]{40}$/.test(manifest.appSha)||!/^[a-f0-9]{40}$/.test(manifest.opsSha)||!/^\d+$/.test(manifest.checks.runId))throw fail('EXACT_SOURCE_REQUIRED')
  const run=api(`actions/runs/${manifest.checks.runId}`)
  if(run.head_sha!==manifest.appSha||run.conclusion!=='success'||run.status!=='completed')throw fail('EXACT_APP_CI_REQUIRED')
  const checks=api(`commits/${manifest.opsSha}/check-runs?per_page=100`).check_runs
  if(!checks?.some(check=>check.name==='focused'&&check.conclusion==='success')||checks.some(check=>!['success','skipped','neutral'].includes(check.conclusion)))throw fail('EXACT_OPS_CI_REQUIRED')
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2)
  try{
    if(args[0]==='--help'){console.log('scripts/release/run.sh <preflight|publish|resume|recover> <qualified-manifest.json> [receipt.json]\nReuses the existing provider. No configuration or credential mutation. Same receipt resumes its original deadline.');process.exit(0)}
    existingConfiguration()
    if(args[0]==='route-benchmark'){
      if(![4,5].includes(args.length))throw fail('INVALID_RUN_ARGUMENTS')
      const {transferBenchmark}=await import('../mihomo/transfer-benchmark.mjs')
      const result=await transferBenchmark(args[1],args[2],JSON.parse(readFileSync(resolve(args[3]),'utf8')),{concurrency:args[4]===undefined?1:Number(args[4])})
      console.log(JSON.stringify(result));process.exitCode=result.status==='download-verified'?0:1
    }else if(args[0]==='route-docker'){
      if(![3,4].includes(args.length))throw fail('INVALID_RUN_ARGUMENTS')
      const {dockerOperation}=await import('../mihomo/docker-proxy.mjs')
      const result=await dockerOperation(args[1],args[2],{expectedHash:args[3]});console.log(JSON.stringify(result));process.exitCode=result.receipt.error?1:0
    }else if(args[0]==='route-native'){
      if(args.length!==3&&!(args.length===4&&args[2]==='filter-provider'))throw fail('INVALID_RUN_ARGUMENTS')
      const {nativeOperation}=await import('../mihomo/native-operator.mjs')
      const result=await nativeOperation(args[1],args[2],{expectedProviderHash:args[3]});console.log(JSON.stringify(result));process.exitCode=result.receipt.error?1:0
    }else if(args[0]==='route-check'){
      const {inspectUploadPaths}=await import('../mihomo/host-status.mjs')
      console.log(JSON.stringify(await inspectUploadPaths()))
    }else if(args[0]==='subscription-check'){
      const {probeSubscription}=await import('../mihomo/probe.mjs')
      const result=await probeSubscription();console.log(JSON.stringify(result));process.exitCode=result.status==='subscription-validated'?0:1
    }else
    if(args[0]==='doctor'){
      const accepted=await callRelease('accepted');console.log(JSON.stringify({status:'read-only-preflight-passed',node:process.version,acceptedReleaseId:accepted.releaseId,productionWrites:0}));process.exit(0)
    }
    else {
    const [mode,input,output]=args
    if(args.length<2||args.length>3)throw fail('INVALID_RUN_ARGUMENTS')
    const manifest=JSON.parse(readFileSync(resolve(input),'utf8')),path=resolve(output??`.release-runs/${manifest.releaseId}-${mode}.json`)
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(manifest.releaseId??''))throw fail('INVALID_RELEASE_ID')
    process.chdir(resolve(dirname(fileURLToPath(import.meta.url)),'../..'))
    const previous=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):undefined
    const result=await runRelease({manifest,mode,previous},{qualify:qualifySource,save:value=>atomicReceipt(path,value),progress:value=>console.error(JSON.stringify(value))})
    console.log(JSON.stringify({releaseId:result.releaseId,status:result.status,error:result.error??null,receipt:path,elapsedSeconds:((result.completedAt??result.observedAt)-result.startedAt)/1000,retries:result.retries,productionAccepted:result.status==='accepted'}))
    console.error(`Release ${result.releaseId}: ${result.status}. Receipt: ${path}. ${result.status==='accepted'?'Controller accepted this candidate.':result.status==='recovered'?'Controller restored the compatible release; candidate not accepted.':'Production acceptance is not established.'}`)
    process.exitCode=['accepted','preflight-passed'].includes(result.status)?0:result.status==='recovered'?2:1
    }
  }catch(error){console.error(JSON.stringify({status:'preflight-failed',error:safe(error),productionAccepted:false}));process.exitCode=1}
}
