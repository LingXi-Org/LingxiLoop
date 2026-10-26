// Controlled loopback experiment, NOT a Cloudflare/production speed claim.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { putImmutableObject, transferObjects } from './static-transfer.mjs'

const objects=Array.from({length:32},(_,index)=>({key:`chunks/fixture-${index}.js`,bytes:Buffer.alloc(16384,index)}))
const store=new Map(),server=createServer(async(req,res)=>{
  await new Promise(resolve=>setTimeout(resolve,10))
  if(req.method==='PUT'){const chunks=[];for await(const part of req)chunks.push(part);store.set(req.url,Buffer.concat(chunks));res.end();return}
  const body=store.get(req.url);res.writeHead(body?200:404);res.end(body)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${server.address().port}`,options={account:'fixture',bucket:'fixture',token:'fixture',requestPacer:fn=>fn(),fetcher:(remote,init)=>fetch(url+new URL(remote).pathname,init)}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
// Exact previous GET/hash/PUT sequence, without network or policy changes.
async function previous(key,bytes){
  const path=`https://api.cloudflare.com/client/v4/accounts/fixture/r2/buckets/fixture/objects/${key}`
  const response=await options.fetcher(path,{method:'GET'})
  if(response.ok){if(hash(new Uint8Array(await response.arrayBuffer()))!==hash(bytes))throw Error('conflict');return}
  if(response.status!==404)throw Error('lookup failed')
  const written=await options.fetcher(path,{method:'PUT',body:bytes});await written.arrayBuffer();if(!written.ok)throw Error('upload failed')
}
try{
  const rows=[]
  for(const cache of ['cold','warm'])for(let sample=1;sample<=3;sample++)for(const implementation of ['baseline-serial','bounded-four']){
    store.clear();if(cache==='warm')for(const object of objects)store.set(`/client/v4/accounts/fixture/r2/buckets/fixture/objects/${object.key}`,object.bytes)
    const started=performance.now()
    if(implementation==='baseline-serial')for(const object of objects)await previous(object.key,object.bytes)
    else {const receipt=await transferObjects(objects,{...options,concurrency:4,upload:putImmutableObject});if(receipt.status!=='complete')throw Error('benchmark failed')}
    rows.push({cache,sample,implementation,elapsedMs:Number((performance.now()-started).toFixed(3)),objects:objects.length,bytes:objects.reduce((n,x)=>n+x.bytes.length,0),retries:0,manualInterventions:0})
  }
  console.log(JSON.stringify({kind:'unpaced-pool-only-not-production',pacingExcluded:true,node:process.version,latencyMsPerRequest:10,rows},null,2))
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
