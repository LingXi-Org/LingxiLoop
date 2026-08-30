import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { EnterpriseApplicationError } from '../modules/enterprise/application.js'
import { enterpriseApplication } from '../modules/enterprise/facade.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const ADMIN = 'u-enterprise-admin'
const COMPANY = 'co-enterprise'
const OTHER_COMPANY = 'co-enterprise-other'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await pool.query(
    `INSERT INTO users(id,email,display_name) VALUES ($1,'enterprise-admin@test.local','Enterprise Admin')`,
    [ADMIN],
  )
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,status,plan_id) VALUES
       ($1,'Enterprise School','enterprise-school','EDUCATION','ACTIVE','plan-personal-free'),
       ($2,'Other School','other-school','EDUCATION','ACTIVE','plan-personal-free')`,
    [COMPANY,OTHER_COMPANY],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status) VALUES
       ($1,$3,'ADMIN','ACTIVE'),($2,$3,'ADMIN','ACTIVE')`,
    [COMPANY,OTHER_COMPANY,ADMIN],
  )
})
after(async () => { await teardownAll() })

test('[integration] Organization hierarchy is tenant-scoped and idempotent', async () => {
  const root = await enterpriseApplication.createUnit(ADMIN,COMPANY,{
    name: 'School', parentUnitId: null, idempotencyKey: 'root-unit',
  })
  const child = await enterpriseApplication.createUnit(ADMIN,COMPANY,{
    name: 'Science', parentUnitId: root.id, idempotencyKey: 'science-unit',
  })
  assert.equal(child.parentUnitId, root.id)
  assert.equal((await enterpriseApplication.createUnit(ADMIN,COMPANY,{
    name: 'Science', parentUnitId: root.id, idempotencyKey: 'science-unit',
  })).created, false)

  const foreign = await enterpriseApplication.createUnit(ADMIN,OTHER_COMPANY,{
    name: 'Foreign', parentUnitId: null, idempotencyKey: 'foreign-unit',
  })
  await assert.rejects(
    enterpriseApplication.createUnit(ADMIN,COMPANY,{
      name: 'Invalid', parentUnitId: foreign.id, idempotencyKey: 'invalid-parent',
    }),
    (error: unknown) => error instanceof EnterpriseApplicationError && error.code === 'not_found',
  )
  assert.deepEqual((await enterpriseApplication.listUnits(ADMIN,COMPANY)).map((unit) => unit.name), ['School','Science'])
})

test('[integration] Governance Policy writes reject stale revisions and replay identical outcomes', async () => {
  const request = { policyVersion: 'retention-v1', config: { retentionDays: 365 }, expectedRevision: 0 }
  const first = await enterpriseApplication.putPolicy(ADMIN,COMPANY,'RETENTION',request)
  assert.equal(first.revision, 1)
  assert.equal(first.changed, true)
  assert.equal((await enterpriseApplication.putPolicy(ADMIN,COMPANY,'RETENTION',request)).changed, false)
  await assert.rejects(
    enterpriseApplication.putPolicy(ADMIN,COMPANY,'RETENTION',{
      ...request, config: { retentionDays: 730 },
    }),
    (error: unknown) => error instanceof EnterpriseApplicationError && error.code === 'conflict',
  )
  const second = await enterpriseApplication.putPolicy(ADMIN,COMPANY,'RETENTION',{
    policyVersion: 'retention-v2', config: { retentionDays: 730 }, expectedRevision: 1,
  })
  assert.equal(second.revision, 2)
  assert.equal((await pool.query(
    `SELECT 1 FROM domain_events WHERE event_type='GOVERNANCE_POLICY.CONFIGURED' AND aggregate_id=$1`,
    [second.id],
  )).rowCount, 2)
})
