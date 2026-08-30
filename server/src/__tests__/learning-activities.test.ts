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
    learnerId: 'learner-1', assistance: 'NONE', answer: 'evidence', idempotencyKey: 'submission-1',
  })

  assert.equal(inserted, 'attempt-1')
  assert.deepEqual(values?.slice(0, 6), [
    'attempt-1','company-1','project-1','activity-1','learner-1','NONE',
  ])
  assert.match(statement, /activity\.company_id=\$2 AND activity\.project_id=\$3/)
  assert.match(statement, /activity\.status='PUBLISHED'/)
  assert.doesNotMatch(statement, /project_memberships/)
  assert.match(statement, /ON CONFLICT\(company_id,project_id,activity_id,learner_id,client_submission_id\)/)
})
