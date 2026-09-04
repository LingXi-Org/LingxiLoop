import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { findTeacherTurnCounts } from '../modules/learning/teacher-runtime-repository.js'

test('Pulse turn counts use only tenant and Project learning facts', async () => {
  let captured: { sql: string; params?: unknown[] } | undefined
  const db = {
    query: async <T>(sql: string, params?: unknown[]) => {
      captured = { sql, params }
      return { rows: [] as T[], rowCount: 0 }
    },
  } as Queryable

  assert.deepEqual(await findTeacherTurnCounts(db, 'company-1', 'project-1'), {
    learners: 0,
    objectives: 0,
    activities: 0,
    pending_reviews: 0,
  })
  assert.deepEqual(captured?.params, ['company-1', 'project-1'])
  assert.match(captured?.sql ?? '', /learning_knowledge_units/)
  assert.match(captured?.sql ?? '', /attempt\.project_id=\$2/)
  assert.match(captured?.sql ?? '', /evaluation\.status='PENDING'/)
  assert.doesNotMatch(captured?.sql ?? '', /learning_objectives|attempt\.course_id/)
})

test('Pulse approval freshness resolves Project facts through the Course teaching adapter', () => {
  const source = readFileSync(new URL('../modules/learning/teacher-approval-repository.ts', import.meta.url), 'utf8')
  assert.match(source, /course\.project_id=objective\.project_id/)
  assert.match(source, /course\.project_id=activity\.project_id/)
  assert.match(source, /course\.project_id=attempt\.project_id/)
  assert.match(source, /attempt\.company_id=evaluation\.company_id AND attempt\.project_id=evaluation\.project_id/)
  assert.doesNotMatch(source, /learning_objectives|attempt\.course_id|objective\.course_id|activity\.course_id/)
})
