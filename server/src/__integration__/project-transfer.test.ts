import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { ProjectTransferError } from '../modules/transfers/public.js'
import { projectTransferApplication } from '../modules/transfers/facade.js'
import { ensureTeacherPlans } from '../modules/entitlements/public.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const TEACHER = 'u-transfer-teacher'
const ADMIN = 'u-transfer-admin'
const LATE_STUDENT = 'u-transfer-late-student'
const SOURCE = 'co-transfer-source'
const TARGET = 'co-transfer-target'
const PROJECT = 'project-transfer-stable'
const CONTRACT = 'contract-transfer-target'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await ensureTeacherPlans(pool)
  await pool.query(
    `INSERT INTO users(id,email,display_name) VALUES
       ($1,'transfer-teacher@test.local','Transfer Teacher'),
       ($2,'transfer-admin@test.local','Transfer Admin'),
       ($3,'transfer-student@test.local','Transfer Student')`,
    [TEACHER, ADMIN, LATE_STUDENT],
  )
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,status,personal_owner_user_id,plan_id) VALUES
       ($1,'Transfer Source','transfer-source','PERSONAL','ACTIVE',$3,'plan-personal-free'),
       ($2,'Transfer Target','transfer-target','EDUCATION','ACTIVE',NULL,'plan-personal-free')`,
    [SOURCE, TARGET, TEACHER],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status) VALUES
       ($1,$3,'OWNER','ACTIVE'),
       ($2,$3,'MEMBER','ACTIVE'),
       ($2,$4,'OWNER','ACTIVE')`,
    [SOURCE, TARGET, TEACHER, ADMIN],
  )
  await pool.query(
    `INSERT INTO education_contracts
       (id,company_id,plan_id,status,starts_at,ends_at,seat_limit,config)
     VALUES ($1,$2,'plan-personal-free','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',10,$3::jsonb)`,
    [CONTRACT, TARGET, JSON.stringify({
      transfer: { enabled: true, policyVersion: 'transfer-v1', legalBasis: 'school-contract' },
    })],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status) VALUES
       ('seat-transfer-teacher',$1,$2,$3,'ACTIVE'),
       ('seat-transfer-admin',$1,$2,$4,'ACTIVE')`,
    [TARGET, CONTRACT, TEACHER, ADMIN],
  )
  await pool.query(
    `INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,preset_key) VALUES
       ($1,$3,'human','Transfer Teacher','T','#667085','avail',NULL),
       ($2,$4,'human','Transfer Admin','A','#667085','avail',NULL),
       ('agent-transfer-pulse',$3,'agent','Pulse','P','#7C3AED','avail','pulse')`,
    [TEACHER, ADMIN, SOURCE, TARGET],
  )
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
     VALUES ($1,$2,'TEACHING','plan-teacher-free','Stable Transfer Project','ACTIVE',$3)`,
    [PROJECT, SOURCE, TEACHER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role,status)
     VALUES ($1,$2,$3,'OWNER','ACTIVE')`,
    [SOURCE, PROJECT, TEACHER],
  )
  await pool.query(
    `INSERT INTO conversations(id,kind,title,members,leader_id,company_id,project_id)
     VALUES ('conversation-transfer','assistant','Transfer Context',$1::jsonb,'agent-transfer-pulse',$2,$3)`,
    [JSON.stringify([TEACHER, 'agent-transfer-pulse']), SOURCE, PROJECT],
  )
  await pool.query(
    `INSERT INTO courses(id,company_id,project_id,created_by)
     VALUES ('course-transfer',$1,$2,$3)`,
    [SOURCE, PROJECT, TEACHER],
  )
  await pool.query(
    `INSERT INTO im_channel_bindings(channel_id,company_id,profile)
     VALUES ('conversation-transfer',$1,$2::jsonb)`,
    [SOURCE, JSON.stringify({ channelId: 'conversation-transfer', members: [TEACHER, 'agent-transfer-pulse'] })],
  )
  await pool.query(
    `INSERT INTO context_threads(id,company_id,project_id,context_type,context_id,channel_id,created_by)
     VALUES ('thread-transfer',$1,$2,'TEACHER_OPERATIONS',$2,'conversation-transfer',$3)`,
    [SOURCE, PROJECT, TEACHER],
  )
  await pool.query(
    `INSERT INTO context_thread_participants(thread_id,company_id,project_id,participant_id)
     VALUES ('thread-transfer',$1,$2,$3)`,
    [SOURCE, PROJECT, TEACHER],
  )
  await pool.query(
    `INSERT INTO learning_project_teacher_agents(project_id,company_id,agent_id)
     VALUES ($1,$2,'agent-transfer-pulse')`,
    [PROJECT, SOURCE],
  )
  await pool.query(
    `INSERT INTO learning_knowledge_units
       (id,company_id,project_id,title,success_criteria,status,created_by)
     VALUES ('unit-transfer',$1,$2,'Transfer Unit','Demonstrate transfer','PUBLISHED',$3)`,
    [SOURCE, PROJECT, TEACHER],
  )
  await pool.query(
    `INSERT INTO learning_cases(id,company_id,project_id,user_id,knowledge_unit_id,reason)
     VALUES ('case-transfer',$1,$2,$3,'unit-transfer','Needs review')`,
    [SOURCE, PROJECT, TEACHER],
  )
  await pool.query(
    `INSERT INTO evidence_records
       (id,company_id,project_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id)
     VALUES ('evidence-transfer',$1,$2,'L1','OBSERVED','TRANSFER_FIXTURE',$3,'{}','USER',$3)`,
    [SOURCE, PROJECT, TEACHER],
  )
})
after(async () => { await teardownAll() })

test('[integration] dual-confirmed transfer rechecks changed members and preserves Project-owned identities', async () => {
  const requested = await projectTransferApplication.request(TEACHER, SOURCE, PROJECT, {
    targetCompanyId: TARGET,
    idempotencyKey: 'request-transfer',
  })
  assert.equal(requested.status, 'PENDING')
  assert.equal((await projectTransferApplication.confirmTeacher(TEACHER, PROJECT, {
    idempotencyKey: 'teacher-confirm',
  })).status, 'PENDING')
  assert.equal((await projectTransferApplication.confirmEducation(ADMIN, PROJECT, {
    idempotencyKey: 'education-confirm',
  })).status, 'READY')

  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status)
     VALUES ($1,$2,'MEMBER','ACTIVE')`,
    [SOURCE, LATE_STUDENT],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role,status)
     VALUES ($1,$2,$3,'STUDENT','ACTIVE')`,
    [SOURCE, PROJECT, LATE_STUDENT],
  )
  await assert.rejects(
    projectTransferApplication.complete(ADMIN, PROJECT, { idempotencyKey: 'complete-transfer' }),
    (error: unknown) => error instanceof ProjectTransferError && error.code === 'conditions_not_ready',
  )

  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status)
     VALUES ($1,$2,'MEMBER','ACTIVE')`,
    [TARGET, LATE_STUDENT],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
     VALUES ('seat-transfer-student',$1,$2,$3,'ACTIVE')`,
    [TARGET, CONTRACT, LATE_STUDENT],
  )
  assert.equal((await projectTransferApplication.complete(ADMIN, PROJECT, {
    idempotencyKey: 'complete-transfer',
  })).status, 'COMPLETED')

  const { rows: projects } = await pool.query(
    `SELECT id,company_id,kind,plan_id,status FROM projects WHERE id=$1`, [PROJECT],
  )
  assert.deepEqual(projects, [{
    id: PROJECT,
    company_id: TARGET,
    kind: 'INSTITUTIONAL_COURSE',
    plan_id: null,
    status: 'ACTIVE',
  }])
  for (const [table, id] of [
    ['courses', 'course-transfer'],
    ['context_threads', 'thread-transfer'],
    ['learning_cases', 'case-transfer'],
    ['evidence_records', 'evidence-transfer'],
  ] as const) {
    const { rows } = await pool.query<{ id: string; company_id: string; project_id: string }>(
      `SELECT id,company_id,project_id FROM ${table} WHERE id=$1`, [id],
    )
    assert.deepEqual(rows, [{ id, company_id: TARGET, project_id: PROJECT }])
  }
  assert.deepEqual((await pool.query(
    `SELECT channel_id,company_id FROM im_channel_bindings WHERE channel_id='conversation-transfer'`,
  )).rows, [{ channel_id: 'conversation-transfer', company_id: TARGET }])
  assert.deepEqual((await pool.query(
    `SELECT id,company_id FROM participants WHERE id='agent-transfer-pulse' ORDER BY company_id`,
  )).rows, [{ id: 'agent-transfer-pulse', company_id: TARGET }])
  const { rows: events } = await pool.query<{ company_id: string; event_type: string }>(
    `SELECT company_id,event_type FROM domain_events
      WHERE project_id=$1 AND event_type LIKE 'PROJECT_TRANSFER.%'
      ORDER BY sequence`,
    [PROJECT],
  )
  assert.equal(events[0]?.company_id, SOURCE)
  assert.deepEqual(events.at(-1), { company_id: TARGET, event_type: 'PROJECT_TRANSFER.COMPLETED' })
})
