const url = new URL(process.env.KOMODO_WEBHOOK_URL)
if(url.hostname !== 'ops.christmas1314.xyz') throw new Error('Unexpected control plane')
const headers = {'content-type':'application/json','x-api-key':process.env.KOMODO_API_KEY,'x-api-secret':process.env.KOMODO_API_SECRET}
async function read(operation,body={}) {
 const r=await fetch(new URL(`/read/${operation}`,url),{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
 if(!r.ok) throw new Error(`Read ${operation}: HTTP ${r.status}`)
 return r.json()
}


for(const stack of ['lingxiloop-app-a','lingxiloop-app-b']) {
 const services=await read('ListStackServices',{stack})
 console.log(JSON.stringify({stack,services:services.map(s=>({service:s.service,state:s.state,image:s.image,status:s.container?.status}))}))
}
const list=await read('ListUpdates')
for(const summary of (list.updates??[]).slice(0,15)) {
 const id=summary.id??summary._id?.$oid
 const update=await read('GetUpdate',{id})
 console.log(JSON.stringify({id,operation:update.operation,status:update.status,success:update.success,start_ts:update.start_ts}))
 for(const log of update.logs??[]) if(log.stage==='Compose Pull'&&!log.success) {
  let detail=String(log.stderr??'')+'\n'+String(log.stdout??'')
  detail=detail.replace(/https?:\/\/[^\s"']+/g,'[URL]').replace(/[A-Za-z0-9+/_=-]{40,}/g,'[opaque value]')
  for(const key of ['KOMODO_WEBHOOK_URL','KOMODO_API_KEY','KOMODO_API_SECRET']) if(process.env[key]) detail=detail.split(process.env[key]).join('[secret]')
  console.log(JSON.stringify({id,pullFailure:detail.slice(-500)}))
 }
}
