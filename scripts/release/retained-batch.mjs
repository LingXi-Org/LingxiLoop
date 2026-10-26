import {createHash} from 'node:crypto'
const fault=code=>Object.assign(Error(code),{code})
const hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
export function retainedBatches(objects){
 const batches=[];let batch=[],bytes=0
 const flush=()=>{if(batch.length)batches.push({items:batch});batch=[];bytes=0}
 for(const item of objects){
  if(!(item.size>0&&item.size<=256*1024)){flush();batches.push({single:item});continue}
  if(batch.length===8||bytes+item.size>256*1024)flush()
  batch.push(item);bytes+=item.size
 }
 flush();return batches
}
export async function transferRetainedBatches(objects,{retainedApiBase,retainedApiToken,upload,fetcher=fetch,requestPacer=fn=>fn(),now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms)),maxMs=960000,...options}){
 const base=new URL(retainedApiBase)
 if(base.protocol!=='https:'||base.pathname!=='/'||base.username||base.password||base.search||base.hash||!retainedApiToken)throw fault('RETAINED_API_CONFIGURATION_REQUIRED')
 const startedAt=now(),deadline=startedAt+maxMs,results=[];let requests=0,retries=0,completed=0
 const request=async(method,items,body,batchDeadline)=>{
  const remaining=batchDeadline-now();if(remaining<=0)throw fault('TRANSFER_DEADLINE_EXCEEDED')
  let response
  try{response=await requestPacer(()=>{
   const remaining=batchDeadline-now();if(remaining<=0)throw fault('TRANSFER_DEADLINE_EXCEEDED')
   requests++
   return fetcher(new URL('/v1/retained-assets',base),{method,redirect:'manual',signal:AbortSignal.timeout(Math.min(20000,remaining)),headers:{authorization:`Bearer ${retainedApiToken}`,'content-type':method==='POST'?'application/json':'application/octet-stream',...(method==='PUT'?{'x-lingxi-retained-inventory':JSON.stringify(items)}:{})},body:method==='POST'?JSON.stringify(items):body})
  })}
  catch(error){if(error.code==='TRANSFER_DEADLINE_EXCEEDED')throw error;throw Object.assign(fault('RETAINED_TRANSPORT_UNAVAILABLE'),{transient:true})}
  if(!response.ok){
   const value=response.headers.get('retry-after'),retryAfter=value?(/^\d+$/.test(value)?Number(value)*1000:Math.max(0,Date.parse(value)-now())):0
   await response.body?.cancel();throw Object.assign(fault('RETAINED_HTTP_'+response.status),{transient:[429,500,502,503,504].includes(response.status),retryAfter})
  }
  let record;try{record=await response.json()}catch{throw Object.assign(fault('RETAINED_RESPONSE_UNCONFIRMED'),{transient:true})}
  if(record.version!==1||!Array.isArray(record.results)||record.results.length!==items.length||new Set(record.results.map(x=>x.key)).size!==items.length||items.some(item=>!record.results.some(row=>row.key===item.key&&row.sha256===item.sha256&&row.size===item.size&&typeof row.present==='boolean'&&typeof row.reused==='boolean')))throw fault('RETAINED_EVIDENCE_MISMATCH')
  return record.results
 }
 try{
  for(const group of retainedBatches(objects)){
   if(now()>=deadline)throw fault('TRANSFER_DEADLINE_EXCEEDED')
   if(group.single){
    const item=group.single,result=await upload(item.key,typeof item.bytes==='function'?item.bytes():item.bytes,{...options,fetcher,requestPacer,now,wait,contentType:item.contentType,deadline:Math.min(deadline,now()+60000)})
    requests+=result.requests;retries+=result.retries;completed++;results.push({...result,status:'complete'});continue
   }
   const items=group.items.map(({key,sha256,size,contentType})=>({key,sha256,size,contentType})),batchDeadline=Math.min(deadline,now()+60000)
   let done=false
   for(let attempt=0;attempt<3&&!done;attempt++){
    try{
     const observed=await request('POST',items,null,batchDeadline),missing=items.filter(item=>!observed.find(row=>row.key===item.key).present)
     if(missing.length){
      const chunks=missing.map(item=>{const original=group.items.find(x=>x.key===item.key),bytes=typeof original.bytes==='function'?original.bytes():original.bytes;if(bytes.length!==item.size||hash(bytes)!==item.sha256)throw fault('RETENTION_SOURCE_CHANGED');return bytes})
      const written=await request('PUT',missing,Buffer.concat(chunks),batchDeadline)
      if(written.some(row=>!row.present))throw Object.assign(fault('RETAINED_RESPONSE_UNCONFIRMED'),{transient:true})
     }
     completed+=items.length;results.push({objects:items.length,reused:missing.length===0,status:'complete'});done=true
    }catch(error){
     if(!error.transient||attempt===2)throw error
     const delay=Math.max(error.retryAfter||0,250*2**attempt)
     if(now()+delay>=batchDeadline)throw fault('TRANSFER_RETRY_BUDGET_EXCEEDED')
     retries++;await wait(delay)
    }
   }
  }
  return {version:1,status:'complete',total:objects.length,completed,requests,retries,startedAt,completedAt:now(),elapsedMs:now()-startedAt,results}
 }catch(error){return {version:1,status:'failed',error:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'RETAINED_TRANSFER_FAILED',total:objects.length,completed,requests:requests+(error.requests??0),retries:retries+(error.retries??0),startedAt,completedAt:now(),elapsedMs:now()-startedAt,results}}
}
