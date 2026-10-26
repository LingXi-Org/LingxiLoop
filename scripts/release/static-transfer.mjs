import { createHash } from 'node:crypto'
import { createR2RequestPacer, RETENTION_CONCURRENCY } from './r2-pacer.mjs'
const processPacer=createR2RequestPacer()

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fault = code => Object.assign(new Error(code), { code })
const transient = status => [429, 500, 502, 503, 504].includes(status)
const safeCode = error => /^[A-Z][A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'TRANSFER_FAILED'

// The R2 object itself is the durable checkpoint. Every retry and process
// restart reads and hashes it before considering another identical PUT.
export async function putImmutableObject(key, bytes, {
  account, bucket, token, contentType = 'application/octet-stream', fetcher = fetch,
  now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random,
  deadline = now() + 60_000,
  requestPacer = processPacer, lookupOnly = false,
} = {}) {
  if (!account || !bucket || !token) throw fault('R2_CONFIGURATION_MISSING')
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/objects/${key.split('/').map(encodeURIComponent).join('/')}`
  const startedAt = now(), expected = digest(bytes)
  let requests = 0, wrote = false, retryAfter = 0
  const request = async method => {
    if (now() >= deadline) throw fault('TRANSFER_DEADLINE_EXCEEDED')
    requests++
    let response
    try {
      response = await requestPacer(()=>{
        if(now()>=deadline)throw fault('TRANSFER_DEADLINE_EXCEEDED')
        return fetcher(url, { method, headers: { authorization: `Bearer ${token}`, ...(method === 'PUT' ? { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' } : {}) },
        ...(method === 'PUT' ? { body: bytes } : {}), redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, Math.min(20_000, deadline - now()))) })
      })
    } catch { throw fault('R2_TRANSPORT_UNAVAILABLE') }
    if (!response.ok && response.status !== 404) {
      const value = response.headers.get('retry-after')
      retryAfter = value ? Math.max(0, /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now()) : 0
      await response.body?.cancel()
      const error = fault(`R2_HTTP_${response.status}`); error.transient = transient(response.status); throw error
    }
    return response
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const existing = await request('GET')
      if (existing.ok) {
        let actual
        try { actual = digest(new Uint8Array(await existing.arrayBuffer())) } catch { throw fault('R2_TRANSPORT_UNAVAILABLE') }
        if (actual !== expected) throw fault('IMMUTABLE_ARTIFACT_CONFLICT')
        return { key, bytes: bytes.length, reused: !wrote, reconciled: wrote, retries: attempt, requests, startedAt, completedAt: now(), elapsedMs: now() - startedAt }
      }
      await existing.body?.cancel()
      if(lookupOnly)return {key,missing:true,requests,retries:attempt}
      wrote = true
      const response = await request('PUT')
      await response.body?.cancel()
      if (!response.ok) throw fault(`R2_HTTP_${response.status}`)
      return { key, bytes: bytes.length, reused: false, reconciled: false, retries: attempt, requests, startedAt, completedAt: now(), elapsedMs: now() - startedAt }
    } catch (error) {
      if (attempt === 2 || !(error.transient || error.code === 'R2_TRANSPORT_UNAVAILABLE')) throw Object.assign(error, { requests, retries: attempt })
      const delay = Math.max(retryAfter || 0, 250 * 2 ** attempt + Math.floor(random() * 250))
      if (now() + delay >= deadline) throw Object.assign(fault('TRANSFER_RETRY_BUDGET_EXCEEDED'), { requests, retries: attempt })
      await wait(delay)
    }
  }
}

export async function transferObjects(objects, { concurrency = RETENTION_CONCURRENCY, now = Date.now, maxMs = 960_000, upload = putImmutableObject, ...options } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || !Number.isFinite(maxMs) || maxMs <= 0 || maxMs > 960_000) throw fault('INVALID_TRANSFER_BUDGET')
  const startedAt = now(), deadline = startedAt + maxMs, results = []
  let next = 0, stopped = false
  const worker = async () => {
    while (!stopped && next < objects.length) {
      if (now() >= deadline) { stopped = true; break }
      const object = objects[next++]
      try { results.push({ ...await upload(object.key, typeof object.bytes === 'function' ? object.bytes() : object.bytes, { ...options, contentType: object.contentType, now, deadline: Math.min(deadline, now() + 60_000) }), status: 'complete' }) }
      catch (error) { stopped = true; results.push({ key: object.key, status: 'failed', error: safeCode(error), requests: error.requests ?? 0, retries: error.retries ?? 0 }) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, objects.length) }, worker))
  const completed = results.filter(item => item.status === 'complete').length, failed = results.length - completed
  return { version: 1, status: completed === objects.length ? 'complete' : 'failed', startedAt, completedAt: now(), elapsedMs: now() - startedAt,
    concurrency, total: objects.length, completed, failed, notStarted: objects.length - results.length,
    requests: results.reduce((sum, row) => sum + row.requests, 0), retries: results.reduce((sum, row) => sum + row.retries, 0), results }
}

// Complete group receipts bind the full sorted path/size/SHA256 inventory.
// Retained objects are never deleted or overwritten during publication.
export async function retainGroups(objects,options={}){
  const now=options.now??Date.now,startedAt=now(),deadline=startedAt+960_000,groups=new Map(),results=[]
  let completed=0,requests=0,retries=0
  for(const object of objects){const group=object.key.split('.').at(-1);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(object)}
  for(const [group,items]of groups){
    const proof=Buffer.from(JSON.stringify({version:1,objects:items.map(item=>({key:item.key,sha256:item.sha256,bytes:item.size})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)}))
    if(items.some(item=>!/^sha256:[a-f0-9]{64}$/.test(item.sha256??'')||!Number.isSafeInteger(item.size)))throw fault('RETENTION_INVENTORY_REQUIRED')
    const key=`retention/sha256/${digest(proof)}.json`,requestOptions={...options,deadline:Math.min(deadline,now()+60000),contentType:'application/json'}
    try{
      const existing=await putImmutableObject(key,proof,{...requestOptions,lookupOnly:true});requests+=existing.requests;retries+=existing.retries
      if(!existing.missing){completed+=items.length;results.push({group,objects:items.length,reusedGroup:true});continue}
      if(now()>=deadline)throw fault('TRANSFER_DEADLINE_EXCEEDED')
      const checked=items.map(item=>({...item,bytes:()=>{
        const bytes=typeof item.bytes==='function'?item.bytes():item.bytes
        if(bytes.length!==item.size||`sha256:${digest(bytes)}`!==item.sha256)throw fault('RETENTION_SOURCE_CHANGED')
        return bytes
      }}))
      const transferred=await transferObjects(checked,{...options,maxMs:deadline-now()});requests+=transferred.requests;retries+=transferred.retries;completed+=transferred.completed
      results.push({group,reusedGroup:false,...transferred})
      if(transferred.status!=='complete')throw fault('STATIC_TRANSFER_INCOMPLETE')
      const committed=await putImmutableObject(key,proof,{...requestOptions,deadline:Math.min(deadline,now()+60000)});requests+=committed.requests;retries+=committed.retries
    }catch(error){requests+=error.requests??0;retries+=error.retries??0;return{version:1,status:'failed',error:safeCode(error),startedAt,completedAt:now(),elapsedMs:now()-startedAt,total:objects.length,completed,requests,retries,results}}
  }
  return{version:1,status:'complete',startedAt,completedAt:now(),elapsedMs:now()-startedAt,total:objects.length,completed,requests,retries,results}
}
