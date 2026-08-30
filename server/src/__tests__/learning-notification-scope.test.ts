import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Course notifications adapt Project-scoped learning facts without legacy mastery', () => {
  const source = readFileSync(new URL('../modules/learning/notifications.ts', import.meta.url), 'utf8')
  assert.match(source, /course\.project_id=state\.project_id AND course\.company_id=state\.company_id/)
  assert.match(source, /state\.company_id=claimed\.company_id AND state\.project_id=course\.project_id/)
  assert.match(source, /attempt\.company_id=evaluation\.company_id AND attempt\.project_id=evaluation\.project_id/)
  assert.match(source, /attempt\.company_id=claimed\.company_id AND attempt\.project_id=course\.project_id/)
  assert.match(source, /evaluation\.status='PENDING'/)
  assert.doesNotMatch(source, /learning_mastery|attempt\.course_id/)
})
