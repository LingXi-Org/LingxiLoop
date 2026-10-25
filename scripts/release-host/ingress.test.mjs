import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,rm,writeFile,readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Journal,fault } from './journal.mjs'
import { NginxIngress } from './ingress.mjs'
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(),'release-ingress-')), journal = new Journal(join(directory,'journal.sqlite'))
  const templateFile=join(directory,'template.conf'),outputFile=join(directory,'gateway.conf'),calls=[],states={ 'main-runtime-a':{ enabled:true,generation:0 },'main-runtime-b':{ enabled:true,generation:0 } }
  await writeFile(templateFile,'{{LINGXI_UPSTREAMS}}\nserver { listen 8091; {{LINGXI_INGRESS_STATES}} }')
  const policy={ container:'stable-gateway',templateFile,outputFile,backends:Object.fromEntries(Object.keys(states).map((target,index)=>[target,{ address:`10.20.0.${index+2}:5183`,observedUrl:`http://127.0.0.1:18091/state/${target}` }])) }
  const run=async args=>{ calls.push(args);if(args.includes('reload')) { const config=await readFile(outputFile,'utf8');for(const target of Object.keys(states)){ const line=config.split('\n').find(line=>line.includes(`/state/${target} `));states[target]=JSON.parse(line.match(/return 200 '([^']+)'/)[1]) } } return '' }
  const fetcher=async url=>new Response(JSON.stringify(states[new URL(url).pathname.split('/').at(-1)]),{ status:200 })
  const ingress=new NginxIngress({ journal,policy,run,fetcher,wait:async()=>{} })
  t.after(async()=>{journal.close();await rm(directory,{ recursive:true,force:true })})
  const request=(target,phase,enabled,generation=1)=>({ target,phase,enabled,generation,releaseId:'release-495' })
  return { directory,journal,ingress,states,calls,request,run }
}
test('stable gateway disables/restores each backend including recovery without recreation or stale-generation writes',async t=>{
  const f=await setup(t)
  await Promise.all([f.ingress.set(f.request('main-runtime-a','drain',false)),f.ingress.set(f.request('main-runtime-b','drain',false))])
  assert.equal(f.states['main-runtime-a'].enabled,false);assert.equal(f.states['main-runtime-b'].enabled,false)
  await f.ingress.set(f.request('main-runtime-a','undrain',true))
  await f.ingress.set(f.request('main-runtime-a','recovery-drain',false))
  await f.ingress.set(f.request('main-runtime-a','recovery-undrain',true))
  assert.equal(f.states['main-runtime-a'].enabled,true)
  assert.ok(f.calls.every(args=>args[0]==='exec' && args[1]==='stable-gateway' && args[2]==='nginx'))
  await f.ingress.set(f.request('main-runtime-a','drain',false,2))
  await assert.rejects(f.ingress.set(f.request('main-runtime-a','undrain',true,1)),{ code:'STALE_GENERATION' })
})
test('lost reload response is resolved from active Nginx generation without replay; unrelated unknown blocks shared config',async t=>{
  const f=await setup(t),original=f.ingress.run
  f.ingress.run=async args=>{await original(args);if(args.includes('reload'))throw Object.assign(fault('LOST_RESPONSE','Nginx response lost'),{ uncertain:true })}
  const request=f.request('main-runtime-a','drain',false)
  await assert.rejects(f.ingress.set(request))
  const before=f.calls.length
  assert.equal((await f.ingress.set(request)).enabled,false);assert.equal(f.calls.length,before)
  f.ingress.run=async()=>{throw fault('NO_RESPONSE','Unknown before reload')}
  await assert.rejects(f.ingress.set(f.request('main-runtime-b','drain',false)))
  await assert.rejects(f.ingress.set(f.request('main-runtime-a','undrain',true)),{ code:'INGRESS_OUTCOME_UNCERTAIN' })
})
