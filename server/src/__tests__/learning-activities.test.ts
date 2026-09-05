import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  closeProjectLearningActivityRecord,
  findLearningActivity,
  findProjectLearningActivity,
  insertProjectLearningActivity,
  insertProjectLearningActivityAttempt,
  publishProjectLearningActivityRecord,
} from '../modules/learning/repository.js'
import { submitProjectLearningActivity } from '../modules/learning/activities-application.js'

function queryable(
  handler: (text: string, params: readonly unknown[] | undefined) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params) => {
      const result = handler(text, params)
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? result.rows?.length ?? 0 } as never
    },
  }
}

const activityRow = {
  id: 'activity-1',
  project_id: 'project-1',
  title: 'Lease lab',
  instructions: 'Run it',
  kind: 'PRACTICE',
  status: 'DRAFT',
  evaluation_mode: 'TEACHER_REQUIRED',
  target_level: 2,
  rubric: [],
  knowledge_unit_ids: ['unit-1'],
  due_at: null,
}

test('activity creation atomically validates project units and writes normalized links', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return { rows: [{ id: 'activity-1' }] }
  })

  await insertProjectLearningActivity(db, {
    id: 'activity-1', companyId: 'company-1', projectId: 'project-1', actorId: 'agent-1',
    title: 'Lease lab', instructions: 'Run it', kind: 'PRACTICE', evaluationMode: 'TEACHER_REQUIRED',
    targetLevel: 2, rubric: [], knowledgeUnitIds: ['unit-1'],
  })

  assert.deepEqual(values?.slice(0, 3), ['activity-1','company-1','project-1'])
  assert.deepEqual(values?.slice(5, 8), ['PRACTICE','TEACHER_REQUIRED',2])
  assert.deepEqual(values?.[10], ['unit-1'])
  assert.match(statement, /project\.company_id=\$2 AND project\.id=\$3/)
  assert.match(statement, /unit\.company_id=project\.company_id AND unit\.project_id=project\.id/)
  assert.match(statement, /INSERT INTO learning_activity_knowledge_units\(company_id,project_id,activity_id,knowledge_unit_id\)/)
  assert.doesNotMatch(statement, /objective_ids|course_id/)
})

test('project activity reads use normalized knowledge-unit links', async () => {
  let statement = ''
  const db = queryable((text, params) => {
    statement = text
    assert.deepEqual(params, ['company-1','project-1','activity-1'])
    return { rows: [activityRow] }
  })

  const activity = await findProjectLearningActivity(db, 'company-1', 'project-1', 'activity-1')

  assert.deepEqual(activity, {
    id: 'activity-1', projectId: 'project-1', title: 'Lease lab', instructions: 'Run it',
    kind: 'PRACTICE', status: 'DRAFT', evaluationMode: 'TEACHER_REQUIRED', targetLevel: 2,
    rubric: [], knowledgeUnitIds: ['unit-1'],
  })
  assert.match(statement, /link\.company_id=activity\.company_id AND link\.project_id=activity\.project_id/)
  assert.match(statement, /activity\.company_id=\$1 AND activity\.project_id=\$2/)
})

test('Course activity lookup resolves Project scope then returns only the teaching projection', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    if (text.includes('FROM courses course')) return { rows: [{
      course_id: 'course-1', company_id: 'company-1', project_id: 'project-1',
      project_kind: 'TEACHING', project_status: 'ACTIVE',
    }] }
    return { rows: [activityRow] }
  })

  const activity = await findLearningActivity(db, 'company-1', 'course-1', 'activity-1')

  assert.deepEqual(calls[0]?.params, ['company-1','course-1'])
  assert.deepEqual(calls[1]?.params, ['company-1','project-1','activity-1'])
  assert.deepEqual(activity, {
    id: 'activity-1', courseId: 'course-1', title: 'Lease lab', instructions: 'Run it',
    type: 'PRACTICE', status: 'DRAFT', evaluationMode: 'TEACHER_REQUIRED', targetLevel: 2,
    rubric: [], objectiveIds: ['unit-1'],
  })
})

test('publish and close persistence stays in the permission-resolved project scope', async () => {
  const calls: string[] = []
  const db = queryable((text) => {
    calls.push(text)
    return { rowCount: 1 }
  })
  const input = {
    companyId: 'company-1', projectId: 'project-1', activityId: 'activity-1', teacherId: 'teacher-1',
  }

  assert.equal(await publishProjectLearningActivityRecord(db, input), true)
  assert.equal(await closeProjectLearningActivityRecord(db, input), true)

  for (const statement of calls) {
    assert.match(statement, /activity\.company_id=\$1 AND activity\.project_id=\$2/)
    assert.doesNotMatch(statement, /project_memberships/)
  }
  assert.match(calls[0] ?? '', /status='PUBLISHED'/)
  assert.match(calls[1] ?? '', /status='CLOSED'/)
})

test('UI submission binds a published activity and learner to one project', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return { rows: [{ id: 'attempt-1' }], rowCount: 1 }
  })

  const inserted = await insertProjectLearningActivityAttempt(db, {
    id: 'attempt-1', companyId: 'company-1', projectId: 'project-1', activityId: 'activity-1',
    learnerId: 'learner-1', assistance: 'NONE', evidenceId: 'evidence-1', idempotencyKey: 'submission-1',
  })

  assert.equal(inserted, 'attempt-1')
  assert.deepEqual(values?.slice(0, 6), [
    'attempt-1','company-1','project-1','activity-1','learner-1','NONE',
  ])
  assert.match(statement, /activity\.company_id=\$2 AND activity\.project_id=\$3/)
  assert.match(statement, /activity\.status='PUBLISHED'/)
  assert.match(statement, /assistance,evidence_id,client_submission_id/)
  assert.doesNotMatch(statement, /project_memberships/)
  assert.match(statement, /ON CONFLICT\(company_id,project_id,activity_id,learner_id,client_submission_id\)/)
})

test('Assessment submission appends a bounded business event in the same transaction', async () => {
  const calls: string[] = []
  let eventPayload: Record<string, unknown> | undefined
  let evidenceRow: Record<string, unknown> | undefined
  const db = queryable((text, params) => {
    calls.push(text)
    if (text.includes('FROM users WHERE')) {
      return { rows: [{ id: 'learner-1', deleted_at: null, suspended_at: null }] }
    }
    if (text.includes('FROM companies WHERE')) {
      return { rows: [{ id: 'company-1', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan-1' }] }
    }
    if (text.includes('FROM projects WHERE id=$1')) {
      return { rows: [{
        id: 'project-1', company_id: 'company-1', kind: 'PERSONAL_LEARNING', plan_id: 'plan-1',
        status: 'ACTIVE', created_by: 'learner-1', conversation_members: null, leader_id: null,
        resource_status: 'ACTIVE',
      }] }
    }
    if (text.includes('FROM company_memberships')) return { rows: [{ role: 'OWNER', status: 'ACTIVE' }] }
    if (text.includes('FROM project_memberships')) return { rows: [{ role: 'OWNER', status: 'ACTIVE' }] }
    if (text.includes('FROM plans WHERE')) {
      return { rows: [{ id: 'plan-1', code: 'PERSONAL_FREE', status: 'ACTIVE' }] }
    }
    if (text.includes('FROM plan_entitlements')) return { rows: [{ code: 'learning.core', value: true }] }
    if (text.includes('SELECT * FROM evidence_records')) {
      return { rows: evidenceRow ? [evidenceRow] : [] }
    }
    if (text.includes('INSERT INTO evidence_records')) {
      const data = JSON.parse(String(params?.[7])) as Record<string, unknown>
      evidenceRow = {
        id: String(params?.[0]), company_id: 'company-1', project_id: 'project-1',
        level: 'L1', derivation: 'OBSERVED', kind: 'LEARNER_SUBMISSION',
        subject_user_id: 'learner-1', data, created_by_type: 'USER', created_by_id: 'learner-1',
        created_at: '2026-08-30T00:59:00.000Z',
      }
      return { rows: [evidenceRow] }
    }
    if (text.includes('INSERT INTO learning_attempts')) return { rows: [{ id: 'attempt-1' }] }
    if (text.includes('SELECT 1 FROM learning_attempts')) return { rows: [{ '?column?': 1 }] }
    if (text.includes('INSERT INTO evidence_links')) return { rowCount: 1 }
    if (text.includes('pg_advisory_xact_lock')) return {}
    if (text.includes('FROM domain_events WHERE')) return {}
    if (text.includes('INSERT INTO domain_events')) {
      eventPayload = JSON.parse(String(params?.[10])) as Record<string, unknown>
      return { rows: [{
        id: 'event-1', company_id: 'company-1', project_id: 'project-1',
        aggregate_type: 'ASSESSMENT_ATTEMPT', aggregate_id: 'attempt-1',
        sequence: 1, aggregate_sequence: 1, event_type: 'ASSESSMENT.ATTEMPT_SUBMITTED',
        schema_version: 1, idempotency_key: 'assessment-attempt:attempt-1:submitted',
        actor_type: 'USER', actor_id: 'learner-1', payload: eventPayload,
        occurred_at: '2026-08-30T01:00:00.000Z',
      }] }
    }
    throw new Error(`unexpected query: ${text}`)
  })

  const result = await submitProjectLearningActivity(async (work) => work(db), {
    companyId: 'company-1', projectId: 'project-1', activityId: 'activity-1',
    learnerId: 'learner-1', answer: 'private answer text', assistance: 'HINT',
    idempotencyKey: 'submission-1',
  })

  assert.deepEqual(result, { attemptId: 'attempt-1' })
  assert.deepEqual(evidenceRow?.data, { answer: 'private answer text' })
  assert.deepEqual(eventPayload, {
    attemptId: 'attempt-1', activityId: 'activity-1', learnerId: 'learner-1', assistance: 'HINT',
  })
  assert.ok(calls.findIndex((text) => text.includes('INSERT INTO learning_attempts'))
    < calls.findIndex((text) => text.includes('INSERT INTO domain_events')))
  assert.equal(calls.some((text) => /learning_attempts[\s\S]*\bevidence\b/.test(text)), false)
})
