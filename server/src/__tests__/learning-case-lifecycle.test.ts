import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LEARNING_CASE_ACTION_KINDS,
  type LearningCaseActionKind,
  type LearningCaseStatus,
  type LearningCaseTransition,
  transitionLearningCase,
} from '../domain/public.js'

type ExpectedTransition = Pick<LearningCaseTransition, 'outcome' | 'to'>

const EXPECTED_TRANSITIONS = {
  DETECTED: {
    DIAGNOSE: { outcome: 'APPLIED', to: 'IN_PROGRESS' },
    INTERVENE: { outcome: 'INVALID', to: null },
    REASSESS: { outcome: 'INVALID', to: null },
    ESCALATE: { outcome: 'APPLIED', to: 'ESCALATED' },
    OVERRIDE: { outcome: 'APPLIED', to: 'RESOLVED' },
    CLOSE: { outcome: 'INVALID', to: null },
  },
  IN_PROGRESS: {
    DIAGNOSE: { outcome: 'ALREADY_APPLIED', to: 'IN_PROGRESS' },
    INTERVENE: { outcome: 'APPLIED', to: 'IN_PROGRESS' },
    REASSESS: { outcome: 'APPLIED', to: 'RESOLVED' },
    ESCALATE: { outcome: 'APPLIED', to: 'ESCALATED' },
    OVERRIDE: { outcome: 'APPLIED', to: 'RESOLVED' },
    CLOSE: { outcome: 'INVALID', to: null },
  },
  ESCALATED: {
    DIAGNOSE: { outcome: 'INVALID', to: null },
    INTERVENE: { outcome: 'APPLIED', to: 'ESCALATED' },
    REASSESS: { outcome: 'APPLIED', to: 'RESOLVED' },
    ESCALATE: { outcome: 'ALREADY_APPLIED', to: 'ESCALATED' },
    OVERRIDE: { outcome: 'APPLIED', to: 'RESOLVED' },
    CLOSE: { outcome: 'INVALID', to: null },
  },
  RESOLVED: {
    DIAGNOSE: { outcome: 'INVALID', to: null },
    INTERVENE: { outcome: 'INVALID', to: null },
    REASSESS: { outcome: 'INVALID', to: null },
    ESCALATE: { outcome: 'INVALID', to: null },
    OVERRIDE: { outcome: 'INVALID', to: null },
    CLOSE: { outcome: 'APPLIED', to: 'CLOSED' },
  },
  CLOSED: {
    DIAGNOSE: { outcome: 'INVALID', to: null },
    INTERVENE: { outcome: 'INVALID', to: null },
    REASSESS: { outcome: 'INVALID', to: null },
    ESCALATE: { outcome: 'INVALID', to: null },
    OVERRIDE: { outcome: 'INVALID', to: null },
    CLOSE: { outcome: 'ALREADY_APPLIED', to: 'CLOSED' },
  },
} as const satisfies Record<
  LearningCaseStatus,
  Record<LearningCaseActionKind, ExpectedTransition>
>

test('LearningCase supports the diagnose, intervention, escalation and resolution loop', () => {
  const cases: Array<
    readonly [LearningCaseStatus, LearningCaseActionKind, ExpectedTransition]
  > = [
    ['DETECTED', 'DIAGNOSE', { outcome: 'APPLIED', to: 'IN_PROGRESS' }],
    // Multiple interventions are legitimate actions; request idempotency belongs outside this domain.
    ['IN_PROGRESS', 'INTERVENE', { outcome: 'APPLIED', to: 'IN_PROGRESS' }],
    ['DETECTED', 'ESCALATE', { outcome: 'APPLIED', to: 'ESCALATED' }],
    ['IN_PROGRESS', 'ESCALATE', { outcome: 'APPLIED', to: 'ESCALATED' }],
    ['ESCALATED', 'INTERVENE', { outcome: 'APPLIED', to: 'ESCALATED' }],
    ['IN_PROGRESS', 'REASSESS', { outcome: 'APPLIED', to: 'RESOLVED' }],
    ['ESCALATED', 'REASSESS', { outcome: 'APPLIED', to: 'RESOLVED' }],
    ['DETECTED', 'OVERRIDE', { outcome: 'APPLIED', to: 'RESOLVED' }],
    ['IN_PROGRESS', 'OVERRIDE', { outcome: 'APPLIED', to: 'RESOLVED' }],
    ['ESCALATED', 'OVERRIDE', { outcome: 'APPLIED', to: 'RESOLVED' }],
    ['RESOLVED', 'CLOSE', { outcome: 'APPLIED', to: 'CLOSED' }],
  ]

  for (const [status, actionKind, expected] of cases) {
    assert.deepEqual(transitionLearningCase(status, actionKind), { from: status, ...expected })
  }
})

test('LearningCase rejects every unsupported status and action combination', () => {
  for (const [status, expectedActions] of Object.entries(EXPECTED_TRANSITIONS) as Array<
    [LearningCaseStatus, Record<LearningCaseActionKind, ExpectedTransition>]
  >) {
    for (const actionKind of LEARNING_CASE_ACTION_KINDS) {
      const expected = expectedActions[actionKind]
      assert.deepEqual(transitionLearningCase(status, actionKind), { from: status, ...expected })
    }
  }
})

test('LearningCase repeats are idempotent only when status proves the action completed', () => {
  const provenRepeats: Array<readonly [LearningCaseStatus, LearningCaseActionKind]> = [
    ['IN_PROGRESS', 'DIAGNOSE'],
    ['ESCALATED', 'ESCALATE'],
    ['CLOSED', 'CLOSE'],
  ]

  for (const [status, actionKind] of provenRepeats) {
    assert.deepEqual(transitionLearningCase(status, actionKind), {
      outcome: 'ALREADY_APPLIED',
      from: status,
      to: status,
    })
  }

  // RESOLVED does not prove whether REASSESS or OVERRIDE produced it.
  for (const actionKind of ['REASSESS', 'OVERRIDE'] as const) {
    assert.deepEqual(transitionLearningCase('RESOLVED', actionKind), {
      outcome: 'INVALID',
      from: 'RESOLVED',
      to: null,
    })
  }
})

test('LearningCase CLOSED is terminal while a repeated CLOSE remains idempotent', () => {
  for (const actionKind of LEARNING_CASE_ACTION_KINDS) {
    const transition = transitionLearningCase('CLOSED', actionKind)
    if (actionKind === 'CLOSE') {
      assert.deepEqual(transition, {
        outcome: 'ALREADY_APPLIED',
        from: 'CLOSED',
        to: 'CLOSED',
      })
    } else {
      assert.deepEqual(transition, { outcome: 'INVALID', from: 'CLOSED', to: null })
    }
  }
})
