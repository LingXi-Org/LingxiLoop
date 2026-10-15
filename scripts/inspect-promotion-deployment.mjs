const url = new URL(process.env.KOMODO_WEBHOOK_URL)
if(url.hostname !== 'ops.christmas1314.xyz') throw new Error('Unexpected control plane')
const headers = {'content-type':'application/json','x-api-key':process.env.KOMODO_API_KEY,'x-api-secret':process.env.KOMODO_API_SECRET}
async function read(operation,body={}) {
 const r=await fetch(new URL(`/read/${operation}`,url),{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
 if(!r.ok) throw new Error(`Read ${operation}: HTTP ${r.status}`)
 return r.json()
}

async function execute(operation,body) {
 const r=await fetch(new URL(`/execute/${operation}`,url),{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
 if(!r.ok) throw new Error(`Execute ${operation}: HTTP ${r.status}`)
 let u=await r.json();const id=u._id?.$oid
 if(!id) throw new Error('Missing update id')
 for(let i=0;u.status!=='Complete'&&i<60;i++) {await new Promise(r=>setTimeout(r,2000));u=await read('GetUpdate',{id})}
 console.log(JSON.stringify({operation,id,status:u.status,success:u.success}))
 if(u.status!=='Complete'||!u.success) throw new Error('Worker recovery failed')
}
for(const stack of ['lingxiloop-app-a','lingxiloop-app-b']) {
 const services=await read('ListStackServices',{stack})
 const worker=services.find(s=>s.service==='worker')
 if(worker?.state==='Exited') await execute('StartStack',{stack,services:['worker']})
 const after=await read('ListStackServices',{stack})
 console.log(JSON.stringify({stack,services:after.map(s=>({service:s.service,state:s.state,image:s.image,status:s.container?.status}))}))
}
