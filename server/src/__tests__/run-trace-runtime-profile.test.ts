import assert from 'node:assert/strict'
import test from 'node:test'
import { assertMigrationRuntime, PUBLIC_PURPOSE_SCHEMA_HASH } from '../db/runtime-profile.js'

const target={runtime:'3.8.0',schema:14,controlPlane:11,publicText:2,runTrace:1}
test('0052 requires the exact native trace package and preserves previous exact profiles',()=>{
  assert.doesNotThrow(()=>assertMigrationRuntime(true,true,target,PUBLIC_PURPOSE_SCHEMA_HASH,true))
  for(const versions of [{...target,runtime:'3.7.0'},{...target,runtime:'3.8.1'},{...target,schema:15},{...target,controlPlane:12},{...target,publicText:1},{...target,runTrace:undefined},{...target,runTrace:0},{...target,runTrace:2}]){
    assert.throws(()=>assertMigrationRuntime(true,true,versions,PUBLIC_PURPOSE_SCHEMA_HASH,true),/0052 requires/)
  }
  assert.throws(()=>assertMigrationRuntime(true,true,target,'a'.repeat(64),true),/0052 requires/)
  assert.throws(()=>assertMigrationRuntime(false,true,target,PUBLIC_PURPOSE_SCHEMA_HASH,true),/0052 requires/)
  assert.throws(()=>assertMigrationRuntime(true,false,target,PUBLIC_PURPOSE_SCHEMA_HASH,true),/0052 requires/)
  assert.throws(()=>assertMigrationRuntime(true,true,target,PUBLIC_PURPOSE_SCHEMA_HASH),/0051 requires/)
  assert.doesNotThrow(()=>assertMigrationRuntime(true,true,{...target,runtime:'3.7.0'},PUBLIC_PURPOSE_SCHEMA_HASH))
  assert.doesNotThrow(()=>assertMigrationRuntime(true,false,{runtime:'3.6.0',schema:14,controlPlane:11}))
})
