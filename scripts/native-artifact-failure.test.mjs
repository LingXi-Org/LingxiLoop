import assert from 'node:assert/strict'
import test from 'node:test'
import {serviceFailure,checkedServiceFailure}from'./native-artifact-failure.mjs'
test('failed real services disclose only known source locations and setting names',()=>{
  const failure=serviceFailure({message:'LINGXIOS_R2_BUCKET missing; token=private-token; prompt=private-prompt',stack:'Error: private-token\n at secret (/runner/work/server/src/agent-runtime/runtime.ts:124:1)\n at private (/tmp/secret.ts:1:1)'})
  assert.deepEqual(failure,{sources:['agent-runtime/runtime.ts:124'],settings:['LINGXIOS_R2_BUCKET']})
  assert.deepEqual(checkedServiceFailure({...failure,sources:[...failure.sources,'private-token','../../private.ts:12']}),failure)
})
