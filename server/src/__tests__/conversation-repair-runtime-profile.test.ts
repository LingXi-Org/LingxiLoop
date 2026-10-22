import assert from 'node:assert/strict'
import test from 'node:test'
import { assertMigrationRuntime, PUBLIC_PURPOSE_SCHEMA_HASH } from '../db/runtime-profile.js'

const target={runtime:'3.8.2',schema:14,controlPlane:11,publicText:2,runTrace:1}
test('0053 requires exact formally published repair package and preserves previous profiles',()=>{
  assert.doesNotThrow(()=>assertMigrationRuntime(true,true,target,PUBLIC_PURPOSE_SCHEMA_HASH,true,true))
  for(const versions of [{...target,runtime:'3.8.0'},{...target,runtime:'3.8.1'},{...target,runtime:'3.8.3'},{...target,schema:15},{...target,controlPlane:12},{...target,publicText:1},{...target,runTrace:undefined}]){
    assert.throws(()=>assertMigrationRuntime(true,true,versions,PUBLIC_PURPOSE_SCHEMA_HASH,true,true),/0053 requires/)
  }
  assert.throws(()=>assertMigrationRuntime(true,true,target,'a'.repeat(64),true,true),/0053 requires/)
  assert.throws(()=>assertMigrationRuntime(false,true,target,PUBLIC_PURPOSE_SCHEMA_HASH,true,true),/0053 requires/)
  assert.throws(()=>assertMigrationRuntime(true,false,target,PUBLIC_PURPOSE_SCHEMA_HASH,true,true),/0053 requires/)
  assert.throws(()=>assertMigrationRuntime(true,true,target,PUBLIC_PURPOSE_SCHEMA_HASH,false,true),/0053 requires/)
  assert.throws(()=>assertMigrationRuntime(true,true,target,PUBLIC_PURPOSE_SCHEMA_HASH,true),/0052 requires/)
  assert.doesNotThrow(()=>assertMigrationRuntime(true,true,{...target,runtime:'3.8.0'},PUBLIC_PURPOSE_SCHEMA_HASH,true))
})
