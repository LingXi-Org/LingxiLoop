import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { PERMISSION_ACTIONS } from '../domain/access/public.js'
import { ContextScopedPermissionService } from '../modules/access/application.js'
import { evaluatePolicy, PERMISSION_POLICIES, resourceAccessMode } from '../modules/access/policy.js'
import type { ResolvedAccessContext } from '../modules/access/public.js'

const ownerContext: ResolvedAccessContext = {
  actorUserId: 'owner',
  company: { id: 'company', type: 'PERSONAL', status: 'ACTIVE' },
  companyMembership: { role: 'OWNER', status: 'ACTIVE' },
  project: { id: 'project', kind: 'PERSONAL_LEARNING', status: 'ACTIVE' },
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

test('ResourceAccessMode centralizes Project lifecycle restrictions', () => {
  const withStatus = (
    status: NonNullable<ResolvedAccessContext['project']>['status'],
    kind: NonNullable<ResolvedAccessContext['project']>['kind'] = 'TEACHING',
  ): ResolvedAccessContext => ({
    ...ownerContext,
    project: { ...ownerContext.project!, kind, status },
  })
  assert.deepEqual([
    resourceAccessMode(withStatus('DRAFT')),
    resourceAccessMode(withStatus('ACTIVE')),
    resourceAccessMode(withStatus('COURSE_ENDED')),
    resourceAccessMode(withStatus('READ_ONLY')),
    resourceAccessMode(withStatus('TRANSFER_PENDING')),
    resourceAccessMode(withStatus('RETENTION', 'INSTITUTIONAL_COURSE')),
    resourceAccessMode(withStatus('DELETED', 'INSTITUTIONAL_COURSE')),
  ], ['MANAGER_ONLY', 'READ_WRITE', 'CLOSE_OUT', 'READ_ONLY', 'TRANSFER_PENDING', 'RETENTION', 'DENY'])
})

test('close-out, transfer, read-only, and retention policies fail closed by action', () => {
  const context = (status: NonNullable<ResolvedAccessContext['project']>['status'], role: 'OWNER' | 'STUDENT' = 'OWNER') => ({
    ...ownerContext,
    company: { ...ownerContext.company, type: 'EDUCATION' as const },
    companyMembership: { role: role === 'STUDENT' ? 'MEMBER' as const : 'OWNER' as const, status: 'ACTIVE' as const },
    project: { ...ownerContext.project!, kind: 'INSTITUTIONAL_COURSE' as const, status },
    projectMembership: { role, status: 'ACTIVE' as const },
  })
  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'project_invitation:create', projectId: 'project' },
    context('COURSE_ENDED'), null,
  ), 'PROJECT_STATE_DENIED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'learning:review', projectId: 'project' },
    context('COURSE_ENDED'), null,
  ), 'ALLOWED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'project_member:add', projectId: 'project' },
    context('TRANSFER_PENDING'), null,
  ), 'PROJECT_STATE_DENIED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'student', action: 'learning:submit', projectId: 'project' },
    context('TRANSFER_PENDING', 'STUDENT'), null,
  ), 'ALLOWED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'student', action: 'project:read', projectId: 'project' },
    context('RETENTION', 'STUDENT'), null,
  ), 'PROJECT_STATE_DENIED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'student', action: 'project:read', projectId: 'project' },
    context('ARCHIVED', 'STUDENT'), null,
  ), 'PROJECT_STATE_DENIED')
})

test('Company and Project lifecycle restrictions are both enforced', () => {
  const context: ResolvedAccessContext = {
    ...ownerContext,
    company: { ...ownerContext.company, status: 'READ_ONLY' },
    project: { ...ownerContext.project!, status: 'DELETED' },
  }

  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'project:read', projectId: 'project' },
    context, null,
  ), 'PROJECT_STATE_DENIED')
})
