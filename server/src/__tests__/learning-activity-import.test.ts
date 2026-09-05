import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { importLearningActivitiesRequestSchema } from '../modules/learning/contracts.js'

const application = readFileSync('server/src/modules/learning/activity-import-application.ts', 'utf8')
const repository = readFileSync('server/src/modules/learning/activity-import-repository.ts', 'utf8')
const router = readFileSync('server/src/modules/learning/classroom-router.ts', 'utf8')

const request = {
  sourceSystem: 'standard-import-fixture',
  externalImportId: 'import-2026-fall',
  activities: [{
    externalId: 'activity-1',
    title: 'Number lines',
    instructions: 'Place each value on the number line.',
    kind: 'PRACTICE',
    knowledgeUnitIds: ['unit-1'],
  }],
}

test('standard Activity Import accepts only bounded canonical activity drafts', () => {
  assert.equal(importLearningActivitiesRequestSchema.safeParse(request).success, true)
  for (const forbidden of [
    { status: 'PUBLISHED' },
    { learningState: { level: 4 } },
    { attempt: { answer: 'done' } },
    { evidence: { id: 'evidence-1' } },
  ]) {
    assert.equal(importLearningActivitiesRequestSchema.safeParse({
      ...request,
      activities: [{ ...request.activities[0], ...forbidden }],
    }).success, false)
  }
  assert.equal(importLearningActivitiesRequestSchema.safeParse({
    ...request,
    activities: [request.activities[0], request.activities[0]],
  }).success, false)
})

test('Activity Import writes only canonical activities and their knowledge-unit links', () => {
  assert.match(repository, /INSERT INTO learning_activities/)
  assert.match(repository, /INSERT INTO learning_activity_knowledge_units/)
  assert.match(repository, /status='DRAFT'/)
  assert.doesNotMatch(repository, /(?:learning_states|learning_attempts|evidence_records|learning_cases)/)
  assert.doesNotMatch(repository, /CREATE TABLE|INSERT INTO .*imports/)
})

test('every accepted import becomes one retry-safe Domain Event in the same transaction', () => {
  assert.match(application, /createPermissionService[\s\S]*insertImportedLearningActivity[\s\S]*appendDomainEventInTransaction/)
  assert.match(application, /LEARNING_ACTIVITY\.IMPORTED/)
  assert.match(application, /sourceSystem[\s\S]*externalImportId[\s\S]*externalActivityId/)
  assert.match(application, /sha256[\s\S]*sourceSystem[\s\S]*externalImportId[\s\S]*externalId/)
  assert.match(router, /\.post\('\/projects\/:projectId\/learning\/activity-imports'/)
})
