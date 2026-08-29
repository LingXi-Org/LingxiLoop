import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  closeLearningActivityRecord,
  findLearningActivity,
  insertLearningActivity,
  insertLearningActivityAttempt,
  publishLearningActivityRecord,
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

test('activity creation and lookup use explicit tenant and course scope', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    if (text.includes('SELECT id,course_id')) return { rows: [{
      id: 'activity-1', course_id: 'course-1', title: 'Lease lab', instructions: 'Run it', type: 'practice',
      status: 'draft', evaluation_mode: 'teacher_required', target_level: 2, rubric: [],
      objective_ids: ['objective-1'], due_at: null,
    }] }
    return { rowCount: 1 }
  })

  await insertLearningActivity(db, {
    id: 'activity-1', companyId: 'company-1', courseId: 'course-1', actorId: 'agent-1',
    title: 'Lease lab', instructions: 'Run it', type: 'practice', evaluationMode: 'teacher_required',
    targetLevel: 2, rubric: [], objectiveIds: ['objective-1'],
  })
  const activity = await findLearningActivity(db, 'company-1', 'course-1', 'activity-1')

  assert.deepEqual(calls[0]?.params?.slice(1, 3), ['course-1', 'company-1'])
  assert.match(calls[0]?.text ?? '', /course\.id=\$2 AND course\.company_id=\$3/)
  assert.deepEqual(calls[1]?.params, ['company-1', 'course-1', 'activity-1'])
  assert.equal(activity?.objectiveIds[0], 'objective-1')
})

test('publish and close writes authorize the teacher inside the tenant-scoped update', async () => {
  const calls: string[] = []
  const db = queryable((text) => {
    calls.push(text)
    return { rowCount: 1 }
  })
  const input = { companyId: 'company-1', courseId: 'course-1', activityId: 'activity-1', teacherId: 'teacher-1' }

  assert.equal(await publishLearningActivityRecord(db, input), true)
  assert.equal(await closeLearningActivityRecord(db, input), true)

  for (const statement of calls) {
    assert.match(statement, /activity\.company_id=\$1 AND activity\.course_id=\$2/)
    assert.match(statement, /member\.user_id=\$4 AND member\.role IN \('OWNER','TEACHER'\)/)
    assert.match(statement, /member\.status='ACTIVE'/)
  }
})

test('UI submission is one authoritative insert that binds published activity and learner membership', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return { rows: [{ id: 'attempt-1' }], rowCount: 1 }
  })

  const inserted = await insertLearningActivityAttempt(db, {
    id: 'attempt-1', companyId: 'company-1', courseId: 'course-1', activityId: 'activity-1',
    learnerId: 'learner-1', assistance: 'none', answer: 'evidence', idempotencyKey: 'submission-1',
  })

  assert.equal(inserted, 'attempt-1')
  assert.deepEqual(values?.slice(0, 5), ['attempt-1','company-1','course-1','activity-1','learner-1'])
  assert.match(statement, /activity\.status='published'/)
  assert.match(statement, /learner\.user_id=\$5 AND learner\.status='ACTIVE'/)
  assert.match(statement, /learner\.role IN \('STUDENT','OBSERVER'\)/)
})
