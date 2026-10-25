import test from 'node:test'
import assert from 'node:assert/strict'
import {assertLocalReadinessUrl} from './local-control.mjs'
const interfaces={lo:[{address:'127.0.0.1'}],eth1:[{address:'10.20.0.2'}]}
test('node readiness allows an HTTP literal proved to belong to this machine',()=>{
  assert.doesNotThrow(()=>assertLocalReadinessUrl(new URL('http://10.20.0.2:5183/api/readyz'),interfaces))
  assert.doesNotThrow(()=>assertLocalReadinessUrl(new URL('http://127.0.0.1:5183/api/readyz'),interfaces))
})
test('another private host or DNS name cannot replace actual local-node readiness',()=>{
  for(const url of ['http://10.20.0.3:5183/api/readyz','http://loop.example.invalid/api/readyz','http://private-node.example.invalid:5183/api/readyz'])assert.throws(()=>assertLocalReadinessUrl(new URL(url),interfaces),{code:'INVALID_POLICY'})
})
