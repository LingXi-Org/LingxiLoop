import assert from 'node:assert/strict'
import test from 'node:test'
import {
  projectTransferConditionsReady,
  transitionProjectTransfer,
} from '../domain/public.js'

test('Project Transfer requires every independent confirmation and target condition', () => {
  const ready = {
    teacherOwnerConfirmed: true,
    educationAdminConfirmed: true,
    targetMembershipActive: true,
    targetSeatActive: true,
    policyEnabled: true,
    policyVersionConfigured: true,
    legalBasisConfigured: true,
  }
  assert.equal(projectTransferConditionsReady(ready), true)
  for (const condition of Object.keys(ready) as Array<keyof typeof ready>) {
    assert.equal(projectTransferConditionsReady({ ...ready, [condition]: false }), false, condition)
  }
})

test('Project Transfer has retry-safe terminal transitions', () => {
  assert.deepEqual(transitionProjectTransfer('PENDING', 'MARK_READY'), {
    outcome: 'APPLIED', from: 'PENDING', to: 'READY',
  })
  assert.deepEqual(transitionProjectTransfer('READY', 'COMPLETE'), {
    outcome: 'APPLIED', from: 'READY', to: 'COMPLETED',
  })
  assert.deepEqual(transitionProjectTransfer('COMPLETED', 'COMPLETE'), {
    outcome: 'ALREADY_APPLIED', from: 'COMPLETED', to: 'COMPLETED',
  })
  assert.deepEqual(transitionProjectTransfer('PENDING', 'CANCEL'), {
    outcome: 'APPLIED', from: 'PENDING', to: 'CANCELLED',
  })
  assert.deepEqual(transitionProjectTransfer('READY', 'REJECT'), {
    outcome: 'APPLIED', from: 'READY', to: 'REJECTED',
  })
  assert.deepEqual(transitionProjectTransfer('PENDING', 'COMPLETE'), {
    outcome: 'INVALID', from: 'PENDING', to: null,
  })
})
