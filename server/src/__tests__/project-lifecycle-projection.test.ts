import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { projectLifecycleProjection } from '../modules/learning/project-lifecycle-projection.js'

test('READ_ONLY closes the Teacher room and queues one durable lifecycle projection', async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = []
  const db: Queryable = {
    query: async (sql, params) => {
      calls.push({ sql, params })
      if (/SELECT id FROM courses/.test(sql)) return { rows: [{ id: 'course' }], rowCount: 1 } as never
      return { rows: [], rowCount: 1 } as never
    },
  }
  await projectLifecycleProjection(db, {
    companyId: 'company', projectId: 'project', status: 'READ_ONLY',
  })
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[0]?.params, ['company', 'project'])
  assert.match(calls[1]?.sql ?? '', /UPDATE learning_course_teacher_rooms/)
  assert.match(calls[2]?.sql ?? '', /INSERT INTO learning_effects/)
  assert.match(String(calls[2]?.params?.[5]), /"projectStatus":"READ_ONLY"/)
})

test('ACTIVE does not create a lifecycle projection', async () => {
  let queries = 0
  const db: Queryable = {
    query: async () => {
      queries += 1
      return { rows: [], rowCount: 0 } as never
    },
  }
  await projectLifecycleProjection(db, {
    companyId: 'company', projectId: 'project', status: 'ACTIVE',
  })
  assert.equal(queries, 0)
})
