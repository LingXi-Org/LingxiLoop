import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { provisionPersonalWorkspace } from '../modules/companies/public.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const USER_ID = 'u-personal-context'

async function insertUser(userId = USER_ID): Promise<void> {
  await pool.query(
    `INSERT INTO users (id,email,display_name,email_verified_at)
     VALUES ($1,$2,'Personal Learner',NOW())`,
    [userId, `${userId}@test.local`],
  )
}

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

test('[integration] Personal Workspace provisioning creates one complete inheriting context', async () => {
  const created = await withTransaction(pool, async (db) => {
    await db.query(
      `INSERT INTO users (id,email,display_name,email_verified_at)
       VALUES ($1,$2,'Personal Learner',NOW())`,
      [USER_ID, `${USER_ID}@test.local`],
    )
    return provisionPersonalWorkspace(db, USER_ID)
  })

  assert.equal(created.created, true)
  const { rows } = await pool.query<{
    company_id: string
    company_type: string
    company_status: string
    plan_code: string
    company_role: string
    company_membership_status: string
    project_id: string
    project_name: string
    project_plan_id: string | null
    project_role: string
    project_membership_status: string
  }>(
    `SELECT company.id AS company_id,company.type AS company_type,company.status AS company_status,
            plan.code AS plan_code,company_member.role AS company_role,
            company_member.status AS company_membership_status,
            project.id AS project_id,project.name AS project_name,project.plan_id AS project_plan_id,
            project_member.role AS project_role,project_member.status AS project_membership_status
       FROM companies company
       JOIN plans plan ON plan.id=company.plan_id
       JOIN company_memberships company_member
         ON company_member.company_id=company.id AND company_member.user_id=$1
       JOIN projects project ON project.company_id=company.id AND project.is_general=TRUE
       JOIN project_memberships project_member
         ON project_member.company_id=company.id AND project_member.project_id=project.id
        AND project_member.user_id=$1
      WHERE company.personal_owner_user_id=$1`,
    [USER_ID],
  )
  assert.deepEqual(rows, [{
    company_id: created.companyId,
    company_type: 'PERSONAL',
    company_status: 'ACTIVE',
    plan_code: 'PERSONAL_FREE',
    company_role: 'OWNER',
    company_membership_status: 'ACTIVE',
    project_id: created.projectId,
    project_name: '我的学习',
    project_plan_id: null,
    project_role: 'OWNER',
    project_membership_status: 'ACTIVE',
  }])
})

test('[integration] sequential and concurrent retries keep exactly one Personal Context', async () => {
  await insertUser()
  const first = await withTransaction(pool, (db) => provisionPersonalWorkspace(db, USER_ID))
  const second = await withTransaction(pool, (db) => provisionPersonalWorkspace(db, USER_ID))
  const concurrent = await Promise.all([
    withTransaction(pool, (db) => provisionPersonalWorkspace(db, USER_ID)),
    withTransaction(pool, (db) => provisionPersonalWorkspace(db, USER_ID)),
  ])

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.deepEqual(concurrent.map((result) => result.created), [false, false])
  assert.deepEqual(new Set([first.companyId, second.companyId, ...concurrent.map((result) => result.companyId)]).size, 1)
  const counts = await pool.query<{
    companies: number
    company_memberships: number
    projects: number
    project_memberships: number
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM companies WHERE personal_owner_user_id=$1) AS companies,
       (SELECT COUNT(*)::int FROM company_memberships WHERE user_id=$1) AS company_memberships,
       (SELECT COUNT(*)::int FROM projects project JOIN companies company ON company.id=project.company_id
         WHERE company.personal_owner_user_id=$1 AND project.is_general=TRUE) AS projects,
       (SELECT COUNT(*)::int FROM project_memberships WHERE user_id=$1) AS project_memberships`,
    [USER_ID],
  )
  assert.deepEqual(counts.rows[0], {
    companies: 1,
    company_memberships: 1,
    projects: 1,
    project_memberships: 1,
  })
})

test('[integration] provisioning rejects a committed partial Personal Context instead of repairing it', async () => {
  await insertUser()
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,status,personal_owner_user_id,plan_id)
     VALUES ('co-partial','Partial','partial','PERSONAL','ACTIVE',$1,'plan-personal-free')`,
    [USER_ID],
  )
  await assert.rejects(
    withTransaction(pool, (db) => provisionPersonalWorkspace(db, USER_ID)),
    /Personal Context invariant violated/,
  )
  assert.equal((await pool.query(`SELECT 1 FROM company_memberships WHERE user_id=$1`, [USER_ID])).rowCount, 0)
})

for (const table of ['companies', 'company_memberships', 'projects', 'project_memberships'] as const) {
  test(`[integration] ${table} failure rolls back User and the complete Personal Context`, async () => {
    await pool.query(`CREATE FUNCTION fail_personal_provisioning() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected Personal provisioning failure'; END; $$ LANGUAGE plpgsql`)
    await pool.query(`CREATE TRIGGER fail_personal_provisioning
      BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_personal_provisioning()`)
    try {
      await assert.rejects(
        withTransaction(pool, async (db) => {
          await db.query(
            `INSERT INTO users (id,email,display_name) VALUES ($1,$2,'Rollback Learner')`,
            [USER_ID, `${USER_ID}@test.local`],
          )
          await provisionPersonalWorkspace(db, USER_ID)
        }),
        /injected Personal provisioning failure/,
      )
    } finally {
      await pool.query(`DROP TRIGGER fail_personal_provisioning ON ${table}`)
      await pool.query(`DROP FUNCTION fail_personal_provisioning()`)
    }
    assert.equal((await pool.query(`SELECT 1 FROM users WHERE id=$1`, [USER_ID])).rowCount, 0)
    assert.equal((await pool.query(`SELECT 1 FROM companies WHERE personal_owner_user_id=$1`, [USER_ID])).rowCount, 0)
  })
}
