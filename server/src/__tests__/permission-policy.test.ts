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
  entitlements: { has: () => true, boolean: () => true, number: () => null, string: () => null },
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
    company: {
      ...ownerContext.company,
      type: kind === 'INSTITUTIONAL_COURSE' ? 'EDUCATION' : 'PERSONAL',
    },
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

test('invalid Company and Project lifecycle contexts fail closed with their owning state denial', () => {
  const context = (
    companyType: ResolvedAccessContext['company']['type'],
    companyStatus: ResolvedAccessContext['company']['status'],
    projectKind: NonNullable<ResolvedAccessContext['project']>['kind'],
    projectStatus: NonNullable<ResolvedAccessContext['project']>['status'],
  ): ResolvedAccessContext => ({
    ...ownerContext,
    company: { ...ownerContext.company, type: companyType, status: companyStatus },
    project: { ...ownerContext.project!, kind: projectKind, status: projectStatus },
  })
  const cases: Array<[
    string,
    ResolvedAccessContext,
    'COMPANY_STATE_DENIED' | 'PROJECT_STATE_DENIED',
  ]> = [
    ['PERSONAL/TRIAL', context('PERSONAL', 'TRIAL', 'PERSONAL_LEARNING', 'ACTIVE'), 'COMPANY_STATE_DENIED'],
    [
      'EDUCATION/USER_DELETION_PENDING',
      context('EDUCATION', 'USER_DELETION_PENDING', 'INSTITUTIONAL_COURSE', 'ACTIVE'),
      'COMPANY_STATE_DENIED',
    ],
    ['PERSONAL_LEARNING/DRAFT', context('PERSONAL', 'ACTIVE', 'PERSONAL_LEARNING', 'DRAFT'), 'PROJECT_STATE_DENIED'],
    ['TEACHING/RETENTION', context('PERSONAL', 'ACTIVE', 'TEACHING', 'RETENTION'), 'PROJECT_STATE_DENIED'],
    [
      'INSTITUTIONAL_COURSE/TRANSFER_PENDING',
      context('EDUCATION', 'ACTIVE', 'INSTITUTIONAL_COURSE', 'TRANSFER_PENDING'),
      'PROJECT_STATE_DENIED',
    ],
    [
      'PERSONAL/INSTITUTIONAL_COURSE',
      context('PERSONAL', 'ACTIVE', 'INSTITUTIONAL_COURSE', 'ACTIVE'),
      'PROJECT_STATE_DENIED',
    ],
    [
      'EDUCATION/PERSONAL_LEARNING',
      context('EDUCATION', 'ACTIVE', 'PERSONAL_LEARNING', 'ACTIVE'),
      'PROJECT_STATE_DENIED',
    ],
    ['EDUCATION/TEACHING', context('EDUCATION', 'ACTIVE', 'TEACHING', 'ACTIVE'), 'PROJECT_STATE_DENIED'],
  ]

  for (const [label, accessContext, denial] of cases) {
    assert.equal(resourceAccessMode(accessContext), 'DENY', label)
    assert.equal(evaluatePolicy(
      { actorUserId: 'owner', action: 'project:read', projectId: 'project' },
      accessContext,
      null,
    ), denial, label)
  }
})

test('close-out, transfer, read-only, and retention policies fail closed by action', () => {
  const context = (
    status: NonNullable<ResolvedAccessContext['project']>['status'],
    role: 'OWNER' | 'STUDENT' = 'OWNER',
  ): ResolvedAccessContext => {
    const transfer = status === 'TRANSFER_PENDING'
    return {
      ...ownerContext,
      company: { ...ownerContext.company, type: transfer ? 'PERSONAL' : 'EDUCATION' },
      companyMembership: { role: role === 'STUDENT' ? 'MEMBER' : 'OWNER', status: 'ACTIVE' },
      project: {
        ...ownerContext.project!,
        kind: transfer ? 'TEACHING' : 'INSTITUTIONAL_COURSE',
        status,
      },
      projectMembership: { role, status: 'ACTIVE' },
    }
  }
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
    { actorUserId: 'owner', action: 'project:request_transfer', projectId: 'project' },
    context('TRANSFER_PENDING'), null,
  ), 'ALLOWED')
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

test('retention and archived institutional reads require a Company manager or Project owner', () => {
  type CompanyStatus = ResolvedAccessContext['company']['status']
  type ProjectStatus = NonNullable<ResolvedAccessContext['project']>['status']
  type CompanyRole = ResolvedAccessContext['companyMembership']['role']
  type ProjectRole = NonNullable<ResolvedAccessContext['projectMembership']>['role']
  const restrictedStates: Array<[
    CompanyStatus,
    ProjectStatus,
    'COMPANY_STATE_DENIED' | 'PROJECT_STATE_DENIED',
  ]> = [
    ['RETENTION', 'ACTIVE', 'COMPANY_STATE_DENIED'],
    ['ACTIVE', 'RETENTION', 'PROJECT_STATE_DENIED'],
    ['ACTIVE', 'ARCHIVED', 'PROJECT_STATE_DENIED'],
  ]
  const allowedRoles: Array<[CompanyRole, ProjectRole]> = [
    ['OWNER', 'TEACHER'],
    ['ADMIN', 'TEACHER'],
    ['MEMBER', 'OWNER'],
  ]
  const decide = (
    companyStatus: CompanyStatus,
    projectStatus: ProjectStatus,
    companyRole: CompanyRole,
    projectRole: ProjectRole,
  ) => {
    const context: ResolvedAccessContext = {
      ...ownerContext,
      company: { ...ownerContext.company, type: 'EDUCATION', status: companyStatus },
      companyMembership: { role: companyRole, status: 'ACTIVE' },
      project: { ...ownerContext.project!, kind: 'INSTITUTIONAL_COURSE', status: projectStatus },
      projectMembership: { role: projectRole, status: 'ACTIVE' },
    }
    return evaluatePolicy(
      { actorUserId: 'owner', action: 'project:read', projectId: 'project' },
      context,
      null,
    )
  }

  for (const [companyStatus, projectStatus, denial] of restrictedStates) {
    const label = `${companyStatus}/${projectStatus}`
    assert.equal(decide(companyStatus, projectStatus, 'MEMBER', 'TEACHER'), denial, label)
    for (const [companyRole, projectRole] of allowedRoles) {
      assert.equal(decide(companyStatus, projectStatus, companyRole, projectRole), 'ALLOWED', label)
    }
  }
})

test('ordinary teachers remain managers in MANAGER_ONLY Project contexts', () => {
  const context: ResolvedAccessContext = {
    ...ownerContext,
    company: { ...ownerContext.company, type: 'EDUCATION' },
    companyMembership: { role: 'MEMBER', status: 'ACTIVE' },
    project: { ...ownerContext.project!, kind: 'INSTITUTIONAL_COURSE', status: 'DRAFT' },
    projectMembership: { role: 'TEACHER', status: 'ACTIVE' },
  }

  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'project:update', projectId: 'project' },
    context,
    null,
  ), 'ALLOWED')
})

test('Personal Project owners can submit learning without becoming teaching-course learners', () => {
  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'learning:submit', projectId: 'project' },
    ownerContext,
    null,
  ), 'ALLOWED')

  const teachingOwner: ResolvedAccessContext = {
    ...ownerContext,
    project: { ...ownerContext.project!, kind: 'TEACHING' },
  }
  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'learning:submit', projectId: 'project' },
    teachingOwner,
    null,
  ), 'ROLE_NOT_ALLOWED')
})

test('Company and Project lifecycle restrictions are both enforced', () => {
  const context: ResolvedAccessContext = {
    ...ownerContext,
    company: { ...ownerContext.company, type: 'EDUCATION', status: 'READ_ONLY' },
    project: { ...ownerContext.project!, kind: 'INSTITUTIONAL_COURSE', status: 'DELETED' },
  }

  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'project:read', projectId: 'project' },
    context, null,
  ), 'PROJECT_STATE_DENIED')
})
