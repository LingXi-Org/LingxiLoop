import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  insertLearningObjective,
  listLearningObjectives,
  updateLearningObjectiveStatus,
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

test('objective writes carry the tenant and course scope in the authoritative repository', async () => {
  const statements: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    statements.push({ text, params })
    return { rowCount: 1 }
  })

  await insertLearningObjective(db, {
    id: 'objective-1', companyId: 'company-1', courseId: 'course-1', actorId: 'agent-1',
    title: 'Explain leases', successCriteria: 'Give one invariant', targetLevel: 3, position: 0,
  })
  const updated = await updateLearningObjectiveStatus(db, {
    companyId: 'company-1', courseId: 'course-1', objectiveId: 'objective-1',
    teacherId: 'teacher-1', status: 'published',
  })

  assert.equal(updated, true)
  assert.deepEqual(statements[0]?.params?.slice(1, 3), ['course-1', 'company-1'])
  assert.match(statements[0]?.text ?? '', /course\.id=\$2 AND course\.company_id=\$3/)
  assert.deepEqual(statements[1]?.params?.slice(0, 4), ['company-1', 'course-1', 'objective-1', 'teacher-1'])
  assert.match(statements[1]?.text ?? '', /objective\.course_id=\$2 AND objective\.company_id=\$1/)
  assert.match(statements[1]?.text ?? '', /member\.user_id=\$4 AND member\.role='teacher'/)
})

test('objective reads map only rows from the requested tenant and course', async () => {
  let values: readonly unknown[] | undefined
  const db = queryable((_text, params) => {
    values = params
    return { rows: [{
      id: 'objective-1', course_id: 'course-1', title: 'Explain leases', success_criteria: 'Give one invariant',
      target_level: 3, position: 0, status: 'draft', prerequisite_ids: ['objective-0'],
    }] }
  })

  const result = await listLearningObjectives(db, 'company-1', 'course-1')

  assert.deepEqual(values, ['company-1', 'course-1'])
  assert.deepEqual(result[0], {
    id: 'objective-1', courseId: 'course-1', title: 'Explain leases', successCriteria: 'Give one invariant',
    targetLevel: 3, position: 0, status: 'draft', prerequisiteIds: ['objective-0'],
  })
})
