import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

test('teacher dashboard keeps raw evidence behind an explicit attempt request', () => {
  const shared = read('./useLearningDashboardData.ts')
  const teacher = read('./useTeacherOverviewData.ts')

  assert.match(
    shared,
    /perspective === 'teacher' \? Promise\.resolve\(\[\]\) : learningApi\.listEvidence\(projectId\)/,
  )
  assert.match(
    shared,
    /perspective === 'teacher' \? Promise\.resolve\(\[\]\) : learningApi\.listMissions\(projectId\)/,
  )
  assert.doesNotMatch(teacher, /listEvidence|listMissions|getAttempt|getLearner/)
  assert.match(teacher, /canReview \? learningApi\.listReviews\(projectId\)/)
})
