import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ActionContext } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { authorizeAgent } from '../agents/tools.js'
import { ensureTeacherAgentForCourse } from '../modules/learning/teacher-agent-application.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model: enabling teacher visuals must not grant students, internal jobs,
// or noninteractive teacher tasks the teacher's course authority.
test('teacher visualize authorizes an interactive manager and rejects students and internal work', async () => {
  await ensureSchemaOnce(); await resetAllTables(); const im = await installRecordingWukong()
  try {
    const { companyId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    await seedUserMembership('visualize-student', companyId, { role: 'STUDENT', isAdmin: false })
    const projectId = 'visualize-teacher-project', courseId = 'visualize-teacher-course'
    await pool.query("INSERT INTO projects(id,company_id,kind,name,created_by) VALUES($1,$2,'INSTITUTIONAL_COURSE','Visualize course','test-owner')", [projectId, companyId])
    await pool.query("INSERT INTO courses(id,company_id,project_id,created_by) VALUES($1,$2,$3,'test-owner')", [courseId, companyId, projectId])
    await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'test-owner','TEACHER'),($1,$2,'visualize-student','STUDENT')", [projectId, companyId])
    const teacher = await ensureTeacherAgentForCourse(companyId, courseId, pool, work => withTransaction(pool, work))
    const context = { database: pool, signal: AbortSignal.timeout(10000), action: { action: 'visualize.read_reference' },
      work: { id: 'teacher-visualize-run', tenantId: companyId, principalId: 'test-owner', agentId: teacher.agentId,
        kind: 'turn', lane: 'interactive', createdAt: new Date().toISOString(), meta: { conversationId: teacher.roomId } } } as unknown as ActionContext
    await authorizeAgent(context)
    await assert.rejects(authorizeAgent({ ...context, work: { ...context.work, lane: 'background' } }))
    await assert.rejects(authorizeAgent({ ...context, work: { ...context.work, conversation: { internal: true, conversationId: teacher.roomId } } } as ActionContext))
    await pool.query('UPDATE conversations SET members=members || to_jsonb(ARRAY[$2::text]) WHERE id=$1', [teacher.roomId, 'visualize-student'])
    await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',(profile->'members') || to_jsonb(ARRAY[$2::text])) WHERE channel_id=$1", [teacher.roomId, 'visualize-student'])
    await assert.rejects(authorizeAgent({ ...context, work: { ...context.work, principalId: 'visualize-student' } }))
  } finally { await teardownAll(); await im.close() }
})
