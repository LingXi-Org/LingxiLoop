import assert from 'node:assert/strict'
import { test } from 'node:test'
import { terminalRunTraceReference } from './terminalRunTrace'

test('terminal trace references bind run, request, fence and feedback without inventing legacy fences',()=>{
  const custom={runId:'run',requestVersion:2,terminalFeedbackId:'feedback',terminalStatus:'failed'}
  assert.deepEqual(terminalRunTraceReference(custom),{version:1,runId:'run',requestVersion:2,feedbackId:'feedback'})
  const reference={version:1,runId:'run',requestVersion:2,fence:3,feedbackId:'feedback'}
  assert.deepEqual(terminalRunTraceReference({...custom,runTraceReference:reference}),reference)
  for(const patch of [{runId:'other'},{requestVersion:3},{feedbackId:'other'},{fence:-1},{version:2}])
    assert.equal(terminalRunTraceReference({...custom,runTraceReference:{...reference,...patch}}),undefined)
  assert.equal(terminalRunTraceReference({...custom,terminalStatus:'succeeded'}),undefined)
})
