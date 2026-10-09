import pg from 'pg'
import { ensureEducationPlan } from '../server/src/modules/entitlements/public'
import { installStarterAgents } from '../server/src/modules/companies/onboarding-repository'
import { insertCourse } from '../server/src/modules/learning/courses-repository'
import { syncStudyRoomMembers } from '../server/src/modules/learning/reporting-repository'
import { seedAdminFixtures } from './admin/seed'
import { seedLearningFixtures } from './learning-seed'

const url = new URL(process.env.DATABASE_URL ?? '')
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash
  || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/lingxiloop_browser_test') {
  throw new Error('Browser fixtures require the dedicated local lingxiloop_browser_test database')
}
const db = new pg.Client({ connectionString: url.href })
await db.connect()
try {
  await db.query('BEGIN')
  await ensureEducationPlan(db)
  const company = 'e2e-school'
  await db.query(`INSERT INTO companies(id,name,slug,type,plan_id)
    VALUES($1,'E2E School',$1,'EDUCATION','plan-education') ON CONFLICT(id) DO NOTHING`, [company])
  await db.query(`INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
    VALUES($1,$1,'plan-education','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',100)
    ON CONFLICT(id) DO UPDATE SET ends_at=EXCLUDED.ends_at`, [company])
  for (const [name, number] of [['member', 1], ['admin', 2], ['student', 3]] as const) {
    const user = `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
    const role = name === 'student' ? 'STUDENT' : 'TEACHER'
    const email = process.env[`E2E_USER_${name.toUpperCase()}_USERNAME`] || `${name}@e2e.lingxiloop.test`
    await db.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,$2,$3,NOW())
      ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email`, [user, email, `E2E ${name}`])
    await db.query(`INSERT INTO company_memberships(company_id,user_id,role,is_admin) VALUES($1,$2,$3,$4)
      ON CONFLICT DO NOTHING`, [company, user, role, name !== 'student'])
    await db.query(`WITH period AS (INSERT INTO company_membership_periods(membership_id,role)
      SELECT id,role FROM company_memberships WHERE company_id=$1 AND user_id=$2 AND period_id IS NULL RETURNING id,membership_id)
      UPDATE company_memberships member SET period_id=period.id FROM period WHERE member.id=period.membership_id`, [company, user])
    await db.query(`INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
      VALUES($1,$2,$2,$3,'ACTIVE') ON CONFLICT(id) DO NOTHING`, [`e2e-seat-${name}`, company, user])
    await db.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
      VALUES($1,$2,'human',$3,$4,'E','#64748b','avail') ON CONFLICT DO NOTHING`, [user, company, `E2E ${name}`, role.toLowerCase()])
  }
  await installStarterAgents(db, company)
  const projectId = 'e2e-classroom'
  const courseId = 'e2e-course'
  const roomId = 'e2e-study-room'
  if (!(await db.query('SELECT 1 FROM projects WHERE id=$1', [projectId])).rowCount) {
    await insertCourse(db, {
      companyId: company, userId: '00000000-0000-4000-8000-000000000001',
      projectId, courseId, roomId, kind: 'TEACHING', planId: null,
      input: { name: 'E2E Classroom', description: 'Disposable browser test classroom', color: '#5266d6' },
    })
  }
  await db.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role)
    SELECT $1,company_id,user_id,role FROM company_memberships WHERE company_id=$2 AND status='ACTIVE'
    ON CONFLICT DO NOTHING`, [projectId, company])
  await syncStudyRoomMembers(db, {
    companyId: company, courseId, roomId, title: 'E2E Classroom · Study Room', topic: null, leaderId: null,
  })
  await seedAdminFixtures(db)
  await seedLearningFixtures(db)
  await db.query('COMMIT')
} catch (error) { await db.query('ROLLBACK'); throw error }
finally { await db.end() }
