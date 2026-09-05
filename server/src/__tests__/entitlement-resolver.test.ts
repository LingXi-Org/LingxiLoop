import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveEntitlements } from '../modules/access/entitlement-resolver.js'
import type { AccessRepository } from '../modules/access/repository.js'

test('typed entitlements preserve boolean, number, and string values without coercion', async () => {
  const repository = {
    plan: async () => ({ id: 'teacher-free', code: 'TEACHER_FREE', status: 'ACTIVE' }),
    entitlements: async () => [
      { code: 'teacher.expensive_compute', value: false },
      { code: 'teacher.project_limit', value: 3 },
      { code: 'teacher.compute_tier', value: 'free' },
    ],
  } as unknown as AccessRepository

  const resolution = await resolveEntitlements(repository, 'teacher-free')
  assert.equal(resolution.allowed, true)
  if (!resolution.allowed) return

  assert.deepEqual({
    expensiveCompute: resolution.entitlements.boolean('teacher.expensive_compute'),
    projectLimit: resolution.entitlements.number('teacher.project_limit'),
    computeTier: resolution.entitlements.string('teacher.compute_tier'),
    booleanDoesNotCoerceNumber: resolution.entitlements.boolean('teacher.project_limit'),
    hasRequiresTrueBoolean: resolution.entitlements.has('teacher.compute_tier'),
  }, {
    expensiveCompute: false,
    projectLimit: 3,
    computeTier: 'free',
    booleanDoesNotCoerceNumber: null,
    hasRequiresTrueBoolean: false,
  })
})
