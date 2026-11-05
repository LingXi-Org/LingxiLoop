import assert from 'node:assert/strict'
import test from 'node:test'
import {serviceFailure,checkedServiceFailure,measurementFailure}from'./native-artifact-failure.mjs'
test('failed real services disclose only known source locations and setting names',()=>{
  const failure=serviceFailure({message:'LINGXIOS_R2_BUCKET missing; token=private-token; prompt=private-prompt',stack:'Error: private-token\n at secret (/runner/work/server/src/agent-runtime/runtime.ts:124:1)\n at private (/tmp/secret.ts:1:1)'})
  assert.deepEqual(failure,{sources:['agent-runtime/runtime.ts:124'],settings:['LINGXIOS_R2_BUCKET']})
  assert.deepEqual(checkedServiceFailure({...failure,sources:[...failure.sources,'private-token','../../private.ts:12']}),failure)
})
test('fatal measurement tracebacks expose only known script lines and exception classes',()=>{
  assert.deepEqual(measurementFailure('Traceback (most recent call last):\n  File "/runner/private/scripts/native-artifact-benchmark.py", line 444, in main\n    secretPrompt()\n  File "/tmp/secret-token.py", line 88\nTypeError: cookie=private-token prompt=private-prompt'),{sources:['native-artifact-benchmark.py:444'],exception:'TypeError'})
  assert.deepEqual(measurementFailure('private-token private-prompt'),{sources:[]})
})
