import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { claimLearningEffects, enqueueLearningEffect } from '../modules/learning/effects-repository.js'

test('expired processing learning effects are reclaimed with a fresh fence', async () => {
  let sql = ''
  const db: Queryable = {
    async query(text) {
      sql = text
      return { rows: [], rowCount: 0 } as never
    },
  }
  assert.deepEqual(await claimLearningEffects(db), [])
  assert.match(sql, /status='processing' AND lease_expires_at<NOW\(\)/)
  assert.match(sql, /lease_token=\$2/)
  assert.match(sql, /FOR UPDATE SKIP LOCKED/)
})

test('re-enqueued learning effects supersede stale leases by tenant-scoped effect identity', async () => {
  let sql = ''
  let values: unknown[] | undefined
  const db: Queryable = {
    async query(text, params) {
      sql = text
      values = params as unknown[]
      return { rows: [], rowCount: 1 } as never
    },
  }
  await enqueueLearningEffect(db, {
    companyId: 'co-a', courseId: 'course-a', kind: 'member_access.revoke',
    effectKey: 'user-a', payload: { userId: 'user-a' },
  })
  assert.match(sql, /ON CONFLICT\(company_id,course_id,kind,effect_key\) DO UPDATE/)
  assert.match(sql, /id=EXCLUDED\.id[\s\S]*status='pending'[\s\S]*lease_token=NULL/)
  assert.deepEqual(values?.slice(1, 5), ['co-a', 'course-a', 'member_access.revoke', 'user-a'])
})

test('course creation writes its audit in the creation transaction', () => {
  const application = readFileSync(new URL('../modules/learning/application.ts', import.meta.url), 'utf8')
  assert.match(application, /transaction\(async \(db\) => \{[\s\S]{0,1600}auditInTransaction\(db, \{[\s\S]{0,100}kind: 'course_create'/)
  assert.doesNotMatch(application, /course_create\.audit/)
  assert.doesNotMatch(application, /infrastructure\.audit\(/)
})
