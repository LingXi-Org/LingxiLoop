import assert from 'node:assert/strict'
import test from 'node:test'
import {assertRuntimePatchTestTarget} from './bootstrap-runtime-patch-test-db.mjs'

test('source bootstrap rejects production, remote, overridden and untracked target names',()=>{
 const url='postgresql://postgres:fixture@127.0.0.1:5432/lingxiloop_test'
 const env={NODE_ENV:'test',DATABASE_URL:url,INTEGRATION_DATABASE_URL:url}
 assert.equal(assertRuntimePatchTestTarget(env),url)
 assert.throws(()=>assertRuntimePatchTestTarget({...env,NODE_ENV:'production'}))
 for(const target of [url.replace('127.0.0.1','db.example.test'),url.replace('lingxiloop_test','production_test'),url+'?host=remote',url.replace('5432','18438'),url.replace('lingxiloop_test','lingxiloop')]){
  assert.throws(()=>assertRuntimePatchTestTarget({...env,DATABASE_URL:target,INTEGRATION_DATABASE_URL:target}))
 }
 assert.throws(()=>assertRuntimePatchTestTarget({...env,DATABASE_URL:url.replace('lingxiloop_test','other_test')}))
})
