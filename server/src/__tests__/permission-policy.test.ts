import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { PERMISSION_ACTIONS } from '../domain/access/public.js'
import { ContextScopedPermissionService } from '../modules/access/application.js'
import { PERMISSION_POLICIES, evaluatePolicy } from '../modules/access/policy.js'
import type { ResolvedAccessContext } from '../modules/access/public.js'

const ownerContext: ResolvedAccessContext = {
  actorUserId: 'owner',
  company: { id: 'company', type: 'PERSONAL', status: 'ACTIVE' },
  companyMembership: { role: 'OWNER', status: 'ACTIVE' },
  project: { id: 'project', kind: 'PERSONAL_LEARNING', status: 'active' },
  projectMembership: { role: 'OWNER', status: 'ACTIVE' },
  effectivePlan: { id: 'plan', code: 'PERSONAL_FREE' },
  entitlements: { has: () => true },
}

test('every canonical PermissionAction has one typed policy', () => {
  assert.deepEqual(Object.keys(PERMISSION_POLICIES).sort(), [...PERMISSION_ACTIONS].sort())
})

test('creator policies deny missing ownership facts instead of treating them as public', () => {
  assert.equal(evaluatePolicy(
    { actorUserId: 'student', action: 'knowledge:manage', projectId: 'project' },
    {
      ...ownerContext,
      actorUserId: 'student',
      projectMembership: { role: 'STUDENT', status: 'ACTIVE' },
    },
    {
      companyId: 'company',
      projectId: 'project',
      createdBy: null,
      conversationMembers: null,
      leaderId: null,
      status: null,
    },
  ), 'ROLE_NOT_ALLOWED')
})

test('runtime failures and unregistered actions fail closed without a context', async () => {
  const db: Queryable = {
    query: async () => { throw new Error('database unavailable') },
  }
  const decision = await new ContextScopedPermissionService(db).can({
    actorUserId: 'actor',
    action: 'unknown:action' as never,
  })
  assert.deepEqual(decision, { allowed: false, reason: 'DENY_BY_DEFAULT', context: null })
})
