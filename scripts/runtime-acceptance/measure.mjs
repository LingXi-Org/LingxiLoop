import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
const output=resolve(import.meta.dirname,'../../.e2e/image-acceptance')
const setup=JSON.parse(readFileSync(`${output}/setup.json`,'utf8'))
const duration=Number(process.env.ACCEPTANCE_PHASE_SECONDS??30)*1000
assert.ok(duration>=10000&&duration<=120000)
const latest=variant=>JSON.parse(readFileSync(`${output}/${variant}/process.jsonl`,'utf8').trim().split('\n').at(-1))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const percentile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)]:null
const result={startedAt:new Date().toISOString(),scope:'Production Web/API idle and safe GET /api/health load only; NOT model dialogue or Worker throughput.',
  setup,phaseSeconds:duration/1000,observer:'Same pg.Client.query and pg.Pool.connect counters, 64KiB allocation sampling and 5s process/GC sampling on both images.',phases:[]}
for(let round=0;round<3;round++) for(const workload of ['idle','normal-read','burst-read']) {
  for(const variant of round%2?['candidate','baseline']:['baseline','candidate']) {
    const before=latest(variant),latencies=[],statuses={}
    assert.ok(Date.now()-Date.parse(before.at)<10000,'Observer must be live')
    const started=performance.now(),deadline=started+duration
    const workers=workload==='burst-read'?8:workload==='normal-read'?1:0
    await Promise.all(Array.from({length:workers},async()=>{
      while(performance.now()<deadline) {
        const at=performance.now()
        let status='network-error'
        try {const response=await fetch(`http://127.0.0.1:${setup.images[variant].port}/api/health`,{signal:AbortSignal.timeout(5000)});status=String(response.status);await response.arrayBuffer()}
        catch {}
        statuses[status]=(statuses[status]??0)+1
        latencies.push(performance.now()-at)
        await delay(Math.max(0,200-(performance.now()-at)))
      }
    }))
    await delay(Math.max(0,deadline-performance.now()))
    const after=latest(variant),seconds=(after.monotonicMs-before.monotonicMs)/1000
    assert.equal(after.pid,before.pid,'Process must not restart during a phase')
    assert.ok(seconds>0)
    const phase={round,variant,workload,startedAt:before.at,finishedAt:after.at,seconds,requests:latencies.length,statuses,
      latencyMs:{p50:percentile(latencies,.5),p95:percentile(latencies,.95),p99:percentile(latencies,.99)},
      sqlPerSecond:(after.sqlSubmitted-before.sqlSubmitted)/seconds,
      cpuCoreFraction:((after.cpu.user+after.cpu.system)-(before.cpu.user+before.cpu.system))/1e6/seconds,
      heapUsedBefore:before.memory.heapUsed,heapUsedAfter:after.memory.heapUsed,rssAfter:after.memory.rss,
      gcCount:after.gcCount-before.gcCount,gcMs:after.gcMs-before.gcMs,poolsAfter:after.pools,
      acquireCompleted:after.acquire.completed-before.acquire.completed,acquireFailed:after.acquire.failed-before.acquire.failed,
      acquireTotalMs:after.acquire.totalMs-before.acquire.totalMs,
      acquireBoundsMs:after.acquire.boundsMs,acquireBuckets:after.acquire.buckets.map((value,index)=>value-before.acquire.buckets[index]),eventLoopAfter:after.eventLoop}
    result.phases.push(phase)
    writeFileSync(`${output}/comparison.json`,JSON.stringify(result,null,2))
    console.log(JSON.stringify({round,variant,workload,requests:phase.requests,sqlPerSecond:phase.sqlPerSecond,statuses}))
  }
}
result.finishedAt=new Date().toISOString()
result.complete=true
writeFileSync(`${output}/comparison.json`,JSON.stringify(result,null,2))
