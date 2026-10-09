import type { Client } from 'pg'
import { insertCourse } from '../server/src/modules/learning/courses-repository'
import { syncStudyRoomMembers } from '../server/src/modules/learning/reporting-repository'
import { ensureTeacherAgentForCourse } from '../server/src/modules/learning/teacher-agent-application'

export async function seedNavigationFixtures(db: Client) {
  const company = 'e2e-school'
  const projectId = 'e2e-navigation-classroom'
  const courseId = 'e2e-navigation-course'
  const roomId = 'e2e-navigation-room'
  if (!(await db.query('SELECT 1 FROM projects WHERE id=$1', [projectId])).rowCount) {
    await insertCourse(db, {
      companyId: company, userId: '00000000-0000-4000-8000-000000000001',
      projectId, courseId, roomId, kind: 'TEACHING', planId: null,
      input: { name: 'E2E Navigation Classroom', description: 'Disposable cross-project navigation fixture', color: '#23734b' },
    })
  }
  await db.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role)
    SELECT $1,company_id,user_id,role FROM company_memberships WHERE company_id=$2 AND status='ACTIVE'
    ON CONFLICT DO NOTHING`, [projectId, company])
  await syncStudyRoomMembers(db, {
    companyId: company, courseId, roomId,
    title: 'E2E Navigation Classroom · Study Room', topic: null, leaderId: null,
  })
  await ensureTeacherAgentForCourse(company, courseId, db, work => work(db))
}
