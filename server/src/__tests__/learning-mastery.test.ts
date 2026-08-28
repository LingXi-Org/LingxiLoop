import assert from 'node:assert/strict'
import test from 'node:test'
import { projectMastery } from '../modules/learning/mastery.js'

const base = { previousLevel: 0, previousIndependentEvidenceCount: 0, demonstratedLevel: 3, assistance: 'none' as const,
  confidence: 0.9, activityType: 'practice' as const, activityTargetLevel: 3, evaluatorKind: 'agent' as const, teacherConfirmed: false }

test('guided evidence cannot project beyond level 2', () => {
  assert.equal(projectMastery({ ...base, demonstratedLevel: 4, assistance: 'guided', activityTargetLevel: 4 }).nextLevel, 2)
})

test('level 3 requires two independent demonstrations', () => {
  const first = projectMastery(base)
  assert.equal(first.nextLevel, 2)
  assert.equal(first.nextIndependentEvidenceCount, 1)
  const second = projectMastery({ ...base, previousLevel: first.nextLevel, previousIndependentEvidenceCount: first.nextIndependentEvidenceCount })
  assert.equal(second.nextLevel, 3)
})

test('repeating the same activity does not count as independent evidence', () => {
  const repeated = projectMastery({ ...base, previousLevel: 2, previousIndependentEvidenceCount: 1, evidenceDistinct: false })
  assert.equal(repeated.nextLevel, 2)
  assert.equal(repeated.nextIndependentEvidenceCount, 1)
})

test('level 4 requires teacher-confirmed project or assessment evidence', () => {
  const proposed = projectMastery({ ...base, previousLevel: 3, previousIndependentEvidenceCount: 2, demonstratedLevel: 4, activityType: 'project', activityTargetLevel: 4 })
  assert.equal(proposed.pendingTeacher, true)
  assert.equal(proposed.nextLevel, 3)
  const confirmed = projectMastery({ ...base, previousLevel: 3, previousIndependentEvidenceCount: 2, demonstratedLevel: 4,
    activityType: 'project', activityTargetLevel: 4, evaluatorKind: 'teacher', teacherConfirmed: true })
  assert.equal(confirmed.nextLevel, 4)
})

test('lower evidence flags review without automatic downgrade', () => {
  const decision = projectMastery({ ...base, previousLevel: 3, previousIndependentEvidenceCount: 2, demonstratedLevel: 1 })
  assert.equal(decision.nextLevel, 3)
  assert.equal(decision.needsReview, true)
})
