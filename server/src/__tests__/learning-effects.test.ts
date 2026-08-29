import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { claimLearningEffects } from '../modules/learning/effects-repository.js'

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

test('audit effect and effect completion share one claimed transaction', () => {
  const worker = readFileSync(new URL('../modules/learning/worker.ts', import.meta.url), 'utf8')
  const application = readFileSync(new URL('../modules/learning/application.ts', import.meta.url), 'utf8')
  assert.match(worker, /withTransaction\(pool, async \(db\) => \{[\s\S]*runEffect\(effect, db\)[\s\S]*completeLearningEffect\(db, effect\)/)
  assert.match(application, /auditInTransaction\(effectDb/)
  assert.doesNotMatch(application, /case 'course_create\.audit':[\s\S]{0,500}infrastructure\.audit\(/)
})
