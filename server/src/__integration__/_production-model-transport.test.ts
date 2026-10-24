import assert from 'node:assert/strict'
import {test} from 'node:test'
import {installProductionModelTransport} from './_production-model-transport.js'

// Failure model: docs/evidence/issue-366/CI-PROVIDER-PROFILE-FAILURE-MODEL.md.
// No network or database: the fake fetch records only test inputs.
test('production-profile fixture transports exact requests locally and restores state',async()=>{
 const state={OPENAI_BASE_URL:'http://127.0.0.1:1/v1',OPENAI_MODEL:'before',OPENAI_API_KEY:'before-placeholder'}
 const prior={...state},requests:Array<{input:Parameters<typeof fetch>[0];init?:RequestInit}>=[]
 const reply=new Response('synthetic bytes',{status:200})
 const original=globalThis.fetch
 const fake:typeof fetch=async(input,init)=>{requests.push({input,init});return reply}
 globalThis.fetch=fake
 const signal=new AbortController().signal
 try{
  const transport=installProductionModelTransport(state,'http://127.0.0.1:12345/v1')
  assert.equal(state.OPENAI_BASE_URL,'https://api.siliconflow.cn/v1')
  assert.equal(state.OPENAI_MODEL,'deepseek-ai/DeepSeek-V4.1-Flash')
  assert.equal(state.OPENAI_API_KEY,'local-model-profile-fixture')
  const init={method:'POST',headers:{authorization:'Bearer local-model-profile-fixture'},body:'{"synthetic":true}',signal}
  assert.equal(await fetch(state.OPENAI_BASE_URL+'/chat/completions',init),reply)
  assert.equal(String(requests[0].input),'http://127.0.0.1:12345/v1/chat/completions')
  assert.equal(requests[0].init,init,'Original options/body/abort signal must be passed unchanged')
  await fetch('http://localhost:54321/v5/work/wait',{method:'POST',body:'{}',signal})
  assert.equal(String(requests[1].input),'http://localhost:54321/v5/work/wait')
  for(const url of ['https://example.com/chat/completions','https://api.siliconflow.cn/v1/other','https://api.siliconflow.cn/v1/chat/completions?x=1'])
   await assert.rejects(fetch(url,init),/fixture.*scope/)
  await assert.rejects(fetch(state.OPENAI_BASE_URL+'/chat/completions',{...init,headers:{authorization:'Bearer other-placeholder'}}),/fixture.*credential/)
  assert.equal(requests.length,2)
  assert.equal(transport.requests,1)
  transport.restore();assert.equal(globalThis.fetch,fake);assert.deepEqual(state,prior)
  transport.restore();assert.equal(globalThis.fetch,fake)
 }finally{globalThis.fetch=original}
})
test('production-profile fixture rejects nonlocal or ambiguous targets before mutation',()=>{
 const state={OPENAI_BASE_URL:'before',OPENAI_MODEL:'before',OPENAI_API_KEY:'fixture'}
 const original=globalThis.fetch
 for(const target of ['https://example.com/v1','http://127.0.0.1:1234/v1?q=1','http://127.0.0.1:1234/v1#x','http://user@127.0.0.1:1234/v1','http://localhost:1234/v1'])
  assert.throws(()=>installProductionModelTransport(state,target),/fixture.*target/)
 assert.deepEqual(state,{OPENAI_BASE_URL:'before',OPENAI_MODEL:'before',OPENAI_API_KEY:'fixture'})
 assert.equal(globalThis.fetch,original)
})
