import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type CompanyStatus, companyStatusBelongsToType, transitionCompany } from '../domain/public.js'

test('Personal Company deletion does not reuse Education contract states', () => {
  assert.deepEqual(transitionCompany('PERSONAL', 'ACTIVE', 'REQUEST_USER_DELETION'), {
    outcome: 'APPLIED', from: 'ACTIVE', to: 'USER_DELETION_PENDING',
  })
  assert.deepEqual(transitionCompany('PERSONAL', 'USER_DELETION_PENDING', 'DELETE'), {
    outcome: 'APPLIED', from: 'USER_DELETION_PENDING', to: 'DELETED',
  })
  assert.equal(companyStatusBelongsToType('PERSONAL', 'GRACE_PERIOD'), false)
})

test('Education Company follows contract offboarding and retention in order', () => {
  const commands = [
    'ACTIVATE', 'ENTER_GRACE_PERIOD', 'ENTER_READ_ONLY', 'OFFBOARD',
    'ENTER_RETENTION', 'ARCHIVE', 'DELETE',
  ] as const
  let status: CompanyStatus = 'TRIAL'
  const visited: CompanyStatus[] = [status]
  for (const command of commands) {
    const transition = transitionCompany('EDUCATION', status, command)
    assert.notEqual(transition.outcome, 'INVALID')
    assert.ok(transition.to)
    status = transition.to
    visited.push(status)
  }
  assert.deepEqual(visited, [
    'TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'READ_ONLY', 'OFFBOARDED', 'RETENTION', 'ARCHIVED', 'DELETED',
  ])
  assert.deepEqual(transitionCompany('EDUCATION', 'ACTIVE', 'OFFBOARD'), {
    outcome: 'INVALID', from: 'ACTIVE', to: null,
  })
})

test('Company SUSPENDED is not part of the lifecycle contract', () => {
  assert.equal((['TRIAL', 'ACTIVE', 'DELETED'] as string[]).includes('SUSPENDED'), false)
})
