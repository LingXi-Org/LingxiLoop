import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {retainedBatches,transferRetainedBatches} from './retained-batch.mjs'
const item=(i,size=10)=>{const bytes=Buffer.alloc(size,i);return {key:`chunks/assets/a${i}-aaaaaaaa.js`,bytes,size,sha256:'sha256:'+createHash('sha256').update(bytes).digest('hex'),contentType:'text/javascript'}}
const options={retainedApiBase:'https://release.test',retainedApiToken:'private',wait:async()=>{},requestPacer:fn=>fn()}
test('batch bounds files/bytes and leaves large files on individually bounded transfer',()=>{
 const groups=retainedBatches([...Array.from({length:9},(_,i)=>item(i)),item(10,256*1024),item(11,256*1024+1)])
 assert.deepEqual(groups.map(g=>g.items?.length??'single'),[8,1,1,'single'])
})
test('lost batch PUT reconciles without rewriting complete objects; denied authorization stops once',async()=>{
 const objects=[item(1),item(2)],stored=new Set();let writes=0
 const fetcher=async(_url,init)=>{
  const items=JSON.parse(init.method==='POST'?init.body:init.headers['x-lingxi-retained-inventory'])
  if(init.method==='PUT'){writes++;for(const object of items)stored.add(object.key);throw Error('private lost response')}
  return Response.json({version:1,results:items.map(x=>({...x,present:stored.has(x.key),reused:stored.has(x.key)}))})
 }
 const result=await transferRetainedBatches(objects,{...options,fetcher})
 assert.equal(result.status,'complete');assert.equal(result.completed,2);assert.equal(writes,1);assert.equal(result.retries,1);assert.equal(result.requests,3)
 let calls=0;const denied=await transferRetainedBatches(objects,{...options,fetcher:async()=>{calls++;return new Response('',{status:403})}})
 assert.equal(denied.status,'failed');assert.equal(denied.requests,1);assert.equal(calls,1)
})
test('malformed identity, source drift and excessive Retry-After never become success',async()=>{
 const objects=[item(1)]
 const bad=await transferRetainedBatches(objects,{...options,fetcher:async()=>Response.json({version:1,results:[]})})
 assert.equal(bad.error,'RETAINED_EVIDENCE_MISMATCH')
 const drift={...objects[0],bytes:Buffer.alloc(10,8)}
 const result=await transferRetainedBatches([drift],{...options,fetcher:async()=>Response.json({version:1,results:[{...objects[0],present:false,reused:false}]})})
 assert.equal(result.error,'RETENTION_SOURCE_CHANGED');assert.equal(result.requests,1)
 const quota=await transferRetainedBatches(objects,{...options,fetcher:async()=>new Response('',{status:429,headers:{'retry-after':'1000'}})})
 assert.equal(quota.error,'TRANSFER_RETRY_BUDGET_EXCEEDED');assert.equal(quota.requests,1)
})
