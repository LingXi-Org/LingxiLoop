const url = new URL(process.env.KOMODO_WEBHOOK_URL)
if(url.hostname !== 'ops.christmas1314.xyz') throw new Error('Unexpected control plane')
const headers = {'content-type':'application/json','x-api-key':process.env.KOMODO_API_KEY,'x-api-secret':process.env.KOMODO_API_SECRET}
async function read(operation,body={}) {
 const r=await fetch(new URL(`/read/${operation}`,url),{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
 if(!r.ok) throw new Error(`Read ${operation}: HTTP ${r.status}`)
 return r.json()
}
const list=await read('ListUpdates')
for(const summary of (list.updates??[]).slice(0,25)) {
 const id=summary.id??summary._id?.$oid
 const update=await read('GetUpdate',{id})
 const logs=update.logs??[]
 console.log(JSON.stringify({id,operation:update.operation,status:update.status,success:update.success,target:update.target,start_ts:update.start_ts,
  stages:logs.map(log=>({stage:log.stage,success:log.success,classifications:[...new Set((String(log.stderr??'')+' '+String(log.stdout??'')).match(/unauthorized|authentication required|denied|manifest unknown|no matching manifest|no space left on device|connection refused|connection reset|timed out|timeout|unhealthy|address already in use|port is already allocated|already in use|name conflict|no such image|pull access denied|exit code [0-9]+|404 Not Found|502 Bad Gateway|503 Service Unavailable/gi)??[])],updateIds:[...new Set((String(log.stdout??'')+' '+String(log.stderr??'')).match(/\b[a-f0-9]{24}\b/g)??[])]}))}))
}
