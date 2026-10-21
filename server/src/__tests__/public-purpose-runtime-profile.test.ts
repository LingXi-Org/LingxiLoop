import assert from 'node:assert/strict'
import test from 'node:test'
import { assertMigrationRuntime, PUBLIC_PURPOSE_SCHEMA_HASH } from '../db/runtime-profile.js'

const target={runtime:'3.7.0',schema:14,controlPlane:11,publicText:2}
test('reader migration package qualification is exact; legacy0050 keeps its old runtime profile',()=>{
  assert.doesNotThrow(()=>assertMigrationRuntime(true,true,target,PUBLIC_PURPOSE_SCHEMA_HASH))
  for(const versions of [{...target,runtime:'3.6.0'},{...target,runtime:'3.7.1'},{...target,schema:15},{...target,controlPlane:12},{...target,publicText:1}]){
    assert.throws(()=>assertMigrationRuntime(true,true,versions,PUBLIC_PURPOSE_SCHEMA_HASH),/0051 requires/)
  }
  assert.throws(()=>assertMigrationRuntime(true,true,target,'a'.repeat(64)),/0051 requires/)
  assert.throws(()=>assertMigrationRuntime(false,true,target,PUBLIC_PURPOSE_SCHEMA_HASH),/0051 requires/)
  assert.throws(()=>assertMigrationRuntime(true,false,target),/0050 requires/)
  assert.doesNotThrow(()=>assertMigrationRuntime(true,false,{runtime:'3.6.0',schema:14,controlPlane:11}))
})
