import type { Client } from 'pg'

export const adminFixtures = {
  company: 'e2e-admin-school',
  manager: '00000000-0000-4000-8000-000000000004',
  member: '00000000-0000-4000-8000-000000000005',
  account: '00000000-0000-4000-8000-000000000006',
  project: 'e2e-admin-project',
  course: 'e2e-admin-course',
  document: 'e2e-admin-document',
} as const

// Called in the disposable browser database's existing seed transaction.
export async function seedAdminFixtures(db: Client) {
  const f = adminFixtures
  for (const [id, name, status] of [
    [f.company, 'E2E Admin School', 'ACTIVE'],
    ['e2e-admin-grace', 'E2E Grace School', 'GRACE_PERIOD'],
    ['e2e-admin-retention', 'E2E Retention School', 'RETENTION'],
  ]) await db.query(`INSERT INTO companies(id,name,slug,type,plan_id,status)
    VALUES($1,$2,$1,'EDUCATION','plan-education',$3)
    ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status`, [id, name, status])
  await db.query(`INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
    VALUES($1,$1,'plan-education','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',20)
    ON CONFLICT(id) DO UPDATE SET ends_at=EXCLUDED.ends_at`, [f.company])
  for (const [id, name, email] of [
    [f.manager, 'E2E isolated manager', process.env.E2E_USER_MANAGER_USERNAME || 'manager@e2e.lingxiloop.test'],
    [f.member, 'E2E removable teacher', 'removable@e2e.lingxiloop.test'],
    [f.account, 'E2E lifecycle account', 'lifecycle@e2e.lingxiloop.test'],
  ]) await db.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,$2,$3,NOW())
    ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,
    suspended_at=NULL,deleted_at=NULL,departed_at=NULL,access_revoked_at=NULL`, [id, email, name])
  await db.query(`INSERT INTO users(id,email,display_name,email_verified_at)
    SELECT 'e2e-admin-page-'||n,'page-'||n||'@e2e.lingxiloop.test','E2E Pagination '||LPAD(n::text,2,'0'),NOW()
    FROM generate_series(1,21) AS n ON CONFLICT(id) DO NOTHING`)
  for (const user of [f.manager, f.member]) {
    await db.query(`INSERT INTO company_memberships(company_id,user_id,role,is_admin)
      VALUES($1,$2,'TEACHER',$3) ON CONFLICT(company_id,user_id) DO UPDATE
      SET status='ACTIVE',ended_at=NULL,is_admin=EXCLUDED.is_admin`, [f.company, user, user === f.manager])
    await db.query(`UPDATE company_memberships SET period_id=NULL WHERE company_id=$1 AND user_id=$2
      AND period_id IN (SELECT id FROM company_membership_periods WHERE ended_at IS NOT NULL)`, [f.company, user])
    await db.query(`WITH period AS (INSERT INTO company_membership_periods(membership_id,role)
      SELECT id,role FROM company_memberships WHERE company_id=$1 AND user_id=$2 AND period_id IS NULL RETURNING id,membership_id)
      UPDATE company_memberships member SET period_id=period.id FROM period WHERE member.id=period.membership_id`, [f.company, user])
    await db.query(`INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
      VALUES($1,$2,$2,$3,'ACTIVE') ON CONFLICT(id) DO UPDATE SET status='ACTIVE',revoked_at=NULL`, [`e2e-admin-seat-${user}`, f.company, user])
  }
  await db.query(`INSERT INTO projects(id,company_id,kind,name,description,status,created_by)
    VALUES($1,$2,'TEACHING','E2E Admin Lifecycle Project','Populated administrative lifecycle fixture','DRAFT',$3)
    ON CONFLICT(id) DO UPDATE SET status='DRAFT',archived_at=NULL`, [f.project, f.company, f.manager])
  await db.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES($1,$2,$3,$4)
    ON CONFLICT(id) DO NOTHING`, [f.course, f.company, f.project, f.manager])
  await db.query(`INSERT INTO documents(id,company_id,project_id,title,created_by) VALUES($1,$2,$3,'E2E Admin Document',$4)
    ON CONFLICT(id) DO NOTHING`, [f.document, f.company, f.project, f.manager])
  await db.query(`INSERT INTO agent_routines(id,company_id,agent_id,channel_id,kind,title,instructions,schedule,status,next_run_at,created_by)
    SELECT 'e2e-admin-routine',company_id,id,'e2e-study-room','e2e_regression','E2E Admin Routine','Future test routine',
      '{"everyMinutes":60}'::jsonb,'active','2099-01-01'::timestamptz,'00000000-0000-4000-8000-000000000001'
    FROM participants WHERE company_id='e2e-school' AND kind='agent' ORDER BY id LIMIT 1
    ON CONFLICT(id) DO UPDATE SET status='active',next_run_at='2099-01-01'::timestamptz,pause_reason=NULL`)
}
