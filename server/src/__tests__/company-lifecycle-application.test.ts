import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import type { CompanyStatus } from '../domain/public.js'
import { CompanyLifecycleApplication } from '../modules/companies/lifecycle-application.js'

test('Education lifecycle updates only its Company and leaves Personal context outside the transaction', async () => {
  let educationStatus: CompanyStatus = 'ACTIVE'
  const writes: string[] = []
  let audits = 0
  const db: Queryable = {
    query: async (sql) => {
      if (/FROM users WHERE/.test(sql)) {
        return { rows: [{ id: 'admin', deleted_at: null, suspended_at: null }], rowCount: 1 } as never
      }
      if (/FROM companies WHERE/.test(sql)) {
        return { rows: [{ id: 'education', type: 'EDUCATION', status: educationStatus, plan_id: 'education-plan' }], rowCount: 1 } as never
      }
      if (/FROM company_memberships/.test(sql)) {
        return { rows: [{ role: 'ADMIN', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM organization_seats/.test(sql)) {
        return { rows: [{ plan_id: 'education-plan' }], rowCount: 1 } as never
      }
      if (/FROM plans WHERE/.test(sql)) {
        return { rows: [{ id: 'education-plan', code: 'EDUCATION', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plan_entitlements/.test(sql)) return { rows: [], rowCount: 0 } as never
      if (/UPDATE companies/.test(sql)) {
        writes.push(sql)
        educationStatus = 'GRACE_PERIOD'
        return { rows: [], rowCount: 1 } as never
      }
      throw new Error(`unexpected Company lifecycle query: ${sql}`)
    },
  }
  const application = new CompanyLifecycleApplication({
    transaction: (work) => work(db),
    auditInTransaction: async () => { audits += 1 },
  })

  const command = { actorUserId: 'admin', companyId: 'education', command: 'ENTER_GRACE_PERIOD' as const }
  assert.deepEqual(await application.execute(command), { ok: true, status: 'GRACE_PERIOD', applied: true })
  assert.deepEqual(await application.execute(command), { ok: true, status: 'GRACE_PERIOD', applied: false })
  assert.equal(writes.length, 1)
  assert.equal(writes.every((sql) => !/projects|subscriptions|personal/i.test(sql)), true)
  assert.equal(audits, 1)
})
