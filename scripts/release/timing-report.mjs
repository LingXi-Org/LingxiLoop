import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const timestamp = value => typeof value === 'number' ? value : Date.parse(value)
const seconds = (start,end) => Number.isFinite(timestamp(start)) && Number.isFinite(timestamp(end)) && timestamp(end)>=timestamp(start) ? (timestamp(end)-timestamp(start))/1000 : null
export function ciTiming(run, payload) {
  // GitHub's attempt endpoint can carry earlier successful jobs forward and
  // relabel their run_attempt. Their old execution is not rerun execution.
  const carried = payload.jobs.filter(job=>job.run_attempt!==run.run_attempt || job.conclusion!=='skipped' && timestamp(job.started_at)<timestamp(run.run_started_at))
  const jobs = payload.jobs.filter(job=>!carried.includes(job)).map(job=>({id:job.id,name:job.name,conclusion:job.conclusion,
    queueSeconds:job.conclusion==='skipped'?null:seconds(job.created_at,job.started_at),executionSeconds:job.conclusion==='skipped'?null:seconds(job.started_at,job.completed_at),
    steps:(job.steps??[]).map(step=>({name:step.name,conclusion:step.conclusion,seconds:step.conclusion==='skipped'?null:seconds(step.started_at,step.completed_at)}))}))
  return {runId:run.id,attempt:run.run_attempt,sha:run.head_sha,event:run.event,conclusion:run.conclusion,url:run.html_url,
    wallSeconds:seconds(run.run_started_at,run.updated_at),runnerSeconds:jobs.reduce((n,j)=>n+(j.executionSeconds??0),0),
    jobQueueSeconds:jobs.every(j=>j.conclusion==='skipped'||j.queueSeconds!==null)?jobs.reduce((n,j)=>n+(j.queueSeconds??0),0):null,
    approvalSeconds:null,productionAccepted:false,carriedJobIds:carried.map(job=>job.id),jobs}
}
export function releaseTiming(record) {
  const cp=record.checkpoint??record.progress??{},timings=cp.timings??{}
  const stages=Object.entries(timings).map(([stage,t])=>({stage,queueSeconds:seconds(t.queuedAt,t.startedAt),executionSeconds:seconds(t.startedAt,t.completedAt),lastError:t.lastError??null}))
  const hosts=Object.entries(record.targets??{}).filter(([,op])=>op&&op.operationId).map(([key,op])=>({key,operationId:op.operationId,generation:op.generation,status:op.status,
    observedWallSeconds:seconds(op.createdAt,op.updatedAt),controlReads:op.errors?.controlReads??null,
    steps:(op.steps??[]).map(s=>({name:s.name,status:s.status,seconds:seconds(s.startedAt,s.completedAt)}))}))
  return {releaseId:record.releaseId,appSha:record.appSha??record.manifest?.appSha,opsSha:record.opsSha??record.manifest?.opsSha,status:record.status,
    acceptedSample:record.status==='accepted',acceptedSeconds:record.status==='accepted'?seconds(record.createdAt,timings.accepted?.completedAt):null,
    observationSeconds:seconds(record.createdAt,record.updatedAt),manualInterventions:record.manualInterventions??null,
    workflowRetries:cp.retries?Object.values(cp.retries).reduce((a,b)=>a+b,0):null,dispatch:record.dispatch??null,stages,hosts}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const [kind,input,jobFile]=process.argv.slice(2),record=JSON.parse(readFileSync(input,'utf8'))
  if(!['ci','release'].includes(kind))throw Error('Expected ci <run.json> <attempt-jobs.json> or release <receipt.json>')
  console.log(JSON.stringify(kind==='ci'?ciTiming(record,JSON.parse(readFileSync(jobFile,'utf8'))):releaseTiming(record),null,2))
}
