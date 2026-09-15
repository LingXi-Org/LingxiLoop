import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { Queryable } from '../db/queryable.js'

test('teacher memory is empty only after authorization; ordinary memory and revocation remain enforced', async () => {
  const assertCan = mock.fn(async (_input: unknown) => {})
  mock.module('../modules/access/public.js', { namedExports: { createPermissionService: () => ({ assertCan }) } })
  const { resolveMemoryScopes } = await import('../modules/memory/public.js')
  const identity = { tenantId: 'company',principalId: 'human',agentId: 'agent',sessionId: 'session',workId: 'run' }
  let room: { conversation_id: string; teacher_managed: boolean } | undefined = { conversation_id: 'room',teacher_managed: true }
  const db = { query: async () => ({ rows: room ? [room] : [] }) } as unknown as Queryable
  assert.deepEqual(await resolveMemoryScopes(identity,db),[])
  assert.deepEqual(assertCan.mock.calls[0].arguments,[{ actorUserId: 'human',companyId: 'company',
    action: 'agent_memory:read',resource: { type: 'conversation',id: 'room' } }])
  room.teacher_managed = false
  assert.deepEqual(await resolveMemoryScopes(identity,db),[
    { tenantId: 'company',scopeType: 'learner',scopeId: 'human' },
    { tenantId: 'company',scopeType: 'course',scopeId: 'room' },
    { tenantId: 'company',scopeType: 'agent_role',scopeId: 'agent' },
  ])
  room.teacher_managed = true
  assertCan.mock.mockImplementation(async () => { throw new Error('permission revoked') })
  await assert.rejects(resolveMemoryScopes(identity,db),/permission revoked/)
  room = undefined
  await assert.rejects(resolveMemoryScopes(identity,db),/memory source identity or membership was revoked/)
})
