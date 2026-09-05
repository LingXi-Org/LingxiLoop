import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  findTeacherAttemptDetail,
  loadTeacherLearnerDetailRows,
  loadTeacherOverviewRows,
} from '../modules/learning/teacher-reporting-repository.js'

const scope = { companyId: 'company-1', projectId: 'project-1', courseId: 'course-1' }

function recordingDb() {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const db = {
    query: async <T>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      return { rows: [] as T[], rowCount: 0 }
    },
  } as Queryable
  return { db, calls }
}

test('Pulse overview reads Project-scoped LearningState facts', async () => {
  const { db, calls } = recordingDb()
  await loadTeacherOverviewRows(db, scope, 30)

  assert.equal(calls.length, 5)
  assert.ok(calls.every((call) => call.params?.[0] === scope.companyId && call.params?.[1] === scope.projectId))
  const sql = calls.map((call) => call.sql).join('\n')
  assert.match(sql, /learning_states/)
  assert.match(sql, /attention_items/)
  assert.match(sql, /evaluation\.status='PENDING'/)
  assert.doesNotMatch(sql, /state\.status='NEEDS_REVIEW'|mission\.status='PAUSED'/)
  assert.doesNotMatch(sql, /learning_mastery|learning_objectives|attempt\.course_id/)
})

test('Pulse learner detail and evidence use composite company and Project joins', async () => {
  const { db, calls } = recordingDb()
  await loadTeacherLearnerDetailRows(db, scope, 'learner-1')
  await findTeacherAttemptDetail(db, scope, 'attempt-1')

  const sql = calls.map((call) => call.sql).join('\n')
  assert.match(sql, /unit\.project_id=state\.project_id/)
  assert.match(sql, /candidate\.company_id=attempt\.company_id AND candidate\.project_id=attempt\.project_id/)
  assert.match(sql, /evaluation\.company_id=attempt\.company_id AND evaluation\.project_id=attempt\.project_id/)
  assert.ok(calls.every((call) => call.params?.[1] === scope.projectId))
})

test('Pulse application exposes state naming and the canonical evaluation default', () => {
  const source = readFileSync(new URL('../modules/learning/teacher-agent-application.ts', import.meta.url), 'utf8')
  assert.match(source, /stateDistribution:distribution/)
  assert.match(source, /\?\?'TEACHER_REQUIRED'/)
  assert.doesNotMatch(source, /masteryDistribution/)
})
