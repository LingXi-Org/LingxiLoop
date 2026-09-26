import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ContextScopedPermissionService } from '../modules/access/application.js'
import { evaluatePolicy, resourceAccessMode } from '../modules/access/policy.js'
import type { ResolvedAccessContext } from '../modules/access/public.js'

const ownerContext: ResolvedAccessContext = {
  actorUserId: 'owner',
  platformAdmin: false,
  company: { id: 'company', type: 'EDUCATION', status: 'ACTIVE' },
  companyMembership: { role: 'TEACHER', isAdmin: true, status: 'ACTIVE' },
  project: { id: 'project', kind: 'TEACHING', status: 'ACTIVE' },
  projectMembership: { role: 'TEACHER', status: 'ACTIVE' },
  effectivePlan: { id: 'plan', code: 'EDUCATION' },
  entitlements: { has: () => true, boolean: () => true, number: () => null, string: () => null },
}

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

test('users can edit their own Canvas frames after the workspace finishes', () => {
  const resource = {
    companyId: 'company',
    projectId: 'project',
    createdBy: 'owner',
    conversationMembers: ['owner'],
    leaderId: null,
    status: 'completed',
  }
  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'canvas:write', resource: { type: 'canvas_frame', id: 'frame' } },
    ownerContext,
    resource,
  ), 'ALLOWED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'other', action: 'canvas:write', resource: { type: 'canvas_frame', id: 'frame' } },
    { ...ownerContext, actorUserId: 'other' },
    resource,
  ), 'RESOURCE_STATE_DENIED')
})

test('platform administrators bypass tenant membership but not entitlements or resource state', () => {
  const platformContext: ResolvedAccessContext = {
    ...ownerContext,
    actorUserId: 'platform-admin',
    platformAdmin: true,
    companyMembership: { role: 'STUDENT', isAdmin: false, status: 'ACTIVE' },
    projectMembership: { role: 'STUDENT', status: 'ACTIVE' },
  }
  const privateConversation = {
    companyId: 'company',
    projectId: 'project',
    createdBy: 'other-user',
    visibilityScope: 'PRIVATE' as const,
    ownerUserId: 'other-user',
    conversationMembers: ['other-user'],
    leaderId: 'other-user',
    status: 'active',
  }
  assert.equal(evaluatePolicy(
    { actorUserId: 'platform-admin', action: 'conversation:read', resource: { type: 'conversation', id: 'private' } },
    platformContext,
    privateConversation,
  ), 'ALLOWED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'platform-admin', action: 'canvas:write', resource: { type: 'canvas', id: 'finished' } },
    platformContext,
    { ...privateConversation, visibilityScope: 'PROJECT', status: 'completed' },
  ), 'RESOURCE_STATE_DENIED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'platform-admin', action: 'conversation:read', resource: { type: 'conversation', id: 'private' } },
    { ...platformContext, entitlements: { ...platformContext.entitlements, has: () => false } },
    privateConversation,
  ), 'ENTITLEMENT_MISSING')
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
      type: 'EDUCATION',
    },
    project: { ...ownerContext.project!, kind, status },
  })
  assert.deepEqual([
    resourceAccessMode(withStatus('DRAFT')),
    resourceAccessMode(withStatus('ACTIVE')),
    resourceAccessMode(withStatus('COURSE_ENDED')),
    resourceAccessMode(withStatus('READ_ONLY')),
    resourceAccessMode(withStatus('RETENTION', 'INSTITUTIONAL_COURSE')),
    resourceAccessMode(withStatus('DELETED', 'INSTITUTIONAL_COURSE')),
  ], ['MANAGER_ONLY', 'READ_WRITE', 'CLOSE_OUT', 'READ_ONLY', 'RETENTION', 'DENY'])
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
    ['PERSONAL/TRIAL', context('PERSONAL' as never, 'TRIAL', 'PERSONAL_LEARNING' as never, 'ACTIVE'), 'COMPANY_STATE_DENIED'],
    [
      'EDUCATION/USER_DELETION_PENDING',
      context('EDUCATION', 'USER_DELETION_PENDING' as never, 'INSTITUTIONAL_COURSE', 'ACTIVE'),
      'COMPANY_STATE_DENIED',
    ],
    ['PERSONAL_LEARNING/DRAFT', context('EDUCATION', 'ACTIVE', 'PERSONAL_LEARNING' as never, 'DRAFT'), 'PROJECT_STATE_DENIED'],
    ['TEACHING/RETENTION', context('EDUCATION', 'ACTIVE', 'TEACHING', 'RETENTION'), 'PROJECT_STATE_DENIED'],
    [
      'INSTITUTIONAL_COURSE/TRANSFER_PENDING',
      context('EDUCATION', 'ACTIVE', 'INSTITUTIONAL_COURSE', 'TRANSFER_PENDING' as never),
      'PROJECT_STATE_DENIED',
    ],
    [
      'PERSONAL/INSTITUTIONAL_COURSE',
      context('PERSONAL' as never, 'ACTIVE', 'INSTITUTIONAL_COURSE', 'ACTIVE'),
      'COMPANY_STATE_DENIED',
    ],
    [
      'EDUCATION/PERSONAL_LEARNING',
      context('EDUCATION', 'ACTIVE', 'PERSONAL_LEARNING' as never, 'ACTIVE'),
      'PROJECT_STATE_DENIED',
    ],
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
    role: 'TEACHER' | 'STUDENT' = 'TEACHER',
  ): ResolvedAccessContext => {
    return {
      ...ownerContext,
      company: { ...ownerContext.company, type: 'EDUCATION' },
      companyMembership: { role, isAdmin: false, status: 'ACTIVE' },
      project: {
        ...ownerContext.project!,
        kind: 'INSTITUTIONAL_COURSE',
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
    ['TEACHER', 'TEACHER'],
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
      companyMembership: { role: companyRole, isAdmin: false, status: 'ACTIVE' },
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
    assert.equal(decide(companyStatus, projectStatus, 'STUDENT', 'STUDENT'), denial, label)
    for (const [companyRole, projectRole] of allowedRoles) {
      assert.equal(decide(companyStatus, projectStatus, companyRole, projectRole), 'ALLOWED', label)
    }
  }
})

test('ordinary teachers remain managers in MANAGER_ONLY Project contexts', () => {
  const context: ResolvedAccessContext = {
    ...ownerContext,
    company: { ...ownerContext.company, type: 'EDUCATION' },
    companyMembership: { role: 'STUDENT', isAdmin: false, status: 'ACTIVE' },
    project: { ...ownerContext.project!, kind: 'INSTITUTIONAL_COURSE', status: 'DRAFT' },
    projectMembership: { role: 'TEACHER', status: 'ACTIVE' },
  }

  assert.equal(evaluatePolicy(
    { actorUserId: 'owner', action: 'project:update', projectId: 'project' },
    context,
    null,
  ), 'ALLOWED')
})

test('teachers cannot submit as students', () => {
  assert.equal(evaluatePolicy({ actorUserId: 'owner', action: 'learning:submit', projectId: 'project' }, ownerContext, null), 'ROLE_NOT_ALLOWED')
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

test('company administrators manage course groups but do not inherit private email or direct-message membership', () => {
  const resource = { companyId:'company',projectId:'project',createdBy:null,conversationMembers:['someone-else'],leaderId:null,status:null }
  for (const conversationKind of ['email','direct']) {
    assert.equal(evaluatePolicy({actorUserId:'owner',action:'conversation:read',companyId:'company'},ownerContext,{...resource,conversationKind}),'RESOURCE_MEMBERSHIP_REQUIRED')
  }
  assert.equal(evaluatePolicy({actorUserId:'owner',action:'conversation:read',companyId:'company'},ownerContext,{...resource,conversationKind:'group'}),'ALLOWED')
})
