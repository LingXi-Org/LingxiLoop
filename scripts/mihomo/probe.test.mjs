import test from 'node:test'
import assert from 'node:assert/strict'
import {probeSubscription} from './probe.mjs'
const env={MIHOMO_SUBSCRIPTION_URL:'https://private.example/secret?token=hidden',MIHOMO_SUBSCRIPTION_ORIGIN:'https://private.example'}
test('subscription probe reports HTTP failure once without secrets, redirect or TLS override',async()=>{
  let calls=0
  const result=await probeSubscription(env,{fetcher:async(_url,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response('private response',{status:503})}})
  assert.equal(calls,1);assert.equal(result.httpStatus,503);assert.equal(result.providerSaved,false);assert.equal(result.registryVerified,false)
  assert.doesNotMatch(JSON.stringify(result),/private|hidden|token/)
})
test('valid node list is read only and never counts as authenticated registry qualification',async()=>{
  const result=await probeSubscription(env,{fetcher:async()=>new Response('proxies:\n  - name: test\n    type: socks5\n    server: test.example\n    port: 443\n')})
  assert.equal(result.status,'subscription-validated');assert.equal(result.nodeCount,1);assert.equal(result.providerSaved,false);assert.equal(result.registryVerified,false)
})
