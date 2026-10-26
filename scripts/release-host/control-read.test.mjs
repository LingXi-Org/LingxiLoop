import test from 'node:test'
import assert from 'node:assert/strict'
import {controlRead} from './control-read.mjs'

test('read retry honors original deadline and Retry-After without sleeping beyond budget',async()=>{
  for(const retryAfter of ['60',new Date(60_000).toUTCString()]){
    let calls=0,waits=0;const receipts=[]
    await assert.rejects(controlRead('https://fixed.test',{},'ingressState',{now:()=>0,timeoutMs:10000,record:r=>receipts.push(r),wait:async()=>{waits++},fetcher:async()=>{calls++;return new Response(null,{status:429,headers:{'retry-after':retryAfter}})}}),{code:'CONTROL_REJECTED',uncertain:false})
    assert.equal(calls,1);assert.equal(waits,0);assert.equal(receipts[0].attempts,1)
  }
})
test('total timeout is shared by attempts and malformed evidence is never retried',async()=>{
  let clock=0,calls=0;const signals=[],receipts=[]
  const value=await controlRead('https://fixed.test',{},'ingressState',{now:()=>clock,timeoutMs:1000,random:()=>0,wait:async ms=>{clock+=ms},record:r=>receipts.push(r),fetcher:async(_url,init)=>{
    signals.push(init.signal);calls++;clock+=100;if(calls===1)throw Error('private');return Response.json({enabled:false,generation:1})
  }})
  assert.equal(value.generation,1);assert.equal(calls,2);assert.equal(receipts[0].elapsedMs,450);assert.equal(receipts[0].retries,1)
  calls=0
  await assert.rejects(controlRead('https://fixed.test',{},'ingressState',{fetcher:async()=>{calls++;return new Response('invalid')} }),{code:'CONTROL_INVALID_RESPONSE'})
  assert.equal(calls,1)
})
