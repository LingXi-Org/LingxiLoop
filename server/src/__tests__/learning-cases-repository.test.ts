import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  appendLearningCaseAction,
  findLearningCase,
  findLearningCaseActionByIdempotencyKey,
  findLearningCaseDetail,
  insertOrFindOpenLearningCase,
  learningCaseActionLinksAreValid,
  listLearningCases,
  lockLearningCase,
  updateLearningCaseRecord,
} from '../modules/learning/cases-repository.js'

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

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    project_id: 'project-1',
    user_id: 'learner-1',
    knowledge_unit_id: 'unit-1',
    status: 'DETECTED',
    reason: 'needs support',
    summary: 'initial summary',
    version: 1,
    created_at: '2026-08-30T01:00:00.000Z',
    updated_at: '2026-08-30T01:00:00.000Z',
    resolved_at: null,
    closed_at: null,
    ...overrides,
  }
}

function actionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    case_id: 'case-1',
    user_id: 'learner-1',
    knowledge_unit_id: 'unit-1',
    kind: 'DIAGNOSE',
    result: 'APPLIED',
    from_status: 'DETECTED',
    to_status: 'IN_PROGRESS',
    case_version: 2,
    idempotency_key: 'request-1',
    actor_id: 'teacher-1',
    reason: 'confirmed gap',
    activity_id: 'activity-1',
    mission_id: null,
    attempt_id: 'attempt-1',
    evaluation_id: 'evaluation-1',
    created_at: '2026-08-30T01:01:00.000Z',
    ...overrides,
  }
}

const expectedCase = {
  id: 'case-1',
  projectId: 'project-1',
  learnerId: 'learner-1',
  knowledgeUnitId: 'unit-1',
  status: 'DETECTED',
  reason: 'needs support',
  summary: 'initial summary',
  version: 1,
  createdAt: '2026-08-30T01:00:00.000Z',
  updatedAt: '2026-08-30T01:00:00.000Z',
  resolvedAt: null,
  closedAt: null,
} as const

const expectedAction = {
  id: 'action-1',
  caseId: 'case-1',
  learnerId: 'learner-1',
  knowledgeUnitId: 'unit-1',
  kind: 'DIAGNOSE',
  result: 'APPLIED',
  fromStatus: 'DETECTED',
  toStatus: 'IN_PROGRESS',
  caseVersion: 2,
  idempotencyKey: 'request-1',
  actorId: 'teacher-1',
  reason: 'confirmed gap',
  activityId: 'activity-1',
  missionId: null,
  attemptId: 'attempt-1',
  evaluationId: 'evaluation-1',
  createdAt: '2026-08-30T01:01:00.000Z',
} as const

test('case list, find, and detail preserve project scope and the explicit learner filter', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return text.includes('learning_case_actions') ? { rows: [actionRow()] } : { rows: [caseRow()] }
  })
  const readScope = {
    companyId: 'company-1',
    projectId: 'project-1',
    learnerFilterId: 'learner-1',
  }

  assert.deepEqual(await listLearningCases(db, {
    ...readScope,
    status: 'DETECTED',
    knowledgeUnitId: 'unit-1',
    limit: 500,
  }), [expectedCase])
  assert.deepEqual(await findLearningCase(db, { ...readScope, caseId: 'case-1' }), expectedCase)
  assert.deepEqual(await findLearningCaseDetail(db, { ...readScope, caseId: 'case-1' }), {
    learningCase: expectedCase,
    actions: [expectedAction],
  })

  assert.equal(calls.length, 4)
  for (const call of calls) {
    assert.match(call.text, /company_id=\$1 AND .*project_id=\$2/)
    assert.match(call.text, /\$[34]::text IS NULL OR .*user_id=\$[34]/)
  }
  assert.match(calls[0]?.text ?? '', /\$4::text IS NULL OR learning_case\.status=\$4/)
  assert.match(calls[0]?.text ?? '', /\$5::text IS NULL OR learning_case\.knowledge_unit_id=\$5/)
  assert.match(calls[0]?.text ?? '', /LIMIT \$6/)
  assert.match(calls[3]?.text ?? '', /ORDER BY case_action\.created_at DESC,case_action\.id DESC LIMIT 100/)
  assert.deepEqual(calls.map((call) => call.params), [
    ['company-1', 'project-1', 'learner-1', 'DETECTED', 'unit-1', 100],
    ['company-1', 'project-1', 'case-1', 'learner-1'],
    ['company-1', 'project-1', 'case-1', 'learner-1'],
    ['company-1', 'project-1', 'case-1', 'learner-1'],
  ])
})

test('open case insert validates the project unit and learner before returning DETECTED', async () => {
  let queryCount = 0
  const db = queryable((text, params) => {
    queryCount += 1
    assert.match(text, /INSERT INTO learning_cases/)
    assert.match(text, /JOIN projects project/)
    assert.match(text, /JOIN project_memberships member/)
    assert.match(text, /member\.company_id=unit\.company_id AND member\.project_id=unit\.project_id/)
    assert.match(text, /member\.user_id=\$4 AND member\.status='ACTIVE'/)
    assert.match(text, /unit\.company_id=\$2 AND unit\.project_id=\$3 AND unit\.id=\$5/)
    assert.match(text, /project\.kind='PERSONAL_LEARNING' AND member\.role='OWNER'/)
    assert.match(text, /project\.kind IN \('TEACHING','INSTITUTIONAL_COURSE'\)/)
    assert.match(text, /member\.role IN \('STUDENT','OBSERVER'\)/)
    assert.match(text, /'DETECTED'/)
    assert.match(text, /ON CONFLICT\(project_id,user_id,knowledge_unit_id\) WHERE status<>'CLOSED' DO NOTHING/)
    assert.deepEqual(params, [
      'case-1', 'company-1', 'project-1', 'learner-1', 'unit-1', 'needs support', 'initial summary',
    ])
    return { rows: [caseRow()] }
  })

  assert.deepEqual(await insertOrFindOpenLearningCase(db, {
    id: 'case-1',
    companyId: 'company-1',
    projectId: 'project-1',
    learnerId: 'learner-1',
    knowledgeUnitId: 'unit-1',
    reason: 'needs support',
    summary: 'initial summary',
  }), { learningCase: expectedCase, created: true })
  assert.equal(queryCount, 1)
})

test('open case dedup reads again after a concurrent conflict for a fresh snapshot', async () => {
  const calls: string[] = []
  const db = queryable((text, params) => {
    calls.push(text)
    if (text.includes('INSERT INTO')) return { rows: [] }
    assert.match(text, /learning_case\.company_id=\$1 AND learning_case\.project_id=\$2/)
    assert.match(text, /learning_case\.user_id=\$3/)
    assert.match(text, /learning_case\.knowledge_unit_id=\$4 AND learning_case\.status<>'CLOSED'/)
    assert.match(text, /member\.user_id=learning_case\.user_id AND member\.status='ACTIVE'/)
    assert.match(text, /project\.kind='PERSONAL_LEARNING' AND member\.role='OWNER'/)
    assert.deepEqual(params, ['company-1', 'project-1', 'learner-1', 'unit-1'])
    return { rows: [caseRow({ id: 'case-concurrent' })] }
  })

  const result = await insertOrFindOpenLearningCase(db, {
    id: 'case-new',
    companyId: 'company-1',
    projectId: 'project-1',
    learnerId: 'learner-1',
    knowledgeUnitId: 'unit-1',
    reason: 'duplicate detector',
    summary: '',
  })
  assert.equal(result?.learningCase.id, 'case-concurrent')
  assert.equal(result?.created, false)
  assert.equal(calls.length, 2)

  const missingDb = queryable(() => ({ rows: [] }))
  assert.equal(await insertOrFindOpenLearningCase(missingDb, {
    id: 'case-missing',
    companyId: 'company-1',
    projectId: 'project-1',
    learnerId: 'learner-missing',
    knowledgeUnitId: 'unit-1',
    reason: 'invalid scope',
    summary: '',
  }), null)
})

test('case transition lock and action idempotency lookup are fully project scoped', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return text.includes('learning_case_actions') ? { rows: [actionRow()] } : { rows: [caseRow()] }
  })

  assert.deepEqual(await lockLearningCase(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    caseId: 'case-1',
    learnerFilterId: null,
  }), expectedCase)
  assert.deepEqual(await findLearningCaseActionByIdempotencyKey(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    idempotencyKey: 'request-1',
  }), expectedAction)

  assert.match(calls[0]?.text ?? '', /company_id=\$1 AND .*project_id=\$2 AND .*id=\$3/)
  assert.match(calls[0]?.text ?? '', /FOR UPDATE/)
  assert.deepEqual(calls[0]?.params, ['company-1', 'project-1', 'case-1', null])
  assert.match(calls[1]?.text ?? '', /case_action\.company_id=\$1 AND case_action\.project_id=\$2/)
  assert.match(calls[1]?.text ?? '', /case_action\.idempotency_key=\$3/)
  assert.deepEqual(calls[1]?.params, ['company-1', 'project-1', 'request-1'])
})

test('action links require project ownership, learner ownership, and evaluation-attempt coherence', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /learning_activities activity[\s\S]*activity\.company_id=\$1 AND activity\.project_id=\$2/)
    assert.match(text, /learning_missions mission[\s\S]*mission\.learner_id=\$3/)
    assert.match(text, /learning_attempts attempt[\s\S]*attempt\.learner_id=\$3/)
    assert.match(text, /learning_evaluations evaluation[\s\S]*evaluation\.company_id=\$1/)
    assert.match(text, /attempt\.learner_id=\$3 AND \(\$6::text IS NULL OR attempt\.id=\$6\)/)
    assert.doesNotMatch(text, /courses|knowledge_unit/i)
    assert.deepEqual(params, [
      'company-1', 'project-1', 'learner-1', 'activity-1', 'mission-1', 'attempt-1', 'evaluation-1',
    ])
    return { rows: [{ valid: true }] }
  })

  assert.equal(await learningCaseActionLinksAreValid(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    learnerId: 'learner-1',
    activityId: 'activity-1',
    missionId: 'mission-1',
    attemptId: 'attempt-1',
    evaluationId: 'evaluation-1',
  }), true)
})

test('case update is a project-scoped compare-and-swap with lifecycle timestamps', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /UPDATE learning_cases learning_case/)
    assert.match(text, /version=learning_case\.version\+1/)
    assert.match(text, /WHEN \$6='RESOLVED'/)
    assert.match(text, /WHEN \$6='CLOSED'/)
    assert.match(text, /learning_case\.company_id=\$1 AND learning_case\.project_id=\$2/)
    assert.match(text, /learning_case\.version=\$4 AND learning_case\.status=\$5/)
    assert.deepEqual(params, [
      'company-1', 'project-1', 'case-1', 1, 'DETECTED', 'IN_PROGRESS', 'diagnosed',
    ])
    return { rows: [caseRow({ status: 'IN_PROGRESS', summary: 'diagnosed', version: 2 })] }
  })

  assert.deepEqual(await updateLearningCaseRecord(db, {
    companyId: 'company-1',
    projectId: 'project-1',
    caseId: 'case-1',
    expectedVersion: 1,
    fromStatus: 'DETECTED',
    toStatus: 'IN_PROGRESS',
    summary: 'diagnosed',
  }), { ...expectedCase, status: 'IN_PROGRESS', summary: 'diagnosed', version: 2 })
})

test('case action append copies trusted case identity and never mutates the ledger', async () => {
  const db = queryable((text, params) => {
    assert.match(text, /^INSERT INTO learning_case_actions/)
    assert.match(text, /SELECT \$1,learning_case\.company_id,learning_case\.project_id,learning_case\.id/)
    assert.match(text, /learning_case\.user_id,[\s\S]*learning_case\.knowledge_unit_id/)
    assert.match(text, /learning_case\.company_id=\$2 AND learning_case\.project_id=\$3/)
    assert.match(text, /learning_case\.id=\$4/)
    assert.match(text, /learning_case\.status=\$8 AND learning_case\.version=\$9/)
    assert.doesNotMatch(text, /UPDATE|DELETE|domain_events|courses|payload/)
    assert.deepEqual(params, [
      'action-1', 'company-1', 'project-1', 'case-1', 'DIAGNOSE', 'APPLIED', 'DETECTED',
      'IN_PROGRESS', 2, 'request-1', 'teacher-1', 'confirmed gap', 'activity-1', null,
      'attempt-1', 'evaluation-1',
    ])
    return { rows: [actionRow()] }
  })

  assert.deepEqual(await appendLearningCaseAction(db, {
    id: 'action-1',
    companyId: 'company-1',
    projectId: 'project-1',
    caseId: 'case-1',
    kind: 'DIAGNOSE',
    result: 'APPLIED',
    fromStatus: 'DETECTED',
    toStatus: 'IN_PROGRESS',
    caseVersion: 2,
    idempotencyKey: 'request-1',
    actorId: 'teacher-1',
    reason: 'confirmed gap',
    activityId: 'activity-1',
    attemptId: 'attempt-1',
    evaluationId: 'evaluation-1',
  }), expectedAction)
})
