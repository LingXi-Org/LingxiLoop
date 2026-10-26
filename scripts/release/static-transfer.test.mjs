import test from 'node:test'
import assert from 'node:assert/strict'
import { putImmutableObject, transferObjects, retainGroups } from './static-transfer.mjs'
import {createHash} from 'node:crypto'

const options = { account: 'fixture', bucket: 'private', token: 'never-log', wait: async () => {}, random: () => 0,requestPacer:fn=>fn() }
test('lost PUT reply is reconciled by digest without repeating the write', async () => {
  let stored, writes = 0
  const receipt = await putImmutableObject('chunks/a.js', Buffer.from('exact'), { ...options, fetcher: async (_url, init) => {
    if (init.method === 'PUT') { stored = init.body; writes++; throw Error('secret transport') }
    return stored ? new Response(stored) : new Response(null, { status: 404 })
  } })
  assert.equal(writes, 1); assert.equal(receipt.reconciled, true); assert.equal(receipt.retries, 1)
  assert.equal(JSON.stringify(receipt).includes('secret'), false)
})
test('completed group receipt replaces per-file reads on restart, and changed bytes invalidate only that group',async()=>{
  const bytes=Buffer.from('exact'),sha256=`sha256:${createHash('sha256').update(bytes).digest('hex')}`,store=new Map(),calls=[]
  const objects=['a.woff2','b.woff2','c.js'].map(key=>({key:`chunks/${key}`,bytes,sha256,size:bytes.length}))
  const config={...options,fetcher:async(url,init)=>{calls.push({url,method:init.method});if(init.method==='PUT'){store.set(url,init.body);return new Response()}return store.has(url)?new Response(store.get(url)):new Response(null,{status:404})}}
  assert.equal((await retainGroups(objects,config)).status,'complete');calls.length=0
  const resumed=await retainGroups(objects,config);assert.equal(resumed.status,'complete');assert.equal(resumed.requests,2);assert.equal(calls.length,2);assert.ok(calls.every(x=>x.method==='GET'&&x.url.includes('/retention/')))
  const changed=Buffer.from('new'),next=[...objects.slice(0,2),{key:'chunks/new.js',bytes:changed,size:changed.length,sha256:`sha256:${createHash('sha256').update(changed).digest('hex')}`}]
  calls.length=0;assert.equal((await retainGroups(next,config)).status,'complete');assert.equal(calls.some(x=>x.url.includes('.woff2')),false)
})
test('retries are finite; authorization, immutable conflicts and long Retry-After stop', async () => {
  for (const status of [401, 403, 400, 429, 503]) {
    let calls = 0
    await assert.rejects(putImmutableObject('chunks/a.js', Buffer.from('exact'), { ...options, fetcher: async () => {
      calls++; return new Response(null, { status, headers: status === 429 ? { 'retry-after': '600' } : {} })
    } }))
    assert.equal(calls, status === 503 ? 3 : 1)
  }
  await assert.rejects(putImmutableObject('chunks/a.js', Buffer.from('exact'), { ...options, fetcher: async () => new Response('different') }), { code: 'IMMUTABLE_ARTIFACT_CONFLICT' })
})
test('bounded pool waits for in-flight work, stops scheduling after failure and records partial results', async () => {
  let active = 0, peak = 0, started = 0
  const result = await transferObjects(Array.from({ length: 12 }, (_, i) => ({ key: String(i), bytes: Buffer.from('x') })), {
    concurrency: 4, upload: async key => {
      active++; started++; peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, key === '0' ? 1 : 10)); active--
      if (key === '0') throw Object.assign(Error('private'), { code: 'R2_HTTP_403' })
      return { reused: true, retries: 0, requests: 1 }
    },
  })
  assert.equal(peak, 4); assert.equal(active, 0); assert.equal(started, 4)
  assert.equal(result.status, 'failed'); assert.equal(result.completed, 3); assert.equal(result.failed, 1); assert.equal(result.notStarted, 8)
  assert.equal(JSON.stringify(result).includes('private'), false)
})
test('warm rerun checks bytes, preserves completed objects and issues no PUT', async () => {
  const methods = []
  const receipt = await putImmutableObject('chunks/a.js', Buffer.from('exact'), { ...options, fetcher: async (_url, init) => { methods.push(init.method); return new Response('exact') } })
  assert.equal(receipt.reused, true); assert.deepEqual(methods, ['GET'])
})
test('failed group lookup retains actual request and retry counts',async()=>{
  const bytes=Buffer.from('exact'),sha256=`sha256:${createHash('sha256').update(bytes).digest('hex')}`
  const result=await retainGroups([{key:'chunks/a.js',bytes,size:bytes.length,sha256}],{...options,fetcher:async()=>new Response(null,{status:503})})
  assert.equal(result.status,'failed');assert.equal(result.requests,3);assert.equal(result.retries,2);assert.equal(result.completed,0)
})
