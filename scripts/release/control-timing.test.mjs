import test from 'node:test'
import assert from 'node:assert/strict'
import { ciTiming, releaseTiming } from './timing-report.mjs'

test('skipped and negative provider timestamps cannot inflate execution or imply approval', () => {
  const report = ciTiming({id:1,run_attempt:2,run_started_at:'2026-10-26T00:00:00Z',updated_at:'2026-10-26T00:00:10Z',conclusion:'success'}, {jobs:[
    {id:1,name:'build',run_attempt:2,conclusion:'success',created_at:'2026-10-26T00:00:01Z',started_at:'2026-10-26T00:00:02Z',completed_at:'2026-10-26T00:00:08Z',steps:[]},
    {id:2,name:'deploy',run_attempt:2,conclusion:'skipped',started_at:'2026-10-26T00:00:09Z',completed_at:'2026-10-26T00:00:08Z',steps:[]},
    {id:3,name:'previous attempt',run_attempt:1,conclusion:'success',started_at:'2026-10-26T00:00:00Z',completed_at:'2026-10-26T00:00:50Z',steps:[]},
    {id:4,name:'relabeled old job',run_attempt:2,conclusion:'success',started_at:'2026-10-25T23:59:00Z',completed_at:'2026-10-25T23:59:30Z',steps:[]},
  ]})
  assert.equal(report.runnerSeconds,6);assert.equal(report.jobQueueSeconds,1)
  assert.equal(report.approvalSeconds,null);assert.equal(report.productionAccepted,false)
  assert.deepEqual(report.carriedJobIds,[3,4])
})
test('blocked and recovered releases are never accepted timing samples',()=>{
  for(const status of ['blocked','recovered','active']){
    const result=releaseTiming({status,createdAt:1000,updatedAt:5000,progress:{timings:{prepare:{queuedAt:1000,startedAt:2000,completedAt:4000}}},targets:{}})
    assert.equal(result.acceptedSample,false);assert.equal(result.acceptedSeconds,null)
    assert.equal(result.stages[0].executionSeconds,2);assert.equal(result.stages[0].queueSeconds,1)
  }
})
