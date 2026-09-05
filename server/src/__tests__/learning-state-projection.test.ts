import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  independentLearningEvidenceKeys,
  insertLearningEvaluation,
  learningEvaluationEvidenceKey,
  lockLearningState,
  markLearningAttemptEvaluated,
  reviewLearningEvaluationRecord,
  upsertLearningState,
} from '../modules/learning/learning-state-repository.js'

function queryable(
  handler: (
    text: string,
    params: readonly unknown[] | undefined,
  ) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params) => {
      const result = handler(text, params)
      return {
        rows: result.rows ?? [],
        rowCount: result.rowCount ?? result.rows?.length ?? 0,
      } as never
    },
  }
}

test('evaluation inserts copy trusted company and project scope from the attempt', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /\(id,company_id,project_id,attempt_id/)
    assert.match(text, /attempt\.id=\$4 AND attempt\.company_id=\$2 AND attempt\.project_id=\$3/)
    assert.match(text, /'AGENT'/)
    assert.deepEqual(params, [
      'evaluation-1',
      'company-1',
      'project-1',
      'attempt-1',
      3,
      0.9,
      '[]',
      'good evidence',
      'agent-1',
      'ACCEPTED',
      null,
      null,
    ])
    return { rowCount: 1 }
  })

  assert.equal(await insertLearningEvaluation(db, {
    id: 'evaluation-1',
    companyId: 'company-1',
    projectId: 'project-1',
    attemptId: 'attempt-1',
    demonstratedLevel: 3,
    confidence: 0.9,
    rubricResults: [],
    feedback: 'good evidence',
    evaluatorId: 'agent-1',
    status: 'ACCEPTED',
  }), true)
})

test('independent evidence is unit-scoped, source-qualified, accepted and excludes the current evaluation', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /learning_activity_knowledge_units activity_unit/)
    assert.match(text, /learning_mission_steps step/)
    assert.match(text, /'ACTIVITY:' \|\| attempt\.activity_id/)
    assert.match(text, /'MISSION_STEP:' \|\| attempt\.mission_step_id/)
    assert.match(text, /evaluation\.status='ACCEPTED'/)
    assert.match(text, /attempt\.assistance='NONE'/)
    assert.match(text, /evaluation\.id<>\$5/)
    assert.match(text, /activity_unit\.knowledge_unit_id=\$4 OR step\.knowledge_unit_id=\$4/)
    assert.deepEqual(params, [
      'company-1',
      'project-1',
      'learner-1',
      'unit-1',
      'evaluation-current',
    ])
    return { rows: [
      { evidence_key: 'ACTIVITY:shared-id' },
      { evidence_key: 'MISSION_STEP:shared-id' },
    ] }
  })

  assert.deepEqual(await independentLearningEvidenceKeys(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    userId: 'learner-1',
    knowledgeUnitId: 'unit-1',
    evaluationId: 'evaluation-current',
  }), ['ACTIVITY:shared-id', 'MISSION_STEP:shared-id'])
})

test('current evidence key is project-scoped and preserves its source type', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /evaluation\.company_id=\$2 AND evaluation\.project_id=\$3/)
    assert.deepEqual(params, ['evaluation-1', 'company-1', 'project-1'])
    return { rows: [{ evidence_key: 'MISSION_STEP:step-1' }] }
  })

  assert.equal(await learningEvaluationEvidenceKey(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    evaluationId: 'evaluation-1',
  }), 'MISSION_STEP:step-1')
})

test('LearningState projection serializes the absent-row case and locks an existing row', async () => {
  const statements: string[] = []
  const expectedParams = ['company-1', 'project-1', 'learner-1', 'unit-1']
  const db = queryable((text, params) => {
    statements.push(text)
    assert.deepEqual(params, expectedParams)
    if (text.includes('pg_advisory_xact_lock')) return { rows: [{}] }
    assert.match(text, /FROM learning_states state/)
    assert.match(text, /state\.company_id=\$1 AND state\.project_id=\$2 AND state\.user_id=\$3/)
    assert.match(text, /state\.knowledge_unit_id=\$4[\s\S]*FOR UPDATE/)
    return { rows: [{ level: 2, independent_evidence_count: 1, review_interval_days: 3 }] }
  })

  assert.deepEqual(await lockLearningState(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    userId: 'learner-1',
    knowledgeUnitId: 'unit-1',
  }), { level: 2, independentEvidenceCount: 1, reviewIntervalDays: 3 })
  assert.equal(statements.length, 2)
})

test('LearningState upsert validates member and unit scope and increments the persisted version', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /INSERT INTO learning_states/)
    assert.match(text, /JOIN project_memberships member/)
    assert.match(text, /unit\.company_id=\$1 AND unit\.project_id=\$2 AND unit\.id=\$4/)
    assert.match(text, /ON CONFLICT\(project_id,user_id,knowledge_unit_id\) DO UPDATE/)
    assert.match(text, /version=learning_states\.version\+1/)
    assert.match(text, /WHERE learning_states\.company_id=EXCLUDED\.company_id/)
    assert.deepEqual(params, [
      'company-1',
      'project-1',
      'learner-1',
      'unit-1',
      3,
      'VERIFIED',
      2,
      7,
    ])
    return { rowCount: 1 }
  })

  assert.equal(await upsertLearningState(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    userId: 'learner-1',
    knowledgeUnitId: 'unit-1',
    level: 3,
    status: 'VERIFIED',
    independentEvidenceCount: 2,
    reviewIntervalDays: 7,
  }), true)
})

test('evaluation review and attempt completion use uppercase project-scoped transitions', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return { rowCount: 1 }
  })

  assert.equal(await reviewLearningEvaluationRecord(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    evaluationId: 'evaluation-1',
    status: 'REJECTED',
    reason: 'insufficient evidence',
    reviewerId: 'teacher-1',
  }), true)
  assert.equal(await markLearningAttemptEvaluated(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    attemptId: 'attempt-1',
  }), true)

  assert.match(calls[0]?.text ?? '', /evaluation\.status='PENDING'/)
  assert.match(calls[0]?.text ?? '', /evaluation\.company_id=\$1 AND evaluation\.project_id=\$2/)
  assert.deepEqual(calls[0]?.params, [
    'company-1',
    'project-1',
    'evaluation-1',
    'REJECTED',
    'insufficient evidence',
    'teacher-1',
  ])
  assert.match(calls[1]?.text ?? '', /SET status='EVALUATED'/)
  assert.match(calls[1]?.text ?? '', /company_id=\$2 AND project_id=\$3/)
})
