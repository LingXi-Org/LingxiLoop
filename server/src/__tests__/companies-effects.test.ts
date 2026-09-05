import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  claimCompanyOnboardingEffect,
  completeCompanyOnboardingEffect,
  enqueueMemberOnboardingEffect,
  failCompanyOnboardingEffect,
} from '../modules/companies/effects-repository.js'

function captureDb(rowCount = 1) {
  let sql = ''
  let values: readonly unknown[] | undefined
  const db: Queryable = {
    async query(text, params) {
      sql = text
      values = params
      return { rows: [], rowCount } as never
    },
  }
  return { db, sql: () => sql, values: () => values }
}

test('member acceptance enqueue is tenant-scoped and never replaces an active lease', async () => {
  const capture = captureDb()
  await enqueueMemberOnboardingEffect(capture.db, 'co-a', 'user-a')
  assert.match(capture.sql(), /ON CONFLICT\(company_id,member_id,kind\) DO NOTHING/)
  assert.doesNotMatch(capture.sql(), /DO UPDATE|lease_token\s*=/)
  assert.deepEqual(capture.values()?.slice(1), ['co-a', 'user-a'])
})

test('invitation membership, audit and onboarding enqueue share the acceptance transaction', () => {
  const application = readFileSync(new URL('../modules/companies/application.ts', import.meta.url), 'utf8')
  assert.match(
    application,
    /transaction\(async \(db\) => \{[\s\S]{0,2600}insertAcceptedMembership\(db,[\s\S]{0,900}auditInTransaction\(db,[\s\S]{0,900}enqueueMemberOnboardingEffect\(db,/,
  )
  assert.doesNotMatch(application, /infrastructure\.seedMemberDms/)
})

test('company onboarding claims one expired or due effect with a fresh lease fence', async () => {
  const capture = captureDb(0)
  assert.equal(await claimCompanyOnboardingEffect(capture.db), null)
  assert.match(capture.sql(), /status='processing' AND lease_expires_at<NOW\(\)/)
  assert.match(capture.sql(), /FOR UPDATE SKIP LOCKED LIMIT 1/)
  assert.match(capture.sql(), /lease_token=\$1/)
})

test('company onboarding completion and failure require tenant, member and lease identity', async () => {
  const effect = {
    id: 'effect-a', companyId: 'co-a', memberId: 'user-a', attempts: 1, leaseToken: 'lease-a',
  }
  const completed = captureDb()
  await completeCompanyOnboardingEffect(completed.db, effect)
  assert.match(completed.sql(), /WHERE id=\$1 AND company_id=\$2 AND member_id=\$3/)
  assert.match(completed.sql(), /lease_token=\$4 AND status='processing'/)

  const failed = captureDb()
  await failCompanyOnboardingEffect(failed.db, effect, 'temporary failure')
  assert.match(failed.sql(), /WHERE id=\$1 AND company_id=\$2 AND member_id=\$3/)
  assert.match(failed.sql(), /lease_token=\$4 AND status='processing'/)
})

test('company onboarding worker renews each single claim and seeds only Agent learning ContextThreads', () => {
  const worker = readFileSync(new URL('../modules/companies/worker.ts', import.meta.url), 'utf8')
  const rootWorker = readFileSync(new URL('../worker.ts', import.meta.url), 'utf8')
  assert.match(worker, /claimCompanyOnboardingEffect\(pool\)/)
  assert.match(worker, /renewCompanyOnboardingEffectLease\(pool, effect\)/)
  assert.match(worker, /seedMemberLearningContextThreads/)
  assert.match(rootWorker, /company-onboarding-effects[\s\S]*startCompanyOnboardingEffectWorker/)
  assert.doesNotMatch(worker, /\b(?:INSERT|UPDATE|DELETE|SELECT)\b/)
})
