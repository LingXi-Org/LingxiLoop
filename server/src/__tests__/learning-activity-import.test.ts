import assert from 'node:assert/strict'
import test from 'node:test'
import { importLearningActivitiesRequestSchema } from '../modules/learning/contracts.js'

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
