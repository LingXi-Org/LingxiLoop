import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { companyLifecycleApplication } from '../modules/companies/facade.js'
import { provisionPersonalWorkspace } from '../modules/companies/public.js'
import { ProjectLifecycleError } from '../modules/projects/public.js'
import { projectLifecycleApplication } from '../modules/projects/facade.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const OWNER = 'u-project-lifecycle-owner'
const COMPANY = 'co-project-lifecycle'
const PROJECT = 'prj-project-lifecycle'
const PERSONAL_ISOLATION_OWNER = 'u-personal-isolation-owner'
const EDUCATION_COMPANY = 'co-education-lifecycle'
const EDUCATION_PLAN = 'plan-education-lifecycle'

interface PersonalContextSnapshot {
  company: {
    id: string
    personalOwnerUserId: string
    status: string
    type: string
    updatedAt: string
  }
  planIds: {
    company: string
    project: string | null
  }
  project: {
    id: string
    companyId: string
    isDefault: boolean
    kind: string
    status: string
    updatedAt: string
  }
  companyMembership: {
    id: string
    companyId: string
    role: string
    status: string
    updatedAt: string
    userId: string
  }
  projectMembership: {
    id: string
    companyId: string
    projectId: string
    role: string
    status: string
    updatedAt: string
    userId: string
  }
}

async function personalContextSnapshot(input: {
  companyId: string
  projectId: string
  userId: string
}): Promise<PersonalContextSnapshot> {
  const { rows } = await pool.query<{ snapshot: PersonalContextSnapshot }>(
    `SELECT jsonb_build_object(
       'company', jsonb_build_object(
         'id', company.id,
         'personalOwnerUserId', company.personal_owner_user_id,
         'status', company.status,
         'type', company.type,
         'updatedAt', company.updated_at
       ),
       'planIds', jsonb_build_object(
         'company', company.plan_id,
         'project', project.plan_id
       ),
       'project', jsonb_build_object(
         'id', project.id,
         'companyId', project.company_id,
         'isDefault', project.is_default,
         'kind', project.kind,
         'status', project.status,
         'updatedAt', project.updated_at
       ),
       'companyMembership', jsonb_build_object(
         'id', company_membership.id,
         'companyId', company_membership.company_id,
         'role', company_membership.role,
         'status', company_membership.status,
         'updatedAt', company_membership.updated_at,
         'userId', company_membership.user_id
       ),
       'projectMembership', jsonb_build_object(
         'id', project_membership.id,
         'companyId', project_membership.company_id,
         'projectId', project_membership.project_id,
         'role', project_membership.role,
         'status', project_membership.status,
         'updatedAt', project_membership.updated_at,
         'userId', project_membership.user_id
       )
     ) AS snapshot
       FROM companies company
       JOIN company_memberships company_membership
         ON company_membership.company_id=company.id AND company_membership.user_id=$3
       JOIN projects project
         ON project.id=$2 AND project.company_id=company.id
       JOIN project_memberships project_membership
         ON project_membership.company_id=company.id AND project_membership.project_id=project.id
        AND project_membership.user_id=$3
      WHERE company.id=$1 AND company.type='PERSONAL' AND company.personal_owner_user_id=$3
        AND project.is_default=TRUE`,
    [input.companyId, input.projectId, input.userId],
  )
  assert.equal(rows.length, 1)
  return rows[0]!.snapshot
}

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await pool.query(`DELETE FROM audit_events WHERE company_id=$1`, [COMPANY])
  await pool.query(
    `INSERT INTO users (id,email,display_name) VALUES ($1,'lifecycle-owner@test.local','Lifecycle Owner')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,personal_owner_user_id,plan_id)
     VALUES ($1,'Lifecycle Company','lifecycle-company','PERSONAL',$2,'plan-personal-free')`,
    [COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role) VALUES ($1,$2,'OWNER')`,
    [COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO projects (id,company_id,kind,name,status,created_by)
     VALUES ($1,$2,'TEACHING','Lifecycle Project','ACTIVE',$3)`,
    [PROJECT, COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships (company_id,project_id,user_id,role)
     VALUES ($1,$2,$3,'OWNER')`,
    [COMPANY, PROJECT, OWNER],
  )
})
after(async () => { await teardownAll() })

test('[integration] concurrent transfer requests apply once and audit once', async () => {
  const requestTransfer = {
    actorUserId: OWNER,
    companyId: COMPANY,
    projectId: PROJECT,
    command: 'REQUEST_TRANSFER' as const,
  }
  const results = await Promise.all([
    projectLifecycleApplication.execute(requestTransfer),
    projectLifecycleApplication.execute(requestTransfer),
  ])

  assert.deepEqual(
    [...results].sort((left, right) => Number(right.applied) - Number(left.applied)),
    [
      { ok: true, status: 'TRANSFER_PENDING', applied: true },
      { ok: true, status: 'TRANSFER_PENDING', applied: false },
    ],
  )

  const persistedState = async () => {
    const project = await pool.query<{ status: string; updated_at: Date }>(
      `SELECT status,updated_at FROM projects WHERE id=$1 AND company_id=$2`,
      [PROJECT, COMPANY],
    )
    const audits = await pool.query<{
      user_id: string | null
      company_id: string | null
      kind: string
      detail: Record<string, unknown> | null
    }>(
      `SELECT user_id,company_id,kind,detail
         FROM audit_events
        WHERE company_id=$1 AND kind='project_lifecycle_transition'
        ORDER BY id`,
      [COMPANY],
    )
    return { project: project.rows, audits: audits.rows }
  }
  const afterTransfer = await persistedState()
  assert.deepEqual(afterTransfer.project.map(({ status }) => ({ status })), [{ status: 'TRANSFER_PENDING' }])
  assert.deepEqual(afterTransfer.audits, [{
    user_id: OWNER,
    company_id: COMPANY,
    kind: 'project_lifecycle_transition',
    detail: {
      projectId: PROJECT,
      projectKind: 'TEACHING',
      command: 'REQUEST_TRANSFER',
      from: 'ACTIVE',
      to: 'TRANSFER_PENDING',
    },
  }])

  await assert.rejects(
    projectLifecycleApplication.execute({
      actorUserId: OWNER,
      companyId: COMPANY,
      projectId: PROJECT,
      command: 'ENTER_RETENTION',
    }),
    (error: unknown) => error instanceof ProjectLifecycleError && error.code === 'invalid_transition',
  )
  assert.deepEqual(await persistedState(), afterTransfer)
})

test('[integration] Education Company lifecycle leaves the owned Personal Context unchanged', async () => {
  await pool.query(
    `INSERT INTO users (id,email,display_name)
     VALUES ($1,'personal-isolation-owner@test.local','Personal Isolation Owner')`,
    [PERSONAL_ISOLATION_OWNER],
  )
  const personal = await withTransaction(pool, (db) => (
    provisionPersonalWorkspace(db, PERSONAL_ISOLATION_OWNER)
  ))
  assert.equal(personal.created, true)

  await pool.query(
    `INSERT INTO plans (id,code,name,status)
     VALUES ($1,'EDUCATION_LIFECYCLE_TEST','Education Lifecycle Test','ACTIVE')`,
    [EDUCATION_PLAN],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,status,plan_id)
     VALUES ($1,'Education Lifecycle','education-lifecycle','EDUCATION','ACTIVE',$2)`,
    [EDUCATION_COMPANY, EDUCATION_PLAN],
  )
  await pool.query(
    `INSERT INTO company_memberships (company_id,user_id,role,status)
     VALUES ($1,$2,'OWNER','ACTIVE')`,
    [EDUCATION_COMPANY, PERSONAL_ISOLATION_OWNER],
  )
  await pool.query(
    `INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES ('contract-education-lifecycle',$1,$2,'ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',1)`,
    [EDUCATION_COMPANY, EDUCATION_PLAN],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
     VALUES ('seat-education-lifecycle',$1,'contract-education-lifecycle',$2,'ACTIVE')`,
    [EDUCATION_COMPANY, PERSONAL_ISOLATION_OWNER],
  )

  const beforeTransition = await personalContextSnapshot({
    companyId: personal.companyId,
    projectId: personal.projectId,
    userId: PERSONAL_ISOLATION_OWNER,
  })
  assert.deepEqual({
    company: {
      id: beforeTransition.company.id,
      ownerUserId: beforeTransition.company.personalOwnerUserId,
      membershipRole: beforeTransition.companyMembership.role,
    },
    planIds: beforeTransition.planIds,
    project: {
      id: beforeTransition.project.id,
      companyId: beforeTransition.project.companyId,
      kind: beforeTransition.project.kind,
      membershipRole: beforeTransition.projectMembership.role,
    },
  }, {
    company: {
      id: personal.companyId,
      ownerUserId: PERSONAL_ISOLATION_OWNER,
      membershipRole: 'OWNER',
    },
    planIds: { company: 'plan-personal-free', project: null },
    project: {
      id: personal.projectId,
      companyId: personal.companyId,
      kind: 'PERSONAL_LEARNING',
      membershipRole: 'OWNER',
    },
  })

  assert.deepEqual(
    await companyLifecycleApplication.execute({
      actorUserId: PERSONAL_ISOLATION_OWNER,
      companyId: EDUCATION_COMPANY,
      command: 'ENTER_GRACE_PERIOD',
    }),
    { ok: true, status: 'GRACE_PERIOD', applied: true },
  )
  const educationState = await pool.query<{ id: string; plan_id: string; status: string }>(
    `SELECT id,plan_id,status FROM companies WHERE id=$1`,
    [EDUCATION_COMPANY],
  )
  assert.deepEqual(educationState.rows, [{
    id: EDUCATION_COMPANY,
    plan_id: EDUCATION_PLAN,
    status: 'GRACE_PERIOD',
  }])

  assert.deepEqual(
    await personalContextSnapshot({
      companyId: personal.companyId,
      projectId: personal.projectId,
      userId: PERSONAL_ISOLATION_OWNER,
    }),
    beforeTransition,
  )
})
