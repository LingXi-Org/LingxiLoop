import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { evaluatePolicy } from '../modules/access/policy.js'
import { listActiveActorProjectScopes, type ResolvedAccessContext } from '../modules/access/public.js'
import {
  learningLearnersQuerySchema,
  learningOverviewQuerySchema,
  learningSpacesQuerySchema,
} from '../modules/learning/contracts.js'
import {
  findLearningAttemptDetail,
  learningLifecycleAction,
  learningPerspective,
  listLearningSpaceRows,
  loadLearnerOverviewRows,
} from '../modules/learning/dashboard-repository.js'
import {
  listLearningDashboardLearnerRows,
  loadLearningDashboardTeacherOverviewRows,
} from '../modules/learning/teacher-reporting-repository.js'

function recordingDb() {
  const calls: Array<{ text: string; params?: readonly unknown[] }> = []
  const db = {
    async query<T>(text: string, params?: readonly unknown[]) {
      calls.push({ text, params })
      return { rows: [] as T[], rowCount: 0 }
    },
  } as Queryable
  return { db, calls }
}

test('learning dashboard query contracts are bounded and parse false without coercing it to true', () => {
  assert.deepEqual(learningSpacesQuerySchema.parse({}), { limit: 30 })
  assert.deepEqual(learningOverviewQuerySchema.parse({}), { windowDays: 30 })
  assert.deepEqual(learningLearnersQuerySchema.parse({ attentionOnly: 'false' }), {
    limit: 30,
    attentionOnly: false,
  })
  assert.deepEqual(learningLearnersQuerySchema.parse({ search: '  learner@example.com  ' }), {
    limit: 30,
    attentionOnly: false,
    search: 'learner@example.com',
  })
  assert.equal(learningSpacesQuerySchema.safeParse({ limit: 101 }).success, false)
  assert.equal(learningOverviewQuerySchema.safeParse({ windowDays: 366 }).success, false)
})

test('cross-Company learning space candidates use Access scope before metadata is loaded', async () => {
  const { db, calls } = recordingDb()
  await listActiveActorProjectScopes(db, {
    actorUserId: 'actor-1',
    afterSortAt: '2026-08-30T00:00:00.000Z',
    afterProjectId: 'project-1',
    limit: 31,
  })

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.params, [
    'actor-1', '2026-08-30T00:00:00.000Z', 'project-1', 31,
  ])
  const sql = calls[0]?.text ?? ''
  assert.match(sql, /FROM project_memberships member/)
  assert.match(sql, /member\.user_id=\$1 AND member\.status='ACTIVE'/)
  assert.match(sql, /project\.id=member\.project_id[\s\S]*project\.company_id=member\.company_id/)
  assert.match(sql, /COALESCE\(visit\.meaningful_visited_at,project\.updated_at\),member\.project_id/)
  assert.match(sql, /LIMIT \$4/)

  const metadata = recordingDb()
  await listLearningSpaceRows(metadata.db, [{
    companyId: 'company-1',
    projectId: 'project-1',
    projectRole: 'TEACHER',
    lastVisitedAt: null,
    sortAt: '2026-08-30T00:00:00.000Z',
  }])
  assert.doesNotMatch(metadata.calls[0]?.text ?? '', /project_memberships|company_memberships/)
  assert.match(metadata.calls[0]?.text ?? '', /jsonb_to_recordset\(\$1::jsonb\)/)
})

test('overview metrics count distinct attempts and keep every fact inside the tenant Project', async () => {
  const learner = recordingDb()
  await loadLearnerOverviewRows(learner.db, {
    companyId: 'company-1', projectId: 'project-1', learnerId: 'learner-1', windowDays: 30,
  })
  assert.equal(learner.calls.length, 6)
  assert.ok(learner.calls.every((call) => call.params?.[0] === 'company-1' && call.params?.[1] === 'project-1'))
  assert.match(learner.calls.map((call) => call.text).join('\n'), /COUNT\(DISTINCT attempt\.id\)/)

  const teacher = recordingDb()
  await loadLearningDashboardTeacherOverviewRows(teacher.db, {
    companyId: 'company-1', projectId: 'project-1', teacherId: 'teacher-1', windowDays: 30,
  })
  assert.equal(teacher.calls.length, 5)
  assert.ok(teacher.calls.every((call) => call.params?.[0] === 'company-1' && call.params?.[1] === 'project-1'))
  const teacherSql = teacher.calls.map((call) => call.text).join('\n')
  assert.match(teacherSql, /COUNT\(DISTINCT attempt\.id\)/)
  assert.match(teacherSql, /attention\.teacher_user_id=\$3/)
  assert.match(teacherSql, /learner\.role IN \('STUDENT','OBSERVER'\)/)
})

test('teacher learner and attempt reads require composite tenant joins and bounded pages', async () => {
  const { db, calls } = recordingDb()
  await listLearningDashboardLearnerRows(db, {
    companyId: 'company-1', projectId: 'project-1', reviewerId: 'teacher-1',
    attentionOnly: true, afterLearnerId: 'learner-0', search: 'alice@example.com', limit: 31,
  })
  await findLearningAttemptDetail(db, {
    companyId: 'company-1', projectId: 'project-1', attemptId: 'attempt-1',
  })

  assert.deepEqual(calls[0]?.params, [
    'company-1', 'project-1', 'teacher-1', true, 'learner-0', 'alice@example.com', 31,
  ])
  assert.match(calls[0]?.text ?? '', /COUNT\(DISTINCT attempt\.id\)/)
  assert.match(calls[0]?.text ?? '', /learners\.user_id>\$5/)
  assert.match(calls[0]?.text ?? '', /user_account\.display_name ILIKE/)
  assert.match(calls[0]?.text ?? '', /user_account\.email ILIKE/)
  assert.match(calls[0]?.text ?? '', /LIMIT \$7/)
  assert.match(calls[1]?.text ?? '', /attempt\.company_id=\$1 AND attempt\.project_id=\$2/)
  assert.match(calls[1]?.text ?? '', /evidence\.company_id=attempt\.company_id AND evidence\.project_id=attempt\.project_id/)
  assert.doesNotMatch(calls[1]?.text ?? '', /project_memberships|company_memberships/)
})

test('Personal Learning is always a learner perspective while course perspective follows membership', () => {
  assert.equal(learningPerspective('PERSONAL_LEARNING', 'OWNER'), 'learner')
  assert.equal(learningPerspective('TEACHING', 'OWNER'), 'teacher')
  assert.equal(learningPerspective('INSTITUTIONAL_COURSE', 'TEACHER'), 'teacher')
  assert.equal(learningPerspective('INSTITUTIONAL_COURSE', 'TA'), 'learner')
  assert.equal(learningPerspective('TEACHING', 'STUDENT'), 'learner')
  assert.equal(learningPerspective('INSTITUTIONAL_COURSE', 'OBSERVER'), 'learner')
})

test('learning spaces expose only the next valid lifecycle action for each Project kind and status', () => {
  assert.equal(learningLifecycleAction('PERSONAL_LEARNING', 'ACTIVE'), null)
  assert.equal(learningLifecycleAction('TEACHING', 'ACTIVE'), 'END')
  assert.equal(learningLifecycleAction('TEACHING', 'COURSE_ENDED'), 'ENTER_READ_ONLY')
  assert.equal(learningLifecycleAction('TEACHING', 'READ_ONLY'), 'ARCHIVE')
  assert.equal(learningLifecycleAction('INSTITUTIONAL_COURSE', 'READ_ONLY'), 'ENTER_RETENTION')
  assert.equal(learningLifecycleAction('INSTITUTIONAL_COURSE', 'RETENTION'), 'ARCHIVE')
  assert.equal(learningLifecycleAction('INSTITUTIONAL_COURSE', 'ARCHIVED'), null)
})

const managerContext: ResolvedAccessContext = {
  actorUserId: 'actor-1',
  company: { id: 'company-1', type: 'PERSONAL', status: 'ACTIVE' },
  companyMembership: { role: 'OWNER', status: 'ACTIVE' },
  effectivePlan: { id: 'plan-1', code: 'PERSONAL_FREE' },
  entitlements: { has: () => true, boolean: () => true, number: () => null, string: () => null },
}

test('agent management and company-wide memory stay manager-only while loop memory remains member-scoped', () => {
  for (const action of ['agent:manage', 'agent_memory:read_company', 'agent_memory:write_company'] as const) {
    assert.equal(evaluatePolicy({ actorUserId: 'actor-1', action, companyId: 'company-1' }, managerContext, null), 'ALLOWED')
    assert.equal(evaluatePolicy(
      { actorUserId: 'actor-1', action, companyId: 'company-1' },
      { ...managerContext, companyMembership: { role: 'MEMBER', status: 'ACTIVE' } },
      null,
    ), 'ROLE_NOT_ALLOWED')
  }
  const memberContext: ResolvedAccessContext = {
    ...managerContext,
    companyMembership: { role: 'MEMBER', status: 'ACTIVE' },
  }
  const conversation = {
    companyId: 'company-1',
    projectId: null,
    createdBy: null,
    conversationMembers: ['actor-1'],
    leaderId: null,
    status: null,
  }
  for (const action of ['agent_memory:read', 'agent_memory:write'] as const) {
    assert.equal(evaluatePolicy({ actorUserId: 'actor-1', action, companyId: 'company-1' }, memberContext, conversation), 'ALLOWED')
    assert.equal(evaluatePolicy(
      { actorUserId: 'actor-1', action, companyId: 'company-1' },
      memberContext,
      { ...conversation, conversationMembers: ['someone-else'] },
    ), 'RESOURCE_MEMBERSHIP_REQUIRED')
  }
  const observabilityRouter = readFileSync(
    new URL('../modules/observability/router.ts', import.meta.url),
    'utf8',
  )
  assert.match(observabilityRouter, /action: 'agent_memory:read_company'/)
  assert.equal(observabilityRouter.match(/action: 'agent_memory:write_company'/g)?.length, 2)
})

test('space capabilities follow Access policy for learner, reviewer, and lifecycle actions', () => {
  const application = readFileSync(new URL('../modules/learning/dashboard-application.ts', import.meta.url), 'utf8')
  assert.match(application, /request\('learning:manage'\)/)
  assert.match(application, /personal \? null : request\('course:update'\)/)
  assert.match(application, /personal \? null : request\('project_invitation:create'\)/)
  assert.match(application, /personal \? null : request\('project_invitation:revoke'\)/)
  assert.match(application, /personal \? null : request\('project_member:remove'\)/)
  assert.match(application, /request\('learning:submit'\)/)
  assert.match(application, /request\('learning:review'\)/)
  assert.match(application, /lifecycle\?\.allowed \? lifecycleAction : null/)
  assert.match(application, /canManage: row\.roleCanManage/)

  const activeCourse = {
    ...managerContext,
    project: { id: 'project-1', kind: 'TEACHING' as const, status: 'ACTIVE' as const },
  }
  const managerActions = [
    'learning:manage',
    'course:update',
    'project_invitation:create',
    'project_invitation:revoke',
    'project_member:remove',
  ] as const
  const activeOwner = {
    ...activeCourse,
    projectMembership: { role: 'OWNER' as const, status: 'ACTIVE' as const },
  }
  for (const action of managerActions) {
    assert.equal(evaluatePolicy(
      { actorUserId: 'actor-1', action, projectId: 'project-1' },
      activeOwner,
      null,
    ), 'ALLOWED')
  }

  const transferPendingOwner = {
    ...activeOwner,
    project: { ...activeOwner.project, status: 'TRANSFER_PENDING' as const },
  }
  assert.equal(evaluatePolicy(
    { actorUserId: 'actor-1', action: 'learning:manage', projectId: 'project-1' },
    transferPendingOwner,
    null,
  ), 'ALLOWED')
  for (const action of managerActions.slice(1)) {
    assert.equal(evaluatePolicy(
      { actorUserId: 'actor-1', action, projectId: 'project-1' },
      transferPendingOwner,
      null,
    ), 'PROJECT_STATE_DENIED')
  }

  const activeLearner = {
    ...activeCourse,
    projectMembership: { role: 'STUDENT' as const, status: 'ACTIVE' as const },
  }
  for (const action of managerActions) {
    assert.equal(evaluatePolicy(
      { actorUserId: 'actor-1', action, projectId: 'project-1' },
      activeLearner,
      null,
    ), 'ROLE_NOT_ALLOWED')
  }

  for (const [role, expected] of [
    ['STUDENT', 'ALLOWED'],
    ['OBSERVER', 'ROLE_NOT_ALLOWED'],
    ['TA', 'ROLE_NOT_ALLOWED'],
    ['OWNER', 'ROLE_NOT_ALLOWED'],
  ] as const) {
    assert.equal(evaluatePolicy(
      { actorUserId: 'actor-1', action: 'learning:submit', projectId: 'project-1' },
      { ...activeCourse, projectMembership: { role, status: 'ACTIVE' } },
      null,
    ), expected)
  }

  const endedOwner = {
    ...activeCourse,
    project: { ...activeCourse.project, status: 'COURSE_ENDED' as const },
    projectMembership: { role: 'OWNER' as const, status: 'ACTIVE' as const },
  }
  assert.equal(evaluatePolicy(
    { actorUserId: 'actor-1', action: 'learning:review', projectId: 'project-1' },
    endedOwner,
    null,
  ), 'ALLOWED')
  assert.equal(evaluatePolicy(
    { actorUserId: 'actor-1', action: 'project:enter_read_only', projectId: 'project-1' },
    endedOwner,
    null,
  ), 'ALLOWED')

  const institutionalReadOnly = {
    ...managerContext,
    company: { ...managerContext.company, type: 'EDUCATION' as const },
    project: { id: 'project-2', kind: 'INSTITUTIONAL_COURSE' as const, status: 'READ_ONLY' as const },
    projectMembership: { role: 'OWNER' as const, status: 'ACTIVE' as const },
  }
  assert.equal(evaluatePolicy(
    { actorUserId: 'actor-1', action: 'project:enter_retention', projectId: 'project-2' },
    institutionalReadOnly,
    null,
  ), 'ALLOWED')
})

test('teacher detail HTTP routes require review while teacher overview requires only read', () => {
  const router = readFileSync(new URL('../modules/learning/classroom-router.ts', import.meta.url), 'utf8')
  const application = readFileSync(new URL('../modules/learning/dashboard-application.ts', import.meta.url), 'utf8')
  for (const route of [
    '/projects/:projectId/learning/learners',
    '/projects/:projectId/learning/learners/:learnerId',
    '/projects/:projectId/learning/attempts/:attemptId',
  ]) {
    const start = router.indexOf(`classroomRouter.get('${route}'`)
    assert.notEqual(start, -1, route)
    assert.match(router.slice(start, start + 500), /'learning:review'/, route)
  }
  const overviewStart = application.indexOf('export async function learningOverview')
  const learnersStart = application.indexOf('export async function listLearningLearners')
  assert.notEqual(overviewStart, -1)
  assert.notEqual(learnersStart, -1)
  const overview = application.slice(overviewStart, learnersStart)
  assert.match(overview, /resolveProjectAccess\(db, scope, projectId, 'learning:read'\)/)
  assert.match(overview, /loadLearningDashboardTeacherOverviewRows/)
  assert.doesNotMatch(overview, /resolveTeacherAccess/)
  assert.match(application, /attention: rows\.attention\.map/)
  assert.doesNotMatch(application, /return \{ perspective, windowDays, \.\.\.rows \}/)
  assert.equal(evaluatePolicy(
    { actorUserId: 'actor-1', action: 'learning:review', projectId: 'project-1' },
    {
      ...managerContext,
      project: { id: 'project-1', kind: 'TEACHING', status: 'ACTIVE' },
      projectMembership: { role: 'TA', status: 'ACTIVE' },
    },
    null,
  ), 'ROLE_NOT_ALLOWED')
})
