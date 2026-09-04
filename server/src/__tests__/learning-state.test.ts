import assert from 'node:assert/strict'
import test from 'node:test'
import { projectLearningState } from '../modules/learning/learning-state.js'

const base = {
  previousLevel: 0,
  previousIndependentEvidenceCount: 0,
  demonstratedLevel: 3,
  assistance: 'NONE' as const,
  confidence: 0.9,
  activityType: 'PRACTICE' as const,
  activityTargetLevel: 3,
  evaluatorKind: 'AGENT' as const,
  teacherConfirmed: false,
}

test('assisted evidence cannot project beyond level 2', () => {
  const decision = projectLearningState({
    ...base,
    demonstratedLevel: 4,
    assistance: 'GUIDED',
    activityTargetLevel: 4,
  })
  assert.equal(decision.nextLevel, 2)
})

test('level 3 requires two independent demonstrations', () => {
  const first = projectLearningState(base)
  assert.equal(first.nextLevel, 2)
  assert.equal(first.nextIndependentEvidenceCount, 1)
  const second = projectLearningState({
    ...base,
    previousLevel: first.nextLevel,
    previousIndependentEvidenceCount: first.nextIndependentEvidenceCount,
  })
  assert.equal(second.nextLevel, 3)
})

test('repeating the same qualified source does not count as independent evidence', () => {
  const repeated = projectLearningState({
    ...base,
    previousLevel: 2,
    previousIndependentEvidenceCount: 1,
    evidenceDistinct: false,
  })
  assert.equal(repeated.nextLevel, 2)
  assert.equal(repeated.nextIndependentEvidenceCount, 1)
})

test('level 4 requires teacher-confirmed project or assessment evidence', () => {
  const proposed = projectLearningState({
    ...base,
    previousLevel: 3,
    previousIndependentEvidenceCount: 2,
    demonstratedLevel: 4,
    activityType: 'PROJECT',
    activityTargetLevel: 4,
  })
  assert.equal(proposed.pendingTeacher, true)
  assert.equal(proposed.nextLevel, 3)
  const confirmed = projectLearningState({
    ...base,
    previousLevel: 3,
    previousIndependentEvidenceCount: 2,
    demonstratedLevel: 4,
    activityType: 'PROJECT',
    activityTargetLevel: 4,
    evaluatorKind: 'TEACHER',
    teacherConfirmed: true,
  })
  assert.equal(confirmed.nextLevel, 4)
})

test('lower evidence flags review without an automatic downgrade', () => {
  const decision = projectLearningState({
    ...base,
    previousLevel: 3,
    previousIndependentEvidenceCount: 2,
    demonstratedLevel: 1,
  })
  assert.equal(decision.nextLevel, 3)
  assert.equal(decision.needsReview, true)
})
