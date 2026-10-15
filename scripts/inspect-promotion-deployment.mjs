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
for(const id of ['6ad10c09d8838102d0fa5c74','6ad10b7bd8838102d0fa5c4b']) {
 const update=await read('GetUpdate',{id})
 for(const log of update.logs??[]) if(log.stage==='Compose Pull'&&!log.success) {
  let detail=String(log.stderr??'')+'\n'+String(log.stdout??'')
  detail=detail.replace(/https?:\/\/[^\s"']+/g,'[URL]').replace(/[A-Za-z0-9+/_=-]{40,}/g,'[opaque value]')
  for(const key of ['KOMODO_WEBHOOK_URL','KOMODO_API_KEY','KOMODO_API_SECRET']) if(process.env[key]) detail=detail.split(process.env[key]).join('[secret]')
  console.log(JSON.stringify({id,pullFailure:detail.slice(-2500)}))
 }
}
for(const stack of ['lingxiloop-app-a','lingxiloop-app-b']) {
 const info=await read('GetStack',{stack})
 console.log(JSON.stringify({stack,id:info._id?.$oid,state:info.info?.state}))
 const status=await read('ListStackServices',{stack})
 console.log(JSON.stringify({stack,services:status}))
}
