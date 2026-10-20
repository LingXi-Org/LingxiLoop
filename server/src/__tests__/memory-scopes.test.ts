import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ForbiddenError } from '../modules/access/errors.js'

// Failure cases: role-based denial, skipped membership checks, revoked access, or widened scopes.
test('teacher and ordinary memory have the same authorized scopes and reject revocation', async () => {
  const assertCan = mock.fn(async (_input: unknown) => {})
  const can = async () => ({allowed:true})
  mock.module('../modules/access/public.js', { namedExports: { createPermissionService: () => ({ assertCan,can }), ForbiddenError } })
  const { resolveMemoryScopes } = await import('../modules/memory/public.js')
  const identity = { tenantId: 'company',principalId: 'human',agentId: 'agent',sessionId: 'session',workId: 'run' }
  let room: { conversation_id: string; teacher_managed: boolean; members:string[]; project_id:string|null; course_id:string|null } | undefined = { conversation_id: 'room',teacher_managed: true,members:['human','agent'],project_id:null,course_id:null }
  const db = { query: async () => ({ rows: room ? [room] : [] }) } as unknown as Queryable
  const expected = [
    {tenantId:'company',scopeType:'learner',scopeId:'human',continuity:'principal',readOnly:false,
      legacyScope:{tenantId:'company',scopeType:'learner',scopeId:'human'}},
    {tenantId:'company',scopeType:'session',scopeId:'room',readOnly:false},
    {tenantId:'company',scopeType:'agent_role',scopeId:'agent',readOnly:false},
  ]
  assert.deepEqual(await resolveMemoryScopes(identity,db),expected)
  assert.deepEqual(assertCan.mock.calls[0].arguments,[{ actorUserId: 'human',companyId: 'company',
    action: 'agent_memory:read',resource: { type: 'conversation',id: 'room' } }])
  room.teacher_managed = false
  assert.deepEqual(await resolveMemoryScopes(identity,db),expected)
  room.members=['human','agent','teacher']
  assert.ok(!(await resolveMemoryScopes(identity,db)).some(scope=>scope.scopeType==='learner'))
  room.members=['human','agent'];room.project_id='project-real';room.course_id='course-real'
  const courses=await resolveMemoryScopes(identity,db)
  assert.ok(courses.some(scope=>scope.scopeType==='learner_course' && scope.scopeId==='course:course-real'))
  assert.ok(!courses.some(scope=>scope.scopeType==='course' && scope.scopeId==='room'))

  room.teacher_managed = true
  assertCan.mock.mockImplementation(async () => { throw new Error('permission revoked') })
  await assert.rejects(resolveMemoryScopes(identity,db),/permission revoked/)
  assertCan.mock.mockImplementation(async () => { throw new ForbiddenError('RESOURCE_MEMBERSHIP_REQUIRED') })
  await assert.rejects(resolveMemoryScopes(identity,db), { code: 'forbidden' })
  room = undefined
  await assert.rejects(resolveMemoryScopes(identity,db),/memory source identity or membership was revoked/)
})
