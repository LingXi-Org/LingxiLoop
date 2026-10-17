// Identical external observer for immutable baseline and candidate test images.
// No product/runtime implementation is patched. Raw heap snapshots stay private.
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { performance, PerformanceObserver, monitorEventLoopDelay } from 'node:perf_hooks'
import { getHeapStatistics, writeHeapSnapshot } from 'node:v8'
import { Session } from 'node:inspector'
const output = process.env.ACCEPTANCE_OUTPUT
if (!output?.startsWith('/acceptance-output/')) throw new Error('Observer requires disposable acceptance output')
mkdirSync(output, { recursive: true })
const require = createRequire('/app/package.json')
const pg = require('pg')
let sqlSubmitted = 0, gcCount = 0, gcMs = 0
const pools=[],seenPools=new WeakSet()
const acquire={completed:0,failed:0,totalMs:0,maxMs:0,boundsMs:[1,2,5,10,25,50,100,250,500,1000,2500,5000,10000],buckets:Array(14).fill(0)}
const connect=pg.Pool.prototype.connect
pg.Pool.prototype.connect=function(callback) {
  if(!seenPools.has(this)){seenPools.add(this);pools.push(new WeakRef(this))}
  const started=performance.now()
  const measured=error=>{const ms=performance.now()-started;acquire.completed++;if(error)acquire.failed++;acquire.totalMs+=ms;acquire.maxMs=Math.max(acquire.maxMs,ms);const index=acquire.boundsMs.findIndex(bound=>ms<=bound);acquire.buckets[index<0?13:index]++}
  if(typeof callback==='function') return Reflect.apply(connect,this,[function(error,...values){measured(error);return callback.call(this,error,...values)}])
  return Reflect.apply(connect,this,[]).then(value=>{measured();return value},error=>{measured(error);throw error})
}
const query = pg.Client.prototype.query
pg.Client.prototype.query = function (...args) { sqlSubmitted++; return Reflect.apply(query, this, args) }
const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable()
const gc = new PerformanceObserver(list => { for (const item of list.getEntries()) { gcCount++; gcMs += item.duration } })
gc.observe({ entryTypes: ['gc'] })
const inspector = new Session(); inspector.connect()
const post = (method, params = {}) => new Promise((resolve, reject) => inspector.post(method, params, (error,result) => error ? reject(error) : resolve(result)))
await post('HeapProfiler.startSampling', { samplingInterval: 65536 })
let sequence = 0
function sample(kind = 'heartbeat') {
  const row = { kind, sequence: sequence++, at: new Date().toISOString(), monotonicMs: performance.now(), pid: process.pid,
    uptime: process.uptime(), memory: process.memoryUsage(), heapLimit: getHeapStatistics().heap_size_limit,
    cpu: process.cpuUsage(), sqlSubmitted, gcCount, gcMs, acquire,
    pools:pools.flatMap(ref=>{const pool=ref.deref();return pool?[{total:pool.totalCount,idle:pool.idleCount,waiting:pool.waitingCount}]:[]}),
    eventLoop: { meanNs: Number.isFinite(lag.mean) ? lag.mean : 0, maxNs: lag.max, p99Ns: lag.percentile(99) } }
  appendFileSync(`${output}/process.jsonl`, `${JSON.stringify(row)}\n`, { mode: 0o644 })
}
let capturing = false
process.on('SIGUSR2', async () => {
  if (capturing) return
  capturing = true
  try {
    if (global.gc) global.gc()
    sample('post-gc')
    const profile = await post('HeapProfiler.getSamplingProfile')
    const stamp = Date.now()
    writeFileSync(`${output}/allocation-${stamp}.json`, JSON.stringify(profile), { mode: 0o600 })
    const heapFile=writeHeapSnapshot(`${output}/heap-${stamp}.heapsnapshot`)
    chmodSync(heapFile,0o600)
    sample('profile-complete')
  } finally { capturing = false }
})
sample('start')
const timer = setInterval(sample, 5000); timer.unref()
process.on('exit', () => sample('exit'))
