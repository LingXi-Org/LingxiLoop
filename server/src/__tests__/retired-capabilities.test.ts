import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunVerificationContext } from '@lingxi-org/lingxios'
import { resolveRetiredDeliveries, verifyRetiredDeliveries, RETIRED_VISUALIZE_NOTICE } from '../agent-runtime/retired-capabilities.js'

function context(): RunVerificationContext {
  return { work: { id: 'old-run', tenantId: 'tenant' }, requestVersion: 1,
    candidate: { body: '已完成交互内容。', requestVersion: 1, artifacts: [] },
    skillActivations: [{ id: 'old-activation', tenantId: 'tenant', runId: 'old-run', requestVersion: 1,
      skill: { name: 'visualize', version: 'old', hash: 'a'.repeat(64) }, checker: 'product:visualize-delivery' }],
    unavailableSkillActivationIds: ['old-activation'], signal: new AbortController().signal,
  } as unknown as RunVerificationContext
}
test('an in-flight retired obligation requires honest non-delivery, then resolves without a new skill or guest', async () => {
  const c = context()
  assert.equal((await resolveRetiredDeliveries(c))[0].outcome, 'pending')
  assert.equal(verifyRetiredDeliveries(c)[0].status, 'failed')
  c.candidate.body = RETIRED_VISUALIZE_NOTICE + '\n\n保留有用的文字讲解。'
  const decision = (await resolveRetiredDeliveries(c))[0]
  assert.equal(decision.outcome, 'unsupported')
  assert.equal(decision.evidence.delivered, false)
  assert.equal(verifyRetiredDeliveries(c)[0].status, 'inconclusive', 'non-delivery cannot satisfy the old interactive task')
  c.unavailableSkillActivationIds = []
  assert.equal((await resolveRetiredDeliveries(c))[0].outcome, 'pending', 'native unavailability is required')
})
test('retirement resolution is bound to the exact current tenant, run and request', async () => {
  for (const patch of [{ tenantId: 'other' }, { runId: 'other' }, { requestVersion: 2 }, { checker: 'other' }, { skill: { name: 'design', version: 'v', hash: 'a'.repeat(64) } }]) {
    const c = context()
    c.skillActivations = [{ ...c.skillActivations[0], ...patch }]
    assert.deepEqual(await resolveRetiredDeliveries(c), [])
    assert.deepEqual(verifyRetiredDeliveries(c), [])
  }
})
test('cancellation stops retirement callbacks without touching durable data', async () => {
  const c = context(); c.signal = AbortSignal.abort()
  await assert.rejects(resolveRetiredDeliveries(c), /abort/i)
  assert.throws(() => verifyRetiredDeliveries(c), /abort/i)
})
