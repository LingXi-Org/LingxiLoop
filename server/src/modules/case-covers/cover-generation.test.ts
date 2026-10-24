import assert from 'node:assert/strict'
import test from 'node:test'
import { createCaseCoverGenerator } from './cover-generation.js'
import { isolatedCoverRenderer } from './cover-renderer.js'
import { CaseCoverGenerationError } from './cover-validation.js'

// Failure modes: losing the failed source makes repair guess from scratch;
// treating previous source as instructions breaks the JSON data boundary;
// allowing another repair exceeds the single bounded repair budget.
test('one bounded repair carries the failed proposal as data and declares HL helper access', async () => {
  const failedProposal = JSON.stringify({ objectName:'router',rationale:'连接网络',altText:'路由器',figure:'hairline({});' })
  let calls = 0
  const generate = createCaseCoverGenerator({ renderer:isolatedCoverRenderer,
    assemble:async()=>{ throw new CaseCoverGenerationError('upstream_validation',['geometry']) },
    model:async ({system,user,attempt})=>{
      calls++
      assert.ok(/helpers through HL/.test(system),'HL helper access contract is explicit')
      assert.ok(system.includes('const { ringAt, seg, place, unproj } = HL'),'binding example uses published kernel helpers')
      assert.ok(/previous proposal.*untrusted data/.test(system),'previous proposal is data')
      const input = JSON.parse(user)
      if (attempt === 1) assert.equal(input.repair,undefined)
      else {
        assert.equal(attempt,2)
        assert.equal(input.repair.previousProposal,failedProposal)
        assert.equal(input.repair.category,'upstream_validation')
        assert.deepEqual(input.repair.checks,['geometry'])
      }
      return failedProposal
    } })
  await assert.rejects(generate({organizationId:'local',caseId:'case',jobId:'job',fingerprint:'fixture',
    generation:1,requestedBy:'teacher',snapshot:{title:'路由器',summary:'',category:'',tags:[],content:'连接网络'},signal:new AbortController().signal}),
    (error:unknown)=>error instanceof CaseCoverGenerationError && error.code==='upstream_validation')
  assert.equal(calls,2)
})
