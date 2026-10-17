import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import pg from 'pg'
const root=resolve(process.env.ACCEPTANCE_OUTPUT??resolve(import.meta.dirname,'../../.e2e/image-acceptance'))
assert.ok(root.startsWith('/workspace/'))
const setup=JSON.parse(readFileSync(`${root}/setup.json`,'utf8'))
const output=`${root}/soak`,name='lingxiloop-acceptance-candidate'
assert.equal(setup.images.candidate.name,name)
assert.equal(setup.images.candidate.release.runtime,'3.5.1')
mkdirSync(output,{recursive:true})
assert.ok(!existsSync(`${output}/state.json`),'Do not overwrite or resume an earlier incomplete soak')
const inspect=()=>{const r=spawnSync('docker',['inspect','--format','{{json .State}} {{.RestartCount}} {{.Image}}',name],{encoding:'utf8'});assert.equal(r.status,0);const end=r.stdout.lastIndexOf('}');return {state:JSON.parse(r.stdout.slice(0,end+1)),restartCount:Number(r.stdout.slice(end+2).split(' ')[0]),image:r.stdout.trim().split(' ').at(-1)}}
const initial=inspect(),started=performance.now(),startedAt=new Date().toISOString(),targetSeconds=86400
const state={status:'running',scope:'Isolated immutable production Web/API only; no Worker, model dialogue, live provider or production deployment qualification.',
  startedAt,earliestCompletionAt:new Date(Date.now()+targetSeconds*1000).toISOString(),targetSeconds,
  image:setup.images.candidate.image,limits:setup.limits,initialStartedAt:initial.state.StartedAt,initialRestartCount:initial.restartCount,
  samples:0,elapsedSeconds:0,lastHeartbeatAt:null,violations:[]}
const save=()=>{writeFileSync(`${output}/state.tmp`,JSON.stringify(state,null,2));renameSync(`${output}/state.tmp`,`${output}/state.json`)}
const db=new pg.Client({connectionString:`postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/${setup.images.candidate.database}`,statement_timeout:5000,connectionTimeoutMillis:5000})
await db.connect()
db.on('error',()=>{state.violations.push('database-connection-error');save()})
let previous=started,closing=false
const violation=reason=>{if(!state.violations.includes(reason))state.violations.push(reason)}
save()
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{if(closing)return;closing=true;state.status='incomplete';state.elapsedSeconds=(performance.now()-started)/1000;save();process.exit(1)})
try {
  for(;;) {
    const now=performance.now(),row={at:new Date().toISOString(),elapsedSeconds:(now-started)/1000}
    if(now-previous>90000)violation('heartbeat-gap-over-90s')
    previous=now
    try {
      const current=inspect()
      row.container={running:current.state.Running,oomKilled:current.state.OOMKilled,exitCode:current.state.ExitCode,startedAt:current.state.StartedAt,restartCount:current.restartCount}
      if(!current.state.Running||current.state.OOMKilled)violation('container-not-running-or-oom')
      if(current.state.StartedAt!==initial.state.StartedAt||current.restartCount!==initial.restartCount||current.image!==initial.image)violation('container-restarted-or-image-changed')
      row.health={}
      for(const endpoint of ['livez','readyz']) {
        const response=await fetch(`http://127.0.0.1:${setup.images.candidate.port}/api/${endpoint}`,{signal:AbortSignal.timeout(5000)})
        row.health[endpoint]=response.status;await response.body?.cancel()
        if(response.status!==200)violation(`health-${endpoint}-failed`)
      }
      const metric=JSON.parse(readFileSync(`${root}/candidate/process.jsonl`,'utf8').trim().split('\n').at(-1))
      row.process={at:metric.at,uptime:metric.uptime,memory:metric.memory,pools:metric.pools,sqlSubmitted:metric.sqlSubmitted,gcCount:metric.gcCount,gcMs:metric.gcMs,acquire:metric.acquire,cpu:metric.cpu}
      if(Date.now()-Date.parse(metric.at)>15000)violation('process-observer-stale')
      if(metric.acquire.failed>0)violation('pool-acquisition-failed')
      const queues=await db.query(`SELECT
        (SELECT count(*)::int FROM lingxios.agent_work_items WHERE status IN ('queued','leased')) AS active_work,
        (SELECT count(*)::int FROM lingxios.agent_delivery_outbox WHERE delivered_at IS NULL AND failed_at IS NULL) AS pending_result,
        (SELECT count(*)::int FROM lingxios.agent_terminal_outbox WHERE delivered_at IS NULL AND failed_at IS NULL) AS pending_terminal,
        (SELECT count(*)::int FROM lingxios.agent_run_events WHERE delivery_work IS NOT NULL AND delivered_at IS NULL AND failed_at IS NULL) AS pending_delivery_events`)
      row.queues=queues.rows[0]
      if(Object.values(row.queues).some(n=>n!==0))violation('unexpected-work-in-empty-fixture')
    } catch {row.error='isolated-soak-sample-failed';violation(row.error)}
    appendFileSync(`${output}/heartbeats.jsonl`,JSON.stringify(row)+'\n')
    state.samples++;state.elapsedSeconds=(performance.now()-started)/1000;state.lastHeartbeatAt=row.at;save()
    if(state.elapsedSeconds>=targetSeconds)break
    await new Promise(resolve=>setTimeout(resolve,Math.min(60000,targetSeconds*1000-(performance.now()-started))))
  }
  state.status=state.violations.length?'failed':'complete-scoped-pass'
  state.finishedAt=new Date().toISOString();save()
  writeFileSync(`${output}/terminal-receipt.json`,JSON.stringify(state,null,2))
} finally {await db.end()}
