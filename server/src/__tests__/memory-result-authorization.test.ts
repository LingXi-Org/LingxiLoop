import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { ActionContext, createLingxiOS } from '@lyyzka/lingxios'
import type { PermissionRequest } from '../modules/access/public.js'

// Failure model: explicit result producer model plus teacher scope restrictions.
const permissions: PermissionRequest[] = []
let revoked = false
const access = await import('../modules/access/public.js')
mock.module('../modules/access/public.js', { namedExports: { ...access,
  createPermissionService: () => ({ async assertCan(input: PermissionRequest) {
    permissions.push(input); if (revoked && input.action === 'learning:manage') throw new access.ForbiddenError('RESOURCE_MEMBERSHIP_REQUIRED')
  } }),
} })
const teacher = await import('../modules/learning/teacher-agent-application.js')
let teacherReads = 0
const teacherScope: Awaited<ReturnType<typeof teacher.resolveTeacherScope>> = {
  companyId: 'company', projectId: 'project', projectName: 'Project', courseId: 'course', courseTitle: 'Course',
  courseStatus: 'ACTIVE', roomId: 'room', roomStatus: 'active', agentId: 'agent', agentName: 'Teacher', teacherId: 'human', mode: 'teacher',
}
mock.module('../modules/learning/teacher-agent-application.js', { namedExports: { ...teacher,
  async resolveTeacherScope() { teacherReads++; return teacherScope },
} })
const { authorizeAgent } = await import('../agents/tools.js')
const work = { id: 'run', tenantId: 'company', agentId: 'agent', principalId: 'human', sessionId: 'session',
  kind: 'turn', lane: 'interactive', conversation: { conversationId: 'room', internal: false, audience: { participantIds: ['human', 'agent'] } } }
const database = { async query(sql: string) {
  if (sql.includes('FROM users')) return { rows: [{}] }
  if (sql.includes('teacher_managed')) return { rows: [{ capabilities: [], teacher_managed: true }] }
  if (sql.includes('SELECT id,kind,departed_at')) return { rows: [{ id: 'human', kind: 'human', departed_at: null }, { id: 'agent', kind: 'agent', departed_at: null }] }
  throw new Error('unexpected authorization query')
} }
const context = { work, action: { action: 'memory.summary' }, database, signal: new AbortController().signal } as unknown as ActionContext

test('teacher memory summary keeps teacher room and audience authorization', async () => {
  await authorizeAgent(context)
  assert.equal(teacherReads, 1)
  assert.ok(permissions.some(value => value.action === 'conversation:read'))
  assert.deepEqual(permissions.find(value => value.action === 'learning:manage'), {
    actorUserId: 'human', companyId: 'company', projectId: 'project', action: 'learning:manage',
    resource: { type: 'project', id: 'project' },
  })
  revoked = true
  await assert.rejects(authorizeAgent(context))
  revoked = false
})

test('memory presentation authorization uses its declared read action and rechecks the same teacher project', async () => {
  const { createMemorySummaryPresentation } = await import('../modules/memory/presentation.js')
  let memoryReads = 0
  const memory = {
    async scopes() { return [{ tenantId: 'company', scopeType: 'session', scopeId: 'room' }] },
    async read() { memoryReads++; return { id: 'memory_1', title: 'Preference', description: 'Short examples', version: 1, status: 'active' } },
  } as unknown as NonNullable<Awaited<ReturnType<typeof createLingxiOS>>['memory']>
  const presentation = createMemorySummaryPresentation(async () => ({ memory }))
  const presentationContext = { ...context, action: { ...context.action, action: 'presentation.render' } }
  const before = teacherReads
  permissions.length = 0
  await presentation.authorize(presentationContext, 'memory_1')
  assert.equal(teacherReads, before + 1)
  assert.deepEqual(permissions.find(value => value.action === 'learning:manage'), {
    actorUserId: 'human', companyId: 'company', projectId: 'project', action: 'learning:manage',
    resource: { type: 'project', id: 'project' },
  })
  assert.equal(memoryReads, 1)
  permissions.length = 0
  await presentation.resolve(presentationContext, 'memory_1')
  assert.equal(teacherReads, before + 2)
  assert.equal(permissions.find(value => value.action === 'learning:manage')?.projectId, 'project')
  assert.equal(memoryReads, 2)
  revoked = true
  try {
    await assert.rejects(presentation.authorize(presentationContext, 'memory_1'))
    await assert.rejects(presentation.resolve(presentationContext, 'memory_1'))
    assert.equal(memoryReads, 2, 'revoked project access must stop before reading memory')
  } finally { revoked = false }
})

test('the teacher exception excludes internal/background requests and other memory actions', async () => {
  for (const candidate of [
    { ...context, work: { ...context.work, lane: 'background' } },
    { ...context, work: { ...context.work, kind: 'routine' } },
    { ...context, work: { ...context.work, conversation: { ...context.work.conversation!, internal: true } } },
    { ...context, action: { ...context.action, action: 'memory.apply' } },
  ]) await assert.rejects(authorizeAgent(candidate as ActionContext), /capability or membership was revoked/)
})
