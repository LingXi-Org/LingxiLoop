import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { ProjectLifecycleError } from '../modules/projects/public.js'
import { projectLifecycleApplication } from '../modules/projects/facade.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const OWNER = 'u-project-lifecycle-owner'
const COMPANY = 'co-project-lifecycle'
const PROJECT = 'prj-project-lifecycle'

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
