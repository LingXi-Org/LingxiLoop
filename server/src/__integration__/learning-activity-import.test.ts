import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { LearningApplicationError } from '../modules/learning/application.js'
import { learningApplication } from '../modules/learning/facade.js'
import { ensureTeacherPlans } from '../modules/entitlements/public.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const TEACHER = 'u-activity-import-teacher'
const COMPANY = 'co-activity-import'
const PROJECT = 'project-activity-import'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await ensureTeacherPlans(pool)
  await pool.query(
    `INSERT INTO users(id,email,display_name)
     VALUES ($1,'activity-import@test.local','Activity Import Teacher')`,
    [TEACHER],
  )
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,status,personal_owner_user_id,plan_id)
     VALUES ($1,'Activity Import','activity-import','PERSONAL','ACTIVE',$2,'plan-personal-free')`,
    [COMPANY, TEACHER],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status)
     VALUES ($1,$2,'OWNER','ACTIVE')`,
    [COMPANY, TEACHER],
  )
  await pool.query(
    `INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status)
     VALUES ($1,$2,'human','Activity Import Teacher','A','#667085','avail')`,
    [TEACHER, COMPANY],
  )
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
     VALUES ($1,$2,'TEACHING','plan-teacher-free','Import Project','ACTIVE',$3)`,
    [PROJECT, COMPANY, TEACHER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role,status)
     VALUES ($1,$2,$3,'OWNER','ACTIVE')`,
    [COMPANY, PROJECT, TEACHER],
  )
  await pool.query(
    `INSERT INTO learning_knowledge_units
       (id,company_id,project_id,title,success_criteria,status,created_by)
     VALUES ('unit-import',$1,$2,'Import Unit','Complete the activity','PUBLISHED',$3)`,
    [COMPANY, PROJECT, TEACHER],
  )
})
after(async () => { await teardownAll() })

const importRequest = {
  sourceSystem: 'fixture-standard',
  externalImportId: 'fall-2026',
  activities: [{
    externalId: 'external-activity-1',
    title: 'Imported practice',
    instructions: 'Use the imported material.',
    kind: 'PRACTICE' as const,
    evaluationMode: 'TEACHER_REQUIRED' as const,
    targetLevel: 2,
    rubric: [],
    knowledgeUnitIds: ['unit-import'],
  }],
}

test('[integration] Activity Import is transactional, event-backed and retry-safe', async () => {
  const scope = { userId: TEACHER, companyId: COMPANY }
  const first = await learningApplication.importActivities(scope, PROJECT, importRequest)
  assert.equal(first.imported.length, 1)
  assert.equal(first.imported[0]?.created, true)
  const replay = await learningApplication.importActivities(scope, PROJECT, importRequest)
  assert.deepEqual(replay, {
    imported: [{ ...first.imported[0]!, created: false }],
  })
  assert.deepEqual((await pool.query(
    `SELECT id,status,title FROM learning_activities WHERE company_id=$1 AND project_id=$2`,
    [COMPANY, PROJECT],
  )).rows, [{ id: first.imported[0]!.activityId, status: 'DRAFT', title: 'Imported practice' }])
  assert.equal((await pool.query(
    `SELECT 1 FROM domain_events
      WHERE company_id=$1 AND project_id=$2 AND event_type='LEARNING_ACTIVITY.IMPORTED'`,
    [COMPANY, PROJECT],
  )).rowCount, 1)

  await assert.rejects(
    learningApplication.importActivities(scope, PROJECT, {
      ...importRequest,
      activities: [{ ...importRequest.activities[0], title: 'Changed identity payload' }],
    }),
    (error: unknown) => error instanceof LearningApplicationError && error.code === 'conflict',
  )
})
