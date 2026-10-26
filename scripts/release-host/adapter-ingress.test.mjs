import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fixture} from './fixtures/fake-host.mjs'

async function setup(t){
  const directory=await mkdtemp(join(tmpdir(),'ingress-readback-')),f=fixture(directory)
  t.after(async()=>{f.journal.close();await rm(directory,{recursive:true,force:true})})
  for(const[name,value]of Object.entries({tokenFile:'executor-private',accessClientIdFile:'access-id-private',accessClientSecretFile:'access-secret-private'})){
    const path=join(directory,name);await writeFile(path,value,{mode:0o600})
    for(const action of ['ingress','ingressState'])f.local.targets['main-runtime-a'].controls[action][name]=path
  }
  assert.equal((await f.run('prepare')).status,'succeeded')
  return f
}
test('transient recovery ingress read retries inside one operation without replaying a mutation',async t=>{
  const f=await setup(t),fetcher=f.adapter.fetcher;let failures=0,posts=0
  f.adapter.wait=async()=>{}
  f.adapter.fetcher=async(url,options)=>{
    if(options.method==='POST')posts++
    if(options.method==='GET'&&new URL(url).pathname==='/ingress'&&failures++===0)throw Error('private transport')
    return fetcher(url,options)
  }
  const result=await f.run('recovery-drain')
  assert.equal(result.status,'succeeded');assert.equal(posts,1)
  assert.equal(result.errors.controlReads.ingressState.retries,1)
  assert.equal(JSON.stringify(result).includes('private transport'),false)
})
test('read authorization is not retried and transient exhaustion records three attempts',async t=>{
  const f=await setup(t),local=f.local.targets['main-runtime-a'];f.adapter.wait=async()=>{}
  for(const status of [401,403,429,502]){
    let calls=0
    f.adapter.fetcher=async()=>{calls++;return new Response(null,{status})}
    await assert.rejects(f.adapter.control(local,'ingressState',f.request('prepare'),'GET'))
    assert.equal(calls,[429,502].includes(status)?3:1)
  }
})
for(const failure of ['502','transport'])test(`ingress ${failure} after effect is read back with the same authentication and completes the remaining maintenance drain`,async t=>{
  const f=await setup(t),fetcher=f.adapter.fetcher,calls=[]
  f.adapter.fetcher=async(url,options)=>{
    calls.push({url,options})
    const response=await fetcher(url,options)
    if(options.method==='POST'){
      if(failure==='transport')throw Error('private URL and token must not escape')
      return new Response('private upstream response',{status:502})
    }
    return response
  }
  const result=await f.run('recovery-drain')
  assert.equal(result.status,'succeeded',JSON.stringify(result))
  const step=result.steps.find(s=>s.name==='ingress-disable')
  assert.equal(step.observedAfterUnknown,true)
  assert.deepEqual(step.originalError,{code:failure==='502'?'CONTROL_REJECTED':'CONTROL_UNAVAILABLE',...(failure==='502'?{httpStatus:502}:{})})
  assert.deepEqual(f.journal.get(result.key).steps.find(s=>s.name==='ingress-disable').originalError,step.originalError)
  const post=calls.find(c=>c.options.method==='POST'),reads=calls.slice(calls.indexOf(post)+1).filter(c=>new URL(c.url).pathname==='/ingress')
  assert.equal(calls.filter(c=>c.options.method==='POST').length,1)
  assert.ok(reads.length>=1)
  for(const read of reads){assert.equal(read.options.method,'GET');assert.deepEqual(read.options.headers,post.options.headers);assert.equal(read.options.body,undefined)}
  assert.deepEqual(f.host.data.calls.filter(args=>args.includes('stop')).map(args=>args.at(-1)),['worker','web'])
  assert.ok(Object.values(f.host.data.containers).every(c=>!c.State.Running&&c.State.Pid===0))
  assert.equal(JSON.stringify(result).includes('private'),false)
  await f.run('recovery-drain');assert.equal(calls.filter(c=>c.options.method==='POST').length,1)
})
for(const mismatch of ['generation','enabled','query'])test(`unproven ${mismatch} after ingress 502 retains unknown intent and never stops Web or repeats POST`,async t=>{
  const f=await setup(t),fetcher=f.adapter.fetcher;let posted=false,posts=0
  f.adapter.fetcher=async(url,options)=>{
    if(options.method==='POST'){posts++;posted=true;await fetcher(url,options);return new Response(null,{status:502})}
    if(posted&&new URL(url).pathname==='/ingress'){
      if(mismatch==='query')throw Error('private query diagnostics')
      return Response.json({...f.host.data.ingress,[mismatch]:mismatch==='generation'?0:true})
    }
    return fetcher(url,options)
  }
  const result=await f.run('recovery-drain')
  assert.equal(result.status,'uncertain');assert.equal(result.errors.forward.code,'CONTROL_REJECTED')
  assert.match(result.errors.forward.message,/HTTP 502/)
  assert.deepEqual(f.host.data.calls.filter(args=>args.includes('stop')).map(args=>args.at(-1)),['worker'])
  assert.equal(result.steps.find(s=>s.name==='ingress-disable').status,'intent')
  await f.executor.reconcileStartup();assert.equal(posts,1)
})
test('authentication and other HTTP rejections never trigger an ingress readback',async t=>{
  const f=await setup(t),local=f.local.targets['main-runtime-a']
  for(const status of [401,403,400,409,429]){
    const calls=[];f.adapter.fetcher=async(url,options)=>{calls.push({url,options});return new Response(null,{status})}
    await assert.rejects(f.adapter.control(local,'ingress',{...f.request('recovery-drain'),enabled:false}),{code:'CONTROL_REJECTED'})
    assert.deepEqual(calls.map(c=>c.options.method),['POST'])
  }
})
test('readback never changes authentication or endpoint to recover a failed mutation',async t=>{
  for(const mismatch of ['url','tokenFile']){
    const f=await setup(t),local=f.local.targets['main-runtime-a'];local.controls.ingressState[mismatch]=mismatch==='url'?'https://different.example/ingress':'/different/trusted-token'
    const calls=[];f.adapter.fetcher=async(url,options)=>{calls.push({url,options});return new Response(null,{status:502})}
    await assert.rejects(f.adapter.control(local,'ingress',{...f.request('drain'),enabled:false}),{code:'CONTROL_REJECTED'})
    assert.equal(calls.length,1)
  }
})
test('ingress enable uses the same exact-generation proof and malformed successful bodies never trigger reconciliation',async t=>{
  const f=await setup(t),local=f.local.targets['main-runtime-a'],fetcher=f.adapter.fetcher,calls=[]
  f.adapter.fetcher=async(url,options)=>{calls.push(options.method);const response=await fetcher(url,options);return options.method==='POST'?new Response(null,{status:503}):response}
  const result=await f.adapter.control(local,'ingress',{...f.request('recovery-undrain',5),enabled:true})
  assert.equal(result.observedAfterUnknown,true);assert.equal(result.generation,5);assert.equal(result.enabled,true);assert.deepEqual(calls,['POST','GET'])
  calls.length=0;f.adapter.fetcher=async(_url,options)=>{calls.push(options.method);return new Response('invalid private JSON')}
  await assert.rejects(f.adapter.control(local,'ingress',{...f.request('drain',5),enabled:false}),{code:'CONTROL_INVALID_RESPONSE'})
  assert.deepEqual(calls,['POST'])
})
