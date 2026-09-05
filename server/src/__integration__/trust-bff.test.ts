import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { TrustApplicationError } from '../modules/trust/application.js'
import { trustApplication } from '../modules/trust/facade.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const ADMIN = 'u-trust-admin'
const TEACHER = 'u-trust-teacher'
const COMPANY = 'co-trust'
const PROJECT = 'project-trust'
const CONTRACT = 'contract-trust'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await pool.query(
    `INSERT INTO users(id,email,display_name) VALUES
       ($1,'trust-admin@test.local','Trust Admin'),
       ($2,'trust-teacher@test.local','Trust Teacher')`,
    [ADMIN,TEACHER],
  )
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,status,plan_id)
     VALUES ($1,'Trust School','trust-school','EDUCATION','ACTIVE','plan-personal-free')`,
    [COMPANY],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status) VALUES
       ($1,$2,'ADMIN','ACTIVE'),($1,$3,'MEMBER','ACTIVE')`,
    [COMPANY,ADMIN,TEACHER],
  )
  await pool.query(
    `INSERT INTO education_contracts
       (id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES ($1,$2,'plan-personal-free','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',5)`,
    [CONTRACT,COMPANY],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status) VALUES
       ('seat-trust-admin',$1,$2,$3,'ACTIVE'),('seat-trust-teacher',$1,$2,$4,'ACTIVE')`,
    [COMPANY,CONTRACT,ADMIN,TEACHER],
  )
  await pool.query(
    `INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status) VALUES
       ($1,$3,'human','Trust Admin','A','#667085','avail'),
       ($2,$3,'human','Trust Teacher','T','#667085','avail')`,
    [ADMIN,TEACHER,COMPANY],
  )
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by)
     VALUES ($1,$2,'INSTITUTIONAL_COURSE','plan-personal-free','Trust Course','ACTIVE',$3)`,
    [PROJECT,COMPANY,TEACHER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role,status)
     VALUES ($1,$2,$3,'TEACHER','ACTIVE')`,
    [COMPANY,PROJECT,TEACHER],
  )
  await pool.query(
    `INSERT INTO evidence_records
       (id,company_id,project_id,level,derivation,kind,data,created_by_type)
     VALUES ('evidence-trust-kpi',$1,$2,'L2','COMPUTED','TRUST_KPI',$3::jsonb,'SYSTEM')`,
    [COMPANY,PROJECT,JSON.stringify({
      label: 'Verified knowledge coverage', value: 0.8, threshold: 0.75,
      numerator: 8, denominator: 10,
      window: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-30T00:00:00.000Z' },
      source: 'learning_states', dataset: 'course-trust', release: '2026-08-30',
    })],
  )
})
after(async () => { await teardownAll() })

test('[integration] Trust BFF enforces audience levels and creates retry-safe signed Evidence snapshots', async () => {
  assert.equal((await trustApplication.context(TEACHER,COMPANY,PROJECT)).audienceLevel, 'L2')
  assert.equal((await trustApplication.context(ADMIN,COMPANY,PROJECT)).audienceLevel, 'L3')
  const kpis = await trustApplication.kpis(TEACHER,COMPANY,PROJECT)
  assert.equal(kpis[0]?.evidenceId, 'evidence-trust-kpi')
  assert.equal(kpis[0]?.denominator, 10)
  const first = await trustApplication.createSnapshot(ADMIN,COMPANY,PROJECT,{ idempotencyKey: 'snapshot-once' })
  const replay = await trustApplication.createSnapshot(ADMIN,COMPANY,PROJECT,{ idempotencyKey: 'snapshot-once' })
  assert.deepEqual(replay, first)
  assert.equal((await pool.query(`SELECT 1 FROM trust_snapshots WHERE id=$1`, [first.id])).rowCount, 1)
  assert.equal((await pool.query(`SELECT 1 FROM evidence_records WHERE id=$1`, [first.evidenceId])).rowCount, 1)
  assert.equal((await pool.query(
    `SELECT 1 FROM domain_events WHERE event_type='TRUST_SNAPSHOT.CREATED' AND aggregate_id=$1`,
    [first.id],
  )).rowCount, 1)
  await assert.rejects(
    trustApplication.readSnapshot(TEACHER,COMPANY,PROJECT,first.id),
    (error: unknown) => error instanceof TrustApplicationError && error.code === 'forbidden',
  )
  await assert.rejects(pool.query(`UPDATE trust_snapshots SET dataset_release='changed' WHERE id=$1`, [first.id]))
})
