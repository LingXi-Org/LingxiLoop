import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {once} from 'node:events'
import {createExecutorServer} from './server.mjs'
import {fixture} from './fixtures/fake-host.mjs'
import {fault} from './journal.mjs'

async function setup(t){
  const directory=await mkdtemp(join(tmpdir(),'operation-wait-')),f=fixture(directory),token='a'.repeat(40),dispatches=[]
  const server=createExecutorServer({executor:f.executor,token,dispatch:key=>{dispatches.push(key);return f.executor.run(key)}})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await server.waitForDispatch();f.journal.close();await rm(directory,{recursive:true,force:true})})
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'},base=`http://127.0.0.1:${server.address().port}`
  const get=(suffix='',options={})=>fetch(`${base}/operations?key=${encodeURIComponent(f.request('prepare').releaseId+':main-runtime-a:prepare')}${suffix}`,{headers,...options})
  return{...f,server,dispatches,headers,base,get}
}
test('authenticated same-key GET waits for real dispatched completion without another POST or dispatch',async t=>{
  const f=await setup(t),prepare=f.adapter.prepare.bind(f.adapter);let release
  const gate=new Promise(resolve=>{release=resolve});f.adapter.prepare=async(...args)=>{await gate;return prepare(...args)}
  const posted=await fetch(`${f.base}/operations`,{method:'POST',headers:f.headers,body:JSON.stringify(f.request('prepare'))}).then(r=>r.json())
  const start=Date.now(),pending=f.get('&waitSeconds=5');setTimeout(release,75)
  const response=await pending,result=await response.json()
  assert.equal(response.status,200);assert.equal(result.status,'succeeded');assert.equal(result.operationId,posted.operationId)
  assert.ok(Date.now()-start>=50);assert.ok(Date.now()-start<5000)
  assert.deepEqual(f.dispatches,[posted.key]);assert.equal(f.host.data.calls.some(args=>args.includes('stop')||args.includes('up')),false)
})
test('wait expiry returns the current unfinished journal without dispatch, and zero/default stays immediate',async t=>{
  const f=await setup(t),op=f.executor.submit(f.request('prepare')).operation;f.executor.active.add(op.key)
  for(const suffix of ['','&waitSeconds=0']){const start=Date.now();assert.equal((await f.get(suffix).then(r=>r.json())).status,'intent');assert.ok(Date.now()-start<1000)}
  const start=Date.now(),result=await f.get('&waitSeconds=0.1').then(r=>r.json())
  assert.ok(Date.now()-start>=80);assert.ok(Date.now()-start<1500);assert.equal(result.status,'intent');assert.equal(result.operationId,op.operationId)
  assert.deepEqual(f.dispatches,[]);assert.deepEqual(f.host.data.calls,[])
})
test('terminal and missing operations return immediately even with a 45-second bound',async t=>{
  const f=await setup(t);let start=Date.now();assert.equal((await f.get('&waitSeconds=45')).status,404);assert.ok(Date.now()-start<1000)
  await f.run('prepare');start=Date.now();assert.equal((await f.get('&waitSeconds=45').then(r=>r.json())).status,'succeeded');assert.ok(Date.now()-start<1000)
})
test('unknown interruption is observed read-only at the wait boundary, retaining earlier errors without replay',async t=>{
  const f=await setup(t),op=f.executor.submit(f.request('prepare')).operation
  f.journal.patch(op.key,{status:'uncertain',errors:{forward:{code:'ORIGINAL_UNKNOWN'},recovery:null,cleanup:[]}})
  let observations=0;f.adapter.observe=async()=>{observations++;if(observations===1)throw fault('OBSERVATION_UNRESOLVED','Not yet proven');return{offlineReady:true}}
  const response=await f.get('&waitSeconds=0.1').then(r=>r.json())
  assert.equal(response.status,'succeeded');assert.equal(response.errors.forward.code,'ORIGINAL_UNKNOWN');assert.equal(observations,2)
  assert.deepEqual(f.dispatches,[]);assert.deepEqual(f.host.data.calls,[])
})
test('GET authentication and finite wait/query limits are checked before touching the journal',async t=>{
  const f=await setup(t);let reads=0;f.executor.journal.get=()=>{reads++;return null}
  assert.equal((await f.get('&waitSeconds=45',{headers:{}})).status,401)
  for(const value of ['-1','46','45.001','NaN','Infinity','1e2','','0.0001'])assert.equal((await f.get(`&waitSeconds=${value}`)).status,400,value)
  for(const suffix of ['&waitSeconds=1&waitSeconds=2','&extra=1','&key=duplicate'])assert.equal((await f.get(suffix)).status,400,suffix)
  assert.equal(reads,0)
})
test('disconnecting an unfinished long GET releases its local wait without dispatching work',async t=>{
  const f=await setup(t),op=f.executor.submit(f.request('prepare')).operation;f.executor.active.add(op.key)
  const abort=new AbortController(),pending=f.get('&waitSeconds=45',{signal:abort.signal});setTimeout(()=>abort.abort(),40)
  await assert.rejects(pending);await new Promise(resolve=>setTimeout(resolve,280))
  assert.equal(f.journal.get(op.key).status,'intent');assert.deepEqual(f.dispatches,[])
})
