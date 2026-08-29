import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { FOUNDATION_PLAN } from '../domain/entitlement/public.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const USER = 'u-domain-foundation'
const SECOND_USER = 'u-domain-foundation-second'
const COMPANY_A = 'co-domain-a'
const COMPANY_B = 'co-domain-b'
const PROJECT_A_STUDENT = 'project-domain-a-student'
const PROJECT_A_TEACHER = 'project-domain-a-teacher'
const PROJECT_B = 'project-domain-b'

function pgCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await pool.query(
    `INSERT INTO users (id,email,display_name) VALUES
       ($1,'domain-user@example.com','Domain User'),
       ($2,'domain-second@example.com','Domain Second')`,
    [USER, SECOND_USER],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug) VALUES
       ($1,'Domain A','domain-a'),
       ($2,'Domain B','domain-b')`,
    [COMPANY_A, COMPANY_B],
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role) VALUES
       ($1,$3,'OWNER'),($2,$3,'MEMBER'),($2,$4,'OWNER')`,
    [COMPANY_A, COMPANY_B, USER, SECOND_USER],
  )
  await pool.query(
    `INSERT INTO projects (id,company_id,name,created_by) VALUES
       ($1,$4,'Student Project',$6),
       ($2,$4,'Teacher Project',$6),
       ($3,$5,'Other Company Project',$7)`,
    [PROJECT_A_STUDENT, PROJECT_A_TEACHER, PROJECT_B, COMPANY_A, COMPANY_B, USER, SECOND_USER],
  )
})
after(async () => { await teardownAll() })

test('[integration] memberships express one user across companies and different project roles', async () => {
  await pool.query(
    `INSERT INTO project_memberships (company_id,project_id,user_id,role) VALUES
       ($1,$3,$5,'STUDENT'),
       ($1,$4,$5,'TEACHER'),
       ($2,$6,$5,'OBSERVER')`,
    [COMPANY_A, COMPANY_B, PROJECT_A_STUDENT, PROJECT_A_TEACHER, USER, PROJECT_B],
  )

  const companies = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM company_memberships WHERE user_id=$1 ORDER BY company_id`,
    [USER],
  )
  assert.deepEqual(companies.rows.map((row) => row.company_id), [COMPANY_A, COMPANY_B])

  const roles = await pool.query<{ project_id: string; role: string }>(
    `SELECT project_id,role FROM project_memberships
      WHERE user_id=$1 ORDER BY project_id`,
    [USER],
  )
  assert.deepEqual(roles.rows, [
    { project_id: PROJECT_A_STUDENT, role: 'STUDENT' },
    { project_id: PROJECT_A_TEACHER, role: 'TEACHER' },
    { project_id: PROJECT_B, role: 'OBSERVER' },
  ])
})

test('[integration] duplicate and cross-company project memberships fail closed', async () => {
  await pool.query(
    `INSERT INTO project_memberships (company_id,project_id,user_id,role)
     VALUES ($1,$2,$3,'STUDENT')`,
    [COMPANY_A, PROJECT_A_STUDENT, USER],
  )

  await assert.rejects(
    pool.query(
      `INSERT INTO project_memberships (company_id,project_id,user_id,role)
       VALUES ($1,$2,$3,'TEACHER')`,
      [COMPANY_A, PROJECT_A_STUDENT, USER],
    ),
    (error) => pgCode(error) === '23505',
  )
  await assert.rejects(
    pool.query(
      `INSERT INTO project_memberships (company_id,project_id,user_id,role)
       VALUES ($1,$2,$3,'STUDENT')`,
      [COMPANY_B, PROJECT_A_TEACHER, USER],
    ),
    (error) => pgCode(error) === '23503',
  )
})

test('[integration] membership deletion cascades toward space state and never toward User', async () => {
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role) VALUES ($1,$2,'MEMBER')`,
    [COMPANY_A, SECOND_USER],
  )
  await pool.query(
    `INSERT INTO project_memberships (company_id,project_id,user_id,role) VALUES
       ($1,$2,$3,'STUDENT'),($1,$2,$4,'OBSERVER')`,
    [COMPANY_A, PROJECT_A_STUDENT, USER, SECOND_USER],
  )

  await pool.query(
    `DELETE FROM project_memberships WHERE company_id=$1 AND project_id=$2 AND user_id=$3`,
    [COMPANY_A, PROJECT_A_STUDENT, USER],
  )
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE id=$1`, [USER])).rowCount, 1)

  await pool.query(
    `DELETE FROM company_memberships WHERE company_id=$1 AND user_id=$2`,
    [COMPANY_A, SECOND_USER],
  )
  assert.equal((await pool.query(
    `SELECT 1 FROM project_memberships WHERE company_id=$1 AND user_id=$2`,
    [COMPANY_A, SECOND_USER],
  )).rowCount, 0)
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE id=$1`, [SECOND_USER])).rowCount, 1)
})

test('[integration] plans support inheritance and only scalar entitlement values', async () => {
  const company = await pool.query<{ plan_id: string }>(
    `SELECT plan_id FROM companies WHERE id=$1`,
    [COMPANY_A],
  )
  assert.equal(company.rows[0]?.plan_id, FOUNDATION_PLAN.id)

  await pool.query(`UPDATE projects SET plan_id=$1 WHERE id=$2`, [FOUNDATION_PLAN.id, PROJECT_A_TEACHER])
  const projects = await pool.query<{ id: string; plan_id: string | null }>(
    `SELECT id,plan_id FROM projects WHERE id IN ($1,$2) ORDER BY id`,
    [PROJECT_A_STUDENT, PROJECT_A_TEACHER],
  )
  assert.deepEqual(projects.rows, [
    { id: PROJECT_A_STUDENT, plan_id: null },
    { id: PROJECT_A_TEACHER, plan_id: FOUNDATION_PLAN.id },
  ])

  await pool.query(
    `INSERT INTO entitlements (id,code,description) VALUES
       ('ent-domain-enabled','domain.enabled','Boolean ability'),
       ('ent-domain-limit','domain.limit','Numeric limit')`,
  )
  await pool.query(
    `INSERT INTO plan_entitlements (plan_id,entitlement_id,value) VALUES
       ($1,'ent-domain-enabled','true'::jsonb),
       ($1,'ent-domain-limit','20'::jsonb)`,
    [FOUNDATION_PLAN.id],
  )
  const values = await pool.query<{ code: string; kind: string }>(
    `SELECT entitlement.code,jsonb_typeof(link.value) AS kind
       FROM plan_entitlements link
       JOIN entitlements entitlement ON entitlement.id=link.entitlement_id
      WHERE link.plan_id=$1 ORDER BY entitlement.code`,
    [FOUNDATION_PLAN.id],
  )
  assert.deepEqual(values.rows, [
    { code: 'domain.enabled', kind: 'boolean' },
    { code: 'domain.limit', kind: 'number' },
  ])

  await pool.query(
    `INSERT INTO entitlements (id,code,description)
     VALUES ('ent-domain-invalid','domain.invalid','Invalid object')`,
  )
  await assert.rejects(
    pool.query(
      `INSERT INTO plan_entitlements (plan_id,entitlement_id,value)
       VALUES ($1,'ent-domain-invalid',$2::jsonb)`,
      [FOUNDATION_PLAN.id, JSON.stringify({ enabled: true })],
    ),
    (error) => pgCode(error) === '23514',
  )
})
