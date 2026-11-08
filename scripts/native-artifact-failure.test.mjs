import assert from 'node:assert/strict'
import test from 'node:test'
import {serviceFailure,checkedServiceFailure,measurementFailure,transportFailure,checkedTransportFailures}from'./native-artifact-failure.mjs'
test('failed real services disclose only known source locations and setting names',()=>{
  const failure=serviceFailure({message:'LINGXIOS_R2_BUCKET missing; token=private-token; prompt=private-prompt',stack:'Error: private-token\n at secret (/runner/work/server/src/agent-runtime/runtime.ts:124:1)\n at private (/tmp/secret.ts:1:1)'})
  assert.deepEqual(failure,{sources:['agent-runtime/runtime.ts:124'],settings:['LINGXIOS_R2_BUCKET']})
  assert.deepEqual(checkedServiceFailure({...failure,sources:[...failure.sources,'private-token','../../private.ts:12','native-artifact-serve.mjs:private-token:31']}),failure)
})
test('fatal measurement tracebacks expose only known script lines and exception classes',()=>{
  assert.deepEqual(measurementFailure('Traceback (most recent call last):\n  File "/runner/private/scripts/native-artifact-benchmark.py", line 444, in main\n    secretPrompt()\n  File "/tmp/secret-token.py", line 88\nTypeError: cookie=private-token prompt=private-prompt'),{sources:['native-artifact-benchmark.py:444'],exception:'TypeError'})
  assert.deepEqual(measurementFailure('private-token private-prompt'),{sources:[]})
})

test('handled proxy failures retain only fixed stages, codes and owning source lines',()=>{
  const secret={message:'token=private-token prompt=private-prompt',code:'ECONNRESET',stack:'Error: private-token\n at f (/tmp/private-token.mjs:55:1)'}
  const location={stack:'Error\n at report (/runner/work/scripts/native-artifact-serve.mjs:31:4)'}
  const safe={stage:'response',code:'ECONNRESET',sources:['native-artifact-serve.mjs:31']}
  assert.deepEqual(transportFailure(secret,'response',location),safe)
  assert.deepEqual(checkedServiceFailure(serviceFailure(location)),{sources:safe.sources,settings:[]})
  assert.deepEqual(checkedTransportFailures([{...safe,count:2,message:secret.message},{stage:'private-token',code:'ECONNRESET'}, {...safe,code:'private-prompt'},{...safe,count:NaN,sources:['private-token','native-artifact-serve.mjs:private-token:31',...safe.sources]}]),[{...safe,count:2},{...safe,count:1}])
  assert.deepEqual(transportFailure(secret,'private-token',secret),{stage:'request',code:'ECONNRESET',sources:[]})
  assert.ok(!JSON.stringify(checkedTransportFailures([{...safe,count:2,message:secret.message}])).includes('private-'))
})
